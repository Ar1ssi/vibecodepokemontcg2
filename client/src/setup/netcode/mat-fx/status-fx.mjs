// Design 022 slice 3: presentation table for the `statusApplied` pop. Keys are
// the engine's condition names (shared/engine/rules/special-conditions.mjs).
// Timings, sizes, positions and colours follow TCG Live's prefabs
// (E:/TCGLive_Extract/vfx_dump/status-vfx-spec.md): on apply the game plays
// `Status_Apply` (2 s) with `Status_<X>_Intro`; on clear, `Status_Remove` (1 s).
// Unity numbers are kept verbatim and converted by status-units.mjs. status.js
// only builds the DOM; the held-condition loop is status-loop.mjs.
import { STATUS_CONDITION_KEYS } from './sfx-cues.mjs';
import { CARD_ASPECT, TINT_GAIN_BRIGHT, unitsToCard, unityPosToCard, unityRgb } from './status-units.mjs';

/** Status_Apply despawns after 2 s (FXManager statusAppliedDespawnTime). */
export const STATUS_APPLY_MS = 2000;
/** Status_Remove plays for 1 s. */
export const STATUS_CLEAR_MS = 1000;
/** The condition label is ours, not TCG Live's: it keeps its own short beat. */
export const STATUS_LABEL_MS = 1000;

const range = (n) => Array.from({ length: n }, (_, i) => i);

/**
 * Flipbook sheets: grid size. The texture and how it is painted (straight,
 * multiplied by a tint, alpha- or luminance-tinted) live in mat-fx.css under
 * `.fx-status-sprite--<name>`, so asset URLs stay with the other CSS assets.
 */
export const STATUS_SPRITES = Object.freeze({
  puff: { cols: 4, rows: 4 },
  swipe: { cols: 4, rows: 4 },
  burnFire: { cols: 4, rows: 4 },
  burnPop: { cols: 2, rows: 2 },
  singed: { cols: 1, rows: 1 },
  emberEdge: { cols: 1, rows: 1 },
  glob: { cols: 4, rows: 4 },
  glob2: { cols: 4, rows: 4 },
  poisonRim: { cols: 1, rows: 1 },
  cloud: { cols: 2, rows: 2 },
  dramaCloud: { cols: 2, rows: 2 },
  zap: { cols: 2, rows: 2 },
  collapse: { cols: 4, rows: 4 },
  smoke: { cols: 4, rows: 4 },
  confusionGlow: { cols: 1, rows: 1 },
  doubleRing: { cols: 1, rows: 1 },
  sparkle: { cols: 2, rows: 2 },
  shockwave: { cols: 2, rows: 2 },
});

/**
 * One Unity particle as an overlay layer. In: `size` (units, or [x, y]) inside a
 * container scaled by `scale`, an extra size-only `own` scale (the node's own
 * transform), `pos` [x, y] units, `up` = -1 for prefabs authored upside down
 * (Sleep's container is turned 180deg about X), `at`/`life` in ms on a clock of
 * `totalMs`, `frameCurve` = Unity frameOverTime curve, `tint` [r, g, b] 0..1
 * times the material's `gain` (status-units.mjs TINT_GAIN_BRIGHT),
 * `grow` = sizeOverLifetime [from, to], `drift` [dx, dy] units over the life.
 * `rim`: an edge glow with the card cut out of it — `true` keeps the quad's
 * Unity size, [padX, padY] sizes it as the card plus a margin (card widths).
 * Out: sizes and offsets in card widths, the slice as fractions of the clock.
 */
