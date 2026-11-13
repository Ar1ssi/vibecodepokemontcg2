// Design 009 slice 6: parent-page "ghost" knockout animation, same overlay
// pattern as shuffle-flight.js. Capture happens BEFORE the DOM diff removes
// the KO'd card (legacy: right after detection, before the owner's discard
// move; authoritative: apply-view.js's `onBeforeApply` hook), so removing the
// real card mid-animation never matters — the ghost is a detached copy.
// Design 042: with effects on, the ghost hands over to the TCG Live knockout
// scene (mat-fx/ko-scene.js; with motion reduced, its still burn, design 078); the drift below
// is the fallback when that scene cannot play.
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import { visualRectOf } from '../board3d/board-rects.js';
import { KNOCKOUT_DURATION_MS, knockoutPose, knockoutStackIds } from './knockout-pose.mjs';
import { fxDisabled, motionReduced, runPose, spawnOverlay } from './mat-fx.mjs';
import { flightSrcOf, meshCanFly } from '../netcode/mat-fx/card-flight.js';
import { frameTurnOf } from '../netcode/mat-fx/evolve-scene.js';
import { playKnockoutScene } from '../netcode/mat-fx/ko-scene.js';
import { releaseSlidePin } from '../netcode/mat-fx/slide-pin-store.js';

// Design 089: a reset game cancels the knockouts still waiting for their hit (a scene started by
// its backstop after the reset flew whatever card then had that instance id).
let resetCount = 0;
export const cancelPendingKnockouts = () => {
  resetCount += 1;
};

/**
 * Lets go of the stack's cards the scene did not take. The scene flies the Pokémon and at most
 * KO_FAN_MAX attached cards, and takes each one's pin as its flight starts; a card past that, or
 * a whole stack whose scene could not play, stayed frozen in the slot until the pin's backstop.
 */
const releaseStackPins = (ghost) => knockoutStackIds(ghost).forEach(releaseSlidePin);

const discardRectFor = (user) => {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  if (!doc) return null;
  const cover = doc.getElementById('discardCover');
  const el = cover?.querySelector('img') || cover;
  if (!el) return null;
  const rect = visualRectOf(el);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};

/**
 * `turn` is the board's rotation (the opponent's is 180°); an Energy drawn as
 * a token snapshots its card art, not the token.
 * @param {'self'|'opp'} user - the side that owns the KO'd card
 * @param {HTMLImageElement|null} cardImageEl
 * @returns {{rect, src, user, turn} | null}
 */
export const captureKnockoutGhost = (user, cardImageEl) => {
  if (!cardImageEl) return null;
  const rect = visualRectOf(cardImageEl);
  if (rect.width < 2 || rect.height < 2) return null;
  return { rect, src: flightSrcOf(cardImageEl), user, turn: frameTurnOf(cardImageEl) };
};

const applyPose = (host, img, pose, turn) => {
  host.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${turn + pose.rotate}deg) scale(${pose.scale})`;
  host.style.opacity = String(pose.opacity);
  img.style.filter = `brightness(${pose.brightness}) saturate(${pose.saturate})`;
};

export const KO_START_BACKSTOP_MS = 1500;

/**
 * @param {{rect, src, user, turn?, attached?: {src}[]}} ghost - from
 *   captureKnockoutGhost; `attached` are the cards that go down with it
 * @param {{deferStart?: (start: () => void) => void}} [options] - design 026:
 *   the ghost appears at once (the real card is already gone) but holds still
 *   until `deferStart` calls back, so the KO lands on the attacker's strike.
 */
export const playKnockoutGhost = (ghost, { deferStart } = {}) => {
  if (!ghost || typeof document === 'undefined') return;
  // A hidden tab plays no scene: the stack's pins go now, not at their backstop.
  if (document.hidden) {
    releaseStackPins(ghost);
    return;
  }
  const bornAt = resetCount;
  const toRect = discardRectFor(ghost.user) || ghost.rect;
  const turn = ghost.turn || 0;

  const buildStandIn = () => {
    const host = spawnOverlay({ rect: ghost.rect, className: 'card-knockout-ghost' });
    const img = document.createElement('img');
    img.src = ghost.src;
    img.alt = '';
    img.draggable = false;
    host.appendChild(img);
    host.style.transform = `rotate(${turn}deg)`;
    return { host, img };
  };
  // Design 089: a card whose own mesh still stands in its slot (pinned) needs no image laid over it.
  let standIn = meshCanFly(ghost.instanceId) ? null : buildStandIn();

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (bornAt !== resetCount) {
      standIn?.host.remove();
      return;
    }
    // Design 078: with motion reduced the scene only burns the card's mesh where it stood.
    const played = !fxDisabled() && playKnockoutScene(ghost, { reduced: motionReduced() });
    // The scene took the pins of the cards it flies as it started them; the rest are let go.
    releaseStackPins(ghost);
    if (played) {
      standIn?.host.remove();
      return;
    }
    standIn ??= buildStandIn();
    const { host, img } = standIn;
    runPose(host, KNOCKOUT_DURATION_MS, (t) =>
      applyPose(host, img, knockoutPose(t, { fromRect: ghost.rect, toRect }), turn)
    );
  };
  if (typeof deferStart !== 'function') {
    start();
    return;
  }
  setTimeout(start, KO_START_BACKSTOP_MS);
  deferStart(start);
};
