import { Composition } from 'remotion';
import { INTRO_FRAMES, Intro } from './Intro';
import { FPS } from './theme';
import { WALKTHROUGH_FRAMES, Walkthrough } from './walkthrough';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="QuickApeIntro" component={Intro} durationInFrames={INTRO_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="QuickApeWalkthrough" component={Walkthrough} durationInFrames={WALKTHROUGH_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
