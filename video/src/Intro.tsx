import { AbsoluteFill, Sequence } from 'remotion';
import { LogoReveal, OrbitScene, Outro, PanelScene, TweetScene } from './scenes';
import { Background } from './ui';

// Scene start frames and lengths (30 fps). Neighbouring scenes overlap by ~14 frames to crossfade.
const TIMELINE = [
  { from: 0, dur: 110, Scene: LogoReveal },
  { from: 96, dur: 250, Scene: TweetScene },
  { from: 332, dur: 175, Scene: OrbitScene },
  { from: 493, dur: 190, Scene: PanelScene },
  { from: 669, dur: 156, Scene: Outro },
] as const;

export const INTRO_FRAMES = 825;

export const Intro: React.FC = () => (
  <AbsoluteFill>
    <Background />
    {TIMELINE.map(({ from, dur, Scene }) => (
      <Sequence key={from} from={from} durationInFrames={dur}>
        <Scene dur={dur} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
