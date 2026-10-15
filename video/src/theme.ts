import { loadFont as loadJetBrains } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadOnest } from '@remotion/google-fonts/Onest';
import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';
import { Easing, interpolate } from 'remotion';

// Same palette and type as the landing page and extension UI.
export const C = {
  bg: '#05070f',
  text: '#eef2f8',
  muted: '#a7b1c8',
  faint: '#6d7891',
  lime: '#b4f24a',
  limeDeep: '#a3e635',
  ink: '#0b1006',
  violet: '#7b61ff',
  teal: '#2ed3b7',
  green: '#3ee6a0',
  line: 'rgba(255,255,255,0.14)',
};

export const FONT = {
  display: loadUnbounded('normal', { weights: ['600', '700'], subsets: ['latin'] }).fontFamily,
  body: loadOnest('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily,
  mono: loadJetBrains('normal', { weights: ['500'], subsets: ['latin'] }).fontFamily,
};

export const FPS = 30;

/** Clamped interpolate with an ease-out curve, the default motion for the whole video. */
export const ease = (frame: number, input: [number, number], output: [number, number], easing = Easing.out(Easing.cubic)) =>
  interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

export const glass = {
  background: 'linear-gradient(155deg, rgba(255,255,255,0.13), rgba(255,255,255,0.03) 45%), rgba(14,18,32,0.72)',
  border: `1px solid ${C.line}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 40px 90px -30px rgba(0,0,0,0.8)',
} as const;

export const PLATFORMS = [
  { id: 'x', name: 'X' },
  { id: 'gmgn', name: 'GMGN' },
  { id: 'dexscreener', name: 'Dexscreener' },
  { id: 'pumpfun', name: 'pump.fun' },
  { id: 'fomo', name: 'Fomo' },
  { id: 'birdeye', name: 'Birdeye' },
  { id: 'axiom', name: 'Axiom' },
  { id: 'telegram', name: 'Telegram' },
] as const;

export const CHAINS = [
  { name: 'Solana', color: '#a78bfa' },
  { name: 'Base', color: '#60a5fa' },
  { name: 'BSC', color: '#facc15' },
  { name: 'Ethereum', color: '#94a3b8' },
] as const;
