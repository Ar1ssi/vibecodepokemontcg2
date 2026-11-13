// Design 042: DOM side of card-flight.mjs — a flying card with its light
// streak, the catch glow on the pile, and the discard pile / deck lookups the
// knockout scene and plain discards share. Every overlay is detached, runs on
// WAAPI (D103) and removes itself.
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { getBoardScene } from '../../board3d/board3d.js';
import { visualRectOf } from '../../board3d/board-rects.js';
import { FLIGHT_LIFT_FRAC, flightPoseFromTrack } from '../../board3d/flight-pose.mjs';
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
 * A pile's visible face (`#discardCover`, `#deckCover`) in a side's board mirror: its
 * page-space rect and the board's turn, or null when it is not laid out yet.
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

// The light streak of a flight over `host` (an overlay on `rect`): its animation's promise.
function addStreak(host, rect, trail, duration, delay) {
  const streak = document.createElement('div');
  streak.className = 'fx-card-flight__trail';
  const streakHeight = rect.width * 0.55;
  streak.style.width = `${TRAIL_BASE_PX}px`;
  streak.style.height = `${streakHeight}px`;
  streak.style.left = `${rect.width / 2 - TRAIL_BASE_PX}px`;
  streak.style.top = `${rect.height / 2 - streakHeight / 2}px`;
  host.prepend(streak);
  return animateFrames(streak, sampleKeyframes(trail, trailFrame, TRACK_SAMPLES), { duration, delay });
}

/**
 * One flying card over `rect` (page px): `pose(t)` and `trail(t)` are tracks
 * over `duration` in px from the rect's centre; no `trail`, no streak.
 * Returns the finish promise.
 */
export function playCardTrack({ rect, src, pose, trail, duration, delay = 0, className = '' }) {
  const host = spawnOverlay({ rect, className: `fx-overlay fx-card-flight ${className}`.trim() });
  const card = document.createElement('div');
  card.className = 'fx-card-flight__card';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  card.appendChild(img);
  host.appendChild(card);
  const done = [animateFrames(card, sampleKeyframes(pose, cardFrame(rect.height), TRACK_SAMPLES), { duration, delay })];
  if (trail) done.push(addStreak(host, rect, trail, duration, delay));
  removeWhen(host, done, delay + duration + BACKSTOP_PAD_MS);
  return Promise.all(done);
}

/**
 * Only the light streak of a flight, over `rect`: the mesh flights (`playMeshTrack`) have no
 * overlay card to carry it. Same `trail(t)` track and timing as `playCardTrack`.
 */
export function playTrailTrack({ rect, trail, duration, delay = 0, className = '' }) {
  const host = spawnOverlay({ rect, className: `fx-overlay fx-card-flight ${className}`.trim() });
  const done = [addStreak(host, rect, trail, duration, delay)];
  removeWhen(host, done, delay + duration + BACKSTOP_PAD_MS);
  return Promise.all(done);
}

export { FLIGHT_LIFT_FRAC };

/** True when the 3D board draws card `instanceId`, so a mesh flight can move it. */
export function meshCanFly(instanceId) {
  const scene = getBoardScene();
  if (!scene || !Number.isFinite(instanceId)) return false;
  return Boolean(scene.inspect().cards.placed(instanceId));
}

/**
 * The mesh twin of `playCardTrack` (design 074 H1): the card's own mesh flies the track instead of
 * a cloned <img>. `pose(u)` is the same track the pose modules return, in px from the centre of
 * `rect` (opacity has no mesh equivalent and is ignored), played linearly over `duration` after
 * `delay` ms; the mesh rises `lift` px off the cloth (default FLIGHT_LIFT_FRAC of `rect`'s height)
 * in flight. Whoever hides the real card keeps it hidden until this resolves; the scene shows the
 * mesh for the flight. Resolves when the flight ends, at once when the 3D board has no such card.
 * Design 089: the mesh is retained from the call to the landing, so a card the view already
 * buried (a knocked-out stack in the discard pile) is still there to fly.
 */
export function playMeshTrack({ instanceId, rect, pose, duration, delay = 0, lift = FLIGHT_LIFT_FRAC * rect.height }) {
  const held = getBoardScene();
  const retained = Boolean(held?.retainCard?.(instanceId));
  return new Promise((resolve) => {
    const land = () => {
      if (retained) held.releaseCard?.(instanceId);
      resolve();
    };
    const fly = () => {
      const scene = getBoardScene();
      if (!scene) {
        land();
        return;
      }
      scene
        .tween(instanceId, (u) => flightPoseFromTrack(rect, pose(u), u, lift), duration, { ease: (u) => u })
        .then(land, land);
    };
    if (delay > 0) setTimeout(fly, delay);
    else fly();
  });
}

/**
 * Design 089: flies a card the board draws no mesh for (an Energy shown as a token, a card from a
 * hand or a pile) on a ghost mesh, so it is lit, tilted and depth-sorted with the rest of the
 * board. An HTML clone would lie flat over every mesh. Same track contract as `playMeshTrack`;
 * `trail` adds the light streak. `face: 'back'` flies the sleeve `backSrc`. Without a 3D board the
 * cloned image flies as before.
 */
export function playGhostTrack({ src, backSrc = null, face = 'front', rect, pose, trail, duration, delay = 0, lift, className = '' }) {
  const scene = getBoardScene();
  const ghostId = scene?.spawnGhostCard?.({ src, backSrc, face }) ?? null;
  if (ghostId === null) {
    return playCardTrack({ rect, src: face === 'back' ? backSrc || src : src, pose, trail, duration, delay, className });
  }
  if (trail) playTrailTrack({ rect, trail, duration, delay, className });
  return playMeshTrack({ instanceId: ghostId, rect, pose, duration, delay, lift }).then(() => scene.removeGhostCard(ghostId));
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
    playGhostTrack({
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
