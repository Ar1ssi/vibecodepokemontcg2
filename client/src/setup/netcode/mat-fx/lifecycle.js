// Design 022 slice 4: lifecycle effects — evolve burst, energy attach snap,
// retreat/switch slide, trainer/stadium card presentation. All are detached
// overlays; every one no-ops when its card or rect cannot be resolved.
import { getEnergyTokenFront, isEnergyCard } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
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
import { brighten, fxRgbForCard, rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';
import {
  CARD_PRESENT_MS,
  ENERGY_SNAP_MS,
  EVOLVE_BURST_MS,
  RETREAT_SLIDE_MS,
  energySnapPose,
  evolveBurstPose,
  evolvePillarPose,
  evolveSilhouettePose,
  moveIdsForEvent,
  presentPoseFor,
  presentTargetRect,
  slidePoseFor,
} from './lifecycle-pose.mjs';
import { takeOrigin } from './origins.mjs';

const buildImage = (src, className) => {
  const img = document.createElement('img');
  if (className) img.className = className;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
};

const BACKSTOP_PAD_MS = 400;

const cardSrc = (element) => element?.currentSrc || element?.src || null;

export const evolve = (plan) => {
  const registry = getCardRegistry();
  const id = rectForInstance(plan.instanceId, registry) ? plan.instanceId : plan.targetInstanceId;
  const rect = rectForInstance(id, registry);
  if (!rect) return;
  const src = cardSrc(registry.get(id)?.element);
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-evolve-burst' });
  const pillar = document.createElement('div');
  pillar.className = 'fx-evolve-burst__pillar';
  const glow = document.createElement('div');
  glow.className = 'fx-evolve-burst__glow';
  const ring = document.createElement('div');
  ring.className = 'fx-evolve-burst__ring';
  const sparkles = document.createElement('div');
  sparkles.className = 'fx-evolve-burst__sparkles';
  host.append(pillar, glow, ring);
  const done = [];
  if (src) {
    const silhouette = buildImage(src, 'fx-evolve-burst__silhouette');
    host.appendChild(silhouette);
    const frames = sampleKeyframes(
      evolveSilhouettePose,
      (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
      24
    );
    done.push(animateFrames(silhouette, frames, { duration: EVOLVE_BURST_MS }));
  }
  host.appendChild(sparkles);
  const glowFrames = sampleKeyframes(
    evolveBurstPose,
    (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
    16
  );
  // The ring starts after a delay (fill 'both'), so it must begin invisible.
  const ringFrames = sampleKeyframes(
    (t) => ({ ...evolveBurstPose(t), fadeIn: Math.min(1, t / 0.08) }),
    (p) => ({ transform: `scale(${p.ringScale})`, opacity: p.ringOpacity * p.fadeIn }),
    16
  );
  const pillarFrames = sampleKeyframes(
    evolvePillarPose,
    (p) => ({ transform: `scale(${p.scaleX}, ${p.scaleY})`, opacity: p.opacity }),
    16
  );
  const rising = burstParticles({
    count: 18,
    distance: rect.height * 0.7,
    direction: -90,
    spread: 50,
    size: [rect.width * 0.05, rect.width * 0.12],
    gravity: -rect.height * 0.2,
    maxDelay: 0.45,
    seed: Math.floor(Math.random() * 1e6),
  });
  done.push(
    animateFrames(glow, glowFrames, { duration: EVOLVE_BURST_MS * 0.8, delay: EVOLVE_BURST_MS * 0.2 }),
    animateFrames(ring, ringFrames, { duration: EVOLVE_BURST_MS * 0.6, delay: EVOLVE_BURST_MS * 0.35 }),
    animateFrames(pillar, pillarFrames, { duration: EVOLVE_BURST_MS }),
    ...spawnParticles(sparkles, rising, { className: 'fx-particle--mote', duration: EVOLVE_BURST_MS })
  );
  removeWhen(host, done, EVOLVE_BURST_MS * 1.5 + BACKSTOP_PAD_MS);
};

export const attach = (plan) => {
  const registry = getCardRegistry();
  const attached = registry.get(plan.instanceId)?.card;
  if (!isEnergyCard(attached)) return;
  const targetRect = rectForInstance(plan.targetInstanceId, registry);
  if (!targetRect) return;
  const size = Math.max(24, targetRect.width * 0.34);
  const rect = {
    left: targetRect.left + (targetRect.width - size) / 2,
    top: targetRect.top + (targetRect.height - size) / 2,
    width: size,
    height: size,
  };
  const rgb = brighten(fxRgbForCard(attached), 0.25);
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-energy-snap' });
  host.style.setProperty('--fx-energy-rgb', rgb.join(', '));
  const ring = document.createElement('div');
  ring.className = 'fx-energy-snap__ring';
  const motes = document.createElement('div');
  motes.className = 'fx-energy-snap__motes';
  const token = document.createElement('div');
  token.className = 'fx-energy-snap__token';
  const tokenSrc = getEnergyTokenFront(attached);
  if (tokenSrc) token.appendChild(buildImage(tokenSrc));
  host.append(ring, motes, token);

  const tokenFrames = sampleKeyframes(
    energySnapPose,
    (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }),
    20
  );
  const ringFrames = sampleKeyframes(
    energySnapPose,
    (p) => ({ transform: `scale(${1 + (1 - p.glow) * 1.6})`, opacity: p.glow }),
    20
  );
  const burst = burstParticles({
    count: 12,
    distance: size * 1.3,
    size: [size * 0.1, size * 0.2],
    maxDelay: 0.05,
    seed: Math.floor(Math.random() * 1e6),
  });
  const done = [
    animateFrames(token, tokenFrames, { duration: ENERGY_SNAP_MS }),
    animateFrames(ring, ringFrames, { duration: ENERGY_SNAP_MS }),
    ...spawnParticles(motes, burst, {
      className: 'fx-particle--mote',
      color: rgbCss(rgb),
      duration: ENERGY_SNAP_MS * 0.9,
      delay: ENERGY_SNAP_MS * 0.55,
    }),
  ];
  removeWhen(host, done, ENERGY_SNAP_MS * 2 + BACKSTOP_PAD_MS);
};

export const retreat = (plan) => {
  const registry = getCardRegistry();
  for (const id of moveIdsForEvent(plan)) {
    const origin = takeOrigin(id);
    const to = rectForInstance(id, registry);
    const pose = origin && to && slidePoseFor(origin.rect, to);
    if (!pose) continue;
    const host = spawnOverlay({ rect: to, className: 'fx-overlay fx-slide' });
    host.appendChild(buildImage(origin.src));
    runPose(host, RETREAT_SLIDE_MS, (t) => {
      const p = pose(t);
      host.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      host.style.opacity = String(p.opacity);
    });
  }
};

const presentCard = (src, fromRect) => {
  const viewport = { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 };
  if (!src || viewport.width < 2 || viewport.height < 2) return;
  const target = presentTargetRect(viewport.width, viewport.height);
  const pose = presentPoseFor(fromRect, target);
  const host = spawnOverlay({ rect: target, className: 'fx-overlay fx-card-present' });
  host.appendChild(buildImage(src));
  runPose(host, CARD_PRESENT_MS, (t) => {
    const p = pose(t);
    host.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`;
    host.style.opacity = String(p.opacity);
  });
};

export const trainerPlay = (plan) => {
  const origin = takeOrigin(plan.instanceId);
  const element = getCardRegistry().get(plan.instanceId)?.element;
  presentCard(origin?.src || element?.currentSrc || element?.src, origin?.rect || null);
};

export const stadiumPlay = (plan) => {
  const element = getCardRegistry().get(plan.instanceId)?.element;
  presentCard(element?.currentSrc || element?.src, null);
};