export function unityLayer(spec, totalMs) {
  const scale = spec.scale ?? 1;
  const up = spec.up ?? 1;
  const [ownX, ownY] = Array.isArray(spec.own) ? spec.own : [spec.own ?? 1, spec.own ?? 1];
  const [sizeX, sizeY] = Array.isArray(spec.size) ? spec.size : [spec.size ?? 0, spec.size ?? 0];
  const { x, y } = unityPosToCard(spec.pos ?? [0, 0], scale);
  const [dx, dy] = spec.drift ?? [0, 0];
  const layer = {
    sprite: spec.sprite,
    shape: spec.shape,
    cells: spec.cells,
    frameCurve: spec.frameCurve,
    w: unitsToCard(sizeX, scale) * ownX,
    h: unitsToCard(sizeY, scale) * ownY,
    x,
    y: y * up,
    start: spec.at / totalMs,
    end: (spec.at + spec.life) / totalMs,
    tint: spec.tint ? unityRgb(spec.tint, spec.gain) : undefined,
    opacity: spec.opacity,
    fadeIn: spec.fadeIn,
    fadeOut: spec.fadeOut,
    scale: spec.grow,
    drift: [unitsToCard(dx, scale), -unitsToCard(dy, scale) * up],
  };
  if (Array.isArray(spec.rim)) {
    const [padX, padY] = spec.rim;
    layer.w = 1 + padX;
    layer.h = (1 + padY) * CARD_ASPECT;
  }
  if (spec.rim) layer.cut = [100 / layer.w, (100 * CARD_ASPECT) / layer.h];
  return layer;
}

const apply = (spec) => unityLayer(spec, STATUS_APPLY_MS);
const clear = (spec) => unityLayer(spec, STATUS_CLEAR_MS);

// Status_Apply (every condition): the dissolving Poof_Color puff, then the
// Swipe, both at the card's upper-right. The chevron meshes are not drawable here.
const STATUS_APPLY_LAYERS = [
  apply({ sprite: 'puff', cells: range(14), frameCurve: [[0, 0], [0.299, 0.488], [1, 1]], size: 8, own: 0.78, pos: [3.79, 3], at: 300, life: 400 }),
  apply({ sprite: 'swipe', cells: range(13), frameCurve: [[0, 0], [1, 0.8]], size: 6.5, own: 0.78, pos: [3.8, 2.54], at: 500, life: 350 }),
];

// Status_Burned_Intro (Scale_Container 0.78).
const BURN = { scale: 0.78 };
const BURN_INTRO = [
  apply({ ...BURN, sprite: 'emberEdge', size: 10.19, own: [1.28, 1.26], pos: [0, -0.26], at: 0, life: 1500, tint: [0.887, 0.599, 0], fadeIn: 0.3, fadeOut: 0.36 }),
  apply({ ...BURN, sprite: 'singed', size: 10.41, own: [1.28, 1.26], pos: [0, -0.26], at: 85, life: 830, fadeIn: 0.2, fadeOut: 0.26 }),
  apply({ ...BURN, sprite: 'burnFire', cells: range(15), size: 10.4, pos: [0, -1.63], at: 0, life: 750, tint: [1, 0.804, 0.561] }),
  apply({ ...BURN, sprite: 'burnPop', gain: TINT_GAIN_BRIGHT, cells: range(3), frameCurve: [[0, 0], [0.797, 0.862], [1, 0.862]], size: 6, at: 0, life: 525, tint: [0.722, 0.348, 0.075], grow: [0.509, 1], fadeOut: 0.2 }),
];

// Status_Poison's Init_Small intro (Scale_Container 0.789): the purple card
// outline, globs bubbling up from the centre (Bubbles + Bubbles_Lopsided).
const POISON = { scale: 0.789 };
const POISON_INTRO = [
  apply({ ...POISON, sprite: 'poisonRim', rim: [0.16, 0.12], at: 0, life: 1700, tint: [0.515, 0.032, 0.613], fadeIn: 0.05, fadeOut: 0.21 }),
  ...[
    ['glob2', 7, [-0.4, 0.2], 0, 900, [0.508, 0.182, 0.594]],
    ['glob', 5, [0.45, -0.1], 0, 700, [0.621, 0, 1]],
    ['glob', 6, [0, 0.5], 100, 1000, [0.508, 0.182, 0.594]],
    ['glob2', 4, [-0.3, -0.45], 330, 800, [0.621, 0, 1]],
    ['glob', 5, [0.5, 0.35], 450, 600, [0.508, 0.182, 0.594]],
    ['glob2', 3, [-0.1, -0.2], 700, 750, [0.621, 0, 1]],
  ].map(([sprite, size, pos, at, life, tint]) =>
    apply({ ...POISON, sprite, cells: range(14), size, pos, at, life, tint, grow: [0.294, 1], fadeIn: 0.1 })
  ),
];

