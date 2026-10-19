// The held-condition idle loop (mat-fx/status-loop.mjs) evaluated at a time, for the three.js
// board, which paints the parts on a canvas instead of animating DOM nodes (design 074 §D3
// "Overlays in scene"). Pure: reproduces the CSS that status-loop.mjs's part styles drive in
// status-marker.css — the `status-fx-life-<k>` fade windows, `status-fx-rock`, and the
// `status-fx-step-x/-y` flipbook steps — so a part sits, fades, drifts, grows, rocks and steps
// exactly as on the iframe board. Lengths are card widths; y points down the card (as
// status-loop.mjs's parts do).
import { STATUS_LOOP_PARTS, STATUS_LOOP_SHEETS, loopWindowFor } from '../netcode/mat-fx/status-loop.mjs';
import { CARD_ASPECT } from '../netcode/mat-fx/status-units.mjs';

const FX = '/src/assets/status-fx';

/**
 * How each sprite is painted (status-marker.css `.status-fx-part--<sprite>`): `multiply` = the
 * sheet times the tint, cut to the sheet's alpha; `alpha` = the tint cut to the sheet's alpha;
 * `luma` = the tint cut to the sheet's brightness; `wisp` = `luma` times a radial falloff;
 * `self` = the sheet cut to its own brightness; `radial` = a radial falloff in the tint.
 */
export const STATUS_LOOP_PAINT = Object.freeze({
  glob: { src: `${FX}/poison/Poison_Glob_highlighted_Flipbook_4x4_15.webp`, paint: 'multiply' },
  glob2: { src: `${FX}/poison/Poison_Glob_2_highlighted_Flipbook_4x4_15.webp`, paint: 'multiply' },
  mainFire: { src: `${FX}/burned/T_VFX_Status_Burned_MainFire_3x3.webp`, paint: 'multiply' },
  fireSet: { src: `${FX}/burned/T_VFX_Status_Burned_FireSet_5_5_4.webp`, paint: 'multiply' },
  lick: { src: `${FX}/burned/T_VFX_Status_Burned_Flame_Lick_R_6x2_12.webp`, paint: 'multiply' },
  cloud: { src: `${FX}/sleep/T_VFX_Status_Sleep_PopClouds_2x2.webp`, paint: 'multiply' },
  dramaCloud: { src: `${FX}/sleep/T_VFX_Status_Sleep_DramaClouds_2x2.webp`, paint: 'multiply' },
  z: { src: `${FX}/sleep/T_VFX_Status_Sleep_Zs_2x2.webp`, paint: 'multiply' },
  pop: { src: `${FX}/confusion/T_VFX_Status_Confusion_Pop_Flipbook_2x2_3.webp`, paint: 'alpha' },
  sparkle: { src: `${FX}/remove/T_Status_VFX_Remove_Sparkle.webp`, paint: 'luma' },
  ring: { src: `${FX}/confusion/T_VFX_Status_Confusion_Ring_flipbook_2x2_4_black.webp`, paint: 'luma' },
  wisp: { src: `${FX}/poison/T_CloudNoise_Bright.webp`, paint: 'wisp' },
  sleepGlow: { src: `${FX}/sleep/t_vfx_match_card_glow.webp`, paint: 'luma' },
  paralyzeGlow: { src: `${FX}/sleep/t_vfx_match_card_glow.webp`, paint: 'luma' },
  zap: { src: `${FX}/paralyze/T_VFX_Status_Paralyze_LoopZap_2x2.webp`, paint: 'self' },
  collapse: { src: `${FX}/paralyze/T_VFX_Status_Paralyze_Collapse_4x4.webp`, paint: 'self' },
  burnGlow: { src: null, paint: 'radial' },
});

/** `ease-in-out` = cubic-bezier(0.42, 0, 0.58, 1), solved for x by bisection. */
export function easeInOut(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const bezier = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.42, 0.58) < x) lo = mid;
    else hi = mid;
  }
  return bezier((lo + hi) / 2, 0, 1);
}

const cycle = (elapsed, duration) => ((elapsed % duration) + duration) % duration / duration;

/** `status-fx-rock`: turn, turn + rock at 25 %, turn - rock at 75 %, eased per segment. */
function rockAt(part, t) {
  const turn = part.turn || 0;
  if (!part.rock || t < part.delay || !(part.life > 0)) return turn;
  const p = cycle(t - part.delay, part.life);
  const keys = [
    [0, turn],
    [0.25, turn + part.rock],
    [0.75, turn - part.rock],
    [1, turn],
  ];
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1] = keys[i];
    const [p0, v0] = keys[i - 1];
    if (p <= p1) return v0 + (v1 - v0) * easeInOut((p - p0) / (p1 - p0));
  }
  return turn;
}

