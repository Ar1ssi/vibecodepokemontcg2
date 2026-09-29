// Design 059: the timing of a deck reveal — design 043's Trainer preview
// (opp-play.mjs `oppPlayTrack`) played from the deck, through the reveal spot,
// into the hand. Several cards arrive one after another, hold together, then go
// into the hand one after another. DOM-free; deck-reveal.js drives the overlays.
import { MAX_SPREAD } from './draw-scene.mjs';
import { OPP_PLAY_HOLD_MS, PREVIEW_GROW_MS, PREVIEW_PLACE_MS, previewPlayMs } from './opp-play.mjs';

// Your own reveal holds like your turn draw's preview (design 044): you picked the
// card. The opponent's holds like their Trainer's preview (design 043).
export const SELF_REVEAL_HOLD_MS = 600;
export const REVEAL_IN_STAGGER_MS = 85;
export const REVEAL_OUT_STAGGER_MS = 110;
// More cards than the spread has slots are shown in the hand without a flight.
export const MAX_REVEAL_SPREAD = MAX_SPREAD;

// The shine crosses the face once as the card settles at the spot.
const SHINE_PEAK_MS = 200;
const SHINE_END_MS = 400;

/** How long a reveal holds at the spot for the side that revealed. */
export const revealHoldFor = (user) => (user === 'opp' ? OPP_PLAY_HOLD_MS : SELF_REVEAL_HOLD_MS);

const cardCount = (count) => Math.max(0, Math.floor(Number(count) || 0));

/**
 * When each card of a `count`-card reveal starts, how long it holds at its spot
 * and how long it plays, in ms from the scene start. The cards hold together for
 * `holdMs` once the last one has arrived.
 * @param {number} count
 * @param {number} holdMs
 * @returns {{count: number, start: (i: number) => number, holdOf: (i: number) => number,
 *   duration: (i: number) => number, total: number}}
 */
export function deckRevealTimes(count, holdMs) {
  const n = Math.min(cardCount(count), MAX_REVEAL_SPREAD);
  const hold = Math.max(0, Number(holdMs) || 0);
  const start = (i) => i * REVEAL_IN_STAGGER_MS;
  const allIn = n > 0 ? start(n - 1) + PREVIEW_GROW_MS : 0;
  const placeAt = (i) => allIn + hold + i * REVEAL_OUT_STAGGER_MS;
  const holdOf = (i) => placeAt(i) - (start(i) + PREVIEW_GROW_MS);
  const total = n > 0 ? placeAt(n - 1) + PREVIEW_PLACE_MS : 0;
  return { count: n, start, holdOf, duration: (i) => previewPlayMs(holdOf(i)), total };
}

/**
 * How long the queue waits after starting a reveal: until the last card starts
 * into the hand, so what follows begins as it lands (0 for no cards).
 */
export function deckRevealHold(count, holdMs) {
  const { count: n, total } = deckRevealTimes(count, holdMs);
  return n > 0 ? total - PREVIEW_PLACE_MS : 0;
}

/** One card's shine band keyframes over its `durationMs`. */
export function revealShineFrames(durationMs) {
  const duration = Math.max(1, Number(durationMs) || 0);
  const at = (ms) => Math.min(1, Math.max(0, ms / duration));
  return [
    { transform: 'translateX(-120%) skewX(-18deg)', opacity: 0, offset: 0 },
    { transform: 'translateX(-120%) skewX(-18deg)', opacity: 0, offset: at(PREVIEW_GROW_MS) },
    { transform: 'translateX(40%) skewX(-18deg)', opacity: 0.9, offset: at(PREVIEW_GROW_MS + SHINE_PEAK_MS) },
    { transform: 'translateX(200%) skewX(-18deg)', opacity: 0, offset: at(PREVIEW_GROW_MS + SHINE_END_MS) },
    { transform: 'translateX(200%) skewX(-18deg)', opacity: 0, offset: 1 },
  ];
}