// Status_Sleep_Intro: a dream cloud gathering over the card's upper half.
// Clouds grow in over the first third of their life and dissolve at the end.
const SLEEP_INTRO = [
  ['cloud', 0, 9.66, [2.2, -6.28], 1800, [0.718, 0.798, 0.934]],
  ['cloud', 2, 7.8, [-4.05, -5.79], 1800, [0.746, 0.812, 0.925]],
  ['cloud', 1, 9.66, [0.06, -10.1], 1450, [0.575, 0.564, 0.802]],
  ['cloud', 3, 7.74, [3.27, -3.29], 1750, [0.647, 0.738, 0.821]],
  ['cloud', 3, 5.8, [-3.7, -3.42], 1850, [0.72, 0.74, 0.925]],
  ['dramaCloud', 3, 8.75, [0.74, -1.41], 1700, [0.835, 0.916, 1]],
  ['dramaCloud', 2, 5.4, [-2.19, -0.87], 1900, [0.882, 0.923, 1]],
].map(([sprite, cell, size, pos, life, tint]) =>
  apply({ sprite, cells: [cell], size, pos, up: -1, at: 0, life, tint, gain: TINT_GAIN_BRIGHT, grow: [0, 1], fadeOut: 0.25 })
);

// Status_Paralyze_Intro (Scale_Container 0.78): four zaps and two collapsing
// bolts inside 0.7 s.
const PARALYZE = { scale: 0.78 };
const PARALYZE_INTRO = [
  apply({ ...PARALYZE, sprite: 'zap', cells: [1], size: 15.76, pos: [-0.54, 0.83], at: 0, life: 114, tint: [0.958, 1, 0.476] }),
  apply({ ...PARALYZE, sprite: 'zap', cells: [0], size: 12.2, pos: [0, 0.75], at: 90, life: 137, tint: [1, 0.983, 0] }),
  apply({ ...PARALYZE, sprite: 'collapse', cells: range(7), size: 15, pos: [0.62, -0.15], at: 170, life: 170 }),
  apply({ ...PARALYZE, sprite: 'zap', cells: [3], size: 17.4, pos: [-0.33, 0.54], at: 340, life: 220 }),
  apply({ ...PARALYZE, sprite: 'collapse', cells: range(7), size: 15, pos: [0.62, -0.15], at: 500, life: 170 }),
];

// Status_Confusion_Intro (Scale_Container 0.78): the bonk's smoke thrown out,
// the double-ring flash and the cream card glow.
const CONFUSION = { scale: 0.78 };
const CONFUSION_INTRO = [
  ...[
    [5, [-14, 6], [0.6, 0.67, 1]],
    [7, [12, 8], [0.941, 0.749, 1]],
    [4, [2, -13], [0.6, 0.67, 1]],
  ].map(([size, drift, tint]) =>
    apply({ ...CONFUSION, sprite: 'smoke', cells: range(15), size, at: 0, life: 600, tint, grow: [0.354, 1], drift })
  ),
  apply({ ...CONFUSION, sprite: 'doubleRing', size: 4 * 2, at: 250, life: 80, grow: [0.543, 1] }),
  apply({ ...CONFUSION, sprite: 'confusionGlow', rim: true, size: 17.08, at: 235, life: 350, tint: [1, 0.999, 0.901], fadeOut: 0.4 }),
];

const STATUS_FX = {
  Poisoned: { label: 'Poisoned', intro: POISON_INTRO },
  Burned: { label: 'Burned', intro: BURN_INTRO },
  Asleep: { label: 'Asleep', intro: SLEEP_INTRO },
  Paralyzed: { label: 'Paralyzed', intro: PARALYZE_INTRO },
  Confused: { label: 'Confused', intro: CONFUSION_INTRO },
};

