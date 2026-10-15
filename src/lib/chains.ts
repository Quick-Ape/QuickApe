import type { ChainId, EvmChainId, Family } from './types';

export interface ChainMeta {
  id: ChainId;
  family: Family;
  name: string;
  symbol: string;
  decimals: number;
  /** EIP-155 chain id (EVM only). */
  evmId?: number;
  /** chainId in the Dexscreener API. */
  dexscreener: string;
  /** Chain segment in gmgn.ai URLs. */
  gmgn: string;
  /** Chain slug in the KyberSwap Aggregator API. */
  kyber?: string;
  /** Chain id in the GoPlus security API. */
  goplus?: string;
  explorer: string;
  defaultRpc: string;
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  solana: {
    id: 'solana',
    family: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    dexscreener: 'solana',
    gmgn: 'sol',
    explorer: 'https://solscan.io',
    // QuickApe's Helius proxy; falls back to PublicNode automatically (see lib/solana/rpc.ts).
    // api.mainnet-beta.solana.com refuses requests from browser extensions (HTTP 403).
    defaultRpc: 'https://www.quickape.world/api/rpc',
  },
  base: {
    id: 'base',
    family: 'evm',
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    evmId: 8453,
    dexscreener: 'base',
    gmgn: 'base',
    kyber: 'base',
    goplus: '8453',
    explorer: 'https://basescan.org',
    defaultRpc: 'https://mainnet.base.org',
  },
  bsc: {
    id: 'bsc',
    family: 'evm',
    name: 'BSC',
    symbol: 'BNB',
    decimals: 18,
    evmId: 56,
    dexscreener: 'bsc',
    gmgn: 'bsc',
    kyber: 'bsc',
    goplus: '56',
    explorer: 'https://bscscan.com',
    defaultRpc: 'https://bsc-dataseed.bnbchain.org',
  },
  ethereum: {
    id: 'ethereum',
    family: 'evm',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    evmId: 1,
    dexscreener: 'ethereum',
    gmgn: 'eth',
    kyber: 'ethereum',
    goplus: '1',
    explorer: 'https://etherscan.io',
    defaultRpc: 'https://ethereum-rpc.publicnode.com',
  },
};

export const CHAIN_IDS: ChainId[] = ['solana', 'base', 'bsc', 'ethereum'];
export const EVM_CHAIN_IDS: EvmChainId[] = ['base', 'bsc', 'ethereum'];

export const isEvmChain = (c: ChainId): c is EvmChainId => CHAINS[c].family === 'evm';

export function chainFromDexscreener(id: string): ChainId | undefined {
  return CHAIN_IDS.find((c) => CHAINS[c].dexscreener === id);
}

const ALIASES: Record<string, ChainId> = {
  sol: 'solana',
  solana: 'solana',
  eth: 'ethereum',
  ether: 'ethereum',
  ethereum: 'ethereum',
  base: 'base',
  bsc: 'bsc',
  bnb: 'bsc',
};

/** Map a chain segment from various platforms' URLs (gmgn, dextools, birdeye...). */
export function chainFromSlug(slug: string | null | undefined): ChainId | undefined {
  return slug ? ALIASES[slug.toLowerCase()] : undefined;
}

export const txUrl = (chain: ChainId, id: string) => `${CHAINS[chain].explorer}/tx/${id}`;
export const tokenUrl = (chain: ChainId, address: string) => `${CHAINS[chain].explorer}/token/${address}`;
export const gmgnUrl = (chain: ChainId, address: string) => `https://gmgn.ai/${CHAINS[chain].gmgn}/token/${address}`;
export const dexscreenerUrl = (chain: ChainId, address: string) =>
  `https://dexscreener.com/${CHAINS[chain].dexscreener}/${address}`;
