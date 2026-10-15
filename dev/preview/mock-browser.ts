/**
 * Fake `browser` for previewing the UI outside the extension. All data is mock data.
 * In the real build `browser` is auto-imported by WXT; in this preview it is a global.
 */
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';
import type { TokenInfo, TradeRecord, WalletState } from '@/lib/types';

const view = new URLSearchParams(location.search).get('view') ?? 'page';
const connectedView = view === 'connected' || view === 'bridge';

const token: TokenInfo = {
  chain: 'solana',
  address: '6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump',
  symbol: 'APECAT',
  name: 'Ape Cat',
  priceUsd: 0.0004213,
  marketCap: 421_300,
  liquidityUsd: 61_200,
  volume24h: 1_830_000,
  change5m: 4.2,
  change1h: -11.6,
  change24h: 182,
  pairCreatedAt: Date.now() - 5 * 3600_000,
  dexId: 'pumpswap',
  pairAddress: 'x',
};

const brett: TokenInfo = {
  ...token,
  chain: 'base',
  address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
  symbol: 'BRETT',
  name: 'Brett',
};

let settings: Settings = { ...structuredClone(DEFAULT_SETTINGS), signer: connectedView ? 'connected' : 'local' };

const TRADING = { solana: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', evm: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' };

let wallet: WalletState =
  view === 'onboarding'
    ? { signer: 'local', hasVault: false, unlocked: false, hasMnemonic: false, connected: {} }
    : view === 'locked'
      ? { signer: 'local', hasVault: true, unlocked: false, hasMnemonic: true, connected: {} }
      : connectedView
        ? { signer: 'connected', hasVault: false, unlocked: false, hasMnemonic: false, connected: {} }
        : { signer: 'local', hasVault: true, unlocked: true, hasMnemonic: true, ...TRADING, connected: {} };

