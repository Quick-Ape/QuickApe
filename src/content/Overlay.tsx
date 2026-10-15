import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { shortAddr } from '@/lib/address';
import type { TokenRequest } from '@/lib/types';
import { quickBuy } from '@/ui/actions';
import { CursorGlyph, LogoMark } from '@/ui/Logo';
import { Panel } from '@/ui/Panel';
import { keepChip, scheduleHideChip, setState, useOverlay } from '@/ui/store';
import { Toasts } from '@/ui/Toasts';
import { openPanel, quickLabel, restoreCollapsed, setCollapsed } from './panel-control';

const POS_KEY = 'qa.panelPos';
const PANEL_W = 340;

function clamp(p: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - PANEL_W - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - 120)),
  };
}

function FloatingPanel({ req, isPage }: { req: TokenRequest; isPage: boolean }) {
  const [pos, setPos] = useState(() => clamp({ x: window.innerWidth - PANEL_W - 24, y: 88 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    browser.storage.local.get(POS_KEY).then((r) => {
      const p = r[POS_KEY] as { x: number; y: number } | undefined;
      if (p) setPos(clamp(p));
    });
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onDragStart = (e: ReactPointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const at = (ev: PointerEvent) => clamp({ x: ev.clientX - drag.current!.dx, y: ev.clientY - drag.current!.dy });
    const move = (ev: PointerEvent) => drag.current && setPos(at(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (drag.current) browser.storage.local.set({ [POS_KEY]: at(ev) }).catch(() => {});
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="qa-float" style={{ left: pos.x, top: pos.y }}>
      <Panel
        req={req}
        mode="float"
        onDragStart={onDragStart}
        onCollapse={() => setCollapsed(true)}
        onClose={isPage ? undefined : () => setState({ panel: null })}
      />
    </div>
  );
}

function DockPill({ req }: { req: TokenRequest }) {
  return (
    <button className="qa-dock qa-glass" onClick={() => setCollapsed(false)}>
      <LogoMark size={26} />
      QuickApe
      {req.address && <small>{shortAddr(req.address)}</small>}
    </button>
  );
}

function HoverChip() {
  const chip = useOverlay((s) => s.chip);
  const settings = useOverlay((s) => s.settings);
  if (!chip) return null;
  return (
    <div className="qa-hchip qa-glass" style={{ left: chip.x, top: chip.y }} onMouseEnter={keepChip} onMouseLeave={() => scheduleHideChip()}>
      {chip.req.address && (
        <button className="qa-hchip-buy" title="Buy instantly (1 click)" onClick={(e) => e.isTrusted && quickBuy(chip.req)}>
          <CursorGlyph />
          {quickLabel(chip.req, settings)}
        </button>
      )}
      <button className="qa-hchip-open" title="Open trading panel" onClick={(e) => e.isTrusted && openPanel(chip.req)}>
        Panel
      </button>
    </div>
  );
}

export function Overlay() {
  const panel = useOverlay((s) => s.panel);
  const pageToken = useOverlay((s) => s.pageToken);
  const collapsed = useOverlay((s) => s.collapsed);
  const active = panel ?? pageToken;

  useEffect(() => {
    restoreCollapsed().catch(() => {});
  }, []);

  return (
    <div className="qa-root">
      {active && !collapsed && <FloatingPanel req={active} isPage={!panel} />}
      {active && collapsed && <DockPill req={active} />}
      <HoverChip />
      <Toasts />
    </div>
  );
}
