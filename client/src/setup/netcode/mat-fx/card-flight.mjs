// Design 042: a card flying to its discard pile, TCG Live style — an arc that
// bends up off the straight line, a tumble that settles as it lands, a lean
// into the flight and a light streak behind it. Shared by the knockout scene
// (ko-scene.mjs) and plain discards (lifecycle.js). DOM-free; card-flight.js
// turns a flight into WAAPI keyframes.
import { seededRandom } from './flow-pose.mjs';

export const FLIGHT_MS = 620;
export const FLIGHT_STAGGER_MS = 80;
export const MAX_FLIGHTS = 8;

// How far the arc bows off its chord, and the cap on the streak behind a card.
const ARC_BOW = 0.22;
const FLIGHT_LEAN = 24;
const TRAIL_STRETCH = 0.14;
const FADE_FROM = 0.88;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/** `to` shifted by whole turns so the card rotates the short way from `from`. */
const nearestTurn = (from, to) => to - 360 * Math.round((to - from) / 360);

/**
 * A flight from `start` to `end`, both in px offsets from the flying element's
 * own centre. `start` may carry the pose the card is already in (the knockout
 * hands over mid-tumble); `end` is where and how it lands.
 * @param {{start: {x?, y?, rotate?, tiltX?, scale?}, end: {x, y, rotate?, scale?}, seed?: number}} opts
 */
export function planFlight({ start = {}, end = {}, seed = 1 }) {
  const rand = seededRandom(seed);
  const sx = num(start.x, 0);
  const sy = num(start.y, 0);
  const ex = num(end.x, sx);
  const ey = num(end.y, sy);
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy);
  // The perpendicular that points up the screen: cards arc over, never under.
  let nx = dist ? -dy / dist : 0;
  let ny = dist ? dx / dist : -1;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = dist * ARC_BOW;
  const r0 = num(start.rotate, 0);
  const side = rand() < 0.5 ? -1 : 1;
  return {
    sx,
    sy,
    ex,
    ey,
    cx: (sx + ex) / 2 + nx * bow,
    cy: (sy + ey) / 2 + ny * bow,
    r0,
    r1: nearestTurn(r0, num(end.rotate, r0)),
    s0: num(start.scale, 1),
    s1: num(end.scale, 1),
    t0: num(start.tiltX, 0),
    spin: side * lerp(12, 24, rand()),
  };
}

const pathAt = (f, e) => {
  const a = (1 - e) ** 2;
  const b = 2 * (1 - e) * e;
  const c = e ** 2;
  return { x: a * f.sx + b * f.cx + c * f.ex, y: a * f.sy + b * f.cy + c * f.ey };
};

/** The card at flight progress u in [0, 1]: px offsets, degrees, scale. */
export function flightPose(u, flight) {
  const c = clamp01(u);
  const e = easeInOutCubic(c);
  const bell = Math.sin(Math.PI * e);
  const { x, y } = pathAt(flight, e);
  return {
    x,
    y,
    rotate: lerp(flight.r0, flight.r1, e) + flight.spin * bell,
    tiltX: lerp(flight.t0, 0, e) + FLIGHT_LEAN * bell,
    scale: lerp(flight.s0, flight.s1, e) * (1 + 0.1 * bell),
    opacity: c < FADE_FROM ? 1 : 1 - (c - FADE_FROM) / (1 - FADE_FROM),
  };
}

/**
 * The light streak behind the card: anchored on the card's centre, pointing
 * back along its path, as long as the card is fast (px per unit of u).
 */
export function flightTrail(u, flight) {
  const c = clamp01(u);
  const h = 0.01;
  const a = pathAt(flight, easeInOutCubic(clamp01(c - h)));
  const b = pathAt(flight, easeInOutCubic(clamp01(c + h)));
  const span = clamp01(c + h) - clamp01(c - h);
  const vx = span ? (b.x - a.x) / span : 0;
  const vy = span ? (b.y - a.y) / span : 0;
  const here = pathAt(flight, easeInOutCubic(c));
  return {
    x: here.x,
    y: here.y,
    angle: (Math.atan2(vy, vx) * 180) / Math.PI,
    length: Math.hypot(vx, vy) * TRAIL_STRETCH,
    opacity: 0.9 * Math.sin(Math.PI * c),
  };
}

/**
 * Start and end of a flight between two screen rects, in px from the from
 * rect's centre. `fromTurn`/`toTurn` are the boards' rotations (the opponent's
 * is 180°), so the card lands turned the way its pile is.
 */
export function rectFlightEnds(fromRect, toRect, { fromTurn = 0, toTurn = 0 } = {}) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  return {
    start: { x: 0, y: 0, rotate: fromTurn, tiltX: 0, scale: 1 },
    end: {
      x: b.x - a.x,
      y: b.y - a.y,
      rotate: toTurn,
      scale: fromRect.width > 0 ? toRect.width / fromRect.width : 1,
    },
  };
}

/** The card art to fly: an Energy drawn as a token keeps its card art aside. */
export const flightSrcOf = (element) => element?.dataset?.energyCardSrc || element?.src || element?.currentSrc || null;

/** Start delay (ms) per flying card; only the first MAX_FLIGHTS fly. */
export function flightDelays(count, stagger = FLIGHT_STAGGER_MS) {
  const n = Math.max(0, Math.min(MAX_FLIGHTS, Math.floor(Number(count) || 0)));
  return Array.from({ length: n }, (_, i) => i * stagger);
}
