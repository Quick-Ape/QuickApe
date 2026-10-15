import { base64 } from '@scure/base';
import { keepAlive, sleep } from '../keepalive';
import type { Settings } from '../settings';
import { appendSolTransfer, TxTooLarge } from '../solana/patch';
import { getBlockHeight, getSignatureStatus, loadLookupTables, sendRawTransaction } from '../solana/rpc';
import { signSerializedTx } from '../solana/tx';
import type { SolanaWallet } from '../wallet/keys';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JITO_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  /** Minimum output after slippage. */
  otherAmountThreshold: string;
  priceImpactPct?: string;
  [k: string]: unknown;
}

// api.jup.ag works without a key (low rate limit); lite-api.jup.ag is being retired and sometimes returns 503.
const JUP_BASES = ['https://api.jup.ag', 'https://lite-api.jup.ag'];

/**
 * Request to the Jupiter Metis Swap API v1 (no Jupiter fee). If the configured base URL
 * is down / rate-limited, automatically retry on the other Jupiter endpoint.
 */
async function jupFetch(s: Settings, path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (s.jupiter.apiKey) headers['x-api-key'] = s.jupiter.apiKey;
  const primary = s.jupiter.baseUrl.replace(/\/+$/, '');
  const bases = [primary, ...JUP_BASES.filter((b) => b !== primary)];

  let last: Response | undefined;
  for (const base of bases) {
    try {
      last = await fetch(`${base}${path}`, { ...init, headers });
    } catch {
      continue; // network error -> try the next base
    }
    // 400 = a real error (e.g. no route), don't fall back.
    if (last.ok || last.status === 400) return last;
  }
  if (last) return last;
  throw new Error("Can't reach Jupiter — check your connection");
}

async function jupError(res: Response): Promise<Error> {
  let msg = `HTTP ${res.status}`;
  let code = '';
  try {
    const j = (await res.json()) as { error?: string; errorCode?: string; message?: string };
    msg = j.error ?? j.message ?? j.errorCode ?? msg;
    code = j.errorCode ?? '';
  } catch {}
  const both = `${code} ${msg}`;
  if (/COULD_NOT_FIND_ANY_ROUTE|No routes found/i.test(both)) return new Error('Jupiter has no route for this token yet');
  if (/TOKEN_NOT_TRADABLE|not tradable/i.test(both)) return new Error("This token isn't tradable on Jupiter");
  if (res.status === 401 || res.status === 403) return new Error('Jupiter rejected the request — check your API key in Settings');
  if (res.status === 429) return new Error('Jupiter rate limit hit — wait a moment or add an API key');
  return new Error(`Jupiter: ${msg}`);
}

/** QuickApe fee for one swap, paid as a SOL transfer to `to` inside the swap transaction. */
export interface SwapFee {
  bps: number;
  to: string;
}

export async function jupQuote(
  s: Settings,
  inputMint: string,
  outputMint: string,
  amount: bigint,
  maxAccounts?: number,
): Promise<JupQuote> {
  const q = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: String(s.chains.solana.slippageBps),
    restrictIntermediateTokens: 'true',
  });
  if (maxAccounts) q.set('maxAccounts', String(maxAccounts));
  const res = await jupFetch(s, `/swap/v1/quote?${q}`);
  if (!res.ok) throw await jupError(res);
  return (await res.json()) as JupQuote;
}

async function jupSwapTx(s: Settings, quote: JupQuote, user: string) {
  const network = s.solanaFee;
  const prioritizationFeeLamports =
    network.mode === 'jito'
      ? { jitoTipLamports: Math.round(network.jitoTipSol * 1e9) }
      : {
          priorityLevelWithMaxLamports: {
            maxLamports: Math.round(network.maxPriorityFeeSol * 1e9),
            priorityLevel: 'veryHigh',
            global: false,
          },
        };
  const res = await jupFetch(s, '/swap/v1/swap', {
    method: 'POST',
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: user,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports,
    }),
  });
  if (!res.ok) throw await jupError(res);
  return (await res.json()) as { swapTransaction: string; lastValidBlockHeight: number };
}

async function sendJito(txB64: string): Promise<void> {
  await fetch(JITO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [txB64, { encoding: 'base64' }] }),
  }).catch(() => {});
}

function describeTxError(err: unknown): string {
  const s = JSON.stringify(err);
  // 6001 = SlippageToleranceExceeded in the Jupiter program
  if (/"Custom":6001/.test(s)) return 'Slippage exceeded — raise slippage and retry';
  if (/InsufficientFundsForRent/.test(s)) return 'Fee wallet is not set up yet — try again in a minute';
  if (/InsufficientFunds|"Custom":1}/.test(s)) return 'Insufficient balance';
  return `Transaction failed: ${s}`;
}

/**
 * Poll until `signature` is confirmed. Throws if it fails on-chain, expires, or times out.
 * `rebroadcast` (only when we hold the signed bytes) resends every ~2s until it lands.
 */
