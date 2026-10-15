// Renders the extension icons (the "one-click cursor" logo) to PNG with no dependencies.
// Geometry matches branding/logo.svg exactly (0-100 coordinates).
// Usage: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const LIME = [0xa3, 0xe6, 0x35];
const INK = [0x0e, 0x13, 0x19];

const POINTER = [[40, 28], [40, 84], [53, 72], [62, 92], [71, 88], [62, 68], [79, 68]];
const POINTER_STROKE = 1.5; // stroke-width 3, linejoin round
const RAYS = [[[31, 28], [21, 28]], [[33, 21], [26, 14]], [[40, 19], [40, 9]]];
const RAY_RADIUS = 2.5; // stroke-width 5, linecap round

// 16px variant: the "click" rays turn into blur at this size, so use just a larger
// cursor whose left edge sits on the pixel grid (1px = 6.25 units) to keep it crisp.
const POINTER_SMALL = [[31.25, 12.5], [31.25, 76.9], [46.15, 63.1], [56.55, 86.1], [66.85, 81.5], [56.55, 58.6], [76.05, 58.6]];

const VARIANTS = {
  full: { pointer: POINTER, rays: RAYS },
  small: { pointer: POINTER_SMALL, rays: [] },
};

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 100 - r);
  const cy = Math.min(Math.max(y, r), 100 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Color at point (u, v) in 0-100 coordinates, or null if transparent. */
function sample(u, v, { pointer, rays }) {
  if (!inRoundedRect(u, v, 22)) return null;
  const onPointer =
    inPolygon(u, v, pointer) ||
    pointer.some((p, i) => distToSegment(u, v, p, pointer[(i + 1) % pointer.length]) <= POINTER_STROKE);
  const onRay = rays.some(([a, b]) => distToSegment(u, v, a, b) <= RAY_RADIUS);
  return onPointer || onRay ? INK : LIME;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function renderPng(size, variant = size <= 16 ? VARIANTS.small : VARIANTS.full) {
  const S = 8; // supersampling per axis for anti-aliasing
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = sample(((x + (sx + 0.5) / S) / size) * 100, ((y + (sy + 0.5) / S) / size) * 100, variant);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = y * row + 1 + x * 4;
      if (a) {
        raw[o] = Math.round(r / a);
        raw[o + 1] = Math.round(g / a);
        raw[o + 2] = Math.round(b / a);
      }
      raw[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icon/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`${size}.png`, outDir), renderPng(size));
// Large version for the Chrome Web Store / social media.
writeFileSync(new URL('../branding/logo-512.png', import.meta.url), renderPng(512));
console.log('icons generated');
