import { useEffect, useState } from 'react';
import { send, type Request } from '@/lib/messages';
import { EVM_WALLET_LABELS, SOLANA_WALLET_LABELS, type EvmWalletPref, type Settings, type SolanaWalletPref } from '@/lib/settings';
import type { WalletState } from '@/lib/types';
import { IconAlert, IconPlug, IconShield } from '@/ui/icons';
import { LogoMark } from '@/ui/Logo';
import { setState } from '@/ui/store';

type Step = 'choose' | 'create' | 'connect' | 'importWarn' | 'import';

/** `next: 'deposit'` asks the app to open the deposit screen right after a new wallet is created. */
type Done = (s: WalletState, next?: 'deposit') => void;

function PasswordFields({ pw, setPw, pw2, setPw2 }: { pw: string; setPw(v: string): void; pw2: string; setPw2(v: string): void }) {
  return (
    <div className="pp-grid2">
      <label className="pp-field">
        Password (min. 8)
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="pp-field">
        Confirm password
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </label>
    </div>
  );
}

function checkPw(pw: string, pw2: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw !== pw2) return "Passwords don't match";
  return null;
}

/** Wallet pickers for connected mode, shared with Settings. */
export function WalletPrefs({
  value,
  onChange,
}: {
  value: Settings['connectedWallets'];
  onChange(v: Settings['connectedWallets']): void;
}) {
  return (
    <div className="pp-grid2">
      <label className="pp-field">
        Solana wallet
        <select value={value.solana} onChange={(e) => onChange({ ...value, solana: e.target.value as SolanaWalletPref })}>
          {(Object.keys(SOLANA_WALLET_LABELS) as SolanaWalletPref[]).map((k) => (
            <option key={k} value={k}>
              {SOLANA_WALLET_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="pp-field">
        EVM wallet
        <select value={value.evm} onChange={(e) => onChange({ ...value, evm: e.target.value as EvmWalletPref })}>
          {(Object.keys(EVM_WALLET_LABELS) as EvmWalletPref[]).map((k) => (
            <option key={k} value={k}>
              {EVM_WALLET_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: Done }) {
  const [step, setStep] = useState<Step>('choose');
  const [mnemonic, setMnemonic] = useState('');
  const [saved, setSaved] = useState(false);
  const [importMode, setImportMode] = useState<'seed' | 'keys'>('seed');
  const [seedInput, setSeedInput] = useState('');
  const [account, setAccount] = useState(1);
  const [solKey, setSolKey] = useState('');
  const [evmKey, setEvmKey] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dedicated, setDedicated] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    send({ type: 'getSettings' }).then(setSettings).catch(() => {});
  }, []);

  const go = (s: Step) => {
    setErr(null);
    setStep(s);
  };

  const startCreate = async () => {
    setMnemonic(await send({ type: 'generateMnemonic' }));
    go('create');
  };

  const submit = async (payload: Extract<Request, { type: 'createVault' }>, next?: 'deposit') => {
    const pwErr = checkPw(pw, pw2);
    if (pwErr) return setErr(pwErr);
    setBusy(true);
    setErr(null);
    try {
      // Creating / importing a trading wallet always means local signing.
      if (settings && settings.signer !== 'local') setState({ settings: await send({ type: 'saveSettings', settings: { ...settings, signer: 'local' } }) });
      onDone(await send(payload), next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useConnected = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const next = await send({ type: 'saveSettings', settings: { ...settings, signer: 'connected' } });
      setState({ settings: next });
      onDone(await send({ type: 'state' }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'choose') {
    return (
      <div className="pp-center">
        <div className="pp-hero-card qa-glass">
          <div className="pp-hero">
            <LogoMark size={64} />
          </div>
          <h1>QuickApe</h1>
          <p>1-click memecoin trading, right on the page.</p>

          <button className="pp-option recommended" onClick={startCreate}>
            <span className="pp-option-ic lime">
              <LogoMark size={26} />
            </span>
            <span className="pp-option-main">
              <b>
                Create trading wallet <em>Recommended</em>
              </b>
              <small>1-click trades. Fund it from Phantom or MetaMask — your main wallet stays untouched.</small>
            </span>
          </button>

          <button className="pp-option" onClick={() => go('connect')}>
            <span className="pp-option-ic">
              <IconPlug size={18} />
            </span>
            <span className="pp-option-main">
              <b>Connect Phantom / MetaMask</b>
              <small>No keys in QuickApe. Approve every trade in your own wallet.</small>
            </span>
          </button>

          <button className="qa-link" style={{ alignSelf: 'center', marginTop: 4 }} onClick={() => go('importWarn')}>
            Import an existing key (advanced)
          </button>
        </div>
      </div>
    );
  }

  if (step === 'create') {
    return (
      <div className="pp-body" style={{ paddingTop: 14 }}>
        <section className="pp-card qa-glass">
          <div className="pp-card-head">
            <h2>Back up your trading wallet</h2>
          </div>
          <p>
            This is a brand-new wallet just for trading. Write these 12 words down or store them in a password manager —
            anyone with them can take the funds in it. You can also restore it in Phantom or MetaMask.
          </p>
          <div className="pp-words">
            {mnemonic.split(' ').map((w, i) => (
              <span key={i}>
                <i>{i + 1}</i>
                {w}
              </span>
            ))}
          </div>
          <label className="pp-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            I've saved my seed phrase
          </label>
        </section>
        <section className="pp-card qa-glass pp-stack">
          <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
          {err && <span className="pp-error">{err}</span>}
          <div className="pp-row">
            <button className="qa-btn" onClick={() => go('choose')}>
              Back
            </button>
            <button
              className="qa-btn primary"
              disabled={!saved || busy}
              onClick={() => submit({ type: 'createVault', password: pw, mnemonic }, 'deposit')}
            >
              {busy ? 'Creating…' : 'Create wallet'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === 'connect') {
    return (
      <div className="pp-body" style={{ paddingTop: 14 }}>
        <section className="pp-card qa-glass pp-stack">
          <div className="pp-card-head" style={{ marginBottom: 0 }}>
            <h2>Connect your own wallet</h2>
          </div>
          <ol className="pp-steps">
            <li>
              <span>Open X, GMGN, Dexscreener, pump.fun, or Fomo and click any quick-buy button.</span>
            </li>
            <li>
              <span>Your wallet asks to connect — once per site.</span>
            </li>
            <li>
              <span>
                Every trade opens your wallet to <b>approve</b>. QuickApe never sees your keys.
              </span>
            </li>
          </ol>
          <div className="pp-divider" />
          {settings && <WalletPrefs value={settings.connectedWallets} onChange={(v) => setSettings({ ...settings, connectedWallets: v })} />}
          <p className="pp-note" style={{ margin: 0 }}>
            Trades take one extra click (the approval). Switch to a trading wallet anytime in Settings for true 1-click.
          </p>
          {err && <span className="pp-error">{err}</span>}
          <div className="pp-row">
            <button className="qa-btn" onClick={() => go('choose')}>
              Back
            </button>
            <button className="qa-btn primary" disabled={busy || !settings} onClick={useConnected}>
              Use connected wallet
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === 'importWarn') {
    return (
      <div className="pp-body" style={{ paddingTop: 14 }}>
        <section className="pp-card qa-glass pp-stack pp-warn">
          <div className="pp-card-head" style={{ marginBottom: 0 }}>
            <span className="pp-warn-ic">
              <IconAlert size={18} />
            </span>
            <h2>Only import a dedicated trading wallet</h2>
          </div>
          <p style={{ margin: 0 }}>
            QuickApe signs trades instantly with an imported key — no approval popup. Never import the wallet that holds your
            savings.
          </p>
          <p style={{ margin: 0 }}>
            Safer options: let QuickApe create a fresh trading wallet, or create a separate account in Phantom / MetaMask and
            import only that one.
          </p>
          <label className="pp-check">
            <input type="checkbox" checked={dedicated} onChange={(e) => setDedicated(e.target.checked)} />
            This is a trading-only wallet, not my main wallet
          </label>
          <div className="pp-row">
            <button className="qa-btn" onClick={() => go('choose')}>
              Back
            </button>
            <button className="qa-btn primary" disabled={!dedicated} onClick={() => go('import')}>
              Continue
            </button>
          </div>
        </section>
        <p className="pp-note" style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          <IconShield size={13} /> Keys are encrypted with your password and never leave this browser.
        </p>
      </div>
    );
  }

  return (
    <div className="pp-body" style={{ paddingTop: 14 }}>
      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>Import trading wallet</h2>
        </div>
        <div className="pp-seg">
          <button className={importMode === 'seed' ? 'on' : ''} onClick={() => setImportMode('seed')}>
            Seed phrase
          </button>
          <button className={importMode === 'keys' ? 'on' : ''} onClick={() => setImportMode('keys')}>
            Private key
          </button>
        </div>

        {importMode === 'seed' ? (
          <div className="pp-stack">
            <p style={{ margin: 0 }}>
              A 12- or 24-word seed from Phantom or MetaMask. You'll get the same Solana and EVM addresses as in that wallet.
            </p>
            <label className="pp-field">
              Seed phrase
              <textarea rows={3} value={seedInput} onChange={(e) => setSeedInput(e.target.value)} spellCheck={false} />
            </label>
            <label className="pp-field">
              Account number (Account 1 = 1)
              <input type="number" min={1} value={account} onChange={(e) => setAccount(Math.max(1, Number(e.target.value)))} />
            </label>
          </div>
        ) : (
          <div className="pp-stack">
            <label className="pp-field">
              Solana private key (Phantom → Show Private Key)
              <input type="password" value={solKey} onChange={(e) => setSolKey(e.target.value)} spellCheck={false} />
            </label>
            <label className="pp-field">
              EVM private key (MetaMask → Account details)
              <input type="password" value={evmKey} onChange={(e) => setEvmKey(e.target.value)} spellCheck={false} />
            </label>
            <p className="pp-note">Fill in one or both.</p>
          </div>
        )}
      </section>

      <section className="pp-card qa-glass pp-stack">
        <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
        {err && <span className="pp-error">{err}</span>}
        <div className="pp-row">
          <button className="qa-btn" onClick={() => go('importWarn')}>
            Back
          </button>
          <button
            className="qa-btn primary"
            disabled={busy}
            onClick={() =>
              submit(
                importMode === 'seed'
                  ? { type: 'createVault', password: pw, mnemonic: seedInput, accountIndex: account - 1 }
                  : { type: 'createVault', password: pw, solanaKey: solKey, evmKey },
              )
            }
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function Unlock({ onDone }: { onDone: Done }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirm, setConfirm] = useState('');

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onDone(await send({ type: 'unlock', password: pw }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pp-center">
      <div className="pp-hero-card qa-glass">
        <div className="pp-hero">
          <LogoMark size={64} />
        </div>
        <h1>Welcome back</h1>
        <p>Enter your password to unlock your trading wallet.</p>
        <form className="pp-stack" onSubmit={unlock}>
          <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button className="qa-btn primary" style={{ height: 40 }} disabled={busy || !pw}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
        {err && <span className="pp-error">{err}</span>}

        {!resetting ? (
          <button className="qa-link" style={{ alignSelf: 'center', marginTop: 6 }} onClick={() => setResetting(true)}>
            Forgot password?
          </button>
        ) : (
          <div className="pp-stack" style={{ marginTop: 8, textAlign: 'left' }}>
            <p style={{ margin: 0 }}>
              Passwords can't be recovered. Resetting removes the wallet from this extension, so you'll need your seed phrase /
              private keys to import it again. Type <b>RESET</b> to continue.
            </p>
            <div className="pp-row">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" />
              <button
                className="qa-btn danger"
                style={{ flex: 'none' }}
                disabled={confirm !== 'RESET'}
                onClick={async () => onDone(await send({ type: 'resetVault' }))}
              >
                Reset wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
