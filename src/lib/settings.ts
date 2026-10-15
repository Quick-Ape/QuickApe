import { CHAINS } from './chains';
import type { ChainId, SignerMode } from './types';

export interface ChainSettings {
  enabled: boolean;
  rpc: string;
  /** Slippage in basis points (100 = 1%). */
  slippageBps: number;
  /** Buy buttons in the panel, in native (SOL/ETH/BNB). */
  buyPresets: number[];
  /** Amount for the quick buy button (1-click instant buy). */
  quickBuy: number;
  /** Max amount per buy, as a guard against misclicks. */
  maxBuy: number;
}

export type SiteId = 'x' | 'dexscreener' | 'gmgn' | 'fomo' | 'pumpfun' | 'birdeye' | 'axiom' | 'telegram';

export const SITE_LABELS: Record<SiteId, string> = {
  x: 'X / Twitter',
  dexscreener: 'Dexscreener',
  gmgn: 'GMGN',
  fomo: 'Fomo',
  pumpfun: 'pump.fun',
  birdeye: 'Birdeye',
  axiom: 'Axiom',
  telegram: 'Telegram Web',
};

/** Wallet the bridge should use in connected mode. 'auto' = first one found on the page. */
export type SolanaWalletPref = 'auto' | 'Phantom' | 'Solflare' | 'Backpack';
export type EvmWalletPref = 'auto' | 'io.metamask' | 'app.phantom' | 'io.rabby' | 'com.coinbase.wallet';

export const SOLANA_WALLET_LABELS: Record<SolanaWalletPref, string> = {
  auto: 'Auto-detect',
  Phantom: 'Phantom',
  Solflare: 'Solflare',
  Backpack: 'Backpack',
};

export const EVM_WALLET_LABELS: Record<EvmWalletPref, string> = {
  auto: 'Auto-detect',
  'io.metamask': 'MetaMask',
  'app.phantom': 'Phantom',
  'io.rabby': 'Rabby',
  'com.coinbase.wallet': 'Coinbase Wallet',
};

export interface Settings {
  /** 'local' = 1-click with the extension's trading wallet, 'connected' = approve each trade in Phantom / MetaMask. */
  signer: SignerMode;
  connectedWallets: { solana: SolanaWalletPref; evm: EvmWalletPref };
  chains: Record<ChainId, ChainSettings>;
  solanaFee: {
    /** 'priority' = regular priority fee, 'jito' = Jito tip + also send to the Jito block engine. */
    mode: 'priority' | 'jito';
    maxPriorityFeeSol: number;
    jitoTipSol: number;
  };
  jupiter: {
    baseUrl: string;
    apiKey: string;
  };
  /** Sell buttons, in percent. */
  sellPresets: number[];
  /** Auto-lock the wallet after this many idle minutes. 0 = until the browser closes. */
  autoLockMinutes: number;
  sites: Record<SiteId, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  signer: 'local',
  connectedWallets: { solana: 'auto', evm: 'auto' },
  chains: {
    solana: {
      enabled: true,
      rpc: CHAINS.solana.defaultRpc,
      slippageBps: 1500,
      buyPresets: [0.05, 0.1, 0.25, 0.5, 1],
      quickBuy: 0.1,
      maxBuy: 2,
    },
    base: {
      enabled: true,
      rpc: CHAINS.base.defaultRpc,
      slippageBps: 1000,
      buyPresets: [0.002, 0.005, 0.01, 0.025, 0.05],
      quickBuy: 0.005,
      maxBuy: 0.5,
    },
    bsc: {
      enabled: true,
      rpc: CHAINS.bsc.defaultRpc,
      slippageBps: 1000,
      buyPresets: [0.01, 0.02, 0.05, 0.1, 0.25],
      quickBuy: 0.02,
      maxBuy: 1,
    },
    ethereum: {
      enabled: true,
      rpc: CHAINS.ethereum.defaultRpc,
      slippageBps: 1000,
      buyPresets: [0.005, 0.01, 0.025, 0.05, 0.1],
      quickBuy: 0.01,
      maxBuy: 0.5,
    },
  },
  solanaFee: {
    mode: 'priority',
    maxPriorityFeeSol: 0.0003,
    jitoTipSol: 0.001,
  },
  jupiter: {
    baseUrl: 'https://api.jup.ag',
    apiKey: '',
  },
  sellPresets: [25, 50, 100],
  autoLockMinutes: 240,
  sites: {
    x: true,
    dexscreener: true,
    gmgn: true,
    fomo: true,
    pumpfun: true,
    birdeye: true,
    axiom: true,
    telegram: true,
  },
};

const KEY = 'settings';
// Earlier defaults: the first blocks extensions, the second was the free stopgap before the QuickApe RPC.
// Old defaults. quickape.vercel.app was the RPC's address before it moved to our own domain.
const BLOCKED_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://quickape.vercel.app/api/rpc',
];

/** Merge saved settings with the defaults, so fields added in later versions still get filled in. */
function merge(saved: Partial<Settings> | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  if (!saved) return structuredClone(d);
  const chains = {} as Settings['chains'];
  for (const id of Object.keys(d.chains) as ChainId[]) {
    chains[id] = { ...d.chains[id], ...saved.chains?.[id] };
  }
  // Move users still on an old default to the QuickApe RPC (custom RPCs are kept).
  if (BLOCKED_RPCS.includes(chains.solana.rpc.replace(/\/+$/, ''))) chains.solana.rpc = d.chains.solana.rpc;
  const solanaFee = { ...d.solanaFee, ...saved.solanaFee };
  // 0.001 SOL was the old default cap: 10% of a 0.01 SOL trade. Move untouched defaults down.
  if (solanaFee.maxPriorityFeeSol === 0.001) solanaFee.maxPriorityFeeSol = d.solanaFee.maxPriorityFeeSol;
  const jupiter = { ...d.jupiter, ...saved.jupiter };
  // lite-api was the old default and is being retired.
  if (jupiter.baseUrl.replace(/\/+$/, '') === 'https://lite-api.jup.ag') jupiter.baseUrl = d.jupiter.baseUrl;
  return {
    ...d,
    ...saved,
    chains,
    solanaFee,
    jupiter,
    connectedWallets: { ...d.connectedWallets, ...saved.connectedWallets },
    sites: { ...d.sites, ...saved.sites },
  };
}

export async function loadSettings(): Promise<Settings> {
  const res = await browser.storage.local.get(KEY);
  return merge(res[KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: s });
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(merge(changes[KEY].newValue as Partial<Settings>));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
