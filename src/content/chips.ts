import { shortAddr } from '@/lib/address';
import type { TokenRequest } from '@/lib/types';
import { quickBuy } from '@/ui/actions';
import { CURSOR_GLYPH_SVG } from '@/ui/Logo';
import { getState } from '@/ui/store';
import { openPanel, quickLabel } from './panel-control';

export const CHIP_TAG = 'quickape-chips';

// Small liquid glass capsule; the blur picks up the tweet's colors behind it (dark/light).
const CSS = `
:host { all: initial; display: block; margin: 8px 0 2px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; font: 600 12px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.chip { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px;
  background: linear-gradient(155deg, rgba(255,255,255,.12), rgba(255,255,255,.03) 45%), rgba(22,27,36,.55);
  border: 1px solid rgba(255,255,255,.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 6px 18px -8px rgba(0,0,0,.5);
  -webkit-backdrop-filter: blur(18px) saturate(180%); backdrop-filter: blur(18px) saturate(180%); }
button { all: unset; cursor: pointer; height: 24px; padding: 0 10px; border-radius: 999px; color: #eef3f7;
  white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; transition: background .15s, filter .15s; }
button:hover { background: rgba(255,255,255,.1); }
.buy { color: #0b1006; background: linear-gradient(180deg, #c6f76d, #a3e635); box-shadow: inset 0 1px 0 rgba(255,255,255,.55); }
.buy:hover { background: linear-gradient(180deg, #d4fb8a, #c6f76d); }
.addr { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; font-weight: 500; color: rgba(228,236,245,.75); }
`;

function handler(fn: () => void) {
  return (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Reject synthetic clicks from page scripts: only genuine user clicks can buy.
    if (e.isTrusted) fn();
  };
}

/** Row of quick-buy chips to insert below a tweet / bio. Closed shadow root, isolated styles. */
export function buildChipRow(items: TokenRequest[]): HTMLElement {
  const host = document.createElement(CHIP_TAG);
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const row = document.createElement('div');
  row.className = 'row';
  const settings = getState().settings;

  for (const req of items) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (req.address) {
      const buy = document.createElement('button');
      buy.className = 'buy';
      buy.innerHTML = CURSOR_GLYPH_SVG; // static constant, not page input
      buy.append(document.createTextNode(quickLabel(req, settings)));
      buy.title = 'Buy instantly (1 click)';
      buy.addEventListener('click', handler(() => quickBuy(req)));
      chip.append(buy);
    }
    const open = document.createElement('button');
    open.className = 'addr';
    open.textContent = req.address ? `${shortAddr(req.address)} ▸` : `$${req.ticker} ▸`;
    open.title = 'Open trading panel';
    open.addEventListener('click', handler(() => openPanel(req)));
    chip.append(open);
    row.append(chip);
  }

  root.append(style, row);
  // Don't let clicks "fall through" to the tweet (which would open the tweet page).
  for (const ev of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown']) {
    host.addEventListener(ev, (e) => e.stopPropagation());
  }
  return host;
}
