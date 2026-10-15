import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, ease, glass } from './theme';

/** Aurora gradient, perspective grid floor, and drifting particles behind every scene. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (x: number, y: number, size: number, color: string, phase: number): CSSProperties => ({
    position: 'absolute',
    left: x + Math.sin(t * 0.35 + phase) * 90 - size / 2,
    top: y + Math.cos(t * 0.3 + phase) * 70 - size / 2,
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color} 0%, transparent 62%)`,
  });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #080b1a 0%, ${C.bg} 100%)`, overflow: 'hidden' }}>
      <div style={blob(180, 120, 1300, 'rgba(180,242,74,0.22)', 0)} />
      <div style={blob(1780, 260, 1400, 'rgba(123,97,255,0.32)', 2)} />
      <div style={blob(860, 1180, 1500, 'rgba(46,211,183,0.18)', 4)} />
      {/* Grid floor receding to a horizon, scrolling toward the camera. */}
      <div style={{ position: 'absolute', inset: 0, perspective: 700, perspectiveOrigin: '50% 45%' }}>
        <div
          style={{
            position: 'absolute',
            left: '-60%',
            width: '220%',
            top: '58%',
            height: 1600,
            transformOrigin: '50% 0%',
            transform: 'rotateX(80deg)',
            backgroundImage:
              'linear-gradient(rgba(180,242,74,0.16) 2px, transparent 2px), linear-gradient(90deg, rgba(180,242,74,0.16) 2px, transparent 2px)',
            backgroundSize: '120px 120px',
            backgroundPosition: `0 ${(frame * 3) % 120}px`,
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 55%, transparent 90%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 55%, transparent 90%)',
          }}
        />
      </div>
      {Array.from({ length: 46 }, (_, i) => {
        const x = random(`px${i}`) * 1920;
        const speed = 0.3 + random(`ps${i}`) * 0.9;
        const y = (((random(`py${i}`) * 1180 - frame * speed) % 1180) + 1180) % 1180 - 50;
        const size = 2 + random(`pz${i}`) * 3;
        const tw = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(frame / 12 + i));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: i % 3 === 0 ? C.lime : '#ffffff',
              opacity: tw * 0.6,
              boxShadow: i % 3 === 0 ? `0 0 10px ${C.lime}` : undefined,
            }}
          />
        );
      })}
      {/* Vignette */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

/** Fades, zooms, and un-blurs a scene in over its first frames and out over its last. */
export const Scene: React.FC<{ dur: number; children: ReactNode; out?: boolean }> = ({ dur, children, out = true }) => {
  const f = useCurrentFrame();
  const inP = ease(f, [0, 16], [0, 1]);
  const outP = out ? ease(f, [dur - 16, dur], [0, 1]) : 0;
  const blur = (1 - inP) * 10 + outP * 12;
  return (
    <AbsoluteFill
      style={{
        opacity: inP * (1 - outP),
        transform: `scale(${1.06 - 0.06 * inP + 0.08 * outP})`,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const CURSOR_PATH = '40,28 40,84 53,72 62,92 71,88 62,68 79,68';

/** The QuickApe tile extruded into a 3D block: stacked layers for depth, lit front face. */
export const LogoTile: React.FC<{
  size: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  spark?: number;
  glow?: number;
}> = ({ size, rotX = 0, rotY = 0, rotZ = 0, spark = 1, glow = 1 }) => {
  const layers = 22;
  const depth = size * 0.3;
  const radius = size * 0.22;
  const sheen = 50 + Math.sin((rotY * Math.PI) / 180) * 40;
  return (
    <div style={{ width: size, height: size, position: 'relative', perspective: size * 6 }}>
      <div
        style={{
          position: 'absolute',
          inset: -size * 0.45,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(180,242,74,${0.55 * glow}) 0%, transparent 60%)`,
          transform: 'translateZ(-200px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`,
        }}
      >
        {Array.from({ length: layers }, (_, i) => {
          const k = i / (layers - 1);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: radius,
                background: `rgb(${Math.round(120 - 60 * k)}, ${Math.round(170 - 80 * k)}, ${Math.round(32 - 14 * k)})`,
                transform: `translateZ(${-(i + 1) * (depth / layers)}px)`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            overflow: 'hidden',
            transform: 'translateZ(0.5px)',
            background: 'linear-gradient(150deg, #dcfc8f 0%, #b4f24a 45%, #8fd12a 100%)',
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.7), inset 0 -6px 18px rgba(60,100,10,0.35)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(115deg, transparent ${sheen - 22}%, rgba(255,255,255,0.45) ${sheen}%, transparent ${sheen + 22}%)`,
            }}
          />
          <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
            <polygon points={CURSOR_PATH} fill="#0E1319" stroke="#0E1319" strokeWidth={3} strokeLinejoin="round" />
            <g stroke="#0E1319" strokeWidth={5} strokeLinecap="round" opacity={spark}>
              <line x1={31} y1={28} x2={31 - 10 * spark} y2={28} />
              <line x1={33} y1={21} x2={33 - 7 * spark} y2={21 - 7 * spark} />
              <line x1={40} y1={19} x2={40} y2={19 - 10 * spark} />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

/** Expanding ring, used for clicks and the logo "pop". */
export const Shockwave: React.FC<{ start: number; size: number; color?: string; dur?: number }> = ({
  start,
  size,
  color = C.lime,
  dur = 28,
}) => {
  const f = useCurrentFrame();
  const p = ease(f, [start, start + dur], [0, 1]);
  if (f < start || f > start + dur) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        border: `${4 * (1 - p) + 1}px solid ${color}`,
        transform: `scale(${0.3 + p * 1.4})`,
        opacity: 1 - p,
        boxShadow: `0 0 40px ${color}`,
      }}
    />
  );
};

/** Big display headline whose words rise in one after another. */
export const Headline: React.FC<{
  lines: { text: string; accent?: boolean; at: number }[];
  size?: number;
  align?: 'left' | 'center';
}> = ({ lines, size = 104, align = 'left' }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.035em', textAlign: align }}>
      {lines.map((line, li) => (
        <div key={li} style={{ color: line.accent ? C.lime : C.text, whiteSpace: 'nowrap' }}>
          {line.text.split(' ').map((w, wi) => {
            const s = spring({ frame: f, fps, delay: line.at + wi * 4, config: { damping: 15, stiffness: 140 } });
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  marginRight: '0.26em',
                  opacity: s,
                  transform: `translateY(${(1 - s) * 60}px) rotateX(${(1 - s) * 50}deg)`,
                  filter: s < 0.98 ? `blur(${(1 - s) * 8}px)` : undefined,
                  textShadow: line.accent ? '0 0 40px rgba(180,242,74,0.45)' : undefined,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Supporting line under a headline. */
export const Sub: React.FC<{ children: ReactNode; at: number; size?: number; align?: 'left' | 'center'; width?: number }> = ({
  children,
  at,
  size = 34,
  align = 'left',
  width,
}) => {
  const f = useCurrentFrame();
  const p = ease(f, [at, at + 18], [0, 1]);
  return (
    <div
      style={{
        fontFamily: FONT.body,
        fontSize: size,
        lineHeight: 1.45,
        color: C.muted,
        textAlign: align,
        maxWidth: width,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** QuickApe quick-buy chip, as it appears under a tweet. */
export const Chip: React.FC<{ press?: number; scale?: number }> = ({ press = 0, scale = 1 }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: 5,
      height: 58,
      borderRadius: 999,
      background: 'rgba(12,16,26,0.75)',
      border: `1px solid ${C.line}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 30px -10px rgba(180,242,74,0.45)',
      transform: `scale(${scale})`,
      transformOrigin: '0 50%',
    }}
  >
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 22px',
        borderRadius: 999,
        color: C.ink,
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: 22,
        background: 'linear-gradient(180deg, #d2fa8a, #b4f24a)',
        transform: `scale(${1 - press * 0.08})`,
        boxShadow: `0 0 ${20 + press * 30}px rgba(180,242,74,${0.35 + press * 0.4})`,
      }}
    >
      <svg viewBox="17 5 66 90" width={14} height={19}>
        <polygon points={CURSOR_PATH} fill={C.ink} />
      </svg>
      0.1 SOL
    </div>
    <div style={{ padding: '0 18px', fontFamily: FONT.mono, fontSize: 19, color: C.muted }}>9xKq…pump ▸</div>
  </div>
);

/** System pointer. */
export const Pointer: React.FC<{ x: number; y: number; press?: number; opacity?: number }> = ({ x, y, press = 0, opacity = 1 }) => (
  <svg
    viewBox="0 0 24 34"
    width={44}
    height={62}
    style={{
      position: 'absolute',
      left: x,
      top: y,
      opacity,
      transform: `scale(${1 - press * 0.15})`,
      transformOrigin: '0 0',
      filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.6))',
    }}
  >
    <path d="M1.5 1.5 L1.5 26 L7.8 20.2 L12.3 30.6 L17 28.6 L12.6 18.5 L21 18.5 Z" fill="#fff" stroke="#0b0f18" strokeWidth={2} strokeLinejoin="round" />
  </svg>
);

/** "Bought" confirmation toast from the extension. */
export const Toast: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <div
    style={{
      display: 'flex',
      gap: 18,
      alignItems: 'center',
      padding: '20px 26px 20px 20px',
      borderRadius: 24,
      width: 470,
      ...glass,
      background: 'linear-gradient(155deg, rgba(62,230,160,0.16), rgba(255,255,255,0.03) 50%), rgba(12,18,26,0.88)',
      border: '1px solid rgba(62,230,160,0.35)',
      ...style,
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(62,230,160,0.18)',
        boxShadow: '0 0 24px rgba(62,230,160,0.35)',
      }}
    >
      <svg viewBox="0 0 24 24" width={28} height={28}>
        <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={C.green} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div style={{ fontFamily: FONT.body }}>
      <div style={{ fontSize: 25, fontWeight: 600, color: C.text }}>Bought MOONCAT</div>
      <div style={{ fontSize: 19, color: C.muted, marginTop: 3 }}>0.1 SOL → ≈ 238.1K MOONCAT · 0.9s</div>
      <div style={{ fontSize: 18, color: C.lime, marginTop: 6, fontWeight: 600 }}>View transaction ↗</div>
    </div>
  </div>
);

/** Small glass label with a colored dot. */
export const Pill: React.FC<{ children: ReactNode; dot?: string; style?: CSSProperties; size?: number }> = ({
  children,
  dot = C.lime,
  style,
  size = 24,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 24px',
      borderRadius: 999,
      fontFamily: FONT.body,
      fontWeight: 600,
      fontSize: size,
      color: C.text,
      whiteSpace: 'nowrap',
      ...glass,
      ...style,
    }}
  >
    <span style={{ width: 12, height: 12, borderRadius: '50%', background: dot, boxShadow: `0 0 14px ${dot}` }} />
    {children}
  </div>
);
