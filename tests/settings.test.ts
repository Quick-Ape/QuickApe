import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings } from '@/lib/settings';

describe('settings migration', () => {
  beforeEach(() => fakeBrowser.reset());

  it.each(['https://api.mainnet-beta.solana.com/', 'https://solana-rpc.publicnode.com', 'https://quickape.vercel.app/api/rpc'])('moves %s to the QuickApe RPC', async (old) => {
    await fakeBrowser.storage.local.set({ settings: { chains: { solana: { rpc: old } } } });
    expect((await loadSettings()).chains.solana.rpc).toBe('https://www.quickape.world/api/rpc');
  });

  it('keeps a custom RPC (e.g. Helius)', async () => {
    const helius = 'https://mainnet.helius-rpc.com/?api-key=example';
    await fakeBrowser.storage.local.set({ settings: { chains: { solana: { rpc: helius } } } });
    expect((await loadSettings()).chains.solana.rpc).toBe(helius);
  });
});

describe('priority fee default', () => {
  beforeEach(() => fakeBrowser.reset());

  it('lowers the old 0.001 SOL default cap to 0.0003', async () => {
    await fakeBrowser.storage.local.set({ settings: { solanaFee: { mode: 'priority', maxPriorityFeeSol: 0.001, jitoTipSol: 0.001 } } });
    expect((await loadSettings()).solanaFee.maxPriorityFeeSol).toBe(0.0003);
  });

  it('keeps a cap the user chose', async () => {
    await fakeBrowser.storage.local.set({ settings: { solanaFee: { mode: 'priority', maxPriorityFeeSol: 0.002, jitoTipSol: 0.001 } } });
    expect((await loadSettings()).solanaFee.maxPriorityFeeSol).toBe(0.002);
  });
});
