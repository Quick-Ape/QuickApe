import { useEffect, useState } from 'react';
import { familyOf, shortAddr } from '@/lib/address';
import { CHAIN_IDS, CHAINS, txUrl } from '@/lib/chains';
import { compact } from '@/lib/format';
import { send, type Balances, type Push } from '@/lib/messages';
import { bpsLabel } from '@/lib/fees';
import { EVM_WALLET_LABELS, SOLANA_WALLET_LABELS } from '@/lib/settings';
import type { TokenRequest, TradeRecord, WalletState } from '@/lib/types';
import { detectFromUrl } from '@/lib/urls';
import { listenTradeUpdates } from '@/ui/actions';
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconExternal,
  IconLock,
  IconPlug,
  IconRefresh,
  IconSearch,
} from '@/ui/icons';
import { LogoMark } from '@/ui/Logo';
import { Panel } from '@/ui/Panel';
import { setState, useOverlay } from '@/ui/store';
import { Toasts } from '@/ui/Toasts';
import { DepositView, WithdrawView } from './Funds';
import { Onboarding, Unlock } from './Onboarding';
import { SettingsTab } from './Settings';

type Tab = 'wallet' | 'trade' | 'activity' | 'settings';
type WalletView = 'home' | 'deposit' | 'welcome' | 'withdraw';

