/**
 * Runs in the page's MAIN world (no extension APIs here). Finds the user's wallets the
 * standard way — Wallet Standard for Solana, EIP-6963 for EVM — and asks them to
 * connect and to approve each transaction. The wallet's own popup is the final say:
 * nothing is signed without the user approving it there.
 */
import { base58, base64 } from '@scure/base';
import { BRIDGE_TAG, type BridgeMethods, type BridgeRequest, type BridgeResponse } from '@/lib/bridge';
import type { EvmTxJson } from '@/lib/messages';
import type { EvmWalletPref, SolanaWalletPref } from '@/lib/settings';

// ---------- Solana: Wallet Standard ----------

interface StdAccount {
  address: string;
  chains: readonly string[];
}

interface StdWallet {
  name: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown>;
}

type ConnectFeature = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StdAccount[] }> };
type SignAndSendFeature = {
  signAndSendTransaction(
    ...inputs: { account: StdAccount; transaction: Uint8Array; chain: string }[]
  ): Promise<{ signature: Uint8Array }[]>;
};

const stdWallets: StdWallet[] = [];
const stdApi = {
  register(...wallets: StdWallet[]) {
    for (const w of wallets) if (!stdWallets.includes(w)) stdWallets.push(w);
    return () => {};
  },
  get: () => stdWallets,
  on: () => () => {},
};

function discoverSolana() {
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: stdApi }));
  } catch {}
}

function pickSolana(prefer: SolanaWalletPref): StdWallet {
  const usable = stdWallets.filter(
    (w) => w.chains.some((c) => c.startsWith('solana:')) && 'solana:signAndSendTransaction' in w.features,
  );
  const wallet =
    prefer === 'auto'
      ? (usable.find((w) => /phantom/i.test(w.name)) ?? usable[0])
      : usable.find((w) => w.name.toLowerCase().startsWith(prefer.toLowerCase()));
  if (!wallet) {
    throw new Error(
      prefer === 'auto'
        ? 'No Solana wallet found — install Phantom, Solflare, or Backpack'
        : `${prefer} not found on this page — install it or pick Auto-detect in Settings`,
    );
  }
  return wallet;
}

async function solanaAccount(wallet: StdWallet): Promise<StdAccount> {
  if (wallet.accounts[0]) return wallet.accounts[0];
  const connect = wallet.features['standard:connect'] as ConnectFeature | undefined;
  if (!connect) throw new Error(`${wallet.name} can't connect`);
  const { accounts } = await connect.connect();
  if (!accounts[0]) throw new Error(`${wallet.name} didn't share an account`);
  return accounts[0];
}

// ---------- EVM: EIP-6963 ----------

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Announced {
  info: { uuid: string; name: string; rdns: string };
  provider: Eip1193;
}

const evmProviders: Announced[] = [];

function discoverEvm() {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function pickEvm(prefer: EvmWalletPref): { name: string; provider: Eip1193 } {
  const found = prefer === 'auto' ? (evmProviders.find((p) => p.info.rdns === 'io.metamask') ?? evmProviders[0]) : evmProviders.find((p) => p.info.rdns === prefer);
  if (found) return { name: found.info.name, provider: found.provider };
  const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (prefer === 'auto' && legacy) return { name: 'Injected wallet', provider: legacy };
  throw new Error(
    prefer === 'auto'
      ? 'No EVM wallet found — install MetaMask, Rabby, or Phantom'
      : 'Your selected EVM wallet was not found — install it or pick Auto-detect in Settings',
  );
}

const ADD_CHAIN: Record<number, object> = {
  8453: {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  56: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
};

async function evmAccount(provider: Eip1193): Promise<string> {
  let accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
  if (!accounts?.length) accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.[0]) throw new Error("Wallet didn't share an account");
  return accounts[0];
}

async function ensureChain(provider: Eip1193, chainId: number) {
  const current = Number.parseInt((await provider.request({ method: 'eth_chainId' })) as string, 16);
  if (current === chainId) return;
  const hex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902 || !ADD_CHAIN[chainId]) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_CHAIN[chainId]] });
  }
}

// ---------- request handling ----------

/** Wallets announce themselves asynchronously; give them a moment on the first request. */
async function withDiscovery<T>(pick: () => T, discover: () => void): Promise<T> {
  try {
    return pick();
  } catch (e) {
    discover();
    await new Promise((r) => setTimeout(r, 400));
    try {
      return pick();
    } catch {
      throw e;
    }
  }
}

const handlers: { [M in keyof BridgeMethods]: (p: BridgeMethods[M]['params']) => Promise<BridgeMethods[M]['result']> } = {
  async solConnect({ prefer }) {
    const wallet = await withDiscovery(() => pickSolana(prefer), discoverSolana);
    const account = await solanaAccount(wallet);
    return { address: account.address, wallet: wallet.name };
  },
  async solSignAndSend({ prefer, tx }) {
    const wallet = await withDiscovery(() => pickSolana(prefer), discoverSolana);
    const account = await solanaAccount(wallet);
    const feature = wallet.features['solana:signAndSendTransaction'] as SignAndSendFeature;
    const [out] = await feature.signAndSendTransaction({ account, transaction: base64.decode(tx), chain: 'solana:mainnet' });
    return { signature: base58.encode(out.signature) };
  },
  async evmConnect({ prefer }) {
    const { name, provider } = await withDiscovery(() => pickEvm(prefer), discoverEvm);
    return { address: await evmAccount(provider), wallet: name };
  },
  async evmSend({ prefer, chainId, tx }: { prefer: EvmWalletPref; chainId: number; tx: EvmTxJson }) {
    const { provider } = await withDiscovery(() => pickEvm(prefer), discoverEvm);
    const from = await evmAccount(provider);
    await ensureChain(provider, chainId);
    const hash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: tx.to, data: tx.data, value: tx.value, ...(tx.gas ? { gas: tx.gas } : {}) }],
    })) as string;
    return { hash };
  },
};

function describe(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001 || /reject|denied|cancel/i.test(err?.message ?? '')) return 'Rejected in your wallet';
  return err?.message || String(e);
}

export function installBridge() {
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    try {
      (e as CustomEvent<(api: typeof stdApi) => void>).detail(stdApi);
    } catch {}
  });
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = (e as CustomEvent<Announced>).detail;
    if (d?.info?.uuid && !evmProviders.some((p) => p.info.uuid === d.info.uuid)) evmProviders.push(d);
  });
  discoverSolana();
  discoverEvm();

  window.addEventListener('message', async (e: MessageEvent) => {
    if (e.source !== window) return;
    const m = e.data as BridgeRequest | undefined;
    if (!m || m.tag !== BRIDGE_TAG || m.dir !== 'req' || !(m.method in handlers)) return;
    const res: BridgeResponse = { tag: BRIDGE_TAG, dir: 'res', id: m.id, ok: true };
    try {
      res.result = await (handlers[m.method] as (p: unknown) => Promise<unknown>)(m.params);
    } catch (err) {
      res.ok = false;
      res.error = describe(err);
    }
    window.postMessage(res, window.location.origin);
  });
}
