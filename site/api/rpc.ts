/**
 * QuickApe Solana RPC proxy (Vercel Function).
 *
 * The extension calls https://www.quickape.world/api/rpc; this forwards to Helius with the
 * API key kept in the HELIUS_API_KEY environment variable, so the key never ships inside
 * the extension. Without the key it answers 503 and the extension falls back to its free RPC.
 *
 * Abuse limits: only the JSON-RPC methods the extension uses, only chrome-extension:// origins
 * (or the exact IDs in ALLOWED_EXTENSION_IDS), no batches, small bodies, and a per-IP rate limit.
 * An Origin header can be faked outside a browser, so the rate limit and method list are the
 * real protection; watch usage in the Helius dashboard.
 */

declare const process: { env: Record<string, string | undefined> };

export const ALLOWED_METHODS = new Set([
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getLatestBlockhash',
  'getBlockHeight',
  'getSlot',
  'getSignatureStatuses',
  'sendTransaction',
  'simulateTransaction',
]);

const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = Number(process.env.RPC_RATE_LIMIT ?? 60);

// Best-effort, per function instance. For a hard global limit, back this with Upstash Redis.
const hits = new Map<string, { start: number; count: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.count++;
  return h.count > MAX_PER_WINDOW;
}

export function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const ids = (process.env.ALLOWED_EXTENSION_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length) return ids.some((id) => origin === `chrome-extension://${id}`);
  return origin.startsWith('chrome-extension://');
}

function cors(origin: string | null): Record<string, string> {
  return originAllowed(origin)
    ? {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

function rpcError(status: number, id: unknown, message: string, origin: string | null): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32000 - status, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
  });
}

/** HELIUS_API_KEY, tolerating a pasted RPC URL, stray whitespace, or quotes around the value. */
export function heliusKey(): string | undefined {
  let v = (process.env.HELIUS_API_KEY ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  const fromUrl = v.match(/api-key=([^&\s"']+)/);
  if (fromUrl) v = fromUrl[1];
  return v || undefined;
}

export function OPTIONS(request: Request): Response {
  const origin = request.headers.get('origin');
  return new Response(null, { status: originAllowed(origin) ? 204 : 403, headers: cors(origin) });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (!originAllowed(origin)) return rpcError(403, null, 'Origin not allowed', origin);

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return rpcError(429, null, 'Too many requests — slow down', origin);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(413, null, 'Request too large', origin);

  let body: { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(400, null, 'Invalid JSON', origin);
  }
  if (Array.isArray(body)) return rpcError(400, null, 'Batch requests are not supported', origin);
  if (typeof body.method !== 'string' || !ALLOWED_METHODS.has(body.method))
    return rpcError(403, body.id, `Method not allowed: ${String(body.method)}`, origin);

  const key = heliusKey();
  if (!key) return rpcError(503, body.id, 'QuickApe RPC is not configured', origin);

  const upstream = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, method: body.method, params: body.params ?? [] }),
  }).catch(() => null);
  if (!upstream) return rpcError(502, body.id, 'Upstream RPC unreachable', origin);
  if (upstream.status === 401 || upstream.status === 403) {
    // Wrong key, or the key restricts allowed domains/IPs in the Helius dashboard.
    return rpcError(upstream.status, body.id, `Helius rejected the API key (HTTP ${upstream.status}) — check HELIUS_API_KEY`, origin);
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
  });
}

// Run at the Vercel edge location closest to each trader instead of a single US region.
export const config = { runtime: 'edge' };

export default function handler(request: Request): Response | Promise<Response> {
  if (request.method === 'OPTIONS') return OPTIONS(request);
  if (request.method === 'POST') return POST(request);
  return new Response('Method not allowed', { status: 405, headers: { allow: 'POST, OPTIONS' } });
}
