// Design 009 slice 6: parent-page "ghost" knockout animation, same overlay
// pattern as shuffle-flight.js. Capture happens BEFORE the DOM diff removes
// the KO'd card (legacy: right after detection, before the owner's discard
// move; authoritative: apply-view.js's `onBeforeApply` hook), so removing the
// real card mid-animation never matters — the ghost is a detached copy.
import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../state.js';
import { visualRectOf } from './iframe-rect.mjs';
import {
  KNOCKOUT_BURST_MS,
  KNOCKOUT_DURATION_MS,
  knockoutBurstPose,
  knockoutPose,
} from './knockout-pose.mjs';
import { fxDisabled, motionReduced, runPose, spawnOverlay } from './mat-fx.mjs';

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
 * @param {'self'|'opp'} user - the side that owns the KO'd card
 * @param {HTMLImageElement|null} cardImageEl
 * @returns {{rect, src, user} | null}
 */
export const captureKnockoutGhost = (user, cardImageEl) => {
  if (!cardImageEl) return null;
  const rect = visualRectOf(cardImageEl);
  if (rect.width < 2 || rect.height < 2) return null;
  return { rect, src: cardImageEl.src, user };
};

const applyPose = (host, img, pose) => {
  host.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rotate}deg) scale(${pose.scale})`;
  host.style.opacity = String(pose.opacity);
  img.style.filter = `brightness(${pose.brightness}) saturate(${pose.saturate})`;
};

const playKnockoutBurst = (rect) => {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-ko-burst' });
  const ring = document.createElement('div');
  ring.className = 'fx-ko-burst__ring';
  host.appendChild(ring);
  runPose(host, KNOCKOUT_BURST_MS, (t) => {
    const pose = knockoutBurstPose(t);
    host.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
    ring.style.transform = `scale(${pose.ringScale})`;
    ring.style.opacity = String(pose.ringOpacity);
  });
};

export const playKnockoutGhost = (ghost) => {
  if (!ghost || typeof document === 'undefined' || document.hidden) return;
  const toRect = discardRectFor(ghost.user) || ghost.rect;

  const host = spawnOverlay({ rect: ghost.rect, className: 'card-knockout-ghost' });
  const img = document.createElement('img');
  img.src = ghost.src;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);

  runPose(host, KNOCKOUT_DURATION_MS, (t) =>
    applyPose(host, img, knockoutPose(t, { fromRect: ghost.rect, toRect }))
  );
  if (!fxDisabled() && !motionReduced()) playKnockoutBurst(ghost.rect);
};
