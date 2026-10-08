// Design 022 slice 3 / design 026: one-shot pop when a special condition
// lands — TCG Live's Status_Apply puff and swipe with the condition's own intro
// (status-fx.mjs holds the layers, converted from the game's prefabs) and a
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
  STATUS_LABEL_MS,
  STATUS_SPRITES,
  flipbookKeyframes,
  spriteLayerKeyframes,
  statusApplyPose,
  statusFxFor,
} from './status-fx.mjs';

/**
 * One layer: a window (scaled, drifted and faded on the effect clock) over a
 * flipbook sheet that steps cell to cell inside it — or, for `shape` layers, a
 * plain CSS ring/square/glow. Sizes are in the card's short side, so a sideways
 * card gets the same burst. `tint` and the rim cut-out ride on custom properties.
 */
function playLayer(host, layer, rect, durationMs) {
  const unit = Math.min(rect.width, rect.height);
  const el = document.createElement('div');
  el.className = layer.shape
    ? `fx-status-shape fx-status-shape--${layer.shape}`
    : `fx-status-sprite fx-status-sprite--${layer.sprite}`;
  const w = layer.w * unit;
  const h = layer.h * unit;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${rect.width / 2 + layer.x * unit - w / 2}px`;
  el.style.top = `${rect.height / 2 + layer.y * unit - h / 2}px`;
  if (layer.tint) el.style.setProperty('--fx-sprite-rgb', layer.tint);
  host.appendChild(el);

  const done = [animateFrames(el, spriteLayerKeyframes(layer, unit), { duration: durationMs })];
  if (layer.shape) return done;

  const sheet = STATUS_SPRITES[layer.sprite];
  const cells = document.createElement('div');
  cells.className = 'fx-status-sprite__sheet';
  cells.style.width = `${sheet.cols * 100}%`;
  cells.style.height = `${sheet.rows * 100}%`;
  if (layer.cut) {
    // The rim's second mask layer is the card, sized as a share of the glow quad.
    cells.style.setProperty('--fx-cut', `${layer.cut[0]}% ${layer.cut[1]}%`);
  }
  el.appendChild(cells);
  done.push(animateFrames(cells, flipbookKeyframes(layer, sheet), { duration: durationMs }));
  return done;
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
  const done = fx.layers.flatMap((layer) => playLayer(host, layer, rect, STATUS_APPLY_MS));

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
  done.push(animateFrames(label, labelFrames, { duration: STATUS_LABEL_MS }));
  removeWhen(host, done, STATUS_APPLY_MS + 400);
};

/**
 * Design 024 slice 4: recovery from a special condition — TCG Live's
 * Status_Remove, a green heal of square, ring, shockwave and thrown stars. No label.
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
  const done = STATUS_CLEAR_LAYERS.flatMap((layer) => playLayer(host, layer, rect, STATUS_CLEAR_MS));
  removeWhen(host, done, STATUS_CLEAR_MS + 400);
};
