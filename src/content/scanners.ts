import { extractAddresses } from '@/lib/address';
import type { TokenRequest } from '@/lib/types';
import { detectFromUrl } from '@/lib/urls';
import { getState, scheduleHideChip, showChip } from '@/ui/store';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { buildChipRow, CHIP_TAG } from './chips';

const CHIP_W = 170;

/**
 * X / Twitter: insert quick-buy chips below every tweet/bio that contains a CA.
 * If there's no CA but there is a cashtag ($WIF), show a ticker chip (opens the panel, no quick-buy).
 */
export function startXScanner(ctx: ContentScriptContext) {
  const SELECTOR = '[data-testid="tweetText"], [data-testid="UserDescription"]';

  const process = (el: HTMLElement) => {
    const text = el.textContent ?? '';
    const key = `${text.length}:${text.slice(-32)}`;
    const next = el.nextElementSibling;
    const hasRow = next?.tagName.toLowerCase() === CHIP_TAG;
    if (el.dataset.qaKey === key && (hasRow || el.dataset.qaEmpty === '1')) return;
    el.dataset.qaKey = key;
    if (hasRow) next!.remove();

    const items: TokenRequest[] = extractAddresses(text)
      .slice(0, 4)
      .map((address) => ({ address, source: 'x' }));
    if (!items.length) {
      const tickers = new Set<string>();
      el.querySelectorAll<HTMLAnchorElement>('a[href*="q=%24"]').forEach((a) => {
        const t = a.textContent?.trim().replace(/^\$/, '');
        if (t && /^[A-Za-z][A-Za-z0-9]{0,14}$/.test(t)) tickers.add(t.toUpperCase());
      });
      for (const ticker of [...tickers].slice(0, 3)) items.push({ ticker, source: 'x' });
    }
    el.dataset.qaEmpty = items.length ? '0' : '1';
    if (items.length) el.insertAdjacentElement('afterend', buildChipRow(items));
  };

  let scheduled = false;
  const run = () => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach(process);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 150);
  };

  const mo = new MutationObserver((muts) => {
    // Ignore mutations that only contain our own chips, to avoid a loop.
    const relevant = muts.some(
      (m) =>
        m.type === 'characterData' ||
        [...m.addedNodes].some((n) => !(n instanceof Element && n.tagName.toLowerCase() === CHIP_TAG)),
    );
    if (relevant) schedule();
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  ctx.onInvalidated(() => mo.disconnect());
  run();
}

const samePage = (a: TokenRequest, b: TokenRequest | null) =>
  !!b && !!a.address && a.address.toLowerCase() === b.address?.toLowerCase();

/**
 * Hovering a link to a token page (gmgn, dexscreener, pump.fun, birdeye, axiom, fomo, explorer)
 * -> a small quick-buy chip appears near the cursor.
 */
export function startLinkHover(ctx: ContentScriptContext, host: HTMLElement) {
  let current: Element | null = null;
  ctx.addEventListener(
    document,
    'mouseover',
    (e) => {
      if (e.composedPath().includes(host)) {
        current = null;
        return;
      }
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a === current) return;
      current = a;
      if (!a) return scheduleHideChip();
      const req = detectFromUrl(a.href);
      if (!req || samePage(req, getState().pageToken)) return scheduleHideChip();
      const r = a.getBoundingClientRect();
      showChip({
        req,
        x: Math.min(e.clientX + 14, window.innerWidth - CHIP_W),
        y: Math.max(4, r.top + r.height / 2 - 14),
      });
    },
    { capture: true, passive: true },
  );
}

/** Select / double-click a CA anywhere -> a quick-buy chip appears next to the selected text. */
export function startSelection(ctx: ContentScriptContext, host: HTMLElement) {
  ctx.addEventListener(document, 'mouseup', (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || !sel.rangeCount || !text || text.length > 120) return;
      const [address] = extractAddresses(text);
      if (!address) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      showChip({
        req: { address, source: 'selection' },
        x: Math.min(r.right + 8, window.innerWidth - CHIP_W),
        y: Math.max(4, r.top + r.height / 2 - 14),
      });
      scheduleHideChip(6000);
    }, 10);
  });
}