// Status_Remove (container 0.667): a green heal — the card-sized square and
// ring, the bright shockwave, a lime glow, and stars thrown out (Stars_Pop,
// 30 at once in TCG Live; 12 here) with a few drifting over the card (Stars).
const REMOVE = { scale: 0.667, gain: TINT_GAIN_BRIGHT };
const GREEN = [0.494, 0.943, 0.627];
const LIME = [0.755, 0.945, 0.494];
export const STATUS_CLEAR_LAYERS = Object.freeze([
  clear({ ...REMOVE, shape: 'glow', size: 18.08, at: 250, life: 400, tint: [0.748, 1, 0.052], opacity: 0.45, grow: [0, 1], fadeOut: 0.4 }),
  clear({ ...REMOVE, shape: 'square', size: [12, 12 * CARD_ASPECT], at: 0, life: 600, tint: [0.046, 0.745, 0.276], opacity: 0.525, fadeIn: 0.42, fadeOut: 0.58 }),
  clear({ ...REMOVE, shape: 'ring', size: 20, at: 0, life: 600, tint: [0, 1, 0.436], fadeIn: 0.41, fadeOut: 0.44, grow: [0.352, 1] }),
  clear({ ...REMOVE, sprite: 'shockwave', cells: range(4), size: 6.83, at: 60, life: 500, tint: [0, 0.745, 0.18], opacity: 0.71, fadeIn: 0.47, fadeOut: 0.13, grow: [0.286, 1] }),
  ...range(12).map((i) =>
    clear({
      ...REMOVE, sprite: 'sparkle', cells: [i % 4], size: 0.8, at: (i % 3) * 30, life: 400 + (i % 4) * 100,
      tint: i % 2 ? GREEN : LIME, fadeIn: 0.18, fadeOut: 0.3,
      drift: [Math.cos((i / 12) * 2 * Math.PI) * (8 + (i % 3) * 3), Math.sin((i / 12) * 2 * Math.PI) * (8 + (i % 3) * 3)],
    })
  ),
  ...range(6).map((i) =>
    clear({
      ...REMOVE, sprite: 'sparkle', cells: [(i + 1) % 4], size: 0.65, pos: [Math.cos(i * 1.3) * 3, Math.sin(i * 1.7) * 3.5],
      at: 100 + i * 90, life: 450, tint: i % 2 ? LIME : GREEN, fadeIn: 0.18, fadeOut: 0.3, drift: [0, 3],
    })
  ),
]);

/**
 * @returns {{key:string,label:string,layers:object[]}|null} null for an unknown
 *   condition. `key` is the condition's sound/loop key (poison, burn, sleep, ...);
 *   `layers` is Status_Apply then the condition's intro, in paint order.
 */