const TABS: [Tab, string][] = [
  ['wallet', 'Wallet'],
  ['trade', 'Trade'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
];

export function App() {
  const [ws, setWs] = useState<WalletState | null>(null);
  const [firstView, setFirstView] = useState<WalletView>('home');

  const refresh = () => send({ type: 'state' }).then(setWs);

  useEffect(() => {
    refresh();
    send({ type: 'getSettings' }).then((settings) => setState({ settings }));
    const off = listenTradeUpdates();
    const onPush = (msg: Push) => {
      if (msg?.type === 'walletState') setWs(msg.state);
    };
    browser.runtime.onMessage.addListener(onPush);
    return () => {
      off();
      browser.runtime.onMessage.removeListener(onPush);
    };
  }, []);

  const onDone = (s: WalletState, next?: 'deposit') => {
    if (next === 'deposit') setFirstView('welcome');
    setWs(s);
  };

  if (!ws) return <div className="qa-popup" />;
  let screen;
  if (ws.signer === 'connected') screen = <Main ws={ws} setWs={setWs} refresh={refresh} firstView="home" />;
  else if (!ws.hasVault) screen = <Onboarding onDone={onDone} />;
  else if (!ws.unlocked) screen = <Unlock onDone={onDone} />;
  else screen = <Main ws={ws} setWs={setWs} refresh={refresh} firstView={firstView} />;
  return <div className="qa-popup">{screen}</div>;
}

function Main({
  ws,
  setWs,
  refresh,
  firstView,
}: {
  ws: WalletState;
  setWs(s: WalletState): void;
  refresh(): void;
  firstView: WalletView;
}) {
  const [tab, setTab] = useState<Tab>('wallet');
  const connected = ws.signer === 'connected';
  return (
    <>
      <header className="pp-top">
        <h1>
          <LogoMark size={26} /> QuickApe
        </h1>
        {connected ? (
          <span className="pp-status connected" title="Trades are approved in your own wallet">
            Connected
          </span>
        ) : (
          <>
            <span className="pp-status" title="Trades are signed instantly by your trading wallet">
              1-click
            </span>
            <button className="qa-icon" title="Lock wallet" aria-label="Lock wallet" onClick={async () => setWs(await send({ type: 'lock' }))}>
              <IconLock size={14} />
            </button>
          </>
        )}
      </header>
      <nav className="pp-tabs qa-glass">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="pp-body">
        <Toasts inline />
        {tab === 'wallet' && (connected ? <ConnectedTab ws={ws} /> : <WalletTab ws={ws} firstView={firstView} />)}
        {tab === 'trade' && <TradeTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'settings' && <SettingsTab ws={ws} onSaved={refresh} />}
      </main>
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="qa-icon"
      title="Copy"
      aria-label="Copy address"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

function useBalances() {
  const tick = useOverlay((s) => s.tick);
  const [bal, setBal] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);
  const load = () => {
    setLoading(true);
    send({ type: 'balances' })
      .then(setBal)
      .finally(() => setLoading(false));
  };
  useEffect(load, [tick]);
  return { bal, loading, load };
}

function BalanceRows({ bal }: { bal: Balances | null }) {
  const settings = useOverlay((s) => s.settings);
  return (
    <>
      {CHAIN_IDS.filter((c) => settings?.chains[c].enabled).map((c) => (
        <div className="pp-bal-row" key={c}>
          <div className="pp-bal">
            <span className={`qa-chain qa-chain-${c}`}>{CHAINS[c].name}</span>
            <b>
              {bal?.native[c] !== undefined ? compact(bal.native[c], 4) : '–'}
              <small>{CHAINS[c].symbol}</small>
            </b>
          </div>
          {bal?.errors?.[c] && <p className="pp-rpc-error">{bal.errors[c]}</p>}
        </div>
      ))}
    </>
  );
}

function WalletTab({ ws, firstView }: { ws: WalletState; firstView: WalletView }) {
  const [view, setView] = useState<WalletView>(firstView);
  const { bal, loading, load } = useBalances();

  if (view === 'deposit' || view === 'welcome')
    return <DepositView ws={ws} welcome={view === 'welcome'} onBack={() => setView('home')} />;
  if (view === 'withdraw') return <WithdrawView ws={ws} onBack={() => setView('home')} />;

  return (
    <>
      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>Trading wallet</h2>
          <button className="qa-icon" title="Refresh" aria-label="Refresh balances" onClick={load} disabled={loading}>
            {loading ? <span className="qa-spin" /> : <IconRefresh size={13} />}
          </button>
        </div>
        <div className="pp-actions">
          <button className="qa-btn primary" onClick={() => setView('deposit')}>
            <IconArrowDown size={15} /> Deposit
          </button>
          <button className="qa-btn" onClick={() => setView('withdraw')}>
            <IconArrowUp size={15} /> Withdraw
          </button>
        </div>
        <BalanceRows bal={bal} />
        {ws.solana && <ReclaimRow onDone={load} />}
      </section>

      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>Addresses</h2>
        </div>
        <div className="pp-addr">
          <span className="qa-chain qa-chain-solana">Solana</span>
          <code title={ws.solana}>{ws.solana ?? 'Not set'}</code>
          {ws.solana && <CopyButton text={ws.solana} />}
        </div>
        <div className="pp-addr">
          <span className="qa-chain qa-chain-base">EVM</span>
          <code title={ws.evm}>{ws.evm ?? 'Not set'}</code>
          {ws.evm && <CopyButton text={ws.evm} />}
        </div>
        <p className="pp-note">Keep only trading funds here. Withdraw profits back to your main wallet anytime.</p>
      </section>

      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>How it works</h2>
        </div>
        <ol className="pp-steps">
          <li>
            <span>
              <b>Deposit</b> SOL / ETH / BNB from Phantom, MetaMask, or an exchange.
            </span>
          </li>
          <li>
            <span>
              On <b>X</b>, a green quick-buy button appears under any tweet with a CA. On <b>GMGN, Dexscreener, pump.fun,
              and Fomo</b>, the trading panel opens on token pages.
            </span>
          </li>
          <li>
            <span>Hover a token link, or select / double-click any CA, to get a quick-buy button.</span>
          </li>
          <li>
            <span>
              <b>Withdraw</b> back to your own wallet when you're done.
            </span>
          </li>
        </ol>
      </section>
    </>
  );
}

/** Close empty token accounts left after selling; each returns ~0.002 SOL of rent. */
function ReclaimRow({ onDone }: { onDone(): void }) {
  const [state, setState_] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const run = async () => {
    setState_('busy');
    try {
      const r = await send({ type: 'reclaimRent' });
      setMsg(
        r.found === 0
          ? 'Nothing to reclaim — no empty token accounts'
          : `Reclaimed ${r.sol.toLocaleString('en-US', { maximumFractionDigits: 6 })} SOL from ${r.closed} of ${r.found} account${r.found === 1 ? '' : 's'}`,
      );
      setState_('done');
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
      setState_('error');
    }
  };
  return (
    <div className="pp-reclaim">
      <div>
        <b>Reclaim SOL</b>
        <span>{state === 'idle' || state === 'busy' ? 'Close empty token accounts left after selling and get their rent back.' : msg}</span>
      </div>
      <button className="qa-btn" onClick={run} disabled={state === 'busy'}>
        {state === 'busy' ? <span className="qa-spin" /> : 'Reclaim'}
      </button>
    </div>
  );
}

function ConnectedTab({ ws }: { ws: WalletState }) {
  const settings = useOverlay((s) => s.settings);
  const { bal, loading, load } = useBalances();
  const rows: { label: string; chain: 'solana' | 'base'; address?: string; wallet: string }[] = [
    { label: 'Solana', chain: 'solana', address: ws.connected.solana, wallet: SOLANA_WALLET_LABELS[settings?.connectedWallets.solana ?? 'auto'] },
    { label: 'EVM', chain: 'base', address: ws.connected.evm, wallet: EVM_WALLET_LABELS[settings?.connectedWallets.evm ?? 'auto'] },
  ];
  const any = !!(ws.connected.solana || ws.connected.evm);

  return (
    <>
      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <span className="pp-option-ic small">
            <IconPlug size={15} />
          </span>
          <h2>Your wallet signs every trade</h2>
        </div>
        <p style={{ marginBottom: 6 }}>QuickApe holds no keys in this mode. Each trade opens your wallet to approve it.</p>
        {rows.map((r) => (
          <div className="pp-addr" key={r.label}>
            <span className={`qa-chain qa-chain-${r.chain}`}>{r.label}</span>
            <code title={r.address}>{r.address ?? `Not connected yet · ${r.wallet}`}</code>
            {r.address && <CopyButton text={r.address} />}
          </div>
        ))}
      </section>

      {any && (
        <section className="pp-card qa-glass">
          <div className="pp-card-head">
            <h2>Balance</h2>
            <button className="qa-icon" title="Refresh" aria-label="Refresh balances" onClick={load} disabled={loading}>
              {loading ? <span className="qa-spin" /> : <IconRefresh size={13} />}
            </button>
          </div>
          <BalanceRows bal={bal} />
        </section>
      )}

      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>How it works</h2>
        </div>
        <ol className="pp-steps">
          <li>
            <span>
              Open <b>X, GMGN, Dexscreener, pump.fun, or Fomo</b> and click a quick-buy button.
            </span>
          </li>
          <li>
            <span>Your wallet asks to connect — once per site.</span>
          </li>
          <li>
            <span>
              <b>Approve</b> the swap in your wallet. Done.
            </span>
          </li>
        </ol>
        <p className="pp-note">Want true 1-click? Switch to a trading wallet in Settings.</p>
      </section>
    </>
  );
}

function TradeTab() {
  const [input, setInput] = useState('');
  const [req, setReq] = useState<TokenRequest | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = input.trim();
    const fromUrl = /^https?:\/\//.test(v) ? detectFromUrl(v) : null;
    if (fromUrl) return setReq(fromUrl);
    if (familyOf(v)) return setReq({ address: v, source: 'popup' });
    if (/^\$?[A-Za-z][A-Za-z0-9]{0,14}$/.test(v)) return setReq({ ticker: v.replace(/^\$/, '').toUpperCase(), source: 'popup' });
    setErr('Enter a CA, $TICKER, or a gmgn / dexscreener / pump.fun link');
  };

  return (
    <>
      <form className="pp-row" onSubmit={submit} style={{ marginBottom: 10 }}>
        <input placeholder="Paste a CA, $TICKER, or token link" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
        <button className="qa-btn primary" style={{ flex: 'none', width: 40, padding: 0 }} aria-label="Search">
          <IconSearch size={16} />
        </button>
      </form>
      {err && <p className="pp-error">{err}</p>}
      {req ? (
        <Panel req={req} mode="embed" />
      ) : (
        <div className="pp-card qa-glass pp-empty">Paste any contract address to buy or sell manually.</div>
      )}
    </>
  );
}

function ActivityTab() {
  const tick = useOverlay((s) => s.tick);
  const [list, setList] = useState<TradeRecord[] | null>(null);
  useEffect(() => {
    send({ type: 'trades' }).then(setList);
  }, [tick]);

  if (!list) return null;
  if (!list.length) return <div className="pp-card qa-glass pp-empty">No trades yet.</div>;
  return (
    <section className="pp-card qa-glass" style={{ paddingTop: 4, paddingBottom: 4 }}>
      {list.map((t) => (
        <div className="pp-trade" key={t.id}>
          <span className={`pp-side ${t.side}`}>{t.side === 'withdraw' ? 'OUT' : t.side.toUpperCase()}</span>
          <div className="pp-trade-main">
            <b>
              {t.side === 'withdraw' ? `Withdraw ${t.amountLabel}` : `${t.symbol} · ${t.amountLabel}`}
              {t.outLabel && <span style={{ color: 'var(--qa-muted)', fontWeight: 500 }}> → {t.outLabel}</span>}
            </b>
            {t.error ? (
              <small className="err" title={t.error}>
                {t.error}
              </small>
            ) : (
              <small>
                {new Date(t.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ·{' '}
                {CHAINS[t.chain].name}
                {t.side === 'withdraw' ? ` · to ${shortAddr(t.token)}` : t.feeBps ? ` · fee ${bpsLabel(t.feeBps)}` : ` · ${shortAddr(t.token)}`}
              </small>
            )}
          </div>
          <span className={`pp-state ${t.status}`}>
            {t.status === 'confirmed' ? <IconCheck size={13} /> : t.status === 'failed' ? <IconAlert size={13} /> : <span className="qa-spin" />}
          </span>
          {t.txId && (
            <a className="qa-icon" href={txUrl(t.chain, t.txId)} target="_blank" rel="noreferrer" aria-label="View transaction">
              <IconExternal size={13} />
            </a>
          )}
        </div>
      ))}
    </section>
  );
}
