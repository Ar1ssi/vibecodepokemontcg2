// Design 092 § water-ice: the pure poses of the group's drawers (move-drawers.js block
// "design 092 water-ice"). `surgeStones`: G-Max Stonesurge's stones, flung out of the geyser and
// left standing round the struck card (the Stealth Rock it sets), or, from the sky, G-Max
// Resonance's ice boulders crashing down round it. `auroraVeil`: the Aurora Veil light that rises
// in a ring of curtains round the card after G-Max Resonance. `splashCrown`: the geyser of water
// that erupts out of the struck card (Max Geyser and its kin). `chiCrescent`: G-Max Rapid Flow's
// crescent blades of light. Offsets are screen px from the target's centre, `h` the card height;
// DOM-free and deterministic for a seed.
import { seededRandom } from '../../flow-pose.mjs';
import { withDefaults } from '../move-spec.mjs';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;
const rad = (deg) => (deg * Math.PI) / 180;
const TAU = Math.PI * 2;
/** How flat the ground ring round a card reads on screen (the board camera looks almost straight down). */
const GROUND_SQUASH = 0.55;

/**
 * One stone per entry: `gx, gy` the ground point under it (where it stands, or lands), `x, y` where
 * it is drawn (lifted off the ground point while it flies), `size` its radius, `stretch` its length
 * over its width along `headingDeg` (a sharp standing stone), `spin` radians tumbled, `alpha`.
 * `from` 'erupt': thrown up out of the card on an arc, landing round it in turn and standing until
 * the beat's last fifth, when it sinks away. `from` 'sky': dropped from `height` h above its ground
 * point, falling faster, shattering as it lands (it grows a little and fades).
 * @returns {{ gx: number, gy: number, x: number, y: number, size: number, stretch: number,
 *   headingDeg: number, spin: number, alpha: number, landed: boolean }[]}
 */
export function surgeStonesPose(s, h, seed, params) {
  const { from, count, distance, height, size } = withDefaults('surgeStones', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((i + 0.2 + rand() * 0.6) / count) * 360;
    const reach = distance * (0.75 + 0.35 * rand());
    const gx = Math.cos(rad(angle)) * reach * h;
    const gy = Math.sin(rad(angle)) * reach * h * GROUND_SQUASH;
    const r = h * (size[0] + (size[1] - size[0]) * rand());
    const tilt = (rand() - 0.5) * 50;
    const tumble = (rand() < 0.5 ? -1 : 1) * (4 + 4 * rand());
    if (from === 'sky') {
      const start = (i / count) * 0.45 + rand() * 0.05;
      const fall = clamp01((c - start) / 0.3);
      if (fall <= 0) continue;
      const crumble = clamp01((c - start - 0.3) / 0.18);
      if (crumble >= 1) continue;
      const drop = height * h * (1 - easeInQuad(fall));
      out.push({
        gx,
        gy,
        x: gx,
        y: gy - drop - r,
        size: r * (1 + 0.35 * crumble),
        stretch: 1,
        headingDeg: -90,
        spin: tumble * fall,
        alpha: (1 - crumble) ** 1.5,
        landed: fall >= 1,
      });
      continue;
    }
    const start = (i / count) * 0.12;
    const flight = clamp01((c - start) / 0.28);
    if (flight <= 0) continue;
    const sink = clamp01((c - 0.8) / 0.2);
    const travel = easeOutCubic(flight);
    const x = gx * travel;
    const y = gy * travel;
    const hop = Math.sin(Math.PI * flight) * height * h;
    const stand = flight >= 1 ? 1 : 0;
    const stretch = 1 + 0.9 * stand;
    out.push({
      gx: x,
      gy: y,
      x,
      y: y - hop - r * stretch * (1 - 0.6 * sink),
      size: r,
      stretch,
      headingDeg: stand ? -90 + tilt : -90 + tilt + 360 * flight,
      spin: stand ? tumble : tumble * flight,
      alpha: 1 - sink ** 2,
      landed: flight >= 1,
    });
  }
  return out;
}

/**
 * The Aurora Veil: `count` curtains of light standing on a ring `r` h round the card, rising out of
 * the ground, shimmering, and fading from the top down. `half` picks the curtains behind the card
 * (`back`, the far side of the ring) or in front of it (`front`); `depth` is the ring's near-far
 * coordinate (> 0 in front). `x, y` is a curtain's foot, `height` how tall it stands now.
 * @returns {{ x: number, y: number, height: number, width: number, alpha: number, index: number,
 *   depth: number }[]}
 */
export function auroraVeilPose(s, h, seed, params) {
  const { count, r, height, w, half } = withDefaults('auroraVeil', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const turn = 25 * c;
  const rise = easeOutCubic(clamp01(c / 0.35));
  const fade = 1 - clamp01((c - 0.7) / 0.3);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * 360 + turn + (rand() - 0.5) * 12;
    const depth = Math.sin(rad(angle));
    const jitter = 0.85 + 0.3 * rand();
    const phase = rand() * TAU;
    if (half === 'back' && depth >= 0) continue;
    if (half === 'front' && depth < 0) continue;
    const local = clamp01((c - 0.04 * i) / 0.4);
    const shimmer = 0.65 + 0.35 * Math.sin(c * 14 + phase);
    out.push({
      x: Math.cos(rad(angle)) * r * h,
      y: depth * r * h * GROUND_SQUASH,
      height: height * h * jitter * rise * easeOutCubic(local),
      width: w * h * (0.8 + 0.4 * rand()),
      alpha: easeOutCubic(local) * fade * shimmer,
      index: i,
      depth,
    });
  }
  return out;
}

