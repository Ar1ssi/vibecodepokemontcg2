// Design 043: the TCG Live opponent Trainer play. The card drops face down off
// the opponent's hand and flips face up on the way, grows to a big preview in
// the middle of the mat, holds, then shrinks into its spot on the board.
// DOM-free; opp-play.js drives the overlay.

// The reference holds the preview ~600 ms; the user asked for twice that.
export const OPP_PLAY_HOLD_MS = 1200;
const DROP_END_MS = 260;
const GROW_END_MS = 520;
const HOLD_END_MS = GROW_END_MS + OPP_PLAY_HOLD_MS;
const PLACE_MS = 300;
export const OPP_PLAY_MS = HOLD_END_MS + PLACE_MS;

// Scale (of the preview) where the card lands on the mat before it grows.
const DROP_SCALE = 0.45;
// How far from the hand toward the preview the card drops before it grows.
const DROP_REACH = 0.55;
const OVERSHOOT = 1.04;
const SETTLE_MS = 80;
const PEAK_TILT = 22;
// Without a hand rect the card starts above the preview, this small.
const FALLBACK_SCALE = 0.3;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (v, a, b) => clamp01((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const usable = (r) => Boolean(r) && r.width >= 2 && r.height >= 2;

/** Degrees folded into (-180, 180], so a 180° board turns the short way. */
export const normalizeTurn = (deg) => {
  const r = (((Number(deg) || 0) % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
};

/** Centre of the union of the usable rects (the two board iframes), else of the viewport. */
export function matCenter(rects, viewport) {
  const valid = (rects || []).filter(usable);
  if (valid.length === 0) return { x: (viewport?.width || 0) / 2, y: (viewport?.height || 0) / 2 };
  const left = Math.min(...valid.map((r) => r.left));
  const top = Math.min(...valid.map((r) => r.top));
  const right = Math.max(...valid.map((r) => r.left + r.width));
  const bottom = Math.max(...valid.map((r) => r.top + r.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/** The big preview's card-shaped box, centred on `center`. */
export function oppPreviewRect(center, viewport, aspect = 0.716) {
  const height = Math.min((viewport?.height || 0) * 0.42, 380);
  const width = height * aspect;
  return { left: center.x - width / 2, top: center.y - height / 2, width, height };
}

/** Only the opponent's plays get the preview; your own keep the centred presentation. */
export const playsOppPreview = (plan) => plan?.user === 'opp';

/**
 * The whole play for one card over OPP_PLAY_MS. x/y are px from the preview's
 * centre, `scale` is of the preview, `rotate` includes the board turn and
 * `flip` is rotateY (180 = the sleeve side facing you).
 * @param {{from?: object|null, preview: object, to?: object|null,
 *   fromTurn?: number, toTurn?: number, toFade?: boolean}} opts - rects in
 *   viewport px; `to` null shrinks the card away in the middle
 * @returns {(t: number) => {x, y, rotate, tiltX, flip, scale, opacity}}
 */
export function oppPlayTrack({ from = null, preview, to = null, fromTurn = 0, toTurn = 0, toFade = false }) {
  const pc = rectCenter(preview);
  const PW = preview.width;
  const hasFrom = usable(from);
  const hasTo = usable(to);
  const f = hasFrom ? rectCenter(from) : { x: pc.x, y: pc.y - preview.height * 0.9 };
  const start = { x: f.x - pc.x, y: f.y - pc.y, scale: hasFrom ? from.width / PW : FALLBACK_SCALE };
  const turn0 = hasFrom ? normalizeTurn(fromTurn) : 0;
  const drop = { x: start.x * (1 - DROP_REACH), y: start.y * (1 - DROP_REACH) };
  const t = hasTo ? rectCenter(to) : pc;
  const end = { x: t.x - pc.x, y: t.y - pc.y, scale: hasTo ? to.width / PW : FALLBACK_SCALE };
  const turn1 = hasTo ? normalizeTurn(toTurn) : 0;
  const fades = toFade || !hasTo;

  return (u) => {
    const ms = clamp01(u) * OPP_PLAY_MS;
    const tiltX = PEAK_TILT * Math.sin(Math.PI * span(ms, 0, GROW_END_MS));
    if (ms < DROP_END_MS) {
      const e = easeOutCubic(span(ms, 0, DROP_END_MS));
      return {
        x: lerp(start.x, drop.x, e),
        y: lerp(start.y, drop.y, e),
        rotate: turn0 * (1 - e),
        tiltX,
        flip: 180 * (1 - easeInOutCubic(span(ms, 0, DROP_END_MS))),
        scale: lerp(start.scale, DROP_SCALE, e),
        opacity: 1,
      };
    }
    if (ms < GROW_END_MS) {
      const g = easeOutCubic(span(ms, DROP_END_MS, GROW_END_MS));
      return {
        x: lerp(drop.x, 0, g),
        y: lerp(drop.y, 0, g),
        rotate: 0,
        tiltX,
        flip: 0,
        scale: lerp(DROP_SCALE, OVERSHOOT, g),
        opacity: 1,
      };
    }
    if (ms < HOLD_END_MS) {
      const s = easeOutCubic(span(ms, GROW_END_MS, GROW_END_MS + SETTLE_MS));
      return { x: 0, y: 0, rotate: 0, tiltX: 0, flip: 0, scale: lerp(OVERSHOOT, 1, s), opacity: 1 };
    }
    const p = easeInOutCubic(span(ms, HOLD_END_MS, OPP_PLAY_MS));
    return {
      x: lerp(0, end.x, p),
      y: lerp(0, end.y, p),
      rotate: lerp(0, turn1, p),
      tiltX: 0,
      flip: 0,
      scale: lerp(1, end.scale, p),
      opacity: fades ? 1 - span(p, 0.6, 1) : 1,
    };
  };
}
