import { shortAddr } from '@/lib/address';
import { CHAINS, txUrl } from '@/lib/chains';
import { send, type Push, type Request } from '@/lib/messages';
import type { TokenRequest, TradeRecord } from '@/lib/types';
import { getState, setState, upsertToast } from './store';

type TradeMsg = Extract<Request, { type: 'trade' }>;
export type TradeParams = TradeMsg extends infer M ? (M extends TradeMsg ? Omit<M, 'type'> : never) : never;

/**
 * Connected mode signs with the user's wallet on the page, which only the content script
 * can reach. It registers the executor here; the popup has none.
 */
type ConnectedExecutor = (params: TradeParams, stage: (text: string) => void) => Promise<TradeRecord>;
let connectedExecutor: ConnectedExecutor | null = null;

export function setConnectedExecutor(fn: ConnectedExecutor) {
  connectedExecutor = fn;
  setState({ canSignOnPage: true });
}

// Toast id per trade id, so confirmation updates overwrite the same toast.
const toastOfTrade = new Map<string, string>();
// Prevent an accidental double-click from buying twice.
const recent = new Map<string, number>();

function tokenLabel(req: TokenRequest, symbol?: string) {
  return symbol ?? (req.address ? shortAddr(req.address) : `$${req.ticker}`);
}

export async function trade(params: TradeParams, symbol?: string): Promise<void> {
  const size = params.side === 'buy' ? params.amount : params.percent;
  const key = `${params.side}:${size}:${params.req.address ?? params.req.ticker}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < 1200) return;
  recent.set(key, now);

  const id = crypto.randomUUID();
  const what =
    params.side === 'buy'
      ? `Buy ${params.amount === 'quick' ? '(quick)' : params.amount} → ${tokenLabel(params.req, symbol)}`
      : `Sell ${params.percent}% ${tokenLabel(params.req, symbol)}`;
  upsertToast({ id, kind: 'pending', title: what, body: 'Preparing transaction…' });

  try {
    let rec: TradeRecord;
    if (getState().settings?.signer === 'connected') {
      if (!connectedExecutor) throw new Error('Connected mode signs on the site — trade from X, GMGN, Dexscreener, etc.');
      rec = await connectedExecutor(params, (text) => upsertToast({ id, kind: 'pending', title: what, body: text }));
    } else {
      rec = await send({ type: 'trade', ...params } as TradeMsg);
    }
    toastOfTrade.set(rec.id, id);
    const verb = rec.side === 'buy' ? 'Buy' : 'Sell';
    upsertToast({
      id,
      kind: 'pending',
      title: `${verb} ${rec.amountLabel}${rec.side === 'buy' ? ` → ${rec.symbol}` : ''}`,
      body: `Sent on ${CHAINS[rec.chain].name}${rec.outLabel ? ` · ≈ ${rec.outLabel}` : ''} · confirming…`,
      link: rec.txId ? txUrl(rec.chain, rec.txId) : undefined,
    });
  } catch (e) {
    upsertToast({ id, kind: 'error', title: what, body: (e as Error).message }, 10_000);
  }
}

export function quickBuy(req: TokenRequest, symbol?: string) {
  return trade({ req, side: 'buy', amount: 'quick' }, symbol);
}

function successTitle(t: TradeRecord) {
  if (t.side === 'withdraw') return `Withdrew ${t.amountLabel}`;
  return `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.symbol}`;
}

function failedTitle(t: TradeRecord) {
  if (t.side === 'withdraw') return 'Withdrawal failed';
  return `${t.side === 'buy' ? 'Buy' : 'Sell'} ${t.symbol} failed`;
}

/** Listen for confirmation updates from the background. Call once per context. */
export function listenTradeUpdates(): () => void {
  const listener = (msg: Push) => {
    if (msg?.type !== 'tradeUpdate') return;
    const t = msg.trade;
    const id = toastOfTrade.get(t.id) ?? t.id;
    if (t.status === 'confirmed') {
      upsertToast(
        {
          id,
          kind: 'success',
          title: successTitle(t),
          body: t.side === 'withdraw' ? `Sent to ${shortAddr(t.token, 6)}` : `${t.amountLabel}${t.outLabel ? ` → ≈ ${t.outLabel}` : ''}`,
          link: t.txId ? txUrl(t.chain, t.txId) : undefined,
        },
        8_000,
      );
    } else if (t.status === 'failed') {
      upsertToast(
        {
          id,
          kind: 'error',
          title: failedTitle(t),
          body: t.error,
          link: t.txId ? txUrl(t.chain, t.txId) : undefined,
        },
        12_000,
      );
    }
    setState((s) => ({ tick: s.tick + 1 }));
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