const trades: TradeRecord[] = [
  { id: '1', time: Date.now() - 60_000, chain: 'solana', side: 'buy', token: token.address, symbol: 'APECAT', amountLabel: '0.1 SOL', outLabel: '238.1K APECAT', status: 'confirmed', txId: '5xyz', feeBps: 50 },
  { id: '4', time: Date.now() - 1800_000, chain: 'solana', side: 'withdraw', token: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', symbol: 'SOL', amountLabel: '1.25 SOL', status: 'confirmed', txId: '5wd' },
  { id: '2', time: Date.now() - 3600_000, chain: 'base', side: 'sell', token: brett.address, symbol: 'BRETT', amountLabel: '50% BRETT', outLabel: '0.0123 ETH', status: 'confirmed', txId: '0xabc', feeBps: 50 },
  { id: '3', time: Date.now() - 7200_000, chain: 'solana', side: 'buy', token: token.address, symbol: 'WIFOG', amountLabel: '0.5 SOL', status: 'failed', error: 'Slippage exceeded — raise slippage and retry' },
];

const msgListeners = new Set<(m: unknown) => void>();
const store: Record<string, unknown> = {};
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let balanceBump = 0;

function confirmLater(rec: TradeRecord, ms = 2500) {
  setTimeout(() => msgListeners.forEach((l) => l({ type: 'tradeUpdate', trade: { ...rec, status: 'confirmed' } })), ms);
}

const state = () => ({ ...wallet, signer: settings.signer });

async function handle(msg: { type: string; [k: string]: unknown }): Promise<unknown> {
  await delay(150);
  switch (msg.type) {
    case 'state':
      return state();
    case 'lock':
      wallet = { ...wallet, unlocked: false };
      return state();
    case 'unlock':
    case 'createVault':
      wallet = { ...wallet, hasVault: true, unlocked: true, hasMnemonic: true, ...TRADING };
      return state();
    case 'generateMnemonic':
      return 'ripple cactus garden lunar oxygen fiscal tuna museum vapor slender actual habit';
    case 'getSettings':
      return settings;
    case 'saveSettings':
      settings = msg.settings as Settings;
      return settings;
    case 'resolve': {
      const req = msg.req as { ticker?: string; address?: string };
      if (req.ticker)
        return {
          candidates: [
            { ...token, symbol: req.ticker, marketCap: 9_800_000, liquidityUsd: 820_000 },
            { ...brett, symbol: req.ticker, marketCap: 120_000, liquidityUsd: 14_000 },
          ],
        };
      return { token: req.address?.startsWith('0x') ? brett : token };
    }
    case 'tokenView':
      return {
        token,
        flags: [{ level: 'warn', text: 'Mint authority enabled — supply can be inflated' }],
        holding: { raw: '238100000000', decimals: 6, ui: 238_100 },
        native: { ui: 2.3456, symbol: 'SOL' },
      };
    case 'balances':
      // Deposit preview: balance "arrives" after a few polls.
      balanceBump++;
      return { native: { solana: 2.3456 + (balanceBump > 2 ? 0.5 : 0), base: 0.0412, bsc: 0.18, ethereum: 0.0051 } };
    case 'trades':
      return trades;
    case 'trade': {
      await delay(700);
      const rec: TradeRecord = { id: crypto.randomUUID(), time: Date.now(), chain: 'solana', side: msg.side as 'buy', token: token.address, symbol: 'APECAT', amountLabel: msg.side === 'buy' ? '0.1 SOL' : `${msg.percent}% APECAT`, outLabel: '238.1K APECAT', status: 'submitted', txId: '5abc', feeBps: 50 };
      confirmLater(rec);
      return rec;
    }
    case 'setConnected':
      wallet = { ...wallet, connected: { ...wallet.connected, [msg.family as string]: msg.address as string } };
      return state();
    case 'prepareTrade': {
      const req = msg.req as { chain: string; address: string };
      const evm = req.chain !== 'solana';
      const rec: TradeRecord = { id: crypto.randomUUID(), time: Date.now(), chain: evm ? 'base' : 'solana', side: msg.side as 'buy', token: req.address, symbol: evm ? 'BRETT' : 'APECAT', amountLabel: msg.side === 'buy' ? (evm ? '0.005 ETH' : '0.1 SOL') : `${msg.percent}%`, outLabel: evm ? '91.2K BRETT' : '238.1K APECAT', status: 'submitted', feeBps: 50 };
      const swap = { to: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5', data: '0xdeadbeef', value: '0x11c37937e08000' };
      return evm
        ? { record: rec, evm: { chainId: 8453, approve: msg.side === 'sell' ? { ...swap, value: '0x0' } : undefined, swap } }
        : { record: rec, solana: { tx: btoa('fake-unsigned-tx'), lastValidBlockHeight: 1 } };
    }
    case 'trackTrade': {
      const rec = { ...(msg.record as TradeRecord), txId: msg.txId as string };
      confirmLater(rec);
      return rec;
    }
    case 'waitApproval':
      await delay(800);
      return true;
    case 'withdraw': {
      await delay(600);
      const rec: TradeRecord = { id: crypto.randomUUID(), time: Date.now(), chain: msg.chain as 'solana', side: 'withdraw', token: msg.to as string, symbol: 'SOL', amountLabel: `${msg.amount === 'max' ? '2.3456' : msg.amount} SOL`, status: 'submitted', txId: '5wd2' };
      confirmLater(rec, 1500);
      return rec;
    }
    case 'openPopup':
      return false;
  }
  throw new Error(`mock: ${msg.type} is not implemented`);
}

(globalThis as Record<string, unknown>).browser = {
  runtime: {
    id: 'preview',
    getURL: (p: string) => p,
    sendMessage: async (msg: { type: string }) => {
      try {
        return { ok: true, data: await handle(msg) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    onMessage: { addListener: (l: (m: unknown) => void) => msgListeners.add(l), removeListener: (l: (m: unknown) => void) => msgListeners.delete(l) },
  },
  storage: {
    local: {
      get: async (k: string) => ({ [k]: store[k] }),
      set: async (o: Record<string, unknown>) => Object.assign(store, o),
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

export { view, settings as initialSettings };
