// Design 022 slice 3 / design 026: one-shot pop when a special condition
// lands — a card-shaped glow in the condition colour, a bouncing label scaled
// to the card, and the condition's own particles (bubbles, embers, Zzz,
// sparks, swirl). The looping idle motion lives in status-marker.css.
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import { burstParticles } from './particles.mjs';
import { STATUS_APPLY_MS, statusApplyPose, statusFxFor } from './status-fx.mjs';

export const status = (plan) => {
  const fx = statusFxFor(plan.condition);
  if (!fx) return;
  const rect = rectForInstance(plan.instanceId, getCardRegistry());
  if (!rect) return;
  const host = spawnOverlay({
    rect,
    className: `fx-overlay fx-status-apply fx-status-apply--${fx.key}`,
  });
  const ring = document.createElement('div');
  ring.className = 'fx-status-apply__ring';
  const motes = document.createElement('div');
  motes.className = 'fx-status-apply__motes';
  motes.style.fontSize = `${rect.width * 0.09}px`;
  const label = document.createElement('div');
  label.className = 'fx-status-apply__label';
  label.style.fontSize = `${Math.max(10, rect.width * 0.17)}px`;
  label.textContent = fx.label;
  host.append(ring, motes, label);

  const ringFrames = sampleKeyframes(
    statusApplyPose,
    (p) => ({ transform: `scale(${p.ringScale})`, opacity: p.ringOpacity }),
    16
  );
  const labelFrames = sampleKeyframes(
    statusApplyPose,
    (p) => ({ transform: `translateY(${p.labelY}px) scale(${p.labelScale})`, opacity: p.labelOpacity }),
    20
  );
  const spec = fx.particles;
  const particles = burstParticles({
    count: spec.count,
    distance: rect.width * spec.distance,
    direction: spec.direction,
    spread: spec.spread,
    size: [rect.width * spec.size[0], rect.width * spec.size[1]],
    aspect: spec.aspect ?? 1,
    gravity: rect.height * spec.gravity,
    maxDelay: 0.3,
    orient: spec.orient ?? true,
    seed: Math.floor(Math.random() * 1e6),
  });
  const done = [
    animateFrames(ring, ringFrames, { duration: STATUS_APPLY_MS * 0.7 }),
    animateFrames(label, labelFrames, { duration: STATUS_APPLY_MS }),
    ...spawnParticles(motes, particles, { className: spec.className, duration: STATUS_APPLY_MS }),
  ];
  removeWhen(host, done, STATUS_APPLY_MS + 400);
};
