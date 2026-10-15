import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import type { CSSProperties } from 'react';
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { LogoTile } from './ui';

/**
 * Edited product walkthrough from two raw screen recordings (1280x650, public/rec/a.mp4 and b.mp4):
 * iOS-style card on a soft wallpaper, Inter captions, zooms, and opaque privacy blurs.
 */

const INTER = loadInter('normal', { weights: ['400', '500', '600', '800'], subsets: ['latin'] }).fontFamily;
const FPS = 30;
const SRC_W = 1280;
const SRC_H = 650;
const VIDEO_W = 1580;
const K = VIDEO_W / SRC_W;
const VIDEO_H = Math.round(SRC_H * K);
const BEZEL = 10;
const CARD_LEFT = (1920 - VIDEO_W) / 2 - BEZEL;
const CARD_TOP = 46;
const FADE = 8; // crossfade between clips, in frames

type Src = 'a' | 'b';
type Box = { x: number; y: number; w: number; h: number; r: number };
type Zoom = { at: number; s: number; x: number; y: number };

// ---- Privacy blurs, in source pixels and source seconds -------------------------------------------
const GOOGLE_AVATAR: Box = { x: 1231, y: 3, w: 30, h: 30, r: 15 };
const X_ACCOUNT: Box = { x: 114, y: 588, w: 196, h: 52, r: 26 };
const PHANTOM_ACCOUNT: Box = { x: 852, y: 34, w: 146, h: 48, r: 14 };
const FOMO_AVATAR: Box = { x: 1236, y: 46, w: 44, h: 44, r: 22 };
const SEED_PHRASE: Box = { x: 878, y: 146, w: 288, h: 140, r: 12 };

const BLURS: { src: Src; box: Box; ranges: [number, number][] }[] = [
  { src: 'a', box: GOOGLE_AVATAR, ranges: [[0, 1e9]] },
  { src: 'b', box: GOOGLE_AVATAR, ranges: [[0, 1e9]] },
  { src: 'a', box: SEED_PHRASE, ranges: [[3.5, 30.5]] },
  { src: 'a', box: PHANTOM_ACCOUNT, ranges: [[56.2, 60]] },
  { src: 'b', box: PHANTOM_ACCOUNT, ranges: [[232.4, 239], [253.2, 262]] },
  { src: 'b', box: FOMO_AVATAR, ranges: [[155, 216.5]] },
  // X account in the sidebar; skipped while a QuickApe toast covers that corner (detected per frame).
  { src: 'b', box: X_ACCOUNT, ranges: [[0, 33.7], [38.3, 38.7], [42.5, 43.6], [44.4, 53.3], [70.8, 71.7], [74.5, 75.6], [76.4, 78.5]] },
];

// ---- Story -------------------------------------------------------------------------------------------
const CAPTIONS = {
  create: ['Create a trading wallet', 'A fresh wallet just for trading. Your main wallet stays untouched.'],
  backup: ['Back it up, lock it', 'The seed phrase and password stay encrypted on your device.'],
  deposit: ['Deposit with a QR code', 'Send only what you plan to trade.'],
  fund: ['Fund it from Phantom', '0.2 SOL from the main wallet, in seconds.'],
  ready: ['Ready to trade', 'The balance shows up right in the popup.'],
  x: ['See a CA on X. Click once.', 'A 0.01 SOL quick-buy, right under the post.'],
  chain: ['Confirmed on-chain', 'One transaction, fee included, on Solscan.'],
  sell: ['Sell from the panel', 'Price, liquidity, safety flags. Sell 100% in one click.'],
  gmgn: ['Works on GMGN', 'The trading panel docks on every token page.'],
  fomo: ['…and on Fomo', 'Buy from the feed, sell from the panel.'],
  activity: ['Every trade in Activity', 'Buys, sells and withdrawals, fees included.'],
  withdraw: ['Withdraw anytime', 'Send profits back to your main wallet.'],
  back: ['Back in Phantom', 'The SOL lands in your main wallet.'],
} as const;
type CaptionId = keyof typeof CAPTIONS;

const POPUP = { s: 1.45, x: 1020, y: 275 };
const PANEL = { s: 1.35, x: 1133, y: 350 };
const PHANTOM = { s: 1.4, x: 1000, y: 290 };
const FULL = { s: 1, x: 640, y: 325 };

