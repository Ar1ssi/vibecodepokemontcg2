// Design 042: the TCG Live knockout. Gold stars spray off the card; the
// card is thrown back away from the attacker, tipping over, swings forward as
// its attached cards fan out from behind it, and then the card and each
// attachment fly to the discard pile (card-flight.mjs). DOM-free;
// ko-scene.js drives the overlays.
import { FLIGHT_MS, FLIGHT_STAGGER_MS, flightPose, flightTrail, planFlight } from './card-flight.mjs';

export const KO_SCENE_MS = 1900;
export const KO_FLIGHT_AT_MS = 820;
// Attachments shown fanning out and flying; the rest go with the pile silently.
export const KO_FAN_MAX = 5;

const KNOCK_FROM_MS = 40;
const KNOCK_TO_MS = 500;
const FAN_FROM_MS = 480;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (v, a, b) => clamp01((v - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const msOf = (t) => clamp01(t) * KO_SCENE_MS;
const rad = (deg) => (deg * Math.PI) / 180;
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * The knocked-out card before it flies. `dir` is the screen direction away
 * from the attacker (+1 down for your card, -1 up for the opponent's); x/y
 * are px from the card's centre, `rotate` is added to the board's turn and
 * `tiltX` is card-local (negative tips the far edge away).
 */
export function koHeroPose(t, { dir = -1, H = 0 } = {}) {
  const ms = msOf(t);
  const knock = easeOutCubic(span(ms, KNOCK_FROM_MS, KNOCK_TO_MS));
  const swing = easeInOutCubic(span(ms, KNOCK_TO_MS, KO_FLIGHT_AT_MS));
  const jolt = Math.sin(Math.PI * span(ms, 0, 140));
  return {
    x: 0,
    y: dir * H * (0.9 * knock - 0.5 * swing),
    rotate: 13 * knock - 5 * swing,
    tiltX: -(58 * knock - 46 * swing),
    scale: 1 + 0.06 * jolt + 0.1 * knock - 0.04 * swing,
    opacity: 1,
  };
}

/**
 * Attachment `index` (1..n) of the knocked-out card: hidden behind it until
 * the swing, then fanned out to its side in the card's own frame, so the
 * opponent's (turned 180°) fans the same way on its board.
 */
export function koFanPose(t, index, { dir = -1, turn = 0, W = 0, H = 0 } = {}) {
  const hero = koHeroPose(t, { dir, H });
  const ms = msOf(t);
  const fan = easeOutCubic(span(ms, FAN_FROM_MS, KO_FLIGHT_AT_MS - 40));
  const lx = index * 0.27 * W * fan * hero.scale;
  const ly = -index * 0.05 * H * fan * hero.scale;
  const a = rad(turn + hero.rotate);
  return {
    x: hero.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: hero.y + lx * Math.sin(a) + ly * Math.cos(a),
    rotate: hero.rotate + index * 7 * fan,
    tiltX: hero.tiltX,
    scale: hero.scale,
    opacity: ms < FAN_FROM_MS ? 0 : 1,
  };
}

/** When card `index` (0 = the knocked-out card) leaves for the pile, in ms. */
export const koFlightStartMs = (index) => KO_FLIGHT_AT_MS + index * FLIGHT_STAGGER_MS;

/**
 * The whole scene for one card as two pose tracks over KO_SCENE_MS, both in
 * px from the knocked-out card's centre with `rotate` including the board
 * turn: `pose` for the card and `trail` for its streak.
 * @param {{index: number, dir: number, turn: number, pileTurn: number,
 *   cardRect: object, pileRect: object, seed?: number}} opts
 */
export function koTrack({ index = 0, dir = -1, turn = 0, pileTurn = turn, cardRect, pileRect, seed = 1 }) {
  const W = cardRect.width;
  const H = cardRect.height;
  const before = index === 0 ? (t) => koHeroPose(t, { dir, H }) : (t) => koFanPose(t, index, { dir, turn, W, H });
  const startMs = koFlightStartMs(index);
  const at = before(startMs / KO_SCENE_MS);
  const from = rectCenter(cardRect);
  const to = rectCenter(pileRect || cardRect);
  const flight = planFlight({
    start: { ...at, rotate: turn + at.rotate },
    end: {
      x: to.x - from.x,
      y: to.y - from.y,
      rotate: pileTurn,
      scale: W > 0 ? (pileRect || cardRect).width / W : 1,
    },
    seed: seed + index,
  });
  const flightU = (t) => (msOf(t) - startMs) / FLIGHT_MS;
  return {
    landsAtMs: startMs + FLIGHT_MS,
    pose: (t) => {
      if (msOf(t) < startMs) {
        const p = before(t);
        return { ...p, rotate: turn + p.rotate };
      }
      return flightPose(flightU(t), flight);
    },
    trail: (t) => {
      if (msOf(t) < startMs) return { x: at.x, y: at.y, angle: 0, length: 0, opacity: 0 };
      return flightTrail(flightU(t), flight);
    },
  };
}
