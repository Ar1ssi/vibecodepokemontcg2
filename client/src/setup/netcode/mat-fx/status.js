// Design 022 slice 3: one-shot pop when a special condition lands. The looping
// idle motion lives in status-marker.css next to the tokens it animates.
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
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
  const label = document.createElement('div');
  label.className = 'fx-status-apply__label';
  label.textContent = fx.label;
  host.append(ring, label);
  runPose(host, STATUS_APPLY_MS, (t) => {
    const pose = statusApplyPose(t);
    ring.style.transform = `scale(${pose.ringScale})`;
    ring.style.opacity = String(pose.ringOpacity);
    label.style.transform = `translateY(${pose.labelY}px)`;
    label.style.opacity = String(pose.labelOpacity);
  });
};