interface Clip {
  src: Src;
  from: number;
  to: number;
  speed: number;
  caption: CaptionId;
  zoom: Zoom[];
}

const z = (at: number, v: { s: number; x: number; y: number }): Zoom => ({ at, ...v });

const CLIPS: Clip[] = [
  { src: 'a', from: 0, to: 4, speed: 1.5, caption: 'create', zoom: [z(0, POPUP)] },
  { src: 'a', from: 4, to: 30, speed: 4, caption: 'backup', zoom: [z(4, POPUP)] },
  { src: 'a', from: 30, to: 41, speed: 2, caption: 'deposit', zoom: [z(30, { s: 1.45, x: 1015, y: 285 })] },
  { src: 'a', from: 46, to: 56.5, speed: 4, caption: 'fund', zoom: [z(46, PHANTOM)] },
  { src: 'a', from: 56.5, to: 72, speed: 2.5, caption: 'fund', zoom: [z(56.5, PHANTOM)] },
  { src: 'a', from: 72.5, to: 78, speed: 1.5, caption: 'ready', zoom: [z(72.5, { s: 1.45, x: 1020, y: 290 })] },
  { src: 'b', from: 26, to: 31.5, speed: 2, caption: 'x', zoom: [z(26, FULL)] },
  {
    src: 'b', from: 31.5, to: 38.6, speed: 1, caption: 'x',
    zoom: [z(31.5, { s: 1.8, x: 470, y: 365 }), z(33.8, { s: 1.7, x: 230, y: 560 })],
  },
  { src: 'b', from: 40.8, to: 42.5, speed: 0.8, caption: 'chain', zoom: [z(40.8, { s: 1.6, x: 420, y: 400 })] },
  { src: 'b', from: 45, to: 60, speed: 1.5, caption: 'sell', zoom: [z(45, PANEL), z(53.2, { s: 1.6, x: 260, y: 560 })] },
  { src: 'b', from: 86, to: 94, speed: 2, caption: 'gmgn', zoom: [z(86, FULL)] },
  { src: 'b', from: 106, to: 124, speed: 3, caption: 'gmgn', zoom: [z(106, FULL), z(109, PANEL)] },
  { src: 'b', from: 160, to: 169, speed: 2, caption: 'fomo', zoom: [z(160, { s: 1.6, x: 260, y: 380 })] },
  {
    src: 'b', from: 175, to: 199, speed: 2, caption: 'fomo',
    zoom: [z(175, { s: 1.6, x: 260, y: 400 }), z(181, { s: 1.6, x: 260, y: 560 }), z(183.5, PANEL), z(189, { s: 1.6, x: 260, y: 560 })],
  },
  { src: 'b', from: 218.5, to: 223, speed: 1.5, caption: 'activity', zoom: [z(218.5, POPUP)] },
  { src: 'b', from: 240, to: 251, speed: 2, caption: 'withdraw', zoom: [z(240, POPUP)] },
  { src: 'b', from: 254, to: 261, speed: 1.5, caption: 'back', zoom: [z(254, PHANTOM)] },
];

const INTRO = 80;
const OUTRO = 105;
const clipFrames = (c: Clip) => Math.round(((c.to - c.from) / c.speed) * FPS);
const TIMELINE = (() => {
  let at = INTRO - FADE;
  return CLIPS.map((c) => {
    const start = at;
    at += clipFrames(c) - FADE;
    return { ...c, start, frames: clipFrames(c) };
  });
})();
const lastClip = TIMELINE[TIMELINE.length - 1];
const OUTRO_START = lastClip.start + lastClip.frames - FADE;
export const WALKTHROUGH_FRAMES = OUTRO_START + OUTRO;

// ---- Pieces --------------------------------------------------------------------------------------------

