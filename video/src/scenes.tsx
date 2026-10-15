import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, CHAINS, FONT, PLATFORMS, ease, glass } from './theme';
import { Chip, Headline, LogoTile, Pill, Pointer, Scene, Shockwave, Sub, Toast } from './ui';

/** 1. The tile flies in from deep space, clicks, and the wordmark lands. */
export const LogoReveal: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, delay: 4, config: { damping: 14, stiffness: 60, mass: 1.1 } });
  const spark = ease(f, [44, 54], [0, 1], Easing.out(Easing.back(2.2)));
  const flash = interpolate(f, [44, 48, 70], [0, 0.32, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <Scene dur={dur}>
      <AbsoluteFill style={{ perspective: 1600 }}>
        <div
          style={{
            position: 'absolute',
            left: 960 - 130,
            top: 250,
            width: 260,
            height: 260,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${interpolate(s, [0, 1], [-2200, 0])}px) scale(${1 + ease(f, [40, 110], [0, 0.04])})`,
          }}
        >
          <LogoTile
            size={260}
            rotX={interpolate(s, [0, 1], [40, 14]) + Math.sin(f / 22) * 4}
            rotY={interpolate(s, [0, 1], [-200, -26]) + Math.sin(f / 30) * 10}
            spark={spark}
            glow={s}
          />
          <Shockwave start={46} size={560} />
          <Shockwave start={52} size={820} dur={36} color="rgba(180,242,74,0.55)" />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 36%, rgba(220,255,160,${flash}), transparent 55%)` }} />
      <div style={{ position: 'absolute', top: 590, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 128, letterSpacing: '-0.04em', color: C.text }}>
          {'QuickApe'.split('').map((ch, i) => {
            const k = spring({ frame: f, fps, delay: 50 + i * 2.5, config: { damping: 14, stiffness: 150 } });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: k,
                  transform: `translateY(${(1 - k) * 70}px) scale(${0.8 + 0.2 * k})`,
                  color: i >= 5 ? C.lime : C.text,
                  textShadow: i >= 5 ? '0 0 50px rgba(180,242,74,0.5)' : undefined,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: 18 }}>
          <Sub at={70} size={36} align="center">
            1-click memecoin trading, right where you find them
          </Sub>
        </div>
      </div>
    </Scene>
  );
};

