import type { Hex } from 'viem';
import { familyOf } from './address';
import { CHAINS, EVM_CHAIN_IDS, chainFromDexscreener } from './chains';
import { erc20Meta } from './evm/client';
import type { Settings } from './settings';
import { getMintInfo } from './solana/rpc';
import type { ChainId, EvmChainId, SafetyFlag, TokenInfo, TokenRef, TokenRequest } from './types';

const DS = 'https://api.dexscreener.com';

interface DsToken {
  address: string;
  name: string;
  symbol: string;
}

interface DsPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DsToken;
  quoteToken: DsToken;
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

// Small in-memory cache in the service worker so repeated hovers/clicks don't spam APIs.
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

// Case-insensitive for Solana too: Dexscreener URLs write addresses in lowercase.
const sameAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function dsTokenPairs(chain: ChainId, address: string): Promise<DsPair[]> {
  return cached(`dst:${chain}:${address}`, 15_000, async () =>
    (await getJson<DsPair[] | null>(`${DS}/tokens/v1/${CHAINS[chain].dexscreener}/${address}`)) ?? [],
  );
}

async function dsPair(chain: ChainId, pair: string): Promise<DsPair | undefined> {
  return cached(`dsp:${chain}:${pair}`, 15_000, async () => {
    const r = await getJson<{ pairs?: DsPair[] | null; pair?: DsPair | null }>(
      `${DS}/latest/dex/pairs/${CHAINS[chain].dexscreener}/${pair}`,
    );
    return r.pair ?? r.pairs?.[0] ?? undefined;
  });
}

