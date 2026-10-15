import { CHAINS, isEvmChain } from '@/lib/chains';
import { erc20Balance } from '@/lib/evm/client';
import { compact, formatUnits, parseUnits, toDecimalString } from '@/lib/format';
import { resolveToken, tokenDecimals } from '@/lib/market';
import type { EvmTxJson, PreparedTrade, Push } from '@/lib/messages';
import type { Settings } from '@/lib/settings';
import { getBalanceLamports, getTokenBalance } from '@/lib/solana/rpc';
import { buildEvmSwap, evmSwap, NATIVE, SWAP_REVERTED, waitEvmTx, type EvmTxRequest } from '@/lib/trade/evm';
import { buildSolanaSwap, confirmSignature, SOL_MINT, solanaSwap } from '@/lib/trade/solana';
import { withdrawEvm, withdrawSol } from '@/lib/trade/withdraw';
import type { ChainId, TokenInfo, TokenRequest, TradeRecord } from '@/lib/types';
import { numberToHex, type Hex } from 'viem';
import { feeBpsFor, solanaSwapFee } from './fees';
import { closeAfterFullSell } from './reclaim';
import { getWallets, touch } from './session';
import { FEES } from '@/lib/fees';

const HISTORY = 'trades';

export async function tradeHistory(): Promise<TradeRecord[]> {
  return ((await browser.storage.local.get(HISTORY))[HISTORY] as TradeRecord[] | undefined) ?? [];
}

// Update history sequentially so parallel updates don't overwrite each other.
let historyQueue = Promise.resolve();
function saveTrade(t: TradeRecord): Promise<void> {
  historyQueue = historyQueue.then(async () => {
    const list = (await tradeHistory()).filter((x) => x.id !== t.id);
    list.unshift(t);
    await browser.storage.local.set({ [HISTORY]: list.slice(0, 100) });
  });
  return historyQueue;
}

function push(msg: Push, tabId?: number) {
  if (tabId !== undefined) browser.tabs.sendMessage(tabId, msg).catch(() => {});
  browser.runtime.sendMessage(msg).catch(() => {}); // popup (if open)
}

function notifyTitle(t: TradeRecord): string {
  if (t.side === 'withdraw') return t.status === 'confirmed' ? `✅ Withdrew ${t.amountLabel}` : '❌ Withdrawal failed';
  const verb = t.side === 'buy' ? 'Buy' : 'Sell';
  return t.status === 'confirmed' ? `✅ ${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}` : `❌ ${verb} ${t.symbol} failed`;
}

function notify(t: TradeRecord) {
  browser.notifications
    .create(t.id, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: notifyTitle(t),
      message:
        t.status === 'confirmed'
          ? t.side === 'withdraw'
            ? `Sent to ${t.token}`
            : `${t.amountLabel}${t.outLabel ? ` → ${t.outLabel}` : ''}`
          : (t.error ?? ''),
    })
    .catch(() => {});
}

// One EVM transaction per chain at a time until it's sent, so nonces don't collide.
const evmLocks = new Map<string, Promise<unknown>>();
async function withChainLock<T>(chain: string, fn: () => Promise<T>): Promise<T> {
  const prev = evmLocks.get(chain) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  evmLocks.set(chain, run);
  return run;
}

export type TradeParams = { req: TokenRequest } & (
  | { side: 'buy'; amount: number | 'quick' }
  | { side: 'sell'; percent: number }
);

type Owners = { solana?: string; evm?: Hex };

interface Plan {
  token: TokenInfo;
  chain: ChainId;
  owner: string;
  record: TradeRecord;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  /** Token balance before a sell (undefined for buys). */
  balance?: bigint;
}

/**
 * Everything that doesn't need a signature: resolve the token, apply limits, work out
 * the input amount (native for buys, % of the owner's balance for sells).
 */
