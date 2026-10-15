/**
 * Tests against the real APIs (Jupiter, KyberSwap, Dexscreener, Solana RPC). Never sends
 * a transaction — only quotes, builds and signs locally with a dummy wallet.
 * Run: LIVE=1 npx vitest run tests/live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { resolveToken, safetyFlags } from '@/lib/market';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { signSerializedTx } from '@/lib/solana/tx';
import { jupQuote, SOL_MINT } from '@/lib/trade/solana';
import { solanaFromMnemonic } from '@/lib/wallet/keys';

const live = !!process.env.LIVE;
const s = structuredClone(DEFAULT_SETTINGS);
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

describe.skipIf(!live)('live APIs', () => {
  it('a real Jupiter quote + swap tx is signed correctly', async () => {
    const wallet = solanaFromMnemonic('test test test test test test test test test test test junk', 7);
    const quote = await jupQuote(s, SOL_MINT, BONK, 10_000_000n);
    expect(BigInt(quote.outAmount)).toBeGreaterThan(0n);

    const res = await fetch(`${s.jupiter.baseUrl}/swap/v1/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }),
    });
    const { swapTransaction } = (await res.json()) as { swapTransaction: string };
    const tx = base64.decode(swapTransaction);
    const { signed, signature } = signSerializedTx(tx, wallet);
    const msg = signed.subarray(1 + signed[0] * 64);
    expect(ed25519.verify(base58.decode(signature), msg, base58.decode(wallet.address))).toBe(true);
  }, 30_000);

  it('resolves a Solana CA, a lowercase address (dexscreener URL) and a ticker', async () => {
    const r = await resolveToken({ address: BONK }, s);
    expect('token' in r && r.token.symbol).toBe('Bonk');
    const lower = await resolveToken({ address: BONK.toLowerCase(), chain: 'solana', isPair: true }, s);
    expect('token' in lower && lower.token.address).toBe(BONK);
    const t = await resolveToken({ ticker: 'BONK' }, s);
    expect('candidates' in t && t.candidates.length).toBeGreaterThan(0);
  }, 30_000);

  it('resolving an EVM CA without a chain picks the chain with the most liquidity', async () => {
    // Brett on Base
    const r = await resolveToken({ address: '0x532f27101965dd16442E59d40670FaF5eBB142E4' }, s);
    expect('token' in r && r.token.chain).toBe('base');
    if ('token' in r) {
      const flags = await safetyFlags(r.token, s);
      expect(Array.isArray(flags)).toBe(true);
    }
  }, 30_000);

  it('SOL withdraw transaction deserializes on a real Solana node (simulation only)', async () => {
    const { buildSolTransfer } = await import('@/lib/solana/transfer');
    const from = solanaFromMnemonic('test test test test test test test test test test test junk', 7);
    const to = solanaFromMnemonic('test test test test test test test test test test test junk', 8);
    const tx = buildSolTransfer(from.address, to.address, 1_000_000n, '11111111111111111111111111111111');
    // Same client as the extension (QuickApe RPC, falling back to PublicNode). A malformed transaction
    // throws a JSON-RPC error; an unfunded sender is a normal simulation error.
    const { rpc } = await import('@/lib/solana/rpc');
    const r = await rpc<{ value: { err: unknown } }>(s.chains.solana.rpc, 'simulateTransaction', [
      base64.encode(tx),
      { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true },
    ]);
    expect(JSON.stringify(r.value.err)).toMatch(/AccountNotFound|InsufficientFunds/);
  }, 30_000);

  it('ATA derivation matches mainnet, and token balances work on an RPC without indexed calls', async () => {
    const { associatedTokenAddress } = await import('@/lib/solana/pda');
    const { getTokenBalance } = await import('@/lib/solana/rpc');
    const call = async <T,>(method: string, params: unknown[]) => {
      const r = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return ((await r.json()) as { result: T }).result;
    };
    type Parsed = {
      transaction: { message: { accountKeys: { pubkey: string }[] } };
      meta: { postTokenBalances: { accountIndex: number; mint: string; owner?: string; programId?: string; uiTokenAmount: { amount: string } }[] };
    };
    // Real token accounts from recent Jupiter swaps: every ATA there must match our derivation.
    // Many recent swaps are version 1 transactions, so ask for up to v1.
    const sigs = await call<{ signature: string }[]>('getSignaturesForAddress', [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      { limit: 8 },
    ]);
    let matched = 0;
    let sample: { owner: string; mint: string } | undefined;
    for (const { signature } of sigs) {
      const tx = await call<Parsed | null>('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]);
      if (!tx) continue;
      for (const b of tx.meta.postTokenBalances) {
        if (!b.owner || !b.programId) continue;
        if (associatedTokenAddress(b.owner, b.mint, b.programId) === tx.transaction.message.accountKeys[b.accountIndex].pubkey) {
          matched++;
          if (!sample && BigInt(b.uiTokenAmount.amount) > 0n) sample = { owner: b.owner, mint: b.mint };
        }
      }
    }
    expect(matched, 'no associated token accounts found in recent swaps').toBeGreaterThan(0);
    // PublicNode refuses getTokenAccountsByOwner, so this goes through the ATA fallback without throwing.
    if (sample) {
      const bal = await getTokenBalance('https://solana-rpc.publicnode.com', sample.owner, sample.mint);
      expect(bal.raw).toBeGreaterThanOrEqual(0n);
    }
  }, 60_000);

  it('QuickApe fee on Solana: one SOL transfer in the swap transaction, for Token-2022 pump tokens too', async () => {
    const { FEES } = await import('@/lib/fees');
    const { buildSolanaSwap } = await import('@/lib/trade/solana');
    const mainnet = async <T,>(method: string, params: unknown[]) => {
      const r = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return ((await r.json()) as { result: T }).result;
    };
    // A heavily funded wallet, only ever used as the (unsigned) signer of simulations.
    const WHALE = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
    const PUMP_TOKEN_2022 = '23UQPjo1ASYdzk8m7f8zMvDpJwAaGdUndYecigJwpump';
    const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const to = FEES.wallets.solana;
    const before = BigInt((await mainnet<{ value: number }>('getBalance', [to])).value);
    const cases: [string, string, string, bigint][] = [
      ['buy Token-2022 pump token', SOL_MINT, PUMP_TOKEN_2022, 500_000_000n],
      ['buy BONK', SOL_MINT, BONK, 500_000_000n],
      ['sell USDC', USDC, SOL_MINT, 100_000_000n],
    ];
    for (const [label, input, output, amount] of cases) {
      const built = await buildSolanaSwap(s, WHALE, input, output, amount, { bps: FEES.baseBps, to }).catch((e: Error) => {
        throw new Error(`${label}: ${e.message}`);
      });
      if (input === SOL_MINT) {
        expect(built.feeLamports).toBe((amount * BigInt(FEES.baseBps)) / 10_000n);
        expect(BigInt(built.quote.inAmount)).toBe(amount - built.feeLamports);
      } else {
        expect(built.feeLamports).toBe((BigInt(built.quote.otherAmountThreshold) * BigInt(FEES.baseBps)) / 10_000n);
      }
      const sim = await mainnet<{ value: { err: unknown; logs: string[] | null; accounts: ({ lamports: number } | null)[] } }>(
        'simulateTransaction',
        [built.txBase64, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, accounts: { encoding: 'base64', addresses: [to] } }],
      );
      expect(sim.value.err, `${label}: ${(sim.value.logs ?? []).slice(-4).join(' | ')}`).toBeNull();
      expect(BigInt(sim.value.accounts[0]?.lamports ?? 0) - before, label).toBe(built.feeLamports);
      await new Promise((r) => setTimeout(r, 1500)); // stay under Jupiter's keyless rate limit
    }
  }, 90_000);

  it('QuickApe fee on EVM: KyberSwap takes exactly 0.5%', async () => {
    const { FEES } = await import('@/lib/fees');
    const base = 'https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&amountIn=10000000000000000';
    const fee = `&feeAmount=${FEES.baseBps}&isInBps=true&chargeFeeBy=currency_in&feeReceiver=${FEES.wallets.evm}`;
    const get = async (u: string) =>
      ((await (await fetch(u, { headers: { 'x-client-id': 'quickape' } })).json()) as { data: { routeSummary: { amountOut: string } } }).data
        .routeSummary.amountOut;
    const [a, b] = await Promise.all([get(base), get(base + fee)]);
    expect(Number(b) / Number(a)).toBeCloseTo(0.995, 3);
  }, 30_000);

  it('KyberSwap route ETH -> USDC on Base', async () => {
    const q = new URLSearchParams({
      tokenIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountIn: '1000000000000000',
    });
    const res = await fetch(`https://aggregator-api.kyberswap.com/base/api/v1/routes?${q}`, {
      headers: { 'x-client-id': 'quickape' },
    });
    const j = (await res.json()) as { code: number; data: { routeSummary: { amountOut: string } } };
    expect(j.code).toBe(0);
    expect(BigInt(j.data.routeSummary.amountOut)).toBeGreaterThan(0n);
  }, 30_000);
});
