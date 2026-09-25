// Design 042: DOM side of card-flight.mjs — a flying card with its light
// streak, the catch glow on the pile, and the discard pile / deck lookups the
// knockout scene and plain discards share. Every overlay is detached, runs on
// WAAPI (D103) and removes itself.
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { animateFrames, removeWhen, sampleKeyframes, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { FLIGHT_MS, flightDelays, flightPose, flightTrail, planFlight, rectFlightEnds } from './card-flight.mjs';

export { flightSrcOf } from './card-flight.mjs';
import { frameTurnOf } from './evolve-scene.js';
import { docForSide } from './side-doc.mjs';

const BACKSTOP_PAD_MS = 400;
const TRACK_SAMPLES = 48;
const CATCH_MS = 420;
// The streak element's unscaled length; its transform stretches it to the pose's.
const TRAIL_BASE_PX = 100;

/**
 * A pile's visible face (`#discardCover`, `#deckCover`) inside a side's
 * playmat iframe: its page-space rect and the board's turn, or null when the
 * frame is not laid out yet.
 */
export function pileOf(user, zoneId) {
  const doc = docForSide(user, selfContainerDocument, oppContainerDocument);
  const cover = doc?.getElementById(`${zoneId}Cover`);
  const el = cover?.querySelector('img') || cover;
  if (!el) return null;
  const rect = visualRectOf(el);
  if (rect.width < 2 || rect.height < 2) return null;
  return { rect, turn: frameTurnOf(el) };
}

const cardFrame = (H) => (p) => ({
  transform:
    `translate(${p.x}px, ${p.y}px) perspective(${H * 4}px) rotate(${p.rotate}deg) ` +
    `rotateX(${p.tiltX}deg) scale(${p.scale})`,
  opacity: p.opacity,
});

const trailFrame = (p) => ({
  transform: `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg) scaleX(${p.length / TRAIL_BASE_PX})`,
  opacity: p.opacity,
});

/**
 * One flying card over `rect` (page px): `pose(t)` and `trail(t)` are tracks
 * over `duration` in px from the rect's centre. Returns the finish promise.
 */
export function playCardTrack({ rect, src, pose, trail, duration, delay = 0, className = '' }) {
  const W = rect.width;
  const H = rect.height;
  const host = spawnOverlay({ rect, className: `fx-overlay fx-card-flight ${className}`.trim() });
  const streak = document.createElement('div');
  streak.className = 'fx-card-flight__trail';
  const streakHeight = W * 0.55;
  streak.style.width = `${TRAIL_BASE_PX}px`;
  streak.style.height = `${streakHeight}px`;
  streak.style.left = `${W / 2 - TRAIL_BASE_PX}px`;
  streak.style.top = `${H / 2 - streakHeight / 2}px`;
  const card = document.createElement('div');
  card.className = 'fx-card-flight__card';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  card.appendChild(img);
  host.append(streak, card);
  const done = [
    animateFrames(card, sampleKeyframes(pose, cardFrame(H), TRACK_SAMPLES), { duration, delay }),
    animateFrames(streak, sampleKeyframes(trail, trailFrame, TRACK_SAMPLES), { duration, delay }),
  ];
  removeWhen(host, done, delay + duration + BACKSTOP_PAD_MS);
  return Promise.all(done);
}

/** A soft gold glow on the pile as a card lands in it. */
export function playPileCatch(pileRect, delay = 0) {
  const host = spawnOverlay({ rect: pileRect, className: 'fx-overlay fx-pile-catch' });
  const frames = [
    { transform: 'scale(0.9)', opacity: 0 },
    { transform: 'scale(1.05)', opacity: 1, offset: 0.25 },
    { transform: 'scale(1.3)', opacity: 0 },
  ];
  removeWhen(host, [animateFrames(host, frames, { duration: CATCH_MS, delay, easing: 'ease-out' })], delay + CATCH_MS + BACKSTOP_PAD_MS);
}

/**
 * Plain discards: each card flies from where it was to the pile, staggered,
 * each caught by the pile as it lands.
 * @param {{src: string, rect: object, turn?: number}[]} cards
 * @param {{rect: object, turn: number}} pile
 * @returns {number} how many cards flew
 */
export function playDiscardFlights(cards, pile) {
  const delays = flightDelays(cards.length);
  delays.forEach((delay, i) => {
    const { src, rect, turn = pile.turn } = cards[i];
    const flight = planFlight({
      ...rectFlightEnds(rect, pile.rect, { fromTurn: turn, toTurn: pile.turn }),
      seed: Math.floor(Math.random() * 1e6),
    });
    playCardTrack({
      rect,
      src,
      pose: (u) => flightPose(u, flight),
      trail: (u) => flightTrail(u, flight),
      duration: FLIGHT_MS,
      delay,
    });
    playPileCatch(pile.rect, delay + FLIGHT_MS * 0.9);
  });
  return delays.length;
}
