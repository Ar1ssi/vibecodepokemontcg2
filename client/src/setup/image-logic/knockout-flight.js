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
import { KNOCKOUT_DURATION_MS, knockoutPose } from './knockout-pose.mjs';

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

export const playKnockoutGhost = (ghost) => {
  if (!ghost || typeof document === 'undefined' || document.hidden) return;
  const toRect = discardRectFor(ghost.user) || ghost.rect;

  const host = document.createElement('div');
  host.className = 'card-knockout-ghost';
  host.style.left = `${ghost.rect.left}px`;
  host.style.top = `${ghost.rect.top}px`;
  host.style.width = `${ghost.rect.width}px`;
  host.style.height = `${ghost.rect.height}px`;
  const img = document.createElement('img');
  img.src = ghost.src;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);
  document.body.appendChild(host);

  let started = null;
  const tick = (now) => {
    if (started == null) started = now;
    const t = Math.min(1, (now - started) / KNOCKOUT_DURATION_MS);
    applyPose(host, img, knockoutPose(t, { fromRect: ghost.rect, toRect }));
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    host.remove();
  };

  applyPose(host, img, knockoutPose(0, { fromRect: ghost.rect, toRect }));
  requestAnimationFrame(tick);
};
