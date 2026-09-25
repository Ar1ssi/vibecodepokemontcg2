// Design 022 slice 1 / design 026: combat effects. `attack` lunges a ghost of
// the attacker (the real card hides meanwhile) and announces its contact
// moment; `damage` queues the hit — number, white flash, slash, type-coloured
// sparks, table shake — to land on that moment. Every overlay is detached and
// self-removing; both no-op when a card cannot be resolved (edge 1).
//
// Design 024 slice 2: `attackBanner` opens the sequence — the attack's name
// sweeps across screen while a ring marks the defender, so an attack reads as
// name -> target -> impact -> number rather than all at once (see fx-holds).
import { getCardRegistry } from '../apply-view.js';
import {
  animateFrames,
  rectForInstance,
  removeWhen,
  runPose,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import { playBanner } from './banner.js';
import { classifyHitOnce } from './damage-hit.mjs';
import {
  DAMAGE_POP_MS,
  HIT_FLASH_MS,
  HIT_SPARKS_MS,
  LUNGE_IMPACT,
  LUNGE_MS,
  SCREEN_SHAKE_MS,
  TARGET_RING_MS,
  attackAngleDeg,
  attackBannerText,
  createImpactQueue,
  damagePopPose,
  hitFlashPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
  slashPose,
  stackOffset,
  targetRingPose,
} from './combat-pose.mjs';
import { brighten, fxRgbForCard, FX_NEUTRAL_RGB, rgbCss } from './fx-colors.mjs';
import { peekCombatOrigin } from './origins.mjs';
import { burstParticles } from './particles.mjs';

const BACKSTOP_PAD_MS = 400;
const floatingCount = new Map();
const impacts = createImpactQueue({ setTimer: (fn, ms) => setTimeout(fn, ms) });
// The tilt owns `transform` on these; WAAPI `translate` composes without clobbering it.
const SHAKE_TARGET_IDS = ['battleMat', 'selfContainer', 'oppContainer', 'stadium'];

/** Live rect, else the pre-diff snapshot (a KO'd card is already gone). */
const combatRect = (instanceId, registry) =>
  rectForInstance(instanceId, registry) || peekCombatOrigin(instanceId)?.rect || null;

const combatSrc = (instanceId, registry) => {
  const element = registry.get(instanceId)?.element;
  return element?.currentSrc || element?.src || peekCombatOrigin(instanceId)?.src || null;
};

/** Queue `job(ctx)` to run when the current batch's attack connects. */
export const afterImpact = (job) => impacts.add(job);

const showDamageNumber = (instanceId, rect, hit) => {
  const index = floatingCount.get(instanceId) || 0;
  floatingCount.set(instanceId, index + 1);
  const host = spawnOverlay({ rect, className: `fx-overlay fx-damage-pop fx-damage-pop--${hit.kind}` });
  host.style.fontSize = `${Math.max(16, rect.width * (hit.weakness ? 0.42 : 0.36))}px`;
  if (hit.weakness) host.classList.add('fx-damage-pop--weakness');
  const text = `${hit.kind === 'heal' ? '+' : '−'}${hit.amount}`;
  const num = document.createElement('span');
  num.className = 'fx-damage-pop__num';
  num.dataset.text = text;
  num.textContent = text;
  host.appendChild(num);
  if (hit.weakness) {
    const tag = document.createElement('span');
    tag.className = 'fx-damage-pop__tag';
    tag.textContent = 'Weakness';
    host.appendChild(tag);
  }
  const lift = stackOffset(index, rect.height);
  const drift = (Math.random() - 0.5) * rect.width * 0.24;
  const frames = sampleKeyframes(
    (t) => damagePopPose(t, { rise: rect.height * 0.42, drift }),
    (p) => ({
      transform: `translate3d(${p.x}px, ${p.y + lift}px, 0) scale(${p.scale})`,
      opacity: p.opacity,
    }),
    30
  );
  removeWhen(host, [animateFrames(host, frames, { duration: DAMAGE_POP_MS })], DAMAGE_POP_MS + BACKSTOP_PAD_MS);
  setTimeout(() => {
    const left = (floatingCount.get(instanceId) || 1) - 1;
    if (left <= 0) floatingCount.delete(instanceId);
    else floatingCount.set(instanceId, left);
  }, DAMAGE_POP_MS * 0.6);
};

const hitRgbFor = (ctx, hit) => {
  if (hit.weakness) return [255, 206, 64];
  return ctx?.attackerCard ? brighten(fxRgbForCard(ctx.attackerCard), 0.3) : FX_NEUTRAL_RGB;
};

const strikeTarget = (rect, hit, ctx) => {
  const rgb = hitRgbFor(ctx, hit);
  const direction = ctx?.direction ?? -90;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-hit' });
  host.style.setProperty('--fx-hit-rgb', rgb.join(', '));

  const flash = document.createElement('div');
  flash.className = 'fx-hit__flash';
  const slash = document.createElement('div');
  slash.className = 'fx-hit__slash';
  slash.style.rotate = `${direction + 90 + (Math.random() - 0.5) * 30}deg`;
  const sparkLayer = document.createElement('div');
  sparkLayer.className = 'fx-hit__sparks';
  host.append(flash, slash, sparkLayer);

  const amplitude = Math.min(10, 3 + hit.amount / 20);
  const jitter = sampleKeyframes(
    (t) => shakePose(t, amplitude),
    (p) => ({ transform: `translate3d(${p.x}px, 0, 0)` }),
    16
  );
  const flashFrames = sampleKeyframes(hitFlashPose, (p) => ({ opacity: p.opacity }), 12);
  const slashFrames = sampleKeyframes(
    slashPose,
    (p) => ({ transform: `scale(${p.scaleX}, ${p.scaleY})`, opacity: p.opacity }),
    12
  );
  const sparks = burstParticles({
    count: hit.weakness ? 22 : Math.min(18, 8 + Math.round(hit.amount / 20)),
    distance: rect.width * (hit.weakness ? 0.95 : 0.75),
    direction,
    spread: 150,
    size: [rect.width * 0.1, rect.width * 0.22],
    aspect: 0.16,
    gravity: rect.height * 0.12,
    maxDelay: 0.08,
    seed: Math.floor(Math.random() * 1e6),
  });
  const done = [
    animateFrames(host, jitter, { duration: HIT_FLASH_MS }),
    animateFrames(flash, flashFrames, { duration: HIT_FLASH_MS }),
    animateFrames(slash, slashFrames, { duration: HIT_FLASH_MS }),
    ...spawnParticles(sparkLayer, sparks, {
      className: 'fx-particle--streak',
      color: rgbCss(rgb),
      duration: HIT_SPARKS_MS,
    }),
  ];
  removeWhen(host, done, HIT_SPARKS_MS + BACKSTOP_PAD_MS);
};

const shakeTable = (amount) => {
  const amplitude = screenShakeAmplitude(amount);
  if (amplitude === 0) return 0;
  const frames = screenShakeOffsets(amplitude).map((translate) => ({ translate }));
  for (const id of SHAKE_TARGET_IDS) {
    document.getElementById(id)?.animate?.(frames, {
      duration: SCREEN_SHAKE_MS,
      easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
    });
  }
};

export const damage = (plan) => {
  const hit = classifyHitOnce(plan);
  if (!hit) return 0;
  const rect = combatRect(plan.instanceId, getCardRegistry());
  if (!rect) return 0;
  impacts.add((ctx) => {
    showDamageNumber(plan.instanceId, rect, hit);
    if (hit.kind !== 'hit') return;
    strikeTarget(rect, hit, ctx);
    shakeTable(hit.amount);
  });
};

/** Hide the real attacker while its ghost lunges; always restored. */
const hideDuring = (element, promise, backstopMs) => {
  const target = element?.closest?.('.mat-holo') || element;
  if (!target?.style) return;
  const previous = target.style.visibility;
  target.style.visibility = 'hidden';
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    target.style.visibility = previous;
  };
  const timer = setTimeout(restore, backstopMs);
  promise.then(() => {
    clearTimeout(timer);
    restore();
  });
};