async function dsSearch(q: string): Promise<DsPair[]> {
  return cached(`dss:${q}`, 30_000, async () => {
    const r = await getJson<{ pairs?: DsPair[] | null }>(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`);
    return r.pairs ?? [];
  });
}

/** The highest-liquidity pair where `address` is the base token. */
function bestPair(pairs: DsPair[], chain: ChainId, address: string): DsPair | undefined {
  return pairs
    .filter((p) => chainFromDexscreener(p.chainId) === chain && sameAddr(p.baseToken.address, address))
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

function toInfo(p: DsPair, chain: ChainId): TokenInfo {
  return {
    chain,
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    imageUrl: p.info?.imageUrl,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : undefined,
    marketCap: p.marketCap ?? p.fdv,
    liquidityUsd: p.liquidity?.usd,
    volume24h: p.volume?.h24,
    change5m: p.priceChange?.m5,
    change1h: p.priceChange?.h1,
    change24h: p.priceChange?.h24,
    pairCreatedAt: p.pairCreatedAt,
    dexId: p.dexId,
    pairAddress: p.pairAddress,
    url: p.url,
  };
}

/** Info for a token Dexscreener hasn't indexed yet (e.g. just launched on pump.fun). */
async function minimalInfo(ref: TokenRef, settings: Settings): Promise<TokenInfo | undefined> {
  const rpc = settings.chains[ref.chain].rpc;
  if (ref.chain === 'solana') {
    const mint = await getMintInfo(rpc, ref.address);
    if (!mint) return undefined;
    return { ...ref, symbol: ref.address.slice(0, 4), name: 'New token (not on Dexscreener yet)' };
  }
  try {
    const m = await erc20Meta(ref.chain as EvmChainId, rpc, ref.address as Hex);
    return { ...ref, symbol: m.symbol, name: m.name };
  } catch {
    return undefined;
  }
}

export async function tokenInfo(ref: TokenRef, settings: Settings): Promise<TokenInfo> {
  const pair = bestPair(await dsTokenPairs(ref.chain, ref.address), ref.chain, ref.address);
  if (pair) return toInfo(pair, ref.chain);
  const info = await minimalInfo(ref, settings);
  if (!info) throw new Error("This address isn't a token");
  return info;
}

export type ResolveResult = { token: TokenInfo } | { candidates: TokenInfo[] };

const enabledChains = (s: Settings) => (Object.keys(s.chains) as ChainId[]).filter((c) => s.chains[c].enabled);

/**
 * Turn whatever was found on the page (CA, pair address, $ticker) into a concrete
 * token: chain + CA + market info.
 */
export async function resolveToken(req: TokenRequest, settings: Settings): Promise<ResolveResult> {
  const chains = enabledChains(settings);

  if (req.ticker && !req.address) {
    const sym = req.ticker.replace(/^\$/, '').toLowerCase();
    const pairs = (await dsSearch(sym)).filter((p) => {
      const c = chainFromDexscreener(p.chainId);
      return c && chains.includes(c) && p.baseToken.symbol.toLowerCase() === sym;
    });
    // One candidate per token (its highest-liquidity pair), sorted by liquidity.
    const seen = new Map<string, DsPair>();
    for (const p of pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))) {
      const k = `${p.chainId}:${p.baseToken.address}`;
      if (!seen.has(k)) seen.set(k, p);
    }
    const candidates = [...seen.values()].slice(0, 8).map((p) => toInfo(p, chainFromDexscreener(p.chainId)!));
    if (!candidates.length) throw new Error(`No $${req.ticker} token found on your enabled chains`);
    return { candidates };
  }

  const address = req.address?.trim();
  if (!address) throw new Error('No CA provided');
  // Dexscreener URLs write Solana addresses in lowercase (which breaks base58),
  // so if the chain is already known, take the family from the chain.
  const family = req.chain ? CHAINS[req.chain].family : familyOf(address);
  if (!family) throw new Error('Unrecognized CA format');

  let candidatesChains: ChainId[];
  if (req.chain) candidatesChains = [req.chain];
  else if (family === 'solana') candidatesChains = ['solana'];
  else candidatesChains = EVM_CHAIN_IDS;
  candidatesChains = candidatesChains.filter((c) => chains.includes(c) && CHAINS[c].family === family);
  if (!candidatesChains.length) throw new Error('The chain for this CA is disabled — enable it in Settings');

  // Treat it as a token CA. For EVM without a chain, pick the chain with the most liquidity.
  const asToken = async () => {
    const found = (
      await Promise.all(
        candidatesChains.map(async (c) => bestPair(await dsTokenPairs(c, address).catch(() => []), c, address)),
      )
    ).filter((p): p is DsPair => !!p);
    found.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return found[0] && toInfo(found[0], chainFromDexscreener(found[0].chainId)!);
  };
  // Treat it as a pair/pool address (dexscreener, axiom, photon, dextools links).
  const asPair = async () => {
    for (const c of candidatesChains) {
      const p = await dsPair(c, address).catch(() => undefined);
      if (p) return toInfo(p, c);
    }
    return undefined;
  };
  for (const step of req.isPair ? [asPair, asToken] : [asToken, asPair]) {
    const token = await step();
    if (token) return { token };
  }

  // New token that isn't on Dexscreener yet: check on-chain directly.
  for (const c of candidatesChains) {
    const info = await minimalInfo({ chain: c, address }, settings).catch(() => undefined);
    if (info) return { token: info };
  }
  throw new Error('Token not found (might be a wallet address, not a CA)');
}

interface GoPlusResult {
  is_honeypot?: string;
  buy_tax?: string;
  sell_tax?: string;
  cannot_sell_all?: string;
  is_blacklisted?: string;
  transfer_pausable?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  slippage_modifiable?: string;
  is_open_source?: string;
}

async function evmFlags(ref: TokenRef): Promise<SafetyFlag[]> {
  const id = CHAINS[ref.chain].goplus;
  if (!id) return [];
  const r = await cached(`gp:${ref.chain}:${ref.address}`, 120_000, () =>
    getJson<{ result?: Record<string, GoPlusResult> }>(
      `https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${ref.address}`,
    ),
  );
  const g = r.result?.[ref.address.toLowerCase()];
  if (!g) return [{ level: 'info', text: 'No security data yet (GoPlus)' }];
  const flags: SafetyFlag[] = [];
  const on = (v?: string) => v === '1';
  if (on(g.is_honeypot)) flags.push({ level: 'danger', text: "Honeypot — this token can't be sold" });
  if (on(g.cannot_sell_all)) flags.push({ level: 'danger', text: "Can't sell your full balance" });
  const buyTax = Number(g.buy_tax ?? 0);
  const sellTax = Number(g.sell_tax ?? 0);
  if (buyTax > 0 || sellTax > 0) {
    flags.push({
      level: sellTax >= 0.1 || buyTax >= 0.1 ? 'danger' : 'warn',
      text: `Buy tax ${(buyTax * 100).toFixed(1)}% / sell tax ${(sellTax * 100).toFixed(1)}%`,
    });
  }
  if (on(g.owner_change_balance)) flags.push({ level: 'danger', text: 'Owner can change holder balances' });
  if (on(g.is_blacklisted)) flags.push({ level: 'warn', text: 'Has a blacklist function' });
  if (on(g.transfer_pausable)) flags.push({ level: 'warn', text: 'Transfers can be paused' });
  if (on(g.slippage_modifiable)) flags.push({ level: 'warn', text: 'Owner can change the tax' });
  if (on(g.hidden_owner)) flags.push({ level: 'warn', text: 'Hidden owner' });
  if (g.is_open_source === '0') flags.push({ level: 'warn', text: 'Contract not verified' });
  return flags;
}

async function solanaFlags(ref: TokenRef, settings: Settings): Promise<SafetyFlag[]> {
  const mint = await mintInfo(ref.address, settings);
  if (!mint) return [{ level: 'danger', text: 'Not a valid token mint' }];
  const flags: SafetyFlag[] = [];
  if (mint.freezeAuthority) flags.push({ level: 'danger', text: 'Freeze authority enabled — your tokens can be frozen' });
  if (mint.mintAuthority) flags.push({ level: 'warn', text: 'Mint authority enabled — supply can be inflated' });
  if (mint.extensions.includes('permanentDelegate'))
    flags.push({ level: 'danger', text: 'Permanent delegate — tokens can be pulled from your wallet' });
  if (mint.extensions.includes('transferFeeConfig')) flags.push({ level: 'warn', text: 'Has a transfer fee (Token-2022)' });
  if (mint.extensions.includes('transferHook')) flags.push({ level: 'warn', text: 'Has a transfer hook (Token-2022)' });
  return flags;
}

const mintInfo = (address: string, settings: Settings) =>
  cached(`mint:${address}`, 60_000, () => getMintInfo(settings.chains.solana.rpc, address));

export async function tokenDecimals(ref: TokenRef, settings: Settings): Promise<number> {
  if (ref.chain === 'solana') {
    const m = await mintInfo(ref.address, settings);
    if (!m) throw new Error('Not a token mint');
    return m.decimals;
  }
  return cached(`dec:${ref.chain}:${ref.address}`, 3_600_000, async () => {
    return (await erc20Meta(ref.chain as EvmChainId, settings.chains[ref.chain].rpc, ref.address as Hex)).decimals;
  });
}

export async function safetyFlags(info: TokenInfo, settings: Settings): Promise<SafetyFlag[]> {
  const flags = await (info.chain === 'solana' ? solanaFlags(info, settings) : evmFlags(info)).catch(
    (): SafetyFlag[] => [{ level: 'info', text: "Couldn't run the token security check" }],
  );
  if (!info.pairAddress) flags.push({ level: 'info', text: 'Not on Dexscreener yet' });
  else if (info.dexId === 'pumpfun') flags.push({ level: 'info', text: 'Still on the pump.fun bonding curve' });
  // Bonding curve pairs have no liquidity data, so only check when it's there.
  else if (info.liquidityUsd !== undefined && info.liquidityUsd < 5_000)
    flags.push({ level: 'warn', text: 'Liquidity under $5K' });
  return flags;
}