/** 2. A tweet with a CA gets a buy chip, the cursor clicks it, and the buy confirms. */
export const TweetScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, delay: 2, config: { damping: 16, stiffness: 70 } });
  const highlight = ease(f, [38, 70], [0, 1], Easing.inOut(Easing.cubic));
  const chip = spring({ frame: f, fps, delay: 76, config: { damping: 12, stiffness: 160 } });
  // Pointer travels to the chip's buy button and clicks it.
  const target = { x: 120, y: 319 };
  const travel = ease(f, [100, 140], [0, 1], Easing.inOut(Easing.cubic));
  const px = interpolate(travel, [0, 1], [720, target.x - 3]);
  const py = interpolate(travel, [0, 1], [560, target.y - 3]) - Math.sin(travel * Math.PI) * 90;
  const press = interpolate(f, [142, 146, 156], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const toast = spring({ frame: f, fps, delay: 156, config: { damping: 14, stiffness: 130 } });
  const lit = ease(f, [146, 170], [0, 1]);
  return (
    <Scene dur={dur}>
      <div style={{ position: 'absolute', left: 120, top: 250 }}>
        <Headline
          size={116}
          lines={[
            { text: 'See a CA.', at: 10 },
            { text: 'Click once.', accent: true, at: 90 },
            { text: "You're in.", at: 166 },
          ]}
        />
        <div style={{ marginTop: 34 }}>
          <Sub at={182} size={34}>
            No copy-paste. No swap screens.
          </Sub>
        </div>
      </div>
      <AbsoluteFill style={{ perspective: 1900, perspectiveOrigin: '75% 45%' }}>
        <div
          style={{
            position: 'absolute',
            left: 980,
            top: 250,
            width: 800,
            height: 400,
            borderRadius: 34,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${(1 - s) * -1000}px) translateY(${(1 - s) * 180}px) rotateX(${8 + (1 - s) * 28}deg) rotateY(${-18 - (1 - s) * 30 + f * 0.035}deg)`,
            opacity: s,
            ...glass,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 50px 120px -30px rgba(0,0,0,0.85), 0 0 ${80 * lit}px rgba(180,242,74,${0.25 * lit})`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 36,
              top: 34,
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'conic-gradient(from 200deg, #b4f24a, #2ed3b7, #7b61ff, #ff6bd6, #b4f24a)',
            }}
          />
          <div style={{ position: 'absolute', left: 116, top: 50, fontFamily: FONT.body, fontSize: 27, fontWeight: 600, color: C.text }}>
            degen.sol <span style={{ fontWeight: 400, color: C.faint, fontSize: 23 }}>@degenwatch · 2m</span>
          </div>
          <div style={{ position: 'absolute', left: 36, top: 122, width: 728, fontFamily: FONT.body, fontSize: 29, lineHeight: 1.45, color: '#dfe6f2' }}>
            mooncat just migrated off the curve, dev renounced, chart looks clean
          </div>
          <div style={{ position: 'absolute', left: 36, top: 222, fontFamily: FONT.mono, fontSize: 22, color: '#c8d1e4' }}>
            <span style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: -6,
                  top: -4,
                  bottom: -4,
                  width: `calc(${highlight * 100}% + 12px)`,
                  borderRadius: 8,
                  background: 'rgba(180,242,74,0.18)',
                  boxShadow: `inset 0 0 0 1px rgba(180,242,74,${0.5 * highlight})`,
                }}
              />
              <span style={{ position: 'relative' }}>CA: 9xKqTmPQ4dW7nBvRZc2hLsY6uFa8JgN3eM1tXHVbpump</span>
            </span>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 36,
              top: 290,
              opacity: chip,
              transform: `translateY(${(1 - chip) * 24}px) translateZ(30px)`,
            }}
          >
            <Chip press={press} scale={0.7 + 0.3 * chip} />
          </div>
          <div style={{ position: 'absolute', left: target.x, top: target.y, width: 0, height: 0, transform: 'translateZ(40px)' }}>
            <Shockwave start={146} size={200} dur={26} />
          </div>
          <div style={{ position: 'absolute', inset: 0, transform: 'translateZ(60px)' }}>
            <Pointer x={px} y={py} press={press} opacity={ease(f, [96, 104], [0, 1]) * (1 - ease(f, [176, 190], [0, 1]))} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 300,
              top: 372,
              opacity: toast,
              transform: `translateZ(140px) translateY(${(1 - toast) * 70}px) scale(${0.88 + 0.12 * toast})`,
            }}
          >
            <Toast />
          </div>
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