async function plan(p: TradeParams, settings: Settings, owners: Owners, missingWallet: (family: string) => string): Promise<Plan> {
  const resolved = await resolveToken(p.req, settings);
  if (!('token' in resolved)) throw new Error('Pick the right token first (ambiguous ticker)');
  const token = resolved.token;
  const chain = token.chain;
  const cs = settings.chains[chain];
  if (!cs.enabled) throw new Error(`${CHAINS[chain].name} is disabled — enable it in Settings`);
  const native = CHAINS[chain];
  const owner = chain === 'solana' ? owners.solana : owners.evm;
  if (!owner) throw new Error(missingWallet(chain === 'solana' ? 'Solana' : 'EVM'));
  const nativeIn = chain === 'solana' ? SOL_MINT : NATIVE;

  const record: TradeRecord = {
    id: crypto.randomUUID(),
    time: Date.now(),
    chain,
    side: p.side,
    token: token.address,
    symbol: token.symbol,
    amountLabel: '',
    status: 'submitted',
    feeBps: await feeBpsFor(owners, settings),
  };

  if (p.side === 'buy') {
    const amount = p.amount === 'quick' ? cs.quickBuy : p.amount;
    if (!(amount > 0)) throw new Error('Invalid buy amount');
    if (amount > cs.maxBuy) throw new Error(`Above your max buy (${cs.maxBuy} ${native.symbol}) — change it in Settings`);
    record.amountLabel = `${toDecimalString(amount)} ${native.symbol}`;
    const amountIn = parseUnits(toDecimalString(amount), native.decimals);
    return { token, chain, owner, record, tokenIn: nativeIn, tokenOut: token.address, amountIn };
  }

  const pct = Math.round(p.percent);
  if (!(pct >= 1 && pct <= 100)) throw new Error('Sell percent must be 1-100');
  record.amountLabel = `${pct}% ${token.symbol}`;
  const balance =
    chain === 'solana'
      ? (await getTokenBalance(cs.rpc, owner, token.address)).raw
      : (await erc20Balance(chain as Exclude<ChainId, 'solana'>, cs.rpc, token.address as Hex, owner as Hex)).raw;
  if (balance === 0n) throw new Error(`You don't hold ${token.symbol}`);
  const amountIn = pct === 100 ? balance : (balance * BigInt(pct)) / 100n;
  return { token, chain, owner, record, tokenIn: token.address, tokenOut: nativeIn, amountIn, balance };
}

/** "≈ 1.2M BONK" for buys, "≈ 0.42 SOL" for sells. */
async function outLabel(pl: Plan, amountOut: bigint, settings: Settings): Promise<string | undefined> {
  if (pl.record.side === 'sell') {
    const native = CHAINS[pl.chain];
    return `${compact(Number(formatUnits(amountOut, native.decimals)), 4)} ${native.symbol}`;
  }
  const decimals = await tokenDecimals(pl.token, settings).catch(() => undefined);
  return decimals === undefined ? undefined : `${compact(Number(formatUnits(amountOut, decimals)))} ${pl.token.symbol}`;
}

/** Save as submitted, then push the final status (and a notification) once it confirms or fails. */
async function track(record: TradeRecord, confirmation: Promise<void>, tabId?: number): Promise<TradeRecord> {
  await saveTrade(record);
  touch().catch(() => {});
  confirmation.then(
    () => finish({ ...record, status: 'confirmed' }, tabId),
    (e: Error) => finish({ ...record, status: 'failed', error: e.message }, tabId),
  );
  return record;
}

async function finish(t: TradeRecord, tabId?: number) {
  await saveTrade(t);
  push({ type: 'tradeUpdate', trade: t }, tabId);
  notify(t);
}

/**
 * Local mode: sign with the extension's trading wallet and send. Resolves once the
 * transaction is sent (`submitted`); the final status is pushed later via `tradeUpdate`.
 */
