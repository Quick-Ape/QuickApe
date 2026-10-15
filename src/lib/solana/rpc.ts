/** Minimal fetch-based Solana JSON-RPC client (no @solana/web3.js, safe in a service worker). */
import { base58, base64 } from '@scure/base';
import { associatedTokenAddress } from './pda';

export class RpcError extends Error {}
/** The endpoint itself failed (network, 403, 429, 5xx), as opposed to a JSON-RPC error about the request. */
class RpcUnavailable extends RpcError {}

/** QuickApe's own RPC: a Vercel proxy to Helius, key kept server-side. */
export const QUICKAPE_RPC = 'https://www.quickape.world/api/rpc';
/** Free, keyless, extension-friendly fallback when the configured RPC is down or refuses us. */
export const FALLBACK_SOLANA_RPC = 'https://solana-rpc.publicnode.com';

let nextId = 1;
// Endpoints that just failed are skipped for a short while instead of being retried on every call.
const downUntil = new Map<string, number>();

async function rpcOnce<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
  } catch {
    throw new RpcUnavailable(`Solana RPC unreachable (${new URL(url).hostname})`);
  }
  if (!res.ok) {
    // Public endpoints often refuse browser-extension requests (403) or rate-limit them (429).
    const hint = [401, 403, 429].includes(res.status) ? ' — set your own Solana RPC (e.g. Helius) in Settings' : '';
    throw new RpcUnavailable(`Solana RPC ${method} failed (HTTP ${res.status})${hint}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new RpcError(`RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

export async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  if (url !== FALLBACK_SOLANA_RPC && (downUntil.get(url) ?? 0) > Date.now()) {
    return rpcOnce<T>(FALLBACK_SOLANA_RPC, method, params);
  }
  try {
    return await rpcOnce<T>(url, method, params);
  } catch (e) {
    if (!(e instanceof RpcUnavailable) || url === FALLBACK_SOLANA_RPC) throw e;
    downUntil.set(url, Date.now() + 30_000);
    return rpcOnce<T>(FALLBACK_SOLANA_RPC, method, params);
  }
}

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export async function getBalanceLamports(url: string, owner: string): Promise<bigint> {
  const r = await rpc<{ value: number }>(url, 'getBalance', [owner, { commitment: 'confirmed' }]);
  return BigInt(r.value);
}

/** Address lookup tables are append-only, so a cached address list stays valid for the indices it has. */
const lookupTables = new Map<string, string[]>();
const LOOKUP_TABLE_META_SIZE = 56;

/** Address lists of lookup tables; `need` is the length each table must have (refetched if the cache is shorter). */
export async function loadLookupTables(url: string, need: Map<string, number>): Promise<Map<string, string[]>> {
  const missing = [...need].filter(([t, len]) => (lookupTables.get(t)?.length ?? 0) < len).map(([t]) => t);
  if (missing.length) {
    const r = await rpc<{ value: ({ data: [string, string] } | null)[] }>(url, 'getMultipleAccounts', [
      missing,
      { encoding: 'base64', commitment: 'confirmed' },
    ]);
    r.value.forEach((acc, i) => {
      if (!acc) throw new Error(`Lookup table ${missing[i]} not found`);
      const data = base64.decode(acc.data[0]);
      const addresses: string[] = [];
      for (let p = LOOKUP_TABLE_META_SIZE; p + 32 <= data.length; p += 32) addresses.push(base58.encode(data.subarray(p, p + 32)));
      lookupTables.set(missing[i], addresses);
    });
  }
  return new Map([...need.keys()].map((t) => [t, lookupTables.get(t) ?? []]));
}

interface ParsedTokenAccount {
  account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number } } } } };
}

/** Total `mint` token balance owned by `owner` (all token accounts, SPL & Token-2022). */
export async function getTokenBalance(url: string, owner: string, mint: string): Promise<{ raw: bigint; decimals: number }> {
  let accounts: ParsedTokenAccount['account'][];
  try {
    const r = await rpc<{ value: ParsedTokenAccount[] }>(url, 'getTokenAccountsByOwner', [
      owner,
      { mint },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    accounts = r.value.map((a) => a.account);
  } catch {
    // Some free RPCs (e.g. PublicNode) don't serve indexed calls. Read the associated token
    // accounts directly instead — that's where swaps deliver tokens.
    const atas = [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((p) => associatedTokenAddress(owner, mint, p));
    const r = await rpc<{ value: (ParsedTokenAccount['account'] | null)[] }>(url, 'getMultipleAccounts', [
      atas,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    accounts = r.value.filter((a): a is ParsedTokenAccount['account'] => !!a && !Array.isArray(a.data));
  }
  let raw = 0n;
  let decimals = 0;
  for (const acc of accounts) {
    const amt = acc.data.parsed.info.tokenAmount;
    raw += BigInt(amt.amount);
    decimals = amt.decimals;
  }
  return { raw, decimals };
}

export interface MintInfo {
  program: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
}

/** Token mint info, or null if this address isn't an SPL/Token-2022 mint. */
export async function getMintInfo(url: string, mint: string): Promise<MintInfo | null> {
  const r = await rpc<{
    value: {
      owner: string;
      data: { parsed?: { type: string; info: Record<string, unknown> } } | unknown[];
    } | null;
  }>(url, 'getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const v = r.value;
  if (!v || (v.owner !== TOKEN_PROGRAM && v.owner !== TOKEN_2022_PROGRAM)) return null;
  const parsed = !Array.isArray(v.data) ? v.data.parsed : undefined;
  if (!parsed || parsed.type !== 'mint') return null;
  const info = parsed.info as {
    decimals: number;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    extensions?: { extension: string }[];
  };
  return {
    program: v.owner,
    decimals: info.decimals,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    extensions: (info.extensions ?? []).map((e) => e.extension),
  };
}

export async function sendRawTransaction(url: string, txBase64: string): Promise<string> {
  return rpc<string>(url, 'sendTransaction', [
    txBase64,
    { encoding: 'base64', skipPreflight: true, maxRetries: 0 },
  ]);
}

export interface SignatureStatus {
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
  err: unknown;
}

export async function getSignatureStatus(url: string, sig: string): Promise<SignatureStatus | null> {
  const r = await rpc<{ value: (SignatureStatus | null)[] }>(url, 'getSignatureStatuses', [
    [sig],
    { searchTransactionHistory: false },
  ]);
  return r.value[0];
}

export async function getBlockHeight(url: string): Promise<number> {
  return rpc<number>(url, 'getBlockHeight', [{ commitment: 'confirmed' }]);
}

export async function getLatestBlockhash(url: string): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const r = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(url, 'getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  return r.value;
}
