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
import {
  animateFrames,
  fxDisabled,
  motionReduced,
  removeWhen,
  runPose,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from './mat-fx.mjs';
import { burstParticles } from '../netcode/mat-fx/particles.mjs';

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

const KO_SHARD_MS = 760;
const KO_START_BACKSTOP_MS = 1500;

// Design 026: flash core + two shockwave rings + card shards thrown outward.
const playKnockoutBurst = (rect) => {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-ko-burst' });
  const core = document.createElement('div');
  core.className = 'fx-ko-burst__core';
  const ring = document.createElement('div');
  ring.className = 'fx-ko-burst__ring';
  const ring2 = document.createElement('div');
  ring2.className = 'fx-ko-burst__ring fx-ko-burst__ring--outer';
  const shards = document.createElement('div');
  shards.className = 'fx-ko-burst__shards';
  host.append(core, ring, ring2, shards);
  const coreFrames = sampleKeyframes(
    knockoutBurstPose,
    (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
    16
  );
  const ringFrames = sampleKeyframes(
    knockoutBurstPose,
    (p) => ({ transform: `scale(${p.ringScale})`, opacity: p.ringOpacity }),
    16
  );
  const outerFrames = sampleKeyframes(
    (t) => knockoutBurstPose(t),
    (p) => ({ transform: `scale(${p.ringScale * 1.35})`, opacity: p.ringOpacity * 0.6 }),
    16
  );
  const pieces = burstParticles({
    count: 16,
    distance: rect.width * 1.1,
    size: [rect.width * 0.1, rect.width * 0.2],
    gravity: rect.height * 0.35,
    maxDelay: 0.05,
    seed: Math.floor(Math.random() * 1e6),
  });
  const done = [
    animateFrames(core, coreFrames, { duration: KNOCKOUT_BURST_MS }),
    animateFrames(ring, ringFrames, { duration: KNOCKOUT_BURST_MS }),
    animateFrames(ring2, outerFrames, { duration: KNOCKOUT_BURST_MS * 1.3, delay: 60 }),
    ...spawnParticles(shards, pieces, {
      className: 'fx-particle--shard',
      color: 'rgba(255, 196, 120, 1)',
      duration: KO_SHARD_MS,
    }),
  ];
  removeWhen(host, done, KO_SHARD_MS + 400);
};

/**
 * @param {{rect, src, user}} ghost - from captureKnockoutGhost
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

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    runPose(host, KNOCKOUT_DURATION_MS, (t) =>
      applyPose(host, img, knockoutPose(t, { fromRect: ghost.rect, toRect }))
    );
    if (!fxDisabled() && !motionReduced()) playKnockoutBurst(ghost.rect);
  };
  if (typeof deferStart !== 'function') {
    start();
    return;
  }
  setTimeout(start, KO_START_BACKSTOP_MS);
  deferStart(start);
};