export async function executeTrade(p: TradeParams, settings: Settings, tabId?: number): Promise<TradeRecord> {
  if (settings.signer === 'connected') throw new Error('Connected mode is on — approve trades in your wallet on the site');
  const wallets = await getWallets();
  if (!wallets) throw new Error('Wallet locked — click the QuickApe icon in your toolbar to unlock');
  const pl = await plan(
    p,
    settings,
    { solana: wallets.solana?.address, evm: wallets.evm?.address },
    (f) => `No ${f} wallet yet — import one in Settings`,
  );

  try {
    let txId: string;
    let confirmation: Promise<void>;
    let amountOut: bigint;
    if (pl.chain === 'solana') {
      const funds = pl.record.side === 'buy' ? ensureSol(settings, pl.owner, pl.amountIn) : undefined;
      funds?.catch(() => {});
      const fee = await solanaSwapFee(settings, pl.record.feeBps ?? 0);
      const r = await solanaSwap(settings, wallets.solana!, pl.tokenIn, pl.tokenOut, pl.amountIn, fee, funds);
      if (!fee) pl.record.feeBps = 0;
      if (pl.record.side === 'sell' && pl.amountIn === pl.balance) closeAfterFullSell(settings, wallets.solana!, pl.token.address, r.confirmation);
      [txId, confirmation, amountOut] = [r.signature, r.confirmation, BigInt(r.quote.outAmount)];
    } else if (isEvmChain(pl.chain)) {
      const chain = pl.chain;
      const fee = evmFee(pl.record.feeBps);
      const r = await withChainLock(chain, () =>
        evmSwap(settings, chain, wallets.evm!, pl.tokenIn, pl.tokenOut, pl.amountIn, fee),
      );
      [txId, confirmation, amountOut] = [r.hash, r.confirmation, r.amountOut];
    } else throw new Error('Unsupported chain');

    pl.record.txId = txId;
    pl.record.outLabel = await outLabel(pl, amountOut, settings);
    return track(pl.record, confirmation, tabId);
  } catch (e) {
    const err = tradeError(e, pl.chain);
    await saveTrade({ ...pl.record, status: 'failed', error: err.message });
    throw err;
  }
}

/** Room for network fees and the new token account's rent on top of the buy amount. */
const SOL_BUY_RESERVE = 2_500_000n;

/**
 * Solana transactions are sent with skipPreflight, so one the wallet can't pay for would
 * sit until its blockhash expires. Fail fast with a clear message instead.
 */
async function ensureSol(settings: Settings, owner: string, amountIn: bigint) {
  const balance = await getBalanceLamports(settings.chains.solana.rpc, owner);
  const need = amountIn + SOL_BUY_RESERVE;
  if (balance < need) {
    const sol = (n: bigint) => compact(Number(formatUnits(n, 9)), 4);
    throw new Error(`Not enough SOL: you have ${sol(balance)}, this buy needs about ${sol(need)}. Deposit from the Wallet tab.`);
  }
}

/** viem errors carry a long multi-line message; keep the one-line summary. */
function tradeError(e: unknown, chain: ChainId): Error {
  const err = e as Error & { shortMessage?: string };
  const text = err.shortMessage ?? err.message;
  if (isEvmChain(chain) && /insufficient funds|exceeds the balance/i.test(text)) {
    return new Error(`Not enough ${CHAINS[chain].symbol} for this trade plus gas. Deposit from the Wallet tab.`);
  }
  return err.shortMessage ? new Error(err.shortMessage) : err;
}

const evmFee =(bps?: number) => (bps ? { bps, receiver: FEES.wallets.evm } : undefined);

const txJson = (t: EvmTxRequest): EvmTxJson => ({
  to: t.to,
  data: t.data,
  value: numberToHex(t.value),
  gas: t.gas === undefined ? undefined : numberToHex(t.gas),
});

/**
 * Connected mode: build the unsigned transaction(s) for the user's Phantom / MetaMask
 * address. The content script has the wallet sign and send them, then calls `trackTrade`.
 */
