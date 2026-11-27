// Design 092 grass-bug-flying: the pure poses of the pieces this group's Max Moves needed and the
// 063/065 library did not have (max-drawers-gbf.js draws them).
// - `prop`: giant matter rising out of the ground round the defender and standing there — the
//   apples of G-Max Tartness / Sweetness, the roots of G-Max Drum Solo, the plants of Max
//   Overgrowth. Each surges up out of the cloth with a small bounce, sways while it stands, then
//   sinks back into the ground (matter does not evaporate: it goes back where it came from).
// - `vine`: G-Max Vine Lash's two vines, reared high off the attacker and whipped down onto the
//   defender at contact, then drawn back.
// - `tornado`: the horizontal tornado tube of Max Airstream / G-Max Wind Rage — rings of wind
//   turning about the lane, growing out of the attacker to the defender, unwinding from its tail.
// Lengths in card heights (h) or px as noted, angles in screen degrees (y down), progress s in
// [0, 1) of the beat. DOM-free and deterministic for a seed.
import { seededRandom } from '../../flow-pose.mjs';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// Exactly 0 at the start, where the polynomial leaves a rounding speck.
const easeOutBack = (t) => (t <= 0 ? 0 : 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2);
const lerp = (a, b, t) => a + (b - a) * t;

/** Kinds of prop the drawer knows. */
export const PROP_KINDS = Object.freeze(['apple', 'root', 'mushroom', 'dome']);

/** How wide each kind stands for its height. */
export const PROP_WIDTH = Object.freeze({ apple: 1.08, root: 0.42, mushroom: 1.05, dome: 1.7 });

// The ring the props stand on round the defender's centre, in card heights per unit of `spread`:
// wider than tall, so it clears the card (0.72 h wide, 1 h tall) on all sides.
const RING_X = 1;
const RING_Y = 0.62;

/**
 * The props of a beat at progress `s`: `count` of them `size` h tall, standing on a ring round the
 * defender's centre (`spread` scales it) evenly over `arc` (screen degrees, y down: 90 is in front
 * of the card, 270 behind it), each rising over `grow` of the beat after its `stagger`, holding,
 * and sinking back over the last `sink`. `x`, `y` are its base on the cloth relative to the centre
 * (px); `full` its height and `width` its width (px); `rise` how far it is out of the ground (0
 * buried … 1 standing, a little over while it bounces); `lean` its tilt (deg, + clockwise),
 * outward by `tilt`, with a slow sway; `alpha` its opacity. Far props come first.
 * @returns {Array<{ x: number, y: number, full: number, width: number, rise: number, lean: number, alpha: number, seed: number }>}
 */
export function propPose(s, h, seed, { count = 3, size = 0.6, spread = 0.85, arc = [150, 390], grow = 0.22, stagger = 0.06, sink = 0.24, tilt = 0, widthRatio = 1 } = {}) {
  const c = clamp01(s);
  const rand = seededRandom(seed);
  const n = Math.max(1, Math.round(count));
  const [a0, a1] = Array.isArray(arc) && arc.length === 2 ? arc : [150, 390];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const jitter = rand();
    const u = n > 1 ? i / (n - 1) : 0.5;
    const a = (a0 + (a1 - a0) * u) * DEG;
    const up = clamp01((c - i * stagger) / Math.max(0.01, grow));
    const down = clamp01((c - (1 - sink)) / Math.max(0.01, sink));
    const x = Math.cos(a) * spread * RING_X * h;
    const y = Math.sin(a) * spread * RING_Y * h;
    const scale = 0.85 + 0.3 * jitter;
    const outward = x === 0 ? 0 : Math.sign(x);
    out.push({
      x,
      y,
      full: size * h * scale,
      width: size * h * widthRatio * scale,
      rise: easeOutBack(up) * (1 - easeInCubic(down)),
      lean: outward * tilt * (0.7 + 0.6 * jitter) + 3 * Math.sin(TAU * (c * 1.2 + jitter)) * clamp01(up),
      alpha: clamp01(up * 5) * (1 - easeInCubic(down)),
      seed: jitter,
    });
  }
  return out.sort((p, q) => p.y - q.y);
}

/**
 * Where a vine's tip is at progress `s` of its beat, as a lane fraction `f` (0 attacker … 1
 * defender) and a sideways `bow` (h): it rears up and out over the lane until `whipAt`, lashes down
 * onto the defender by `whipAt + 0.07`, holds there, then is drawn back over the last `retract`.
 * `alpha` fades it in and out.
 * @returns {{ f: number, bow: number, alpha: number, lashed: number }}
 */
export function vinePose(s, { whipAt = 0.45, retract = 0.3 } = {}) {
  const c = clamp01(s);
  const rear = easeOutCubic(clamp01(c / whipAt));
  const lash = easeInCubic(clamp01((c - whipAt) / 0.07));
  const back = easeInOutCubic(clamp01((c - (1 - retract)) / retract));
  const f = lerp(lerp(0.1, 0.72, rear), 1, lash) * (1 - 0.65 * back);
  return {
    f,
    bow: lerp(lerp(0.12, 0.45, rear), 0.18, lash),
    alpha: clamp01(c / 0.08) * (1 - back),
    lashed: lash * (1 - back),
  };
}

/**
 * The tornado tube at progress `s`: `head` and `tail` are lane fractions (0 attacker … 1 defender)
 * — it grows out of the attacker over `growIn` of the beat and unwinds from its tail over the last
 * `retract`; `turns` its spin so far (radians, `rpm` turns a minute); `radius` its tube radius (px,
 * `w` h across); `rings` its cross-sections, each at lane fraction `f` with its own `phase`, its
 * `alpha` (faded where the tube ends) and radius `r` (the tube flares toward the defender).
 */
export function tornadoPose(s, h, { growIn = 0.35, retract = 0.3, w = 0.55, rpm = 300, rings = 9, beatMs = 1000 } = {}) {
  const c = clamp01(s);
  const head = easeOutCubic(clamp01(c / Math.max(0.01, growIn)));
  const tail = easeInCubic(clamp01((c - (1 - retract)) / Math.max(0.01, retract)));
  const turns = (rpm / 60) * TAU * ((c * beatMs) / 1000);
  const radius = (w / 2) * h;
  const n = Math.max(2, Math.round(rings));
  const out = [];
  if (head > tail) {
    for (let i = 0; i < n; i += 1) {
      const f = tail + ((head - tail) * (i + 0.5)) / n;
      const edge = Math.min((f - tail) / 0.1, (head - f) / 0.1, 1);
      out.push({ f, phase: turns + i * 0.9, alpha: clamp01(edge), r: radius * (0.7 + 0.5 * f) });
    }
  }
  return { head, tail, turns, radius, rings: out };
}