/** The flipbook cell: `run` steps columns over `stepLife / rows` and rows over `stepLife`. */
function cellAt(part, t, cols) {
  if (part.run) {
    if (t < part.delay) return { col: 0, row: 0 };
    const [usedCols, usedRows] = part.run;
    const stepLife = part.fade ? part.period / loopWindowFor(part.life, part.period) : part.life;
    const col = Math.min(usedCols - 1, Math.floor(cycle(t - part.delay, stepLife / usedRows) * usedCols));
    const row = usedRows > 1 ? Math.min(usedRows - 1, Math.floor(cycle(t - part.delay, stepLife) * usedRows)) : 0;
    return { col, row };
  }
  const cell = Number.isInteger(part.cell) ? part.cell : 0;
  return { col: cell % cols, row: Math.floor(cell / cols) };
}

/**
 * One part at `t` ms of the loop clock, or null while it is hidden (between particles).
 * @param {ReturnType<typeof import('../netcode/mat-fx/status-loop.mjs').loopPart>} part
 * @param {number} t
 * @returns {{ x:number, y:number, w:number, h:number, alpha:number, scale:number,
 *   rotateDeg:number, col:number, row:number, cols:number, rows:number }|null}
 *   `x`/`y` the part's centre offset from the box centre in card widths before the box mapping
 *   (`loopBoxOffset`), drift included; `scale` multiplies `w`/`h`.
 */
export function loopPartFrame(part, t) {
  if (!part || !Number.isFinite(t)) return null;
  const [cols, rows] = STATUS_LOOP_SHEETS[part.sprite] ?? [1, 1];
  let alpha = part.peak;
  let drift = 0;
  let scale = 1;
  if (part.fade) {
    // `backwards` fill: before its delay a part holds keyframe 0, invisible.
    if (t < part.delay) return null;
    const window = 1 / loopWindowFor(part.life, part.period);
    const p = cycle(t - part.delay, part.period);
    if (p >= window) return null;
    const q = p / window;
    if (q < 0.15) alpha = (part.peak * q) / 0.15;
    else if (q > 0.75) alpha = (part.peak * (1 - q)) / 0.25;
    drift = q;
    if (part.grow) scale = part.grow[0] + (part.grow[1] - part.grow[0]) * q;
  }
  if (!(alpha > 0)) return null;
  return {
    x: part.x + part.dx * drift,
    y: part.y + part.dy * drift,
    w: part.w,
    h: part.h,
    alpha,
    scale,
    rotateDeg: rockAt(part, t),
    ...cellAt(part, t, cols),
    cols,
    rows,
  };
}

/**
 * A part's place in its box, card widths from the box centre. Positions are shares of the box
 * (status-loop.mjs `loopPartStyle`): a card part's box is the card; a screen-upright (`sky`)
 * part's box is the card's footprint, so on a card lying sideways (`sideways`) its x share
 * spans the card's height and its y share the card's width. Drift is in widths either way.
 * @param {{ x:number, y:number }} frame from `loopPartFrame`, drift included
 * @param {{ x:number, y:number }} part the part (its resting x, y)
 * @param {{ sky?: boolean, sideways?: boolean }} [options]
 * @returns {{ x:number, y:number }}
 */
export function loopBoxOffset(frame, part, { sky = false, sideways = false } = {}) {
  if (!sky || !sideways) return { x: frame.x, y: frame.y };
  return {
    x: part.x * CARD_ASPECT + (frame.x - part.x),
    y: part.y / CARD_ASPECT + (frame.y - part.y),
  };
}

/**
 * The loop's parts for a card's condition keys (status-loop.mjs `statusLoopKeys`), in draw
 * order, split by where the 3D board draws them: `under` = the glows TCG Live draws behind the
 * card (the DOM cuts the card out of them, `cut`), `card` = parts that turn with the card,
 * `sky` = parts that stay upright on the screen.
 * @param {string[]} keys
 * @returns {{ under: object[], card: object[], sky: object[] }}
 */
export function statusLoopLayers(keys) {
  const layers = { under: [], card: [], sky: [] };
  for (const key of Array.isArray(keys) ? keys : []) {
    for (const part of STATUS_LOOP_PARTS[key] ?? []) {
      if (part.cut) layers.under.push(part);
      else if (part.layer === 'card') layers.card.push(part);
      else layers.sky.push(part);
    }
  }
  return layers;
}
