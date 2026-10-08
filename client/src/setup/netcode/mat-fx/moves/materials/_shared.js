// Design 063: helpers every move material builds on, lifted from the Fire Blast look test's
// fire material. Canvas-only: a material draws on the context it is handed and never reads
// the DOM beyond the noise tile.
import { rgbCss } from '../../fx-colors.mjs';

const TAU = Math.PI * 2;
const TONGUE_SAMPLES = 14;
const NOISE_SIZE = 192;
const rad = (deg) => (deg * Math.PI) / 180;

/** Cheap 1-D turbulence in [-1, 1]: three sines at unrelated rates. */
export const wobble = (s, time, seed) =>
  0.5 * Math.sin(s * 6.3 + time * 7 + seed) +
  0.3 * Math.sin(s * 13.1 - time * 11 + seed * 1.7) +
  0.2 * Math.sin(s * 23 + time * 17 + seed * 2.9);

/**
 * The outline of one tongue: from (x, y) along `angleDeg`, `length` long, `width` wide at
 * the shoulder, tapering to a tip that drifts with time. `scale` shrinks it about its base
 * for the inner passes; `amp` scales the edge wobble (1 = fire). `left` is the edge on the
 * direction's left normal, base to tip; both edges end at the tip.
 * @returns {{left: number[][], right: number[][]}}
 */
export function tongueOutline({ x, y, angleDeg, length, width, time, seed, amp = 1 }, scale = 1) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const len = length * (0.85 + 0.15 * scale);
  const halfWidth = (s) => {
    const envelope = s < 0.22 ? Math.sqrt(s / 0.22) : (1 - (s - 0.22) / 0.78) ** 0.85;
    return width * 0.5 * scale * envelope * (1 + 0.3 * amp * wobble(s, time, seed));
  };
  const drift = (s) =>
    amp * (width * 0.35 * s * s * Math.sin(time * 5 + seed) + width * 0.2 * s * wobble(s * 0.5, time * 0.7, seed + 9));
  const left = [];
  const right = [];
  for (let i = 0; i <= TONGUE_SAMPLES; i += 1) {
    const s = i / TONGUE_SAMPLES;
    const cx = x + ux * s * len + nx * drift(s);
    const cy = y + uy * s * len + ny * drift(s);
    const w = i === TONGUE_SAMPLES ? 0 : halfWidth(s);
    left.push([cx + nx * w, cy + ny * w]);
    right.push([cx - nx * w, cy - ny * w]);
  }
  return { left, right };
}

/**
 * An angular splinter in the `tongueOutline` shape: base, two shoulders 35 % along (one
 * pushed out by the seed so no two splinters match), tip. Straight edges, no wobble.
 * @returns {{left: number[][], right: number[][]}}
 */
export function shardOutline({ x, y, angleDeg, length, width, seed = 0 }) {
  const a = rad(angleDeg);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  const noise = Math.sin(seed * 12.9898) * 43758.5453;
  const lean = 0.5 + 0.5 * (noise - Math.floor(noise));
  const at = (f, side) => [x + ux * length * f + nx * side, y + uy * length * f + ny * side];
  const tip = at(1, 0);
  return {
    left: [at(0, 0), at(0.35, width * 0.5 * (0.6 + 0.4 * lean)), tip],
    right: [at(0, 0), at(0.35 + 0.2 * lean, -width * 0.5), tip],
  };
}

/**
 * Run `draw` with `source-over` so a shadow covers what is under it (an additive pass cannot
 * darken); restores the caller's state, composite included.
 */
export function inShadow(ctx, draw) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

/** Trace a `tongueOutline` as a closed path on `ctx`. */
export function traceOutline(ctx, { left, right }) {
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 2; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

/** Trace one tongue (see `tongueOutline`) as a closed path on `ctx`. */
export function tonguePath(ctx, spec, scale = 1) {
  traceOutline(ctx, tongueOutline(spec, scale));
}

/**
 * A sphere of radius `r`: a radial gradient whose highlight sits `lift` * r up-left of the
 * centre, filled over the circle. `stops` are `[offset, rgb, alpha]`.
 */
export function sphere(ctx, x, y, r, stops, lift = 0.15) {
  if (!(r > 0)) return;
  const g = ctx.createRadialGradient(x - r * lift, y - r * lift, 0, x, y, r);
  for (const [offset, rgb, alpha] of stops) g.addColorStop(offset, rgbCss(rgb, alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

let noiseTile = null;

/** A tiling value-noise alpha mask, built once; null where canvases are unavailable. */
export function getNoiseTile() {
  if (noiseTile !== null) return noiseTile || null;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = NOISE_SIZE;
  canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    noiseTile = false;
    return null;
  }
  const image = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  // Three octaves of lattice noise that wrap at the tile edge.
  const lattice = (cells) => {
    const grid = new Float32Array(cells * cells);
    let a = 2463534242;
    for (let i = 0; i < grid.length; i += 1) {
      a ^= a << 13;
      a ^= a >>> 17;
      a ^= a << 5;
      grid[i] = (a >>> 0) / 4294967296;
    }
    return (x, y) => {
      const gx = (x / NOISE_SIZE) * cells;
      const gy = (y / NOISE_SIZE) * cells;
      const x0 = Math.floor(gx) % cells;
      const y0 = Math.floor(gy) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const top = grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
      const bottom = grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
      return top * (1 - sy) + bottom * sy;
    };
  };
  const octaves = [
    [lattice(6), 0.5],
    [lattice(12), 0.3],
    [lattice(24), 0.2],
  ];
  for (let y = 0; y < NOISE_SIZE; y += 1) {
    for (let x = 0; x < NOISE_SIZE; x += 1) {
      let v = 0;
      for (const [fn, weight] of octaves) v += fn(x, y) * weight;
      const i = (y * NOISE_SIZE + x) * 4;
      image.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (v - 0.35) * 2.2)));
    }
  }
  ctx.putImageData(image, 0, 0);
  noiseTile = canvas;
  return canvas;
}

/**
 * Grain pass: punch scrolling noise out of what is already on `ctx`, so flat gradients
 * break into embers and tongues. `strength` 0-1; `time` scrolls it.
 */
export function grainPass(ctx, size, time, strength = 0.3) {
  const tile = getNoiseTile();
  if (!tile || !(strength > 0)) return;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = strength;
  ctx.translate((time * 90) % NOISE_SIZE, (-time * 140) % NOISE_SIZE);
  ctx.fillStyle = pattern;
  ctx.fillRect(-NOISE_SIZE, -NOISE_SIZE, size + NOISE_SIZE * 2, size + NOISE_SIZE * 2);
  ctx.restore();
}

// ---- design 065: palette tints -------------------------------------------------------

/** '#RRGGBB' → [r, g, b]. */
export function parseHex(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#RRGGBB' mixed with white by `f` (0 = unchanged, 1 = white), as '#rrggbb'. */
export function lighten(hex, f) {
  const toHex = (v) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
  return `#${parseHex(hex).map(toHex).join('')}`;
}

/** `palette` with every key present in `tint` ('#RRGGBB' values) replaced; frozen like a material palette. */
export function tintedPalette(palette, tint) {
  const out = { ...palette };
  for (const [key, hex] of Object.entries(tint ?? {})) out[key] = Object.freeze(parseHex(hex));
  return Object.freeze(out);
}
