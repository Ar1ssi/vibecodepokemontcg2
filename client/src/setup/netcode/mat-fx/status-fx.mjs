// Design 022 slice 3: presentation table for the `statusApplied` pop. Keys are
// the engine's condition names (shared/engine/rules/special-conditions.mjs).
// The pop and the clear are TCG Live's own status VFX flipbooks
// (client/src/assets/status-fx/); this module holds their timing and layout,
// status.js only builds the DOM. The held-condition idle loop is status-loop.mjs.
import { STATUS_CONDITION_KEYS } from './sfx-cues.mjs';

export const STATUS_APPLY_MS = 1000;
export const STATUS_CLEAR_MS = 720;

/**
 * Flipbook sheets: grid size and the cells in play order. The texture and how it
 * is painted (straight, alpha- or luminance-tinted) live in mat-fx.css under
 * `.fx-status-sprite--<name>`, so the asset URL stays with the other CSS assets.
 */
export const STATUS_SPRITES = Object.freeze({
  poof: { cols: 4, rows: 4, cells: range(13) },
  poisonSplat: { cols: 4, rows: 3, cells: range(12) },
  burnFlare: { cols: 4, rows: 4, cells: range(16) },
  sleepCloud: { cols: 2, rows: 2, cells: range(4) },
  sleepZ: { cols: 2, rows: 2, cells: range(4) },
  // The intro zap sheet leaves its bottom-left cell empty; it strikes twice.
  paralyzeZap: { cols: 2, rows: 2, cells: [0, 1, 3, 0, 1, 3] },
  confusionSmoke: { cols: 4, rows: 4, cells: range(16) },
  sparkle: { cols: 2, rows: 2, cells: range(4) },
});

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

// A layer: `sprite` name, `cells` (a subset of the sheet's, default all of them),
// size `w`/`h` and centre offset `x`/`y` in card short sides, its slice of the
// effect clock `start`..`end`, peak `opacity`, `fadeIn`/`fadeOut` as fractions of
// that slice, `scale` from..to, and a `drift` [dx, dy] in card short sides.
const POOF = { sprite: 'poof', w: 1.5, h: 1.5, start: 0, end: 0.5, opacity: 0.7, fadeIn: 0.05, fadeOut: 0.2 };

const STATUS_FX = {
  Poisoned: {
    label: 'Poisoned',
    layers: [
      POOF,
      // The splat's last frames are a card-shaped coat; stretched so it lands on the card.
      { sprite: 'poisonSplat', w: 1.65, h: 2.25, start: 0.04, end: 0.8, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.35 },
    ],
  },
  Burned: {
    label: 'Burned',
    layers: [POOF, { sprite: 'burnFlare', w: 1.4, h: 1.9, y: -0.1, start: 0.04, end: 0.82, fadeIn: 0.04, fadeOut: 0.25 }],
  },
  Asleep: {
    label: 'Asleep',
    layers: [
      POOF,
      ...[
        [0, -0.45, -0.15, 0.02],
        [1, 0.45, -0.25, 0.08],
        [2, 0.05, 0.3, 0.14],
      ].map(([cell, dx, dy, start]) => ({
        sprite: 'sleepCloud', cells: [cell], w: 0.75, h: 0.75, start, end: start + 0.6,
        opacity: 0.95, fadeIn: 0.1, fadeOut: 0.5, scale: [0.4, 1.05], drift: [dx, dy],
      })),
      ...[
        [0, 0.15, 0.25],
        [3, 0.3, 0.4],
      ].map(([cell, x, start]) => ({
        sprite: 'sleepZ', cells: [cell], w: 0.42, h: 0.42, x, y: -0.1, start, end: start + 0.6,
        fadeIn: 0.15, fadeOut: 0.4, scale: [0.6, 1], drift: [0.2, -0.6],
      })),
    ],
  },
  Paralyzed: {
    label: 'Paralyzed',
    layers: [POOF, { sprite: 'paralyzeZap', w: 1.5, h: 1.5, start: 0, end: 0.6, fadeIn: 0.02, fadeOut: 0.2 }],
  },
  Confused: {
    label: 'Confused',
    layers: [POOF, { sprite: 'confusionSmoke', w: 1.6, h: 1.6, start: 0.02, end: 0.8, opacity: 0.85, fadeIn: 0.05, fadeOut: 0.25 }],
  },
};

/** Four remove sparkles around the card, one sheet cell each, popping in turn. */
export const STATUS_CLEAR_LAYERS = Object.freeze(
  [
    [0, -0.35, -0.45],
    [1, 0.38, -0.25],
    [2, -0.32, 0.3],
    [3, 0.34, 0.45],
  ].map(([cell, x, y], i) => ({
    sprite: 'sparkle', cells: [cell], w: 0.5, h: 0.5, x, y, start: i * 0.12, end: i * 0.12 + 0.55,
    fadeIn: 0.3, fadeOut: 0.45, scale: [0.2, 1.1],
  }))
);

/**
 * @returns {{key:string,label:string,layers:object[]}|null} null for an unknown
 *   condition. `key` is the condition's sound/loop key (poison, burn, sleep, ...).
 */
export const statusFxFor = (condition) =>
  Object.hasOwn(STATUS_FX, condition)
    ? { key: STATUS_CONDITION_KEYS[condition], ...STATUS_FX[condition] }
    : null;

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
 * Discrete WAAPI keyframes for one layer's sheet on the whole effect clock: one
 * keyframe per frame at the moment it starts, each held (`step-end`) until the
 * next, so the flipbook plays inside the layer's `start`..`end` slice.
 */
export function flipbookKeyframes(layer, sheet) {
  const cells = layer.cells ?? sheet.cells;
  const span = layer.end - layer.start;
  const at = (cell) => {
    const { x, y } = flipbookOffset(cell, sheet.cols, sheet.rows);
    return `translate(${x}%, ${y}%)`;
  };
  const frames = cells.map((cell, i) => ({
    offset: clamp01(layer.start + (span * i) / cells.length),
    transform: at(cell),
    easing: 'step-end',
  }));
  if (frames[0].offset > 0) frames.unshift({ offset: 0, transform: at(cells[0]), easing: 'step-end' });
  frames.push({ offset: 1, transform: at(cells[cells.length - 1]) });
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

/**
 * Design 024 slice 4: recovering from a condition. The ring is pulled inward
 * under the remove sparkles and takes no label — recovery should read as the
 * inverse of the affliction, and quieter than it.
 */
export function statusClearPose(t) {
  const c = clamp01(t);
  const out = easeOut(c);
  return {
    ringScale: 1.45 - 0.75 * out,
    ringOpacity: c < 0.15 ? c / 0.15 : Math.max(0, 1 - (c - 0.15) / 0.85),
  };
}