const ghostImage = (src, className) => {
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
};

// Trail copies lag the ghost and only show around the strike, so the motion
// smears at speed and reads clean at rest.
const TRAILS = [
  { lag: 0.035, alpha: 0.38 },
  { lag: 0.07, alpha: 0.2 },
];
const strikeWindow = (t) => {
  const d = Math.abs(t - LUNGE_IMPACT * 0.85);
  return Math.max(0, 1 - d / 0.14);
};

export const attack = (plan) => {
  const registry = getCardRegistry();
  const from = combatRect(plan.attackerId, registry);
  const to = combatRect(plan.defenderId, registry);
  const src = combatSrc(plan.attackerId, registry);
  if (!from || !to || !src) return 0;
  const pose = lungePoseFor(from, to);
  if (!pose) return 0;
  impacts.strikeIn(LUNGE_MS * LUNGE_IMPACT, {
    direction: attackAngleDeg(from, to),
    attackerCard: registry.get(plan.attackerId)?.card || null,
  });

  const host = spawnOverlay({ rect: from, className: 'fx-overlay fx-lunge' });
  const layers = TRAILS.map(({ lag, alpha }) => {
    const img = ghostImage(src, 'fx-lunge__trail');
    host.appendChild(img);
    const frames = sampleKeyframes(
      (t) => ({ ...pose(Math.max(0, t - lag)), a: alpha * strikeWindow(t) }),
      (p) => ({ transform: `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`, opacity: p.a }),
      36
    );
    return animateFrames(img, frames, { duration: LUNGE_MS });
  });
  const main = ghostImage(src, 'fx-lunge__card');
  host.appendChild(main);
  const mainFrames = sampleKeyframes(
    pose,
    (p) => ({ transform: `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})` }),
    36
  );
  const mainDone = animateFrames(main, mainFrames, { duration: LUNGE_MS });
  removeWhen(host, [mainDone, ...layers], LUNGE_MS + BACKSTOP_PAD_MS);
  hideDuring(registry.get(plan.attackerId)?.element, mainDone, LUNGE_MS + BACKSTOP_PAD_MS);
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
