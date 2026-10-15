import { useEffect, useMemo, useRef, useState } from 'react';
import { encode } from 'uqr';
import { familyOf, shortAddr } from '@/lib/address';
import { CHAIN_IDS, CHAINS, txUrl } from '@/lib/chains';
import { compact } from '@/lib/format';
import { send, type Balances } from '@/lib/messages';
import type { ChainId, TradeRecord, WalletState } from '@/lib/types';
import { IconCheck, IconCopy, IconExternal } from '@/ui/icons';
import { useOverlay } from '@/ui/store';

/** QR code as crisp SVG modules on a white card (scanners need the contrast). */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const qr = useMemo(() => encode(value, { ecc: 'M', border: 2 }), [value]);
  const path = useMemo(() => {
    let d = '';
    qr.data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
    return d;
  }, [qr]);
  return (
    <svg className="pp-qr" width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" aria-label="Address QR code">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={path} fill="#0b1006" />
    </svg>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="pp-copyaddr"
      onClick={() => {
        navigator.clipboard.writeText(address);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <code>{address}</code>
      <span>{done ? <IconCheck size={14} /> : <IconCopy size={14} />}</span>
    </button>
  );
}

type Family = 'solana' | 'evm';

export function DepositView({ ws, onBack, welcome }: { ws: WalletState; onBack(): void; welcome?: boolean }) {
  const settings = useOverlay((s) => s.settings);
  const [family, setFamily] = useState<Family>(ws.solana ? 'solana' : 'evm');
  const [bal, setBal] = useState<Balances | null>(null);
  const baseline = useRef<Balances | null>(null);
  const address = family === 'solana' ? ws.solana : ws.evm;
  const chains = CHAIN_IDS.filter((c) => settings?.chains[c].enabled && (family === 'solana' ? c === 'solana' : c !== 'solana'));

  // Poll balances so the user sees the deposit land without refreshing.
  useEffect(() => {
    let alive = true;
    const load = () =>
      send({ type: 'balances' })
        .then((b) => {
          if (!alive) return;
          if (!baseline.current) baseline.current = b;
          setBal(b);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const received = chains
    .map((c) => ({ c, diff: (bal?.native[c] ?? 0) - (baseline.current?.native[c] ?? 0) }))
    .filter((x) => x.diff > 1e-9);

  return (
    <>
      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>{welcome ? 'Fund your trading wallet' : 'Deposit'}</h2>
          <button className="qa-link" onClick={onBack}>
            {welcome ? 'Skip' : 'Back'}
          </button>
        </div>
        <p>
          Send only what you plan to trade from Phantom, MetaMask, or an exchange. Your main wallet stays untouched.
        </p>
        {ws.solana && ws.evm && (
          <div className="pp-seg">
            <button className={family === 'solana' ? 'on' : ''} onClick={() => setFamily('solana')}>
              Solana
            </button>
            <button className={family === 'evm' ? 'on' : ''} onClick={() => setFamily('evm')}>
              Base · BSC · ETH
            </button>
          </div>
        )}
        {address ? (
          <div className="pp-deposit">
            <QrCode value={address} />
            <CopyAddress address={address} />
            <p className="pp-note" style={{ textAlign: 'center' }}>
              {family === 'solana'
                ? 'Send SOL on Solana. Tokens sent here also show up.'
                : 'Send ETH on Base / Ethereum or BNB on BSC — same address on every EVM chain.'}
            </p>
          </div>
        ) : (
          <p className="pp-error">No {family === 'solana' ? 'Solana' : 'EVM'} address in this wallet.</p>
        )}
      </section>

      <section className="pp-card qa-glass">
        <div className="pp-card-head">
          <h2>Balance</h2>
          {received.length ? <span className="pp-status">Received</span> : <span className="qa-spin" title="Watching for deposits" />}
        </div>
        {chains.map((c) => {
          const r = received.find((x) => x.c === c);
          return (
            <div className="pp-bal" key={c}>
              <span className={`qa-chain qa-chain-${c}`}>{CHAINS[c].name}</span>
              <b>
                {bal?.native[c] !== undefined ? compact(bal.native[c], 4) : '–'}
                <small>{CHAINS[c].symbol}</small>
                {r && <em className="pp-plus">+{compact(r.diff, 4)}</em>}
              </b>
              {bal?.errors?.[c] && <p className="pp-rpc-error" style={{ flexBasis: '100%' }}>{bal.errors[c]}</p>}
            </div>
          );
        })}
      </section>
    </>
  );
}

const DEST_KEY = 'qa.withdrawTo';

export function WithdrawView({ ws, onBack }: { ws: WalletState; onBack(): void }) {
  const settings = useOverlay((s) => s.settings);
  const chains = CHAIN_IDS.filter((c) => settings?.chains[c].enabled && (c === 'solana' ? ws.solana : ws.evm));
  const [chain, setChain] = useState<ChainId>(chains[0] ?? 'solana');
  const [bal, setBal] = useState<Balances | null>(null);
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'sending' | 'done'>('form');
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<TradeRecord | null>(null);
  const family: Family = chain === 'solana' ? 'solana' : 'evm';
  const symbol = CHAINS[chain].symbol;

  useEffect(() => {
    send({ type: 'balances' }).then(setBal).catch(() => {});
  }, []);
  // Remember the last destination per chain family (usually the user's own Phantom / MetaMask).
  useEffect(() => {
    browser.storage.local.get(DEST_KEY).then((r) => {
      const saved = (r[DEST_KEY] as Partial<Record<Family, string>> | undefined)?.[family];
      setTo(saved ?? '');
    });
  }, [family]);

  const available = bal?.native[chain];

  const review = () => {
    setErr(null);
    const dest = to.trim();
    if (familyOf(dest) !== family) return setErr(`Enter a valid ${family === 'solana' ? 'Solana' : 'EVM'} address`);
    if (dest.toLowerCase() === (family === 'solana' ? ws.solana : ws.evm)?.toLowerCase())
      return setErr("That's the trading wallet itself");
    if (amount !== 'max') {
      const n = Number(amount.replace(',', '.'));
      if (!(n > 0)) return setErr('Enter an amount');
      if (available !== undefined && n > available) return setErr('Amount is above your balance');
    }
    setStep('review');
  };

  const confirm = async () => {
    setStep('sending');
    setErr(null);
    try {
      const dest = to.trim();
      const rec = await send({ type: 'withdraw', chain, to: dest, amount: amount === 'max' ? 'max' : amount.replace(',', '.') });
      const r = await browser.storage.local.get(DEST_KEY);
      await browser.storage.local.set({ [DEST_KEY]: { ...(r[DEST_KEY] as object | undefined), [family]: dest } });
      setResult(rec);
      setStep('done');
    } catch (e) {
      setErr((e as Error).message);
      setStep('review');
    }
  };

  return (
    <section className="pp-card qa-glass pp-stack">
      <div className="pp-card-head" style={{ marginBottom: 0 }}>
        <h2>Withdraw</h2>
        <button className="qa-link" onClick={onBack}>
          {step === 'done' ? 'Done' : 'Back'}
        </button>
      </div>

      {step === 'form' && (
        <>
          <div className="pp-seg" style={{ marginBottom: 0 }}>
            {chains.map((c) => (
              <button key={c} className={chain === c ? 'on' : ''} onClick={() => setChain(c)}>
                {CHAINS[c].name}
              </button>
            ))}
          </div>
          <label className="pp-field">
            <span className="pp-field-row">
              Amount ({symbol})
              <span>Available {available !== undefined ? available.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '–'}</span>
            </span>
            <div className="pp-row">
              <input
                inputMode="decimal"
                placeholder="0.0"
                value={amount === 'max' ? 'Max' : amount}
                onChange={(e) => setAmount(e.target.value === 'Max' ? 'max' : e.target.value)}
              />
              <button className={`qa-btn${amount === 'max' ? ' primary' : ''}`} style={{ flex: 'none' }} onClick={() => setAmount('max')}>
                Max
              </button>
            </div>
          </label>
          <label className="pp-field">
            To ({family === 'solana' ? 'your Phantom / Solana address' : 'your MetaMask / EVM address'})
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={family === 'solana' ? 'Solana address' : '0x…'} spellCheck={false} />
          </label>
          {err && <span className="pp-error">{err}</span>}
          <button className="qa-btn primary" style={{ height: 38 }} onClick={review}>
            Review
          </button>
          <p className="pp-note" style={{ margin: 0 }}>
            Withdraw sends {symbol} only. Sell tokens first to move them out.
          </p>
        </>
      )}

      {(step === 'review' || step === 'sending') && (
        <>
          <div className="pp-review">
            <div>
              <span>Send</span>
              <b>{amount === 'max' ? `Max ${symbol} (minus network fee)` : `${amount} ${symbol}`}</b>
            </div>
            <div>
              <span>Network</span>
              <b>{CHAINS[chain].name}</b>
            </div>
            <div>
              <span>To</span>
              <code>{to.trim()}</code>
            </div>
          </div>
          <p className="pp-note" style={{ margin: 0 }}>
            Double-check the address. Transfers can't be reversed.
          </p>
          {err && <span className="pp-error">{err}</span>}
          <div className="pp-row">
            <button className="qa-btn" onClick={() => setStep('form')} disabled={step === 'sending'}>
              Edit
            </button>
            <button className="qa-btn primary" onClick={confirm} disabled={step === 'sending'}>
              {step === 'sending' ? 'Sending…' : 'Confirm withdraw'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className="pp-done">
          <span className="pp-state confirmed" style={{ width: 40, height: 40 }}>
            <IconCheck size={20} />
          </span>
          <b>Withdrawal sent</b>
          <span>
            {result.amountLabel} → {shortAddr(result.token, 6)}
          </span>
          {result.txId && (
            <a className="qa-pill" href={txUrl(result.chain, result.txId)} target="_blank" rel="noreferrer">
              View transaction <IconExternal size={12} />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