export async function prepareTrade(p: TradeParams, settings: Settings, owners: Owners): Promise<PreparedTrade> {
  const pl = await plan(p, settings, owners, (f) => `Connect your ${f} wallet first`);
  if (pl.chain === 'solana') {
    const fee = await solanaSwapFee(settings, pl.record.feeBps ?? 0);
    if (!fee) pl.record.feeBps = 0;
    const built = await buildSolanaSwap(settings, pl.owner, pl.tokenIn, pl.tokenOut, pl.amountIn, fee);
    pl.record.outLabel = await outLabel(pl, BigInt(built.quote.outAmount), settings);
    return { record: pl.record, solana: { tx: built.txBase64, lastValidBlockHeight: built.lastValidBlockHeight } };
  }
  if (!isEvmChain(pl.chain)) throw new Error('Unsupported chain');
  const built = await buildEvmSwap(settings, pl.chain, pl.owner as Hex, pl.tokenIn, pl.tokenOut, pl.amountIn, evmFee(pl.record.feeBps));
  pl.record.outLabel = await outLabel(pl, built.amountOut, settings);
  return {
    record: pl.record,
    evm: {
      chainId: CHAINS[pl.chain].evmId!,
      approve: built.approve && txJson(built.approve),
      swap: txJson(built.swap),
    },
  };
}

/** Connected mode: the user's wallet sent the transaction; watch it until it confirms. */
export async function trackTrade(
  record: TradeRecord,
  txId: string,
  settings: Settings,
  lastValidBlockHeight: number | undefined,
  tabId?: number,
): Promise<TradeRecord> {
  const chain = record.chain;
  let confirmation: Promise<void>;
  if (chain === 'solana') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txId)) throw new Error('Invalid transaction signature');
    // Phantom sends it; without the signed bytes we can only watch, not rebroadcast.
    confirmation = confirmSignature(settings.chains.solana.rpc, txId, lastValidBlockHeight ?? Number.MAX_SAFE_INTEGER);
  } else if (isEvmChain(chain)) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txId)) throw new Error('Invalid transaction hash');
    confirmation = waitEvmTx(settings, chain, txId as Hex, SWAP_REVERTED);
  } else throw new Error('Unsupported chain');
  confirmation.catch(() => {});
  return track({ ...record, txId, status: 'submitted', time: Date.now() }, confirmation, tabId);
}

/** Connected mode: wait for an approve transaction before sending the swap. */
export async function waitApproval(chain: ChainId, hash: string, settings: Settings): Promise<true> {
  if (!isEvmChain(chain) || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid approval transaction');
  await waitEvmTx(settings, chain, hash as Hex, 'Token approval failed');
  return true;
}

/** Send native SOL / ETH / BNB from the trading wallet back to the user's own wallet. */
export async function executeWithdraw(
  chain: ChainId,
  to: string,
  amount: string,
  settings: Settings,
): Promise<TradeRecord> {
  const wallets = await getWallets();
  if (!wallets) throw new Error('Wallet locked — unlock it first');
  const native = CHAINS[chain];
  let raw: bigint | 'max';
  if (amount === 'max') raw = 'max';
  else {
    const n = Number(amount);
    if (!(n > 0)) throw new Error('Enter an amount');
    raw = parseUnits(toDecimalString(n), native.decimals);
  }

  const r =
    chain === 'solana'
      ? await (wallets.solana
          ? withdrawSol(settings, wallets.solana, to.trim(), raw)
          : Promise.reject(new Error('No Solana wallet yet')))
      : isEvmChain(chain) && wallets.evm
        ? await withChainLock(chain, () => withdrawEvm(settings, chain, wallets.evm!, to.trim(), raw))
        : await Promise.reject(new Error('No EVM wallet yet'));

  const record: TradeRecord = {
    id: crypto.randomUUID(),
    time: Date.now(),
    chain,
    side: 'withdraw',
    token: to.trim(),
    symbol: native.symbol,
    amountLabel: `${Number(formatUnits(r.amount, native.decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${native.symbol}`,
    status: 'submitted',
    txId: r.txId,
  };
  return track(record, r.confirmation);
}