/** Soft iOS-style wallpaper in the brand colors, drifting slowly. */
const Wallpaper: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const blob = (x: number, y: number, size: number, color: string, phase: number): CSSProperties => ({
    position: 'absolute',
    left: x + Math.sin(t * 0.22 + phase) * 120 - size / 2,
    top: y + Math.cos(t * 0.18 + phase) * 90 - size / 2,
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color} 0%, transparent 64%)`,
  });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg, #0d1324 0%, #070a14 60%, #0a0d1a 100%)', overflow: 'hidden' }}>
      <div style={blob(200, 160, 1500, 'rgba(180,242,74,0.30)', 0)} />
      <div style={blob(1750, 220, 1500, 'rgba(123,97,255,0.42)', 1.7)} />
      <div style={blob(1500, 1100, 1400, 'rgba(46,211,183,0.30)', 3.1)} />
      <div style={blob(300, 1050, 1200, 'rgba(255,107,214,0.16)', 4.6)} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08), transparent 55%)' }} />
    </AbsoluteFill>
  );
};

const easeInOut = Easing.inOut(Easing.cubic);

/** Zoom state at a given source time, eased over ~0.7 s of output whenever the target changes. */
function zoomAt(clip: Clip, srcTime: number) {
  const keys = clip.zoom;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].at <= srcTime) i++;
  const cur = keys[i];
  const prev = keys[i - 1] ?? cur;
  const p = easeInOut(Math.min(1, (((srcTime - cur.at) / clip.speed) * FPS) / 22));
  return { s: prev.s + (cur.s - prev.s) * p, x: prev.x + (cur.x - prev.x) * p, y: prev.y + (cur.y - prev.y) * p };
}

/** translate/scale that centers (x, y) at zoom s without showing past the video's edges. */
function zoomTransform({ s, x, y }: { s: number; x: number; y: number }) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tx = clamp(VIDEO_W / 2 - x * K * s, VIDEO_W - VIDEO_W * s, 0);
  const ty = clamp(VIDEO_H / 2 - y * K * s, VIDEO_H - VIDEO_H * s, 0);
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}

const ClipView: React.FC<{ clip: (typeof TIMELINE)[number] }> = ({ clip }) => {
  const f = useCurrentFrame();
  const srcTime = clip.from + (f / FPS) * clip.speed;
  const opacity = interpolate(f, [0, FADE], [0, 1], { extrapolateRight: 'clamp' });
  const blurs = BLURS.filter((b) => b.src === clip.src && b.ranges.some(([s, e]) => srcTime >= s && srcTime <= e));
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: VIDEO_W, height: VIDEO_H, transformOrigin: '0 0', transform: zoomTransform(zoomAt(clip, srcTime)) }}>
        <OffthreadVideo
          src={staticFile(`rec/${clip.src}.mp4`)}
          trimBefore={Math.round(clip.from * FPS)}
          playbackRate={clip.speed}
          muted
          style={{ width: VIDEO_W, height: VIDEO_H, display: 'block' }}
        />
        {blurs.map(({ box }, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: box.x * K,
              top: box.y * K,
              width: box.w * K,
              height: box.h * K,
              borderRadius: box.r * K,
              backdropFilter: 'blur(14px)',
              background: 'rgba(132,136,148,0.94)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** The iOS-style card: glass bezel, large radius, soft shadow. */
const Card: React.FC<{ children: React.ReactNode; enter: number; exit: number }> = ({ children, enter, exit }) => (
  <div
    style={{
      position: 'absolute',
      left: CARD_LEFT,
      top: CARD_TOP,
      width: VIDEO_W + BEZEL * 2,
      height: VIDEO_H + BEZEL * 2,
      padding: BEZEL,
      borderRadius: 46,
      background: 'linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))',
      border: '1px solid rgba(255,255,255,0.28)',
      boxShadow: '0 60px 140px -40px rgba(0,0,0,0.75), 0 20px 50px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
      opacity: enter * (1 - exit),
      transform: `translateY(${(1 - enter) * 60 + exit * -30}px) scale(${0.94 + 0.06 * enter - exit * 0.03})`,
    }}
  >
    <div style={{ position: 'relative', width: VIDEO_W, height: VIDEO_H, borderRadius: 36, overflow: 'hidden', background: '#000' }}>{children}</div>
  </div>
);

/** iOS notification-style caption under the card. */
const Caption: React.FC<{ id: CaptionId; at: number; until: number }> = ({ id, at, until }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f - at, fps, config: { damping: 18, stiffness: 160 } });
  const outP = interpolate(f, [until - 8, until], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (f < at || f > until) return null;
  const [title, sub] = CAPTIONS[id];
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: CARD_TOP + VIDEO_H + BEZEL * 2 + 26,
        display: 'flex',
        justifyContent: 'center',
        opacity: inP * (1 - outP),
        transform: `translateY(${(1 - inP) * 30 + outP * 10}px) scale(${0.96 + 0.04 * inP})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '18px 34px 18px 18px',
          borderRadius: 32,
          background: 'rgba(22,24,34,0.62)',
          backdropFilter: 'blur(30px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
          fontFamily: INTER,
        }}
      >
        <svg viewBox="0 0 100 100" width={60} height={60} style={{ flex: 'none', borderRadius: 14 }}>
          <rect width="100" height="100" rx="22" fill="#A3E635" />
          <polygon points="40,28 40,84 53,72 62,92 71,88 62,68 79,68" fill="#0E1319" stroke="#0E1319" strokeWidth={3} strokeLinejoin="round" />
          <g stroke="#0E1319" strokeWidth={5} strokeLinecap="round">
            <line x1={31} y1={28} x2={21} y2={28} />
            <line x1={33} y1={21} x2={26} y2={14} />
            <line x1={40} y1={19} x2={40} y2={9} />
          </g>
        </svg>
        <div>
          <div style={{ fontSize: 34, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{title}</div>
          <div style={{ fontSize: 23, fontWeight: 400, color: 'rgba(255,255,255,0.68)', marginTop: 4 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
};

const TitleCard: React.FC<{ title: string; sub: string; foot?: string }> = ({ title, sub, foot }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 15, stiffness: 90 } });
  const t2 = spring({ frame: f - 8, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: INTER }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * s})`, opacity: s }}>
        <LogoTile size={150} rotX={10} rotY={interpolate(s, [0, 1], [-90, -14]) + Math.sin(f / 20) * 6} spark={s} glow={s} />
      </div>
      <div style={{ marginTop: 40, fontSize: 92, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', opacity: t2, transform: `translateY(${(1 - t2) * 30}px)` }}>
        {title}
      </div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 500, color: 'rgba(255,255,255,0.7)', opacity: t2 }}>{sub}</div>
      {foot && (
        <div
          style={{
            marginTop: 34,
            padding: '14px 30px',
            borderRadius: 999,
            fontSize: 30,
            fontWeight: 600,
            color: '#0b1006',
            background: 'linear-gradient(180deg, #d2fa8a, #b4f24a)',
            boxShadow: '0 16px 50px -15px rgba(180,242,74,0.7)',
            opacity: t2,
          }}
        >
          {foot}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---- Composition ------------------------------------------------------------------------------------------

export const Walkthrough: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f - (INTRO - 20), fps, config: { damping: 18, stiffness: 90 } });
  const exit = interpolate(f, [OUTRO_START, OUTRO_START + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const introOut = interpolate(f, [INTRO - 22, INTRO - 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // One caption per run of clips that share it.
  const captionRuns: { id: CaptionId; at: number; until: number }[] = [];
  for (const c of TIMELINE) {
    const last = captionRuns[captionRuns.length - 1];
    if (last && last.id === c.caption) last.until = c.start + c.frames;
    else captionRuns.push({ id: c.caption, at: c.start + 4, until: c.start + c.frames });
  }

  return (
    <AbsoluteFill>
      <Wallpaper />
      <Sequence durationInFrames={INTRO}>
        <AbsoluteFill style={{ opacity: introOut }}>
          <TitleCard title="QuickApe" sub="1-click memecoin trading · full walkthrough" />
        </AbsoluteFill>
      </Sequence>
      <Card enter={enter} exit={exit}>
        {TIMELINE.map((c, i) => (
          <Sequence key={i} from={c.start} durationInFrames={c.frames}>
            <ClipView clip={c} />
          </Sequence>
        ))}
      </Card>
      {captionRuns.map((r, i) => (
        <Caption key={i} id={r.id} at={r.at} until={Math.min(r.until, OUTRO_START)} />
      ))}
      <Sequence from={OUTRO_START + 6}>
        <TitleCard title="QuickApe" sub="See a CA. Click once. You're in." foot="quickape.world" />
      </Sequence>
    </AbsoluteFill>
  );
};
