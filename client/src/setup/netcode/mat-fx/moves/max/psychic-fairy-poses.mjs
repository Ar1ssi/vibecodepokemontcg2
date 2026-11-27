// Design 092 psychic-fairy: the pure maths of the hoop coil (Max Mindstorm, G-Max Gravitas, G-Max
// Finale's whirl) and the sky columns (the fairy Max Moves' light pillars, the psychic column). In
// Sword/Shield a spring of psychic hoops forms high over the target, comes down onto it and lands
// at its feet, where the stacked hoops collapse into one ring that ripples outward; shafts of light
// strike down round the target (or rise out of it) and fade where they stand. DOM-free.
import { withDefaults } from '../move-spec.mjs';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeInQuad = (t) => t * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const rad = (deg) => (deg * Math.PI) / 180;
// The coil fades in over this share of the beat as it forms; the collapse takes this share of
// what follows the landing.
const FORM = 0.12;
const COLLAPSE = 0.25;

/**
 * The hoops of the coil at beat progress `s`, bottom hoop first. `lift` is the hoop's height
 * above the anchor in px (screen-up), `rx`/`ry` its ellipse radii, `width` its tube width, `spin`
 * the angle (radians) of the light running round it. Before `land` the coil falls from `height`
 * card heights onto the anchor, accelerating; after it the hoops collapse onto the ground and
 * ripple out to `spread` × r (the upper hoops farthest), fading and thinning.
 * @returns {{ lift: number, rx: number, ry: number, width: number, alpha: number, spin: number, landed: number }[]}
 */
export function hoopCoilPose(s, h, params) {
  const { count, r, squash, gap, height, land, spread, width, spin } = withDefaults('hoopCoil', params);
  const c = clamp01(s);
  const form = clamp01(c / FORM);
  const fall = clamp01(c / land);
  const after = c <= land ? 0 : (c - land) / (1 - land);
  const base = height * (1 - easeInQuad(fall));
  const collapse = easeOutCubic(clamp01(after / COLLAPSE));
  const ripple = easeOutCubic(after);
  const hoops = [];
  for (let k = 0; k < count; k += 1) {
    const rank = count > 1 ? k / (count - 1) : 0;
    const rx = h * r * (1 + (spread - 1) * ripple * (0.7 + 0.3 * rank));
    hoops.push({
      lift: h * (base + k * gap * (1 - collapse)),
      rx,
      ry: rx * squash,
      width: h * width * (1 - 0.5 * ripple),
      alpha: form * (1 - after) ** 1.4,
      spin: rad(spin * c) + k * 0.9,
      landed: after,
    });
  }
  return hoops;
}

// A shaft from the sky strikes its full length in this share of its own time (one rising out of the
// card erupts faster: it bursts out of the struck card on contact), then holds, and fades from here.
const STRIKE = 0.18;
const ERUPT = 0.08;
const FADE_FROM = 0.55;
// Where a shaft stands, below the anchor's centre on screen (card heights): just inside the card's
// near edge, so its foot lights the card's lower half or the cloth beside it.
const FOOT = 0.3;
// The order the shafts strike in, across the row: scattered, never left to right.
const STRIKE_ORDER = Object.freeze([2, 0, 4, 1, 5, 3]);

/** The rank (0 first) column `i` of `count` strikes in. */
export const strikeRank = (i, count) => {
  const order = STRIKE_ORDER.filter((k) => k < count);
  const rank = order.indexOf(i);
  return rank < 0 ? i : rank;
};

/**
 * The shafts of a sky column at beat progress `s`, in px from the anchor (y down on screen). Shaft
 * `i` stands `spread` card heights across the row and strikes after `rank × stagger` ms; `from`
 * 'above' strikes down out of the sky onto its foot, 'below' rises out of its foot. Each spans
 * `top`…`bottom`; once whole it holds, then thins and fades — one from the sky sinks into its foot,
 * one from below breaks off and climbs away. `foot` is the light pooled at `ground`, where it
 * stands (0–1). Shafts not yet struck are left out; `index` is each shaft's place in the row (its
 * item, for a beat's `hues`), whichever have struck.
 * @returns {{ index: number, x: number, top: number, bottom: number, ground: number, width: number, alpha: number, foot: number }[]}
 */
export function skyColumnPose(s, h, params) {
  const { count, spread, stagger, w, height, from, beatMs = 600 } = { ...withDefaults('skyColumn', params), beatMs: params?.beatMs };
  const ms = Number.isFinite(beatMs) && beatMs > 0 ? beatMs : 600;
  const c = clamp01(s);
  const footY = FOOT * h;
  const tall = height * h;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const delay = Math.min(0.9, (strikeRank(i, count) * stagger) / ms);
    if (c < delay) continue;
    const local = (c - delay) / (1 - delay);
    const strike = easeOutCubic(clamp01(local / (from === 'below' ? ERUPT : STRIKE)));
    const fade = clamp01((local - FADE_FROM) / (1 - FADE_FROM));
    const x = count > 1 ? (i / (count - 1) - 0.5) * spread * h : 0;
    let top;
    let bottom;
    if (from === 'below') {
      bottom = footY - tall * 0.5 * fade;
      top = footY - tall * strike;
    } else {
      top = footY - tall + tall * 0.35 * fade;
      bottom = footY - tall + tall * strike;
    }
    out.push({
      index: i,
      x,
      top,
      bottom,
      ground: footY,
      width: w * h * (1 - 0.6 * fade),
      alpha: (1 - fade) ** 1.5,
      foot: strike >= 1 ? (1 - fade) * (from === 'below' ? 1 - fade : 1) : 0,
    });
  }
  return out;
}
