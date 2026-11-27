// Design 092 § water-ice: the pure poses of the group's two drawers (move-drawers.js block
// "design 092 water-ice"). `surgeStones`: G-Max Stonesurge's stones, flung out of the geyser and
// left standing round the struck card (the Stealth Rock it sets), or, from the sky, G-Max
// Resonance's frosted boulders crashing down round it. `auroraVeil`: the Aurora Veil light that
// rises in a ring of curtains round the card after G-Max Resonance. Offsets are screen px from the
// target's centre, `h` the card height; DOM-free and deterministic for a seed.
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
