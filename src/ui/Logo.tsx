// "One-click cursor" logo. Same geometry as branding/logo.svg and scripts/gen-icons.mjs.

const POINTER = '40,28 40,84 53,72 62,92 71,88 62,68 79,68';
const RAYS: [number, number, number, number][] = [
  [31, 28, 21, 28],
  [33, 21, 26, 14],
  [40, 19, 40, 9],
];

/** Full logo: dark cursor on a lime tile. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <rect width="100" height="100" rx="22" fill="#A3E635" />
      <polygon points={POINTER} fill="#0E1319" stroke="#0E1319" strokeWidth="3" strokeLinejoin="round" />
      <g stroke="#0E1319" strokeWidth="5" strokeLinecap="round">
        {RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  );
}

/** Cursor only (color follows `currentColor`), for use inside buy buttons. */
export function CursorGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={Math.round(size * 0.73)} height={size} viewBox="17 5 66 90" aria-hidden="true" style={{ flex: 'none' }}>
      <polygon points={POINTER} fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round">
        {RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  );
}

/** String version for vanilla DOM (chips on X). */
export const CURSOR_GLYPH_SVG =
  `<svg width="9" height="13" viewBox="17 5 66 90" aria-hidden="true">` +
  `<polygon points="${POINTER}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>` +
  `<g stroke="currentColor" stroke-width="7" stroke-linecap="round">` +
  RAYS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('') +
  `</g></svg>`;
