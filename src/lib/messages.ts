import type { ResolveResult } from './market';
import type { Settings } from './settings';
import type { Hex } from 'viem';
import type { ChainId, TokenRef, TokenRequest, TokenView, TradeRecord, WalletState } from './types';

/** Messages from the popup / content script to the background. */
export type Request =
  | { type: 'state' }
  | { type: 'generateMnemonic' }
  | {
      type: 'createVault';
      password: string;
      mnemonic?: string;
      accountIndex?: number;
      solanaKey?: string;
      evmKey?: string;
    }
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'resetVault' }
  | { type: 'exportSecrets'; password: string }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; settings: Settings }
  | { type: 'resolve'; req: TokenRequest }
  | { type: 'tokenView'; ref: TokenRef }
  | { type: 'balances' }
  | { type: 'trade'; req: TokenRequest; side: 'buy'; amount: number | 'quick' }
  | { type: 'trade'; req: TokenRequest; side: 'sell'; percent: number }
  | { type: 'trades' }
  | { type: 'openPopup' }
  // connected mode (Phantom / MetaMask sign on the page)
  | { type: 'setConnected'; family: 'solana' | 'evm'; address: string }
  | ({ type: 'prepareTrade'; owners: { solana?: string; evm?: string } } & TradeBody)
  | { type: 'trackTrade'; record: TradeRecord; txId: string; lastValidBlockHeight?: number }
  | { type: 'waitApproval'; chain: ChainId; hash: string }
  // trading wallet funds
  | { type: 'withdraw'; chain: ChainId; to: string; amount: string }
  | { type: 'reclaimRent' };

type TradeBody = { req: TokenRequest } & ({ side: 'buy'; amount: number | 'quick' } | { side: 'sell'; percent: number });

/** EVM transaction request as JSON (bigints as hex) so it survives extension messaging. */
export interface EvmTxJson {
  to: Hex;
  data: Hex;
  value: Hex;
  gas?: Hex;
}

/** Unsigned transaction(s) for the user's own wallet to sign in connected mode. */
export interface PreparedTrade {
  record: TradeRecord;
  solana?: { tx: string; lastValidBlockHeight: number };
  evm?: { chainId: number; approve?: EvmTxJson; swap: EvmTxJson };
}

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Messages from the background to tabs / the popup. */
export type Push = { type: 'tradeUpdate'; trade: TradeRecord } | { type: 'walletState'; state: WalletState };

export interface Balances {
  native: Partial<Record<ChainId, number>>;
  /** Per-chain RPC error, so the UI can say why a balance is missing. */
  errors?: Partial<Record<ChainId, string>>;
}

export interface ExportedSecrets {
  mnemonic?: string;
  solana?: string;
  evm?: string;
}

/** Maps request type -> response data type, so `send()` is typed. */
export interface ResponseMap {
  state: WalletState;
  generateMnemonic: string;
  createVault: WalletState;
  unlock: WalletState;
  lock: WalletState;
  resetVault: WalletState;
  exportSecrets: ExportedSecrets;
  getSettings: Settings;
  saveSettings: Settings;
  resolve: ResolveResult;
  tokenView: TokenView;
  balances: Balances;
  trade: TradeRecord;
  trades: TradeRecord[];
  openPopup: boolean;
  setConnected: WalletState;
  prepareTrade: PreparedTrade;
  trackTrade: TradeRecord;
  waitApproval: true;
  withdraw: TradeRecord;
  reclaimRent: { closed: number; sol: number; found: number };
}

export async function send<R extends Request>(req: R): Promise<ResponseMap[R['type']]> {
  const res = (await browser.runtime.sendMessage(req)) as Response<ResponseMap[R['type']]> | undefined;
  if (!res) throw new Error('Extension not responding. Try reloading the page.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
