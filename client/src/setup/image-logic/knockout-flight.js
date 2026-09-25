// Design 009 slice 6: parent-page "ghost" knockout animation, same overlay
// pattern as shuffle-flight.js. Capture happens BEFORE the DOM diff removes
// the KO'd card (legacy: right after detection, before the owner's discard
// move; authoritative: apply-view.js's `onBeforeApply` hook), so removing the
// real card mid-animation never matters — the ghost is a detached copy.
// Design 042: with effects on, the ghost hands over to the TCG Live knockout
// scene (mat-fx/ko-scene.js); the drift below is the reduced-motion fallback.
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import { visualRectOf } from './iframe-rect.mjs';
import { KNOCKOUT_DURATION_MS, knockoutPose } from './knockout-pose.mjs';
import { fxDisabled, motionReduced, runPose, spawnOverlay } from './mat-fx.mjs';
import { flightSrcOf } from '../netcode/mat-fx/card-flight.js';
import { frameTurnOf } from '../netcode/mat-fx/evolve-scene.js';
import { playKnockoutScene } from '../netcode/mat-fx/ko-scene.js';

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

const KO_START_BACKSTOP_MS = 1500;

/**
 * @param {{rect, src, user, turn?, attached?: {src}[]}} ghost - from
 *   captureKnockoutGhost; `attached` are the cards that go down with it
 * @param {{deferStart?: (start: () => void) => void}} [options] - design 026:
 *   the ghost appears at once (the real card is already gone) but holds still
 *   until `deferStart` calls back, so the KO lands on the attacker's strike.
 */
export const playKnockoutGhost = (ghost, { deferStart } = {}) => {
  if (!ghost || typeof document === 'undefined' || document.hidden) return;
  const toRect = discardRectFor(ghost.user) || ghost.rect;

  const host = spawnOverlay({ rect: ghost.rect, className: 'card-knockout-ghost' });
  const img = document.createElement('img');
  img.src = ghost.src;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);
  const turn = ghost.turn || 0;
  host.style.transform = `rotate(${turn}deg)`;

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (!fxDisabled() && !motionReduced() && playKnockoutScene(ghost)) {
      host.remove();
      return;
    }
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
