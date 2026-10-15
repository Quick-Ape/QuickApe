import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { shortAddr } from '@/lib/address';
import { CHAINS, dexscreenerUrl, gmgnUrl, tokenUrl } from '@/lib/chains';
import { age, compact, pct, price, usd } from '@/lib/format';
import type { ResolveResult } from '@/lib/market';
import { send } from '@/lib/messages';
import type { TokenInfo, TokenRef, TokenRequest, TokenView, WalletState } from '@/lib/types';
import { bpsLabel, FEES } from '@/lib/fees';
import { trade } from './actions';
import { IconCheck, IconCopy, IconExternal, IconLock, IconMinus, IconX } from './icons';
import { LogoMark } from './Logo';
import { useOverlay } from './store';

interface Props {
  req: TokenRequest;
  /** 'float' = on a web page, 'embed' = inside the popup. */
  mode: 'float' | 'embed';
  onClose?: () => void;
  onCollapse?: () => void;
  onDragStart?: (e: ReactPointerEvent) => void;
}

const stop = (e: ReactPointerEvent) => e.stopPropagation();

export function Panel({ req, mode, onClose, onCollapse, onDragStart }: Props) {
  const settings = useOverlay((s) => s.settings);
  const tick = useOverlay((s) => s.tick);
  const canSignOnPage = useOverlay((s) => s.canSignOnPage);
  const [picked, setPicked] = useState<TokenRequest>(req);
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [view, setView] = useState<TokenView | null>(null);
  const viewRef = useRef<TokenView | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customBuy, setCustomBuy] = useState('');
  const [customSell, setCustomSell] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => setPicked(req), [req.address, req.ticker, req.chain]);

  // 1) Resolve CA / pair / ticker -> a definite token.
  useEffect(() => {
    let alive = true;
    setResolved(null);
    setView(null);
    viewRef.current = null;
    setError(null);
    send({ type: 'resolve', req: picked })
      .then((r) => alive && setResolved(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [picked.address, picked.ticker, picked.chain, picked.isPair]);

  const ref: TokenRef | null = resolved && 'token' in resolved ? resolved.token : null;

  // 2) Market info + balance, refreshed every 15 seconds and after a trade completes.
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    const load = () =>
      send({ type: 'tokenView', ref: { chain: ref.chain, address: ref.address } })
        .then((v) => {
          if (!alive) return;
          viewRef.current = v;
          setView(v);
          setError(null);
        })
        // A failed periodic refresh (e.g. rate limit) doesn't need to be shown while older data is still available.
        .catch((e: Error) => alive && !viewRef.current && setError(e.message));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ref?.chain, ref?.address, tick]);

  useEffect(() => {
    send({ type: 'state' }).then(setWallet).catch(() => {});
  }, [tick, view?.native?.ui]);

  const token: TokenInfo | null = view?.token ?? (resolved && 'token' in resolved ? resolved.token : null);
  const chain = token?.chain;
  const cs = chain && settings ? settings.chains[chain] : null;
  const native = chain ? CHAINS[chain] : null;
  // Connected mode: the user's own wallet signs on the page (address may not be known until first connect).
  const connectedMode = settings?.signer === 'connected';
  const hasWalletForChain = connectedMode || (!!wallet && !!chain && (chain === 'solana' ? !!wallet.solana : !!wallet.evm));
  const canTrade = !!token && (connectedMode ? canSignOnPage : !!wallet?.unlocked && hasWalletForChain);
  const holdsNothing = view?.holding?.raw === '0' || (!connectedMode && !view?.holding);
  const canSell = canTrade && !holdsNothing;
  const tradeReq: TokenRequest | null = token ? { chain: token.chain, address: token.address, source: req.source } : null;

  const buy = (amount: number) => tradeReq && trade({ req: tradeReq, side: 'buy', amount }, token?.symbol);
  const sell = (percent: number) => tradeReq && trade({ req: tradeReq, side: 'sell', percent }, token?.symbol);

  const unlock = async () => {
    const opened = await send({ type: 'openPopup' }).catch(() => false);
    if (!opened) setError('Click the QuickApe icon in your toolbar to unlock');
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const candidates = resolved && 'candidates' in resolved ? resolved.candidates : null;

  return (
    <div className={`qa-panel qa-glass qa-mode-${mode}`}>
      <div className="qa-head" onPointerDown={onDragStart}>
        {token?.imageUrl ? (
          <img className="qa-logo" src={token.imageUrl} alt="" />
        ) : token ? (
          <div className="qa-logo qa-logo-ph">{token.symbol.slice(0, 1).toUpperCase()}</div>
        ) : (
          <LogoMark size={38} />
        )}
        <div className="qa-title">
          <div className="qa-sym">
            <span>{token ? token.symbol : req.ticker ? `$${req.ticker}` : 'QuickApe'}</span>
            {chain && <span className={`qa-chain qa-chain-${chain}`}>{CHAINS[chain].name}</span>}
          </div>
          <div className="qa-name">{token?.name ?? (req.address ? shortAddr(req.address, 6) : 'Pick a token')}</div>
        </div>
        <div className="qa-actions">
          {onCollapse && (
            <button className="qa-icon" title="Minimize" aria-label="Minimize" onClick={onCollapse} onPointerDown={stop}>
              <IconMinus size={14} />
            </button>
          )}
          {onClose && (
            <button className="qa-icon" title="Close" aria-label="Close" onClick={onClose} onPointerDown={stop}>
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>

      {candidates && (
        <div className="qa-section">
          <div className="qa-hint">Multiple tokens use ${req.ticker} — pick the right one:</div>
          <div className="qa-cands">
            {candidates.map((c) => (
              <button
                key={`${c.chain}:${c.address}`}
                className="qa-cand"
                onClick={() => setPicked({ chain: c.chain, address: c.address, source: req.source })}
              >
                {c.imageUrl ? <img src={c.imageUrl} alt="" /> : <span className="qa-logo qa-logo-ph sm">{c.symbol.slice(0, 1)}</span>}
                <span className="qa-cand-main">
                  <span>
                    <b>{c.symbol}</b> <span className={`qa-chain qa-chain-${c.chain}`}>{CHAINS[c.chain].name}</span>
                  </span>
                  <small>{shortAddr(c.address)}</small>
                </span>
                <span className="qa-cand-stats">
                  {usd(c.marketCap)}
                  <small>Liq {usd(c.liquidityUsd)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="qa-flag danger">{error}</div>}
      {!error && !token && !candidates && (
        <div className="qa-loading">
          <span className="qa-spin" /> Finding token…
        </div>
      )}

      {token && (
        <>
          <div className="qa-meta">
            <button className="qa-pill qa-addr" title={token.address} onClick={() => copy(token.address)}>
              {shortAddr(token.address, 5)}
              {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            </button>
            <a className="qa-pill" href={gmgnUrl(token.chain, token.address)} target="_blank" rel="noreferrer">
              GMGN
            </a>
            <a className="qa-pill" href={token.url ?? dexscreenerUrl(token.chain, token.address)} target="_blank" rel="noreferrer">
              Dex
            </a>
            <a className="qa-pill" href={tokenUrl(token.chain, token.address)} target="_blank" rel="noreferrer" title="Explorer">
              <IconExternal size={12} />
            </a>
          </div>

          <div className="qa-stats">
            <Stat k="Price" v={price(token.priceUsd)} />
            <Stat k="MCap" v={usd(token.marketCap)} />
            <Stat k="Liq" v={usd(token.liquidityUsd)} />
            <Stat k="Vol 24h" v={usd(token.volume24h)} />
            <Stat k="Age" v={age(token.pairCreatedAt)} />
            <Stat k="1h" v={pct(token.change1h)} tone={token.change1h} />
          </div>

          {view && view.flags.length > 0 && (
            <div className="qa-flags">
              {view.flags.map((f, i) => (
                <div key={i} className={`qa-flag ${f.level}`}>
                  {f.text}
                </div>
              ))}
            </div>
          )}

          {connectedMode && !canSignOnPage && (
            <div className="qa-flag info" style={{ margin: '0 14px 12px' }}>
              Connected mode signs on the site — trade from X, GMGN, Dexscreener, and others
            </div>
          )}
          {!connectedMode && wallet && !wallet.unlocked && (
            <div className="qa-locked">
              <IconLock size={15} />
              <span>Wallet locked</span>
              <button className="qa-btn primary" onClick={unlock}>
                Unlock
              </button>
            </div>
          )}
          {!connectedMode && wallet?.unlocked && !hasWalletForChain && (
            <div className="qa-flag warn" style={{ margin: '0 14px 12px' }}>
              No {chain === 'solana' ? 'Solana' : 'EVM'} wallet yet — import one in the popup
            </div>
          )}

          <div className="qa-block">
            <div className="qa-block-head">
              <span className="qa-label buy">Buy</span>
              {view?.native && (
                <span className="qa-muted">
                  {compact(view.native.ui, 4)} {view.native.symbol}
                </span>
              )}
            </div>
            <div className="qa-grid">
              {cs?.buyPresets.map((a) => (
                <button key={a} className="qa-btn buy" disabled={!canTrade || a > cs.maxBuy} onClick={() => buy(a)}>
                  {a}
                </button>
              ))}
            </div>
            <form
              className="qa-custom"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(customBuy.replace(',', '.'));
                if (n > 0) buy(n);
              }}
            >
              <input
                inputMode="decimal"
                placeholder={`Amount ${native?.symbol ?? ''}`}
                value={customBuy}
                onChange={(e) => setCustomBuy(e.target.value)}
              />
              <button className="qa-btn buy" disabled={!canTrade}>
                Buy
              </button>
            </form>
          </div>

          <div className="qa-block">
            <div className="qa-block-head">
              <span className="qa-label sell">Sell</span>
              {view?.holding && (
                <span className="qa-muted">
                  {compact(view.holding.ui)}
                  {token.priceUsd ? ` · ${usd(view.holding.ui * token.priceUsd)}` : ''}
                </span>
              )}
            </div>
            <div className="qa-grid">
              {settings?.sellPresets.map((p) => (
                <button key={p} className="qa-btn sell" disabled={!canSell} onClick={() => sell(p)}>
                  {p}%
                </button>
              ))}
            </div>
            <form
              className="qa-custom"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(customSell);
                if (n >= 1 && n <= 100) sell(n);
              }}
            >
              <input inputMode="numeric" placeholder="Percent (1–100)" value={customSell} onChange={(e) => setCustomSell(e.target.value)} />
              <button className="qa-btn sell" disabled={!canSell}>
                Sell
              </button>
            </form>
          </div>

          {cs && (
            <div className="qa-foot">
              <span>{connectedMode ? 'Approve in your wallet' : '1-click'}</span>
              <span>·</span>
              <span title="QuickApe fee, taken in the native coin inside the swap">Fee {bpsLabel(FEES.baseBps)}</span>
              <span>·</span>
              <span>Slippage {cs.slippageBps / 100}%</span>
              <span>·</span>
              <span>
                Max {cs.maxBuy} {native?.symbol}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: number }) {
  return (
    <div className="qa-stat">
      <span>{k}</span>
      <b className={tone === undefined ? '' : tone >= 0 ? 'up' : 'down'}>{v}</b>
    </div>
  );
}
