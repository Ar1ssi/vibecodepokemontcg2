// Design 024 slice 2: `attackBanner` opens the sequence — the attack's name
// sweeps across screen while a ring marks the defender, so an attack reads as
// name -> target -> impact -> number rather than all at once (see fx-holds).
//
// Design 022 slice 1: combat effects. `damage` floats the hit number over the
// target, flashes/jitters an overlay on it (never the real card, so no layout
// cost) and shakes the table for big hits; `attack` lunges a ghost of the
// attacker toward the defender. Both no-op when a card is missing (edge 1).
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import { playBanner } from './banner.js';
import {
  DAMAGE_POP_MS,
  HIT_FLASH_MS,
  LUNGE_MS,
  SCREEN_SHAKE_MS,
  TARGET_RING_MS,
  attackBannerText,
  classifyDamagePlan,
  damagePopPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
  targetRingPose,
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
  if (amplitude === 0) return 0;
  const frames = screenShakeOffsets(amplitude).map((translate) => ({ translate }));
  for (const id of SHAKE_TARGET_IDS) {
    document.getElementById(id)?.animate?.(frames, { duration: SCREEN_SHAKE_MS, easing: 'linear' });
  }
};

export const damage = (plan) => {
  const hit = classifyDamagePlan(plan, lastSeenDamage);
  if (!hit) return 0;
  const rect = rectForInstance(plan.instanceId, getCardRegistry());
  if (!rect) return 0;
  showDamageNumber(rect, hit);
  // A heal drew its number and is done — it still paces like a damage beat,
  // so fall through to the table rather than reporting "nothing drawn".
  if (hit.kind !== 'hit') return undefined;
  flashTarget(rect, hit);
  shakeTable(hit.amount);
};

export const attack = (plan) => {
  const registry = getCardRegistry();
  const from = rectForInstance(plan.attackerId, registry);
  const to = rectForInstance(plan.defenderId, registry);
  const element = registry.get(plan.attackerId)?.element;
  const src = element?.currentSrc || element?.src;
  if (!from || !to || !src) return 0;
  const pose = lungePoseFor(from, to);
  if (!pose) return 0;
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

const showTargetRing = (rect) => {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-target-ring' });
  const ring = document.createElement('div');
  ring.className = 'fx-target-ring__ring';
  host.appendChild(ring);
  runPose(host, TARGET_RING_MS, (t) => {
    const pose = targetRingPose(t);
    ring.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
  });
};

export const attackBanner = (plan) => {
  const registry = getCardRegistry();
  const attackerName = registry.get(plan.attackerId)?.card?.name;
  const text = attackBannerText(plan.attackName, attackerName);
  if (!text) return 0;
  playBanner(text, plan.user, 'attack');
  // A bench-wide or fizzled attack has no single defender; the banner still
  // plays, there is just nothing to ring (edge 9).
  const defenderRect = rectForInstance(plan.defenderId, registry);
  if (defenderRect) showTargetRing(defenderRect);
};
