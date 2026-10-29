// Design 077: the param checks every element kind's packer shares. Pure.

export const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG = Math.PI / 180;

/** A stage point `{ x, y, z? }` with finite x, y (z defaults to 0), else null. */
export function stagePoint(p) {
  if (!p || !finite(p.x) || !finite(p.y)) return null;
  return { x: p.x, y: p.y, z: finite(p.z) ? p.z : 0 };
}

/** An rgb triple 0–1 (may exceed 1: HDR), negatives clamped to 0; `fallback` when malformed. */
export function rgb(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const out = value.slice(0, 3);
  return out.every(finite) ? out.map((c) => Math.max(0, c)) : fallback;
}

/** `value` clamped to [0, 1], `fallback` when not a finite number. */
export const unit = (value, fallback) => (finite(value) ? clamp01(value) : fallback);

/** A positive finite number, else null. */
export const positive = (value) => (finite(value) && value > 0 ? value : null);

/** Degrees → a unit direction in stage px (y down). */
export const headingOf = (deg) => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });

/**
 * A fire-family palette (deep → body → hot → core), each 0–1 rgb; missing keys fall back to
 * the TCG fire palette (materials/fire.js PALETTE / 255).
 */
export const FIRE_PALETTE = Object.freeze({
  deep: Object.freeze([210 / 255, 41 / 255, 8 / 255]),
  body: Object.freeze([235 / 255, 108 / 255, 6 / 255]),
  hot: Object.freeze([241 / 255, 175 / 255, 13 / 255]),
  core: Object.freeze([1, 246 / 255, 214 / 255]),
});

export function firePalette(palette) {
  return {
    deep: rgb(palette?.deep, FIRE_PALETTE.deep),
    body: rgb(palette?.body, FIRE_PALETTE.body),
    hot: rgb(palette?.hot, FIRE_PALETTE.hot),
    core: rgb(palette?.core, FIRE_PALETTE.core),
  };
}

/** Water's palette (materials/water.js PALETTE / 255): deep → body → hot. */
export const WATER_PALETTE = Object.freeze({
  deep: Object.freeze([46 / 255, 124 / 255, 230 / 255]),
  body: Object.freeze([82 / 255, 180 / 255, 1]),
  hot: Object.freeze([185 / 255, 232 / 255, 1]),
});

export function waterPalette(palette) {
  return {
    deep: rgb(palette?.deep, WATER_PALETTE.deep),
    body: rgb(palette?.body, WATER_PALETTE.body),
    hot: rgb(palette?.hot, WATER_PALETTE.hot),
  };
}
