// Design 044: the TCG Live draw. Each card leaves the deck face down, flips
// face up on the way and lands in a spread over the mat (one big preview for
// a single card); the spread holds, then the cards drop one by one into the
// hand. DOM-free; draw-scene.js drives the overlays.
import { normalizeTurn } from './opp-play.mjs';

export const DRAW_IN_MS = 220;
export const DRAW_STAGGER_MS = 85;
export const DRAW_OUT_MS = 200;
export const DRAW_OUT_STAGGER_MS = 110;
export const SINGLE_HOLD_MS = 600;
export const SPREAD_HOLD_MS = 200;
// More cards than this drop straight from the deck into the hand.
export const MAX_SPREAD = 10;

const PER_ROW = 4;
const GAP = 0.1;
const OVERSHOOT = 1.04;
const SETTLE_MS = 80;
const FADE_IN_MS = 40;
const PEAK_TILT = 18;
// How far the deck -> slot path bows up, as a share of its length.
const ARC_BOW = 0.12;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (v, a, b) => (b > a ? clamp01((v - a) / (b - a)) : 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const usable = (r) => Boolean(r) && r.width >= 2 && r.height >= 2;
const cardCount = (count) => Math.max(0, Math.floor(Number(count) || 0));

/**
 * When each card of a `count`-card draw flies in and drops out, in ms from the
 * scene start. Cards past MAX_SPREAD have no slot: they fly straight to the
 * hand, arriving on their own drop time.
 */
export function drawSceneTimes(count) {
  const n = cardCount(count);
  const spread = Math.min(n, MAX_SPREAD);
  const inStart = (i) => i * DRAW_STAGGER_MS;
  const allIn = spread > 0 ? inStart(spread - 1) + DRAW_IN_MS : 0;
  const holdEnd = allIn + (n === 1 ? SINGLE_HOLD_MS : SPREAD_HOLD_MS);
  const outStart = (i) => holdEnd + i * DRAW_OUT_STAGGER_MS;
  const total = n > 0 ? outStart(n - 1) + DRAW_OUT_MS : 0;
  return { inStart, allIn, holdEnd, outStart, total };
}

/** Cards per row, top row fullest: 7 -> [4, 3], 10 -> [4, 3, 3]. */
export function spreadRows(count) {
  const n = Math.min(cardCount(count), MAX_SPREAD);
  if (n === 0) return [];
  const rows = Math.ceil(n / PER_ROW);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}

/**
 * The spread's card-shaped slots (viewport px), row by row from the top left,
 * centred on `center`. One card gets the big preview.
 */
export function drawSpreadRects(count, center, viewport, aspect = 0.716) {
  const rows = spreadRows(count);
  if (rows.length === 0 || !center) return [];
  const vw = viewport?.width || 0;
  const vh = viewport?.height || 0;
  const cols = Math.max(...rows);
  const height =
    cardCount(count) === 1
      ? Math.min(vh * 0.42, 380)
      : Math.min(
          (vh * 0.62) / (rows.length + (rows.length - 1) * GAP),
          (vw * 0.72) / (cols * aspect + (cols - 1) * GAP),
          vh * 0.3
        );
  const width = height * aspect;
  const gap = height * GAP;
  const blockHeight = rows.length * height + (rows.length - 1) * gap;
  const rects = [];
  rows.forEach((inRow, r) => {
    const rowWidth = inRow * width + (inRow - 1) * gap;
    const top = center.y - blockHeight / 2 + r * (height + gap);
    for (let c = 0; c < inRow; c += 1) {
      rects.push({ left: center.x - rowWidth / 2 + c * (width + gap), top, width, height });
    }
  });
  return rects;
}

const bowPoint = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  // The perpendicular that points up the screen: the card arcs over.
  let nx = dist ? -dy / dist : 0;
  let ny = dist ? dx / dist : -1;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (a.x + b.x) / 2 + nx * dist * ARC_BOW, y: (a.y + b.y) / 2 + ny * dist * ARC_BOW };
};

const onCurve = (a, c, b, e) => ({
  x: (1 - e) ** 2 * a.x + 2 * (1 - e) * e * c.x + e ** 2 * b.x,
  y: (1 - e) ** 2 * a.y + 2 * (1 - e) * e * c.y + e ** 2 * b.y,
});