/** The crown flipbook's frames: a chunky mass, a wider sheet, crescents breaking off, scattered drops. */
export const CROWN_FRAMES = 4;

/**
 * The geyser crown erupting out of the struck card: `copies` plumes fanned `spread` degrees apart
 * round straight up, each rising to `height` h in the first fifth of the beat (overshooting a
 * little, the water's mass), its flipbook stepping from the chunky mass to scattered drops over
 * the beat, fading over the last third (a clean fade: it never burns away). `drops` water drops
 * are thrown off its top from a quarter of the way in, arcing out and falling under gravity.
 * `rise` is the plume's length along its heading now (h px), `headingDeg` a screen angle (-90 up),
 * `frame` the flipbook frame, `drops` offsets from the plume's base.
 * @returns {{ plumes: { headingDeg: number, rise: number, width: number, frame: number, alpha: number,
 *   index: number }[], drops: { x: number, y: number, r: number, alpha: number }[] }}
 */
export function splashCrownPose(s, h, seed, params) {
  const { height, width, copies, spread, drops } = withDefaults('splashCrown', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const grow = clamp01(c / 0.2);
  // An easeOutBack: the column overshoots its height a little and settles, water with mass.
  const surge = grow <= 0 ? 0 : 1 + 2.2 * (grow - 1) ** 3 + 1.2 * (grow - 1) ** 2;
  // Exactly 0 at the end, where (1 - 0.66) / 0.34 leaves a rounding speck.
  const fade = c >= 1 ? 0 : 1 - clamp01((c - 0.66) / 0.34) ** 1.6;
  const plumes = [];
  for (let i = 0; i < copies; i += 1) {
    const side = copies > 1 ? i / (copies - 1) - 0.5 : 0;
    const scale = 1 - 0.22 * Math.abs(side) * 2 + 0.08 * rand();
    plumes.push({
      headingDeg: -90 + side * spread * 2 + (rand() - 0.5) * 6,
      rise: height * h * scale * surge,
      width: width * h * (0.75 + 0.25 * grow) * scale,
      frame: Math.min(CROWN_FRAMES - 1, Math.floor((c * 1.1 + i * 0.04) * CROWN_FRAMES)),
      alpha: clamp01(c / 0.05) * fade,
      index: i,
    });
  }
  const out = [];
  for (let k = 0; k < drops; k += 1) {
    const start = 0.25 + rand() * 0.2;
    const local = (c - start) / (1 - start);
    if (!(local > 0) || local >= 1) continue;
    const angle = -90 + (rand() - 0.5) * 120;
    const speed = height * h * (0.5 + 0.5 * rand());
    const t = local * 1.1;
    out.push({
      x: Math.cos(rad(angle)) * speed * 0.7 * t,
      y: -height * h * (0.75 + 0.2 * rand()) + Math.sin(rad(angle)) * speed * 0.5 * t + 1.6 * height * h * t * t,
      r: h * (0.035 + 0.035 * rand()),
      alpha: (1 - local) ** 0.7,
    });
  }
  return { plumes, drops: out };
}

/**
 * Crescent blades of light (G-Max Rapid Flow): `count` arcs of radius `radius` h round the target,
 * `gapDeg` apart, each sweeping `sweep` degrees from `angle` (screen degrees) in the first 55% of
 * the beat, the tail catching the head after it; `points` run from the tail to the head and carry
 * the half-thickness there (a crescent: pointed at both ends, fattest past the middle). `alpha`
 * rises at once and falls cleanly over the last 40% (no dissolve).
 * @returns {{ points: { x: number, y: number, half: number, nx: number, ny: number }[], alpha: number,
 *   index: number }[]}
 */
export function chiCrescentPose(s, h, params) {
  const { radius, sweep, angle, thick, count, gapDeg } = withDefaults('chiCrescent', params);
  const c = clamp01(s);
  const head = easeOutCubic(clamp01(c / 0.55));
  const tail = easeOutCubic(clamp01((c - 0.18) / 0.62));
  const alpha = clamp01(c / 0.06) * (1 - clamp01((c - 0.6) / 0.4) ** 1.4);
  const out = [];
  if (!(head > tail)) return out;
  const steps = 18;
  for (let i = 0; i < count; i += 1) {
    const start = angle - sweep / 2 + (i - (count - 1) / 2) * gapDeg;
    const from = start + sweep * Math.max(tail, head - 0.62);
    const to = start + sweep * head;
    const r = radius * h * (1 + 0.06 * i);
    const points = [];
    for (let k = 0; k <= steps; k += 1) {
      const u = k / steps;
      const a = rad(from + (to - from) * u);
      // Fattest a little past the middle, toward the leading point: the blade's edge cuts first.
      const profile = Math.sin(Math.PI * u ** 0.85) ** 0.8;
      points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, half: (thick * h * profile) / 2, nx: Math.cos(a), ny: Math.sin(a) });
    }
    out.push({ points, alpha, index: i });
  }
  return out;
}