export async function confirmSignature(
  rpc: string,
  signature: string,
  lastValidBlockHeight: number,
  rebroadcast?: () => Promise<void>,
): Promise<void> {
  const started = Date.now();
  let lastSend = Date.now();
  for (let i = 0; Date.now() - started < 90_000; i++) {
    await sleep(1000);
    keepAlive();
    const st = await getSignatureStatus(rpc, signature).catch(() => null);
    if (st?.err) throw new Error(describeTxError(st.err));
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return;
    // Rebroadcast periodically until it lands (maxRetries: 0 on the RPC).
    if (rebroadcast && Date.now() - lastSend > 2000) {
      lastSend = Date.now();
      rebroadcast().catch(() => {});
    }
    if (i % 5 === 4) {
      const height = await getBlockHeight(rpc).catch(() => 0);
      if (height > lastValidBlockHeight) throw new Error('Transaction expired (stale blockhash) — try again');
    }
  }
  throw new Error('Not confirmed after 90 seconds — check the explorer');
}

export interface BuiltSwap {
  quote: JupQuote;
  /** Unsigned versioned transaction, base64. */
  txBase64: string;
  lastValidBlockHeight: number;
  /** QuickApe fee included in the transaction. */
  feeLamports: bigint;
}

/**
 * Quote + unsigned swap transaction for `user` (signed later by us or by the user's wallet).
 *
 * The fee is a SOL transfer appended to Jupiter's transaction rather than Jupiter's platform
 * fee, which some routes (e.g. pump.fun curves) charge in the token itself and which fails
 * outright for Token-2022 tokens. Buys: it comes off the SOL you spend. Sells: it's taken
 * from the minimum SOL out after slippage, so it never exceeds the rate on what you receive.
 */
export async function buildSolanaSwap(
  s: Settings,
  user: string,
  inputMint: string,
  outputMint: string,
  amount: bigint,
  fee?: SwapFee,
): Promise<BuiltSwap> {
  if (!fee) {
    const quote = await jupQuote(s, inputMint, outputMint, amount);
    const { swapTransaction, lastValidBlockHeight } = await jupSwapTx(s, quote, user);
    return { quote, txBase64: swapTransaction, lastValidBlockHeight, feeLamports: 0n };
  }
  const bps = BigInt(fee.bps);
  const buying = inputMint === SOL_MINT;
  const buyFee = buying ? (amount * bps) / 10_000n : 0n;
  // The transfer adds two accounts; if a route then no longer fits, retry with a simpler one.
  for (const maxAccounts of [56, 40]) {
    const quote = await jupQuote(s, inputMint, outputMint, amount - buyFee, maxAccounts);
    const feeLamports = buying ? buyFee : (BigInt(quote.otherAmountThreshold) * bps) / 10_000n;
    const { swapTransaction, lastValidBlockHeight } = await jupSwapTx(s, quote, user);
    if (feeLamports === 0n) return { quote, txBase64: swapTransaction, lastValidBlockHeight, feeLamports };
    try {
      const tx = await appendSolTransfer(base64.decode(swapTransaction), user, fee.to, feeLamports, (need) =>
        loadLookupTables(s.chains.solana.rpc, need),
      );
      return { quote, txBase64: base64.encode(tx), lastValidBlockHeight, feeLamports };
    } catch (e) {
      if (!(e instanceof TxTooLarge) || maxAccounts === 40) throw e;
    }
  }
  throw new Error('Unreachable');
}

/** Send an already-signed transaction to the RPC (and Jito in Jito mode), with rebroadcast until confirmed. */
export async function broadcastSigned(
  s: Settings,
  signed: Uint8Array,
  signature: string,
  lastValidBlockHeight: number,
): Promise<{ confirmation: Promise<void> }> {
  const rpc = s.chains.solana.rpc;
  const txB64 = base64.encode(signed);
  const useJito = s.solanaFee.mode === 'jito';
  const broadcast = async () => {
    await Promise.all([sendRawTransaction(rpc, txB64), useJito ? sendJito(txB64) : Promise.resolve()]);
  };
  await broadcast();
  const confirmation = confirmSignature(rpc, signature, lastValidBlockHeight, broadcast);
  // Avoid an unhandled rejection if the caller hasn't awaited yet.
  confirmation.catch(() => {});
  // Wrapped in an object: returning the promise directly from an async function would await it.
  return { confirmation };
}

export interface SubmittedSwap {
  signature: string;
  quote: JupQuote;
  /** Resolves once confirmed, throws if it fails / expires. */
  confirmation: Promise<void>;
}

/** Quote -> build -> sign -> send with the extension's trading wallet. */
export async function solanaSwap(
  s: Settings,
  wallet: SolanaWallet,
  inputMint: string,
  outputMint: string,
  amount: bigint,
  fee?: SwapFee,
  preflight?: Promise<void>,
): Promise<SubmittedSwap> {
  const built = await buildSolanaSwap(s, wallet.address, inputMint, outputMint, amount, fee);
  // Checks run alongside the quote (e.g. enough SOL) must pass before anything is sent.
  await preflight;
  const { signed, signature } = signSerializedTx(base64.decode(built.txBase64), wallet);
  const { confirmation } = await broadcastSigned(s, signed, signature, built.lastValidBlockHeight);
  return { signature, quote: built.quote, confirmation };
}