/**
 * One card's part of the scene. The card's overlay sits on `slot` (the hand
 * card's rect for a card past the spread) and animates for `duration` ms
 * after `delay`; `pose(u)` gives px from the slot's centre, `scale` of the
 * slot, `rotate` with the board turns and `flip` as rotateY (180 = sleeve up).
 * A missing hand rect fades the card out at its slot. `deck` is where the card
 * starts (design 045: a prize); `fadeIn` false when a sleeve already stands there.
 * @param {{index: number, count: number, deck: object|null, slot: object|null,
 *   hand: object|null, deckTurn?: number, handTurn?: number, fadeIn?: boolean}} opts - rects in viewport px
 * @returns {{delay: number, duration: number, pose: (u: number) => object} | null}
 *   null when the card has nowhere to be drawn
 */
export function drawCardTrack({ index, count, deck, slot, hand, deckTurn = 0, handTurn = 0, fadeIn = true }) {
  const times = drawSceneTimes(count);
  const inSpread = index < MAX_SPREAD;
  const box = inSpread ? slot : hand;
  if (!usable(box)) return null;
  const hasHand = usable(hand);
  const origin = rectCenter(box);
  const toLocal = (r) => ({ x: rectCenter(r).x - origin.x, y: rectCenter(r).y - origin.y, scale: r.width / box.width });
  const start = usable(deck) ? toLocal(deck) : { x: 0, y: -box.height * 0.6, scale: 0.4 };
  const turn0 = usable(deck) ? normalizeTurn(deckTurn) : 0;
  const end = hasHand ? toLocal(hand) : { x: 0, y: 0, scale: 0.9 };
  const turn1 = hasHand ? normalizeTurn(handTurn) : 0;

  const delay = inSpread ? times.inStart(index) : times.outStart(index) - DRAW_IN_MS;
  const inEnd = DRAW_IN_MS;
  const outStart = times.outStart(index) - delay;
  const duration = outStart + DRAW_OUT_MS;

  if (!inSpread) {
    const control = bowPoint(start, end);
    return {
      delay,
      duration,
      pose: (u) => {
        const ms = clamp01(u) * duration;
        const e = easeInOutCubic(span(ms, 0, duration));
        const { x, y } = onCurve(start, control, end, e);
        return {
          x,
          y,
          rotate: lerp(turn0, turn1, e),
          tiltX: PEAK_TILT * Math.sin(Math.PI * e),
          flip: 180 * (1 - easeInOutCubic(span(ms, 0, inEnd))),
          scale: lerp(start.scale, end.scale, e),
          opacity: fadeIn ? span(ms, 0, FADE_IN_MS) : 1,
        };
      },
    };
  }

  const slotCenter = { x: 0, y: 0 };
  const control = bowPoint(start, slotCenter);
  return {
    delay,
    duration,
    pose: (u) => {
      const ms = clamp01(u) * duration;
      if (ms < inEnd) {
        const e = easeOutCubic(span(ms, 0, inEnd));
        const { x, y } = onCurve(start, control, slotCenter, e);
        return {
          x,
          y,
          rotate: turn0 * (1 - e),
          tiltX: PEAK_TILT * Math.sin(Math.PI * e),
          flip: 180 * (1 - easeInOutCubic(span(ms, 0, inEnd))),
          scale: lerp(start.scale, OVERSHOOT, e),
          opacity: fadeIn ? span(ms, 0, FADE_IN_MS) : 1,
        };
      }
      if (ms < outStart) {
        const s = easeOutCubic(span(ms, inEnd, inEnd + SETTLE_MS));
        return { x: 0, y: 0, rotate: 0, tiltX: 0, flip: 0, scale: lerp(OVERSHOOT, 1, s), opacity: 1 };
      }
      const p = easeInOutCubic(span(ms, outStart, duration));
      return {
        x: lerp(0, end.x, p),
        y: lerp(0, end.y, p),
        rotate: lerp(0, turn1, p),
        tiltX: 0,
        flip: 0,
        scale: lerp(1, end.scale, p),
        opacity: hasHand ? 1 : 1 - p,
      };
    },
  };
}

/**
 * How long the queue waits after starting a draw before the next effect: the
 * whole scene except the last card's drop, so what follows begins as the hand
 * fills (0 for an empty draw).
 */
export function drawSceneHold(count) {
  const n = cardCount(count);
  if (n === 0) return 0;
  return Math.max(0, drawSceneTimes(n).total - DRAW_OUT_MS);
}
