import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPTIONS, POST } from '../site/api/rpc';
import { FALLBACK_SOLANA_RPC, QUICKAPE_RPC, rpc } from '@/lib/solana/rpc';

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const req = (body: unknown, origin: string | null = EXT, ip = '1.1.1.1') =>
  new Request('https://www.quickape.world/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('QuickApe RPC proxy', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.HELIUS_API_KEY = 'test-key';
    delete process.env.ALLOWED_EXTENSION_IDS;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('forwards an allowed method to Helius with the server-side key and CORS for the extension', async () => {
    const upstream = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{"jsonrpc":"2.0","id":7,"result":{"value":5}}', { status: 200 }));
    globalThis.fetch = upstream as unknown as typeof fetch;
    const res = await POST(req({ jsonrpc: '2.0', id: 7, method: 'getBalance', params: ['x'] }, EXT, '10.0.0.1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXT);
    expect(await res.json()).toMatchObject({ result: { value: 5 } });
    expect(String(upstream.mock.calls[0][0])).toBe('https://mainnet.helius-rpc.com/?api-key=test-key');
  });

  it('rejects web pages, unknown methods, batches, and missing config', async () => {
    expect((await POST(req({ method: 'getBalance' }, 'https://evil.example', '10.0.0.2'))).status).toBe(403);
    expect((await POST(req({ method: 'getProgramAccounts' }, EXT, '10.0.0.3'))).status).toBe(403);
    expect((await POST(req([{ method: 'getBalance' }], EXT, '10.0.0.4'))).status).toBe(400);
    delete process.env.HELIUS_API_KEY;
    expect((await POST(req({ method: 'getBalance' }, EXT, '10.0.0.5'))).status).toBe(503);
  });

  it('pins to exact extension IDs when configured', async () => {
    process.env.ALLOWED_EXTENSION_IDS = 'abcdefghijklmnopabcdefghijklmnop';
    expect(OPTIONS(new Request('https://x/api/rpc', { method: 'OPTIONS', headers: { origin: EXT } })).status).toBe(204);
    expect(OPTIONS(new Request('https://x/api/rpc', { method: 'OPTIONS', headers: { origin: 'chrome-extension://other' } })).status).toBe(403);
  });

  it('rate-limits a single IP', async () => {
    globalThis.fetch = (async () => new Response('{"jsonrpc":"2.0","id":1,"result":1}')) as unknown as typeof fetch;
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) statuses.push((await POST(req({ method: 'getSlot' }, EXT, '9.9.9.9'))).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('extension RPC fallback', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('uses the free backup when the QuickApe RPC is not configured or down', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url) === QUICKAPE_RPC) return new Response('{"error":{"message":"QuickApe RPC is not configured"}}', { status: 503 });
      return new Response('{"jsonrpc":"2.0","id":1,"result":{"value":123}}');
    }) as unknown as typeof fetch;
    expect(await rpc<{ value: number }>(QUICKAPE_RPC, 'getBalance', ['x'])).toEqual({ value: 123 });
    expect(calls).toEqual([QUICKAPE_RPC, FALLBACK_SOLANA_RPC]);
    // The failing endpoint is skipped for a while instead of being retried on every call.
    await rpc(QUICKAPE_RPC, 'getBalance', ['x']);
    expect(calls).toEqual([QUICKAPE_RPC, FALLBACK_SOLANA_RPC, FALLBACK_SOLANA_RPC]);
  });

  it('does not fall back on a normal JSON-RPC error', async () => {
    globalThis.fetch = (async () => new Response('{"jsonrpc":"2.0","id":1,"error":{"message":"invalid param"}}')) as unknown as typeof fetch;
    await expect(rpc('https://my-rpc.example', 'getBalance', ['x'])).rejects.toThrow('invalid param');
  });
});

describe('HELIUS_API_KEY parsing', () => {
  it.each([
    ['abc-123', 'abc-123'],
    ['  abc-123\n', 'abc-123'],
    ['"abc-123"', 'abc-123'],
    ['https://mainnet.helius-rpc.com/?api-key=abc-123', 'abc-123'],
    ['https://mainnet.helius-rpc.com/?api-key=abc-123&foo=1', 'abc-123'],
  ])('%j -> %s', async (raw, key) => {
    const { heliusKey } = await import('../site/api/rpc');
    process.env.HELIUS_API_KEY = raw;
    expect(heliusKey()).toBe(key);
  });
});
