import { useEffect, useState } from 'react';
import { CHAIN_IDS, CHAINS } from '@/lib/chains';
import { send, type ExportedSecrets } from '@/lib/messages';
import { SITE_LABELS, type Settings, type SiteId } from '@/lib/settings';
import type { ChainId, WalletState } from '@/lib/types';
import { bpsLabel, FEES } from '@/lib/fees';
import { setState } from '@/ui/store';
import { WalletPrefs } from './Onboarding';

const parseList = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);

function Num({ label, value, onChange }: { label: string; value: number; onChange(n: number): void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="pp-field">
      {label}
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function ListField({ label, value, onChange }: { label: string; value: number[]; onChange(v: number[]): void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join(',')]);
  return (
    <label className="pp-field">
      {label}
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(parseList(text))} />
    </label>
  );
}

export function SettingsTab({ ws, onSaved }: { ws: WalletState; onSaved(): void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    send({ type: 'getSettings' }).then(setS);
  }, []);
  if (!s) return null;

  const setChain = (id: ChainId, patch: Partial<Settings['chains'][ChainId]>) =>
    setS({ ...s, chains: { ...s.chains, [id]: { ...s.chains[id], ...patch } } });

  const save = async () => {
    setErr(null);
    for (const id of CHAIN_IDS) {
      const c = s.chains[id];
      if (c.enabled && !/^https?:\/\//.test(c.rpc)) return setErr(`RPC for ${CHAINS[id].name} must be an http(s) URL`);
      if (c.quickBuy > c.maxBuy) return setErr(`Quick buy for ${CHAINS[id].name} is above max buy`);
    }
    const next = await send({ type: 'saveSettings', settings: s });
    setS(next);
    setState({ settings: next });
    onSaved();
    setSaved('Saved');
    setTimeout(() => setSaved(null), 2000);
  };

  return (
    <div>
      <section className="pp-card qa-glass pp-stack">
        <div className="pp-card-head" style={{ marginBottom: 0 }}>
          <h2>Wallet mode</h2>
        </div>
        <div className="pp-seg" style={{ marginBottom: 0 }}>
          <button className={s.signer === 'local' ? 'on' : ''} onClick={() => setS({ ...s, signer: 'local' })}>
            1-click trading wallet
          </button>
          <button className={s.signer === 'connected' ? 'on' : ''} onClick={() => setS({ ...s, signer: 'connected' })}>
            Connected wallet
          </button>
        </div>
        <p className="pp-note" style={{ margin: 0 }}>
          {s.signer === 'local'
            ? ws.hasVault
              ? 'Trades are signed instantly by your trading wallet. Fund it with only what you trade.'
              : "You don't have a trading wallet yet — saving takes you to setup."
            : 'Phantom / MetaMask approves every trade on the site. QuickApe holds no keys.'}
        </p>
        {s.signer === 'connected' && (
          <WalletPrefs value={s.connectedWallets} onChange={(v) => setS({ ...s, connectedWallets: v })} />
        )}
      </section>

      {CHAIN_IDS.map((id) => {
        const c = s.chains[id];
        const sym = CHAINS[id].symbol;
        return (
          <section className="pp-card qa-glass" key={id}>
            <div className="pp-card-head" style={{ marginBottom: c.enabled ? 12 : 0 }}>
              <span className={`qa-chain qa-chain-${id}`}>{CHAINS[id].name}</span>
              <span style={{ marginRight: 'auto' }} />
              <input
                type="checkbox"
                className="pp-switch"
                aria-label={`Enable ${CHAINS[id].name}`}
                checked={c.enabled}
                onChange={(e) => setChain(id, { enabled: e.target.checked })}
              />
            </div>
            {c.enabled && (
              <div className="pp-stack">
                <div className="pp-grid2">
                  <Num label={`Quick buy (${sym})`} value={c.quickBuy} onChange={(n) => setChain(id, { quickBuy: n })} />
                  <Num label={`Max per buy (${sym})`} value={c.maxBuy} onChange={(n) => setChain(id, { maxBuy: n })} />
                  <ListField label={`Buy presets (${sym})`} value={c.buyPresets} onChange={(v) => setChain(id, { buyPresets: v })} />
                  <Num label="Slippage (%)" value={c.slippageBps / 100} onChange={(n) => setChain(id, { slippageBps: Math.round(n * 100) })} />
                </div>
                <label className="pp-field">
                  RPC URL
                  <input value={c.rpc} onChange={(e) => setChain(id, { rpc: e.target.value.trim() })} spellCheck={false} />
                </label>
                {id === 'solana' && (
                  <p className="pp-note">
                    The default is QuickApe's own fast RPC, with a free public backup if it's busy. You can also paste your own,
                    e.g. <code>https://mainnet.helius-rpc.com/?api-key=YOUR_KEY</code>
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

      <section className="pp-card qa-glass pp-stack">
        <div className="pp-card-head" style={{ marginBottom: 0 }}>
          <h2>Solana fees</h2>
        </div>
        <div className="pp-grid2">
          <label className="pp-field">
            Mode
            <select
              value={s.solanaFee.mode}
              onChange={(e) => setS({ ...s, solanaFee: { ...s.solanaFee, mode: e.target.value as 'priority' | 'jito' } })}
            >
              <option value="priority">Priority fee</option>
              <option value="jito">Jito tip (MEV protection)</option>
            </select>
          </label>
          {s.solanaFee.mode === 'priority' ? (
            <Num
              label="Max fee (SOL)"
              value={s.solanaFee.maxPriorityFeeSol}
              onChange={(n) => setS({ ...s, solanaFee: { ...s.solanaFee, maxPriorityFeeSol: n } })}
            />
          ) : (
            <Num label="Tip (SOL)" value={s.solanaFee.jitoTipSol} onChange={(n) => setS({ ...s, solanaFee: { ...s.solanaFee, jitoTipSol: n } })} />
          )}
        </div>
        <label className="pp-field">
          Jupiter API URL
          <input
            value={s.jupiter.baseUrl}
            onChange={(e) => setS({ ...s, jupiter: { ...s.jupiter, baseUrl: e.target.value.trim() } })}
            spellCheck={false}
          />
        </label>
        <label className="pp-field">
          Jupiter API key (optional)
          <input
            type="password"
            placeholder="Free from the Jupiter portal — higher rate limits"
            value={s.jupiter.apiKey}
            onChange={(e) => setS({ ...s, jupiter: { ...s.jupiter, apiKey: e.target.value.trim() } })}
          />
        </label>
      </section>

      <section className="pp-card qa-glass pp-stack">
        <div className="pp-card-head" style={{ marginBottom: 0 }}>
          <h2>General</h2>
        </div>
        <div className="pp-grid2">
          <ListField label="Sell presets (%)" value={s.sellPresets} onChange={(v) => setS({ ...s, sellPresets: v.filter((x) => x <= 100) })} />
          <Num label="Auto-lock (minutes)" value={s.autoLockMinutes} onChange={(n) => setS({ ...s, autoLockMinutes: Math.max(0, Math.round(n)) })} />
        </div>
        <p className="pp-note">Set to 0 to lock only when the browser closes.</p>
        <div className="pp-divider" />
        <div className="pp-field">Enabled on sites (reload open tabs after changing)</div>
        <div className="pp-grid2" style={{ gap: 10 }}>
          {(Object.keys(SITE_LABELS) as SiteId[]).map((id) => (
            <label className="pp-check" key={id}>
              <input type="checkbox" checked={s.sites[id]} onChange={(e) => setS({ ...s, sites: { ...s.sites, [id]: e.target.checked } })} />
              {SITE_LABELS[id]}
            </label>
          ))}
        </div>
      </section>

      <section className="pp-card qa-glass pp-stack">
        <div className="pp-card-head" style={{ marginBottom: 0 }}>
          <h2>Fees</h2>
          <span className="pp-status">{bpsLabel(FEES.baseBps)} per trade</span>
        </div>
        <p className="pp-note" style={{ margin: 0 }}>
          QuickApe takes {bpsLabel(FEES.baseBps)} of each buy and sell, paid in SOL, ETH, or BNB inside the same swap and visible
          on the explorer. Network, priority, and DEX fees are separate.
          {FEES.holderDiscount ? ` Holding ${FEES.holderDiscount.minAmount.toLocaleString('en-US')} ${FEES.holderDiscount.label} lowers it to ${bpsLabel(FEES.holderDiscount.bps)}.` : ''}
        </p>
      </section>

      <div className="pp-savebar qa-glass">
        {err ? <span className="pp-error">{err}</span> : saved ? <span className="pp-ok">{saved}</span> : <span className="qa-muted">Remember to save your changes</span>}
        <button className="qa-btn primary" style={{ padding: '0 22px' }} onClick={save}>
          Save
        </button>
      </div>

      {ws.hasVault && <ExportKeys />}
    </div>
  );
}

function ExportKeys() {
  const [pw, setPw] = useState('');
  const [secrets, setSecrets] = useState<ExportedSecrets | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="pp-card qa-glass pp-stack">
      <div className="pp-card-head" style={{ marginBottom: 0 }}>
        <h2>Export seed phrase / private keys</h2>
      </div>
      {!secrets ? (
        <form
          className="pp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              setSecrets(await send({ type: 'exportSecrets', password: pw }));
              setPw('');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="qa-btn" style={{ flex: 'none' }} disabled={!pw}>
            Reveal
          </button>
        </form>
      ) : (
        <>
          <span className="pp-error">Never share these with anyone.</span>
          {secrets.mnemonic && (
            <div className="pp-field">
              Seed phrase<div className="pp-secret">{secrets.mnemonic}</div>
            </div>
          )}
          {secrets.solana && (
            <div className="pp-field">
              Solana (import into Phantom)<div className="pp-secret">{secrets.solana}</div>
            </div>
          )}
          {secrets.evm && (
            <div className="pp-field">
              EVM (import into MetaMask)<div className="pp-secret">{secrets.evm}</div>
            </div>
          )}
          <button className="qa-btn" onClick={() => setSecrets(null)}>
            Hide
          </button>
        </>
      )}
      {err && <span className="pp-error">{err}</span>}
    </section>
  );
}
