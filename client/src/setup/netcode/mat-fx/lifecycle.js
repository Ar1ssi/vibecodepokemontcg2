// Design 022 slice 4: lifecycle effects — evolve burst, energy attach snap,
// retreat/switch slide, trainer/stadium card presentation. All are detached
// overlays; every one no-ops when its card or rect cannot be resolved.
import { getEnergyTokenFront, isEnergyCard } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import {
  CARD_PRESENT_MS,
  ENERGY_SNAP_MS,
  EVOLVE_BURST_MS,
  RETREAT_SLIDE_MS,
  energySnapPose,
  evolveBurstPose,
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

export const evolve = (plan) => {
  const registry = getCardRegistry();
  const rect = rectForInstance(plan.instanceId, registry) || rectForInstance(plan.targetInstanceId, registry);
  if (!rect) return;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-evolve-burst' });
  const ring = document.createElement('div');
  ring.className = 'fx-evolve-burst__ring';
  host.appendChild(ring);
  runPose(host, EVOLVE_BURST_MS, (t) => {
    const pose = evolveBurstPose(t);
    host.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
    ring.style.transform = `scale(${pose.ringScale})`;
    ring.style.opacity = String(pose.ringOpacity);
  });
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
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-energy-snap' });
  const tokenSrc = getEnergyTokenFront(attached);
  if (tokenSrc) host.appendChild(buildImage(tokenSrc));
  runPose(host, ENERGY_SNAP_MS, (t) => {
    const pose = energySnapPose(t);
    host.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
    host.style.boxShadow = `0 0 ${pose.glow * 18}px ${pose.glow * 6}px rgba(255, 255, 255, ${pose.glow * 0.8})`;
  });
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
