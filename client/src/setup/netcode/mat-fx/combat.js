// Design 022 slice 1: combat effects. `damage` floats the hit number over the
// target, flashes/jitters an overlay on it (never the real card, so no layout
// cost) and shakes the table for big hits; `attack` lunges a ghost of the
// attacker toward the defender. Both no-op when a card is missing (edge 1).
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import {
  DAMAGE_POP_MS,
  HIT_FLASH_MS,
  LUNGE_MS,
  SCREEN_SHAKE_MS,
  classifyDamagePlan,
  damagePopPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
} from './combat-pose.mjs';

const lastSeenDamage = new Map();
// The tilt owns `transform` on these; WAAPI `translate` composes without clobbering it.
const SHAKE_TARGET_IDS = ['battleMat', 'selfContainer', 'oppContainer', 'stadium'];

const showDamageNumber = (rect, hit) => {
  const host = spawnOverlay({ rect, className: `fx-overlay fx-damage-pop fx-damage-pop--${hit.kind}` });
  host.style.fontSize = `${Math.max(14, rect.width * 0.34)}px`;
  host.textContent = `${hit.kind === 'heal' ? '+' : '−'}${hit.amount}`;
  if (hit.weakness) host.classList.add('fx-damage-pop--weakness');
  runPose(host, DAMAGE_POP_MS, (t) => {
    const pose = damagePopPose(t, { rise: rect.height * 0.36 });
    host.style.transform = `translate3d(0, ${pose.y}px, 0) scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
  });
};

const flashTarget = (rect, hit) => {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-hit-flash' });
  if (hit.weakness) host.classList.add('fx-hit-flash--weakness');
  const amplitude = Math.min(10, 3 + hit.amount / 20);
  runPose(host, HIT_FLASH_MS, (t) => {
    const pose = shakePose(t, amplitude);
    host.style.transform = `translate3d(${pose.x}px, 0, 0)`;
    host.style.opacity = String(pose.opacity);
  });
};

const shakeTable = (amount) => {
  const amplitude = screenShakeAmplitude(amount);
  if (amplitude === 0) return;
  const frames = screenShakeOffsets(amplitude).map((translate) => ({ translate }));
  for (const id of SHAKE_TARGET_IDS) {
    document.getElementById(id)?.animate?.(frames, { duration: SCREEN_SHAKE_MS, easing: 'linear' });
  }
};

export const damage = (plan) => {
  const hit = classifyDamagePlan(plan, lastSeenDamage);
  if (!hit) return;
  const rect = rectForInstance(plan.instanceId, getCardRegistry());
  if (!rect) return;
  showDamageNumber(rect, hit);
  if (hit.kind !== 'hit') return;
  flashTarget(rect, hit);
  shakeTable(hit.amount);
};

export const attack = (plan) => {
  const registry = getCardRegistry();
  const from = rectForInstance(plan.attackerId, registry);
  const to = rectForInstance(plan.defenderId, registry);
  const element = registry.get(plan.attackerId)?.element;
  const src = element?.currentSrc || element?.src;
  if (!from || !to || !src) return;
  const pose = lungePoseFor(from, to);
  if (!pose) return;
  const host = spawnOverlay({ rect: from, className: 'fx-overlay fx-lunge' });
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  host.appendChild(img);
  runPose(host, LUNGE_MS, (t) => {
    const p = pose(t);
    host.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`;
  });
};
