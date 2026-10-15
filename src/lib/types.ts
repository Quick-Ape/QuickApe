export type ChainId = 'solana' | 'ethereum' | 'base' | 'bsc';
export type EvmChainId = Exclude<ChainId, 'solana'>;
export type Family = 'solana' | 'evm';

/** Something found on the page. Not necessarily valid / resolved yet. */
export interface TokenRequest {
  /** Token CA, or a pair/pool address if `isPair` is true. */
  address?: string;
  /** Set when the chain is already known (e.g. from a gmgn.ai/base/... URL). */
  chain?: ChainId;
  /** `address` is a pair/pool address (dexscreener, axiom, photon) that needs resolving to a token. */
  isPair?: boolean;
  /** $TICKER without a CA. Can't be quick-bought; the user must pick a candidate first. */
  ticker?: string;
  /** Source site, for labels & debugging. */
  source?: string;
}

export interface TokenRef {
  chain: ChainId;
  address: string;
}

export interface TokenInfo extends TokenRef {
  symbol: string;
  name: string;
  imageUrl?: string;
  priceUsd?: number;
  marketCap?: number;
  liquidityUsd?: number;
  volume24h?: number;
  change5m?: number;
  change1h?: number;
  change24h?: number;
  pairCreatedAt?: number;
  dexId?: string;
  pairAddress?: string;
  url?: string;
}

export type Severity = 'danger' | 'warn' | 'info';

export interface SafetyFlag {
  level: Severity;
  text: string;
}

export interface Holding {
  raw: string;
  decimals: number;
  ui: number;
}

export interface TokenView {
  token: TokenInfo;
  flags: SafetyFlag[];
  /** The user's balance of this token (empty if the wallet is locked). */
  holding?: Holding;
  /** Native balance (SOL/ETH/BNB) on this token's chain. */
  native?: { ui: number; symbol: string };
}

export type TradeSide = 'buy' | 'sell' | 'withdraw';
export type TradeStatus = 'submitted' | 'confirmed' | 'failed';

export interface TradeRecord {
  id: string;
  time: number;
  chain: ChainId;
  side: TradeSide;
  token: string;
  symbol: string;
  /** "0.1 SOL" or "50%" */
  amountLabel: string;
  status: TradeStatus;
  txId?: string;
  error?: string;
  /** Estimated output from the quote, e.g. "1.2M BONK" */
  outLabel?: string;
  /** QuickApe fee charged on this trade, in basis points (50 = 0.5%). */
  feeBps?: number;
}

/** How trades get signed: by the extension's own trading wallet, or by the user's Phantom / MetaMask. */
export type SignerMode = 'local' | 'connected';

export interface WalletState {
  signer: SignerMode;
  hasVault: boolean;
  unlocked: boolean;
  hasMnemonic: boolean;
  /** Trading wallet addresses (only while unlocked). */
  solana?: string;
  evm?: string;
  /** Last addresses the user connected from Phantom / MetaMask (connected mode). */
  connected: { solana?: string; evm?: string };
}