/** 3. Platform logos orbit the tile in 3D. */
export const OrbitScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = 960;
  const cy = 640;
  const R = 640;
  const tilt = 150;
  const ring = ease(f, [6, 40], [0, 1]);
  return (
    <Scene dur={dur}>
      <div style={{ position: 'absolute', top: 80, width: '100%' }}>
        <Headline size={92} align="center" lines={[{ text: 'Works where you trade.', at: 6 }]} />
        <div style={{ marginTop: 20 }}>
          <Sub at={24} size={30} align="center">
            Quick-buy buttons on social feeds, token pages, and chart sites
          </Sub>
        </div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <ellipse
          cx={cx}
          cy={cy + 40}
          rx={R * ring}
          ry={tilt * ring}
          fill="none"
          stroke="rgba(180,242,74,0.28)"
          strokeWidth={2}
          strokeDasharray="6 14"
          strokeDashoffset={-f * 2}
        />
        <ellipse cx={cx} cy={cy + 40} rx={R * 0.62 * ring} ry={tilt * 0.62 * ring} fill="none" stroke="rgba(123,97,255,0.25)" strokeWidth={2} />
      </svg>
      <div style={{ position: 'absolute', left: cx - 100, top: cy - 190, zIndex: 100 }}>
        <LogoTile size={200} rotX={16} rotY={Math.sin(f / 32) * 32} spark={1} glow={0.9} />
      </div>
      {PLATFORMS.map((p, i) => {
        const e = spring({ frame: f, fps, delay: 10 + i * 4, config: { damping: 15, stiffness: 90 } });
        const a = (i / PLATFORMS.length) * Math.PI * 2 + f * 0.016 + 0.25;
        const depth = Math.cos(a);
        const near = (depth + 1) / 2;
        const x = cx + Math.sin(a) * R * e;
        const y = cy + 40 + depth * tilt * e;
        const scale = (0.66 + 0.34 * near) * (0.5 + 0.5 * e);
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: x - 80,
              top: y - 100,
              width: 160,
              zIndex: 100 + Math.round(depth * 99),
              opacity: e * (0.35 + 0.65 * near),
              transform: `scale(${scale})`,
              filter: near < 0.45 ? `blur(${(0.45 - near) * 5}px)` : undefined,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 150,
                height: 150,
                margin: '0 auto',
                borderRadius: 38,
                display: 'grid',
                placeItems: 'center',
                ...glass,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 30px 60px -20px rgba(0,0,0,0.8), 0 0 ${40 * near}px rgba(180,242,74,${0.18 * near})`,
              }}
            >
              <Img src={staticFile(`logos/${p.id}.png`)} style={{ width: 96, height: 96, borderRadius: 22 }} />
            </div>
            <div style={{ marginTop: 14, fontFamily: FONT.body, fontWeight: 600, fontSize: 26, color: C.text }}>{p.name}</div>
          </div>
        );
      })}
    </Scene>
  );
};

/** 4. The real trading panel and popup in 3D, with callouts. */
export const PanelScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, delay: 6, config: { damping: 16, stiffness: 60 } });
  const back = spring({ frame: f, fps, delay: 22, config: { damping: 16, stiffness: 60 } });
  const callouts = [
    { text: 'Honeypot & authority checks', dot: '#f5b84a', top: 468, at: 48 },
    { text: '1-click buy presets', dot: C.lime, top: 584, at: 62 },
    { text: 'Sell 25 / 50 / 100%', dot: '#ff6b8a', top: 744, at: 76 },
    { text: 'Fee 0.5%, shown up front', dot: C.teal, top: 858, at: 90 },
  ];
  return (
    <Scene dur={dur}>
      <div style={{ position: 'absolute', left: 120, top: 250 }}>
        <Headline
          size={92}
          lines={[
            { text: 'Everything in', at: 8 },
            { text: 'one panel.', accent: true, at: 16 },
          ]}
        />
        <div style={{ marginTop: 30 }}>
          <Sub at={32} size={32} width={660}>
            Price, liquidity, safety flags, and your position. Buy in one click, sell in one more.
          </Sub>
        </div>
        <div style={{ marginTop: 44, display: 'flex', gap: 14 }}>
          {CHAINS.map((c, i) => {
            const k = spring({ frame: f, fps, delay: 56 + i * 5, config: { damping: 14, stiffness: 150 } });
            return (
              <div key={c.name} style={{ opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
                <Pill dot={c.color} size={24}>
                  {c.name}
                </Pill>
              </div>
            );
          })}
        </div>
      </div>
      <AbsoluteFill style={{ perspective: 2200, perspectiveOrigin: '72% 50%' }}>
        <div
          style={{
            position: 'absolute',
            left: 1470,
            top: 230,
            width: 365,
            height: 570,
            borderRadius: 26,
            overflow: 'hidden',
            opacity: back * 0.9,
            transform: `translateZ(${-320 - (1 - back) * 600}px) rotateY(-24deg) translateX(${(1 - back) * 200}px)`,
            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.9)',
            border: `1px solid ${C.line}`,
          }}
        >
          <Img src={staticFile('ui/popup.png')} style={{ width: 365, height: 570, display: 'block' }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1170,
            top: 175,
            width: 442,
            height: 725,
            borderRadius: 31,
            transform: `translateZ(${(1 - s) * -900}px) translateY(${(1 - s) * 120 + Math.sin(f / 24) * 8}px) rotateX(5deg) rotateY(${-16 + Math.sin(f / 50) * 3 + (1 - s) * -30}deg)`,
            opacity: s,
            background: 'rgba(10,14,24,0.94)',
            border: `1px solid ${C.line}`,
            boxShadow: '0 60px 140px -30px rgba(0,0,0,0.9), 0 0 90px -20px rgba(180,242,74,0.25)',
          }}
        >
          <Img src={staticFile('ui/panel.png')} style={{ width: 442, height: 725, display: 'block', borderRadius: 31 }} />
        </div>
      </AbsoluteFill>
      {callouts.map((c) => {
        const k = spring({ frame: f, fps, delay: c.at, config: { damping: 14, stiffness: 140 } });
        return (
          <div
            key={c.text}
            style={{
              position: 'absolute',
              right: 1920 - 1230,
              top: c.top,
              opacity: k,
              transform: `translateX(${(1 - k) * 60}px)`,
            }}
          >
            <Pill dot={c.dot} size={23} style={{ background: 'rgba(14,18,32,0.9)' }}>
              {c.text}
            </Pill>
          </div>
        );
      })}
    </Scene>
  );
};

/** 5. End card. */
export const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, delay: 2, config: { damping: 13, stiffness: 70 } });
  const spark = ease(f, [26, 36], [0, 1], Easing.out(Easing.back(2.2)));
  const tag = ease(f, [44, 62], [0, 1]);
  const url = spring({ frame: f, fps, delay: 60, config: { damping: 14, stiffness: 120 } });
  const foot = ease(f, [76, 94], [0, 1]);
  return (
    <Scene dur={dur} out={false}>
      <AbsoluteFill style={{ perspective: 1600 }}>
        <div
          style={{
            position: 'absolute',
            left: 960 - 110,
            top: 150,
            width: 220,
            height: 220,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${(1 - s) * -1200}px)`,
          }}
        >
          <LogoTile size={220} rotX={12 + Math.sin(f / 26) * 4} rotY={interpolate(s, [0, 1], [200, -18]) + Math.sin(f / 34) * 12} spark={spark} glow={s} />
          <Shockwave start={28} size={480} />
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 430, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 132, letterSpacing: '-0.04em' }}>
          {'QuickApe'.split('').map((ch, i) => {
            const k = spring({ frame: f, fps, delay: 18 + i * 2.5, config: { damping: 14, stiffness: 150 } });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: k,
                  transform: `translateY(${(1 - k) * 60}px)`,
                  color: i >= 5 ? C.lime : C.text,
                  textShadow: i >= 5 ? '0 0 50px rgba(180,242,74,0.5)' : undefined,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: 46,
            letterSpacing: '-0.02em',
            color: C.text,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 24}px)`,
          }}
        >
          See a CA. <span style={{ color: C.lime }}>Click once.</span> You're in.
        </div>
        <div style={{ marginTop: 46, display: 'flex', justifyContent: 'center', opacity: url, transform: `scale(${0.85 + 0.15 * url})` }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 16,
              padding: '20px 40px',
              borderRadius: 999,
              fontFamily: FONT.body,
              fontWeight: 600,
              fontSize: 38,
              color: C.ink,
              background: 'linear-gradient(180deg, #d2fa8a, #b4f24a)',
              boxShadow: '0 20px 60px -15px rgba(180,242,74,0.7), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            quickape.world
          </div>
        </div>
        <div style={{ marginTop: 40, fontFamily: FONT.body, fontSize: 28, color: C.muted, opacity: foot }}>
          Chrome extension · Solana · Base · BSC · Ethereum
        </div>
      </div>
    </Scene>
  );
};