export function statusFxFor(condition) {
  if (!Object.hasOwn(STATUS_FX, condition)) return null;
  const { label, intro } = STATUS_FX[condition];
  return { key: STATUS_CONDITION_KEYS[condition], label, layers: [...intro, ...STATUS_APPLY_LAYERS] };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;

/**
 * Translate (percent of the sheet's own size) that brings `cell` into a window
 * one cell big: the sheet is `cols`x`rows` windows, so each cell is 100/cols %
 * of its width.
 */
export function flipbookOffset(cell, cols, rows) {
  const col = cell % cols;
  const row = Math.floor(cell / cols) % rows;
  return { x: -(col * 100) / cols, y: -(row * 100) / rows };
}

/**
 * Earliest t (0..1) at which a piecewise-linear, non-decreasing curve
 * [[t, v], ...] reaches `v`; null when it never does.
 */
export function curveTimeOf(curve, v) {
  if (curve[0][1] >= v) return curve[0][0];
  for (let i = 1; i < curve.length; i += 1) {
    const [t0, v0] = curve[i - 1];
    const [t1, v1] = curve[i];
    if (v1 >= v) return v1 === v0 ? t1 : t0 + ((v - v0) / (v1 - v0)) * (t1 - t0);
  }
  return null;
}

/**
 * Discrete WAAPI keyframes for one layer's sheet on the whole effect clock: one
 * keyframe per frame at the moment it starts, each held (`step-end`) until the
 * next. Frame i of n starts where Unity's frameOverTime reaches i/n — linear by
 * default, or along the layer's `frameCurve`; frames the curve never reaches
 * are skipped, as in Unity.
 */
export function flipbookKeyframes(layer, sheet) {
  const cells = layer.cells ?? range(sheet.cols * sheet.rows);
  const curve = layer.frameCurve ?? [[0, 0], [1, 1]];
  const span = layer.end - layer.start;
  const at = (cell) => {
    const { x, y } = flipbookOffset(cell, sheet.cols, sheet.rows);
    return `translate(${x}%, ${y}%)`;
  };
  const frames = [];
  cells.forEach((cell, i) => {
    const t = curveTimeOf(curve, i / cells.length);
    if (t == null) return;
    frames.push({ offset: clamp01(layer.start + span * t), transform: at(cell), easing: 'step-end' });
  });
  if (frames[0].offset > 0) frames.unshift({ offset: 0, transform: frames[0].transform, easing: 'step-end' });
  frames.push({ offset: 1, transform: frames[frames.length - 1].transform });
  return frames;
}

/**
 * One layer's window at effect time `t` (0..1): opacity ramps in over `fadeIn`
 * and out over `fadeOut` of its slice and is 0 outside it; scale and drift ease
 * out across the slice.
 */
export function spriteLayerPose(layer, t) {
  const c = clamp01(t);
  const span = Math.max(1e-6, layer.end - layer.start);
  const u = (c - layer.start) / span;
  const peak = layer.opacity ?? 1;
  let opacity = 0;
  if (u >= 0 && u <= 1) {
    const fadeIn = layer.fadeIn ?? 0;
    const fadeOut = layer.fadeOut ?? 0;
    const rise = fadeIn > 0 ? clamp01(u / fadeIn) : 1;
    const fall = fadeOut > 0 ? clamp01((1 - u) / fadeOut) : 1;
    opacity = peak * Math.min(rise, fall);
  }
  const k = easeOut(clamp01(u));
  const [from, to] = layer.scale ?? [1, 1];
  const [dx, dy] = layer.drift ?? [0, 0];
  return { opacity, scale: from + (to - from) * k, dx: dx * k, dy: dy * k };
}

/**
 * WAAPI keyframes for one layer's window on the whole effect clock, sampled
 * inside its own slice (a 80 ms flash in a 2 s effect still gets every sample)
 * and held invisible before and after it. `unitPx` turns card widths into px.
 */
export function spriteLayerKeyframes(layer, unitPx, samples = 12) {
  const frame = (offset, t) => {
    const p = spriteLayerPose(layer, t);
    return {
      offset,
      transform: `translate(${p.dx * unitPx}px, ${p.dy * unitPx}px) scale(${p.scale})`,
      opacity: p.opacity,
    };
  };
  const start = clamp01(layer.start);
  const end = clamp01(layer.end);
  // Outside the slice the window is hidden: held (step-end) up to its start, and
  // cut at its end by a second keyframe on the same offset.
  const frames = [];
  if (start > 0) frames.push({ ...frame(0, 0), easing: 'step-end' });
  for (let i = 0; i <= samples; i += 1) {
    // The last sample sits exactly on `end`: float drift past it would put the
    // cut keyframe below it, and WAAPI rejects falling offsets.
    const offset = i === samples ? end : start + ((end - start) * i) / samples;
    frames.push(frame(offset, offset));
  }
  if (end < 1) frames.push(frame(end, Math.min(1, end + 1e-6)), frame(1, 1));
  return frames;
}

/** The condition label drops in with a bounce, holds, then fades. */
export function statusApplyPose(t) {
  const c = clamp01(t);
  const out = easeOut(c);
  return {
    labelY: -14 * out,
    labelScale: c < 0.12 ? 0.5 + 0.7 * (c / 0.12) : c < 0.24 ? 1.2 - 0.2 * ((c - 0.12) / 0.12) : 1,
    labelOpacity: c < 0.7 ? 1 : Math.max(0, 1 - (c - 0.7) / 0.3),
  };
}
