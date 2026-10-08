// Design 022 slice 3 / design 026: one-shot pop when a special condition
// lands — TCG Live's apply poof in the condition colour, the condition's own
// flipbook (poison splat, flare, sleep clouds and Zs, zap, dizzy smoke) and a
// bouncing label scaled to the card. The held-condition loop is status-loop.js.
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  sampleKeyframes,
  spawnOverlay,
} from '../../image-logic/mat-fx.mjs';
import {
  STATUS_APPLY_MS,
  STATUS_CLEAR_LAYERS,
  STATUS_CLEAR_MS,
  STATUS_SPRITES,
  flipbookKeyframes,
  spriteLayerPose,
  statusApplyPose,
  statusClearPose,
  statusFxFor,
} from './status-fx.mjs';

/**
 * One flipbook layer: a window one cell big (scaled, drifted and faded on the
 * effect clock) over the whole sheet, which steps cell to cell inside it.
 * Sizes are in the card's short side so a sideways card gets the same burst.
 */
function playSpriteLayer(host, layer, rect, durationMs) {
  const sheet = STATUS_SPRITES[layer.sprite];
  const unit = Math.min(rect.width, rect.height);
  const sprite = document.createElement('div');
  sprite.className = `fx-status-sprite fx-status-sprite--${layer.sprite}`;
  const w = layer.w * unit;
  const h = layer.h * unit;
  sprite.style.width = `${w}px`;
  sprite.style.height = `${h}px`;
  sprite.style.left = `${rect.width / 2 + (layer.x ?? 0) * unit - w / 2}px`;
  sprite.style.top = `${rect.height / 2 + (layer.y ?? 0) * unit - h / 2}px`;
  const cells = document.createElement('div');
  cells.className = 'fx-status-sprite__sheet';
  cells.style.width = `${sheet.cols * 100}%`;
  cells.style.height = `${sheet.rows * 100}%`;
  sprite.appendChild(cells);
  host.appendChild(sprite);

  const windowFrames = sampleKeyframes(
    (t) => spriteLayerPose(layer, t),
    (p) => ({
      transform: `translate(${p.dx * unit}px, ${p.dy * unit}px) scale(${p.scale})`,
      opacity: p.opacity,
    }),
    24
  );
  return [
    animateFrames(sprite, windowFrames, { duration: durationMs }),
    animateFrames(cells, flipbookKeyframes(layer, sheet), { duration: durationMs }),
  ];
}

export const status = (plan) => {
  const fx = statusFxFor(plan.condition);
  if (!fx) return 0;
  const rect = rectForInstance(plan.instanceId, getCardRegistry());
  if (!rect) return 0;
  const host = spawnOverlay({
    rect,
    className: `fx-overlay fx-status-apply fx-status--${fx.key}`,
  });
  const done = fx.layers.flatMap((layer) => playSpriteLayer(host, layer, rect, STATUS_APPLY_MS));

  const label = document.createElement('div');
  label.className = 'fx-status-apply__label';
  label.style.fontSize = `${Math.max(10, rect.width * 0.17)}px`;
  label.textContent = fx.label;
  host.appendChild(label);
  const labelFrames = sampleKeyframes(
    statusApplyPose,
    (p) => ({ transform: `translateY(${p.labelY}px) scale(${p.labelScale})`, opacity: p.labelOpacity }),
    20
  );
  done.push(animateFrames(label, labelFrames, { duration: STATUS_APPLY_MS }));
  removeWhen(host, done, STATUS_APPLY_MS + 400);
};

/**
 * Design 024 slice 4: recovery from a special condition. Deliberately quieter
 * than the apply pop — TCG Live's remove sparkles over an inward ring in the
 * condition's colour, and no label.
 */
export const statusClear = (plan) => {
  const fx = statusFxFor(plan.condition);
  if (!fx) return 0;
  const rect = rectForInstance(plan.instanceId, getCardRegistry());
  if (!rect) return 0;
  const host = spawnOverlay({
    rect,
    className: `fx-overlay fx-status-clear fx-status--${fx.key}`,
  });
  const ring = document.createElement('div');
  ring.className = 'fx-status-clear__ring';
  host.appendChild(ring);
  const ringFrames = sampleKeyframes(
    statusClearPose,
    (p) => ({ transform: `scale(${p.ringScale})`, opacity: p.ringOpacity }),
    16
  );
  const done = [
    animateFrames(ring, ringFrames, { duration: STATUS_CLEAR_MS * 0.75 }),
    ...STATUS_CLEAR_LAYERS.flatMap((layer) => playSpriteLayer(host, layer, rect, STATUS_CLEAR_MS)),
  ];
  removeWhen(host, done, STATUS_CLEAR_MS + 400);
};
