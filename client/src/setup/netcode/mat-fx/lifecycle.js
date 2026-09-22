// Design 022 slice 4: lifecycle effects — evolve burst, energy attach snap,
// retreat/switch slide, trainer/stadium card presentation. All are detached
// overlays; every one no-ops when its card or rect cannot be resolved.
import { getEnergyTokenFront, isEnergyCard } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { getCardRegistry } from '../apply-view.js';
import { rectForInstance, runPose, spawnOverlay } from '../../image-logic/mat-fx.mjs';
import {
  CARD_PRESENT_MS,
  DISCARD_PUFF_MS,
  ENERGY_SNAP_MS,
  EVOLVE_BURST_MS,
  PROMOTE_MS,
  RETREAT_SLIDE_MS,
  devolveBurstPose,
  discardPuffPose,
  energySnapPose,
  evolveBurstPose,
  moveIdsForEvent,
  presentPoseFor,
  presentTargetRect,
  promotePose,
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

// Evolve and devolve share one overlay and differ only in their pose: the ring
// expands on the way up the line and collapses on the way back down.
const playEvolutionBurst = (plan, className, poseFn) => {
  const registry = getCardRegistry();
  const rect = rectForInstance(plan.instanceId, registry) || rectForInstance(plan.targetInstanceId, registry);
  if (!rect) return;
  const host = spawnOverlay({ rect, className: `fx-overlay ${className}` });
  const ring = document.createElement('div');
  ring.className = 'fx-evolve-burst__ring';
  host.appendChild(ring);
  runPose(host, EVOLVE_BURST_MS, (t) => {
    const pose = poseFn(t);
    host.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
    ring.style.transform = `scale(${pose.ringScale})`;
    ring.style.opacity = String(pose.ringOpacity);
  });
};

export const evolve = (plan) => playEvolutionBurst(plan, 'fx-evolve-burst', evolveBurstPose);

export const devolve = (plan) =>
  playEvolutionBurst(plan, 'fx-evolve-burst fx-devolve-burst', devolveBurstPose);

export const attach = (plan) => {
  const registry = getCardRegistry();
  const attached = registry.get(plan.instanceId)?.card;
  const targetRect = rectForInstance(plan.targetInstanceId, registry);
  if (!targetRect) return;
  // `cardAttached` covers Energy AND Tools. A Tool attaching is real but
  // minor, so it gets a soft ring rather than the Energy token's snap — design
  // 022 left it silent entirely (its edge row 9).
  if (!isEnergyCard(attached)) {
    const ringHost = spawnOverlay({ rect: targetRect, className: 'fx-overlay fx-tool-attach' });
    const toolRing = document.createElement('div');
    toolRing.className = 'fx-tool-attach__ring';
    ringHost.appendChild(toolRing);
    runPose(ringHost, ENERGY_SNAP_MS, (t) => {
      const pose = energySnapPose(t);
      toolRing.style.transform = `scale(${0.8 + 0.3 * (1 - pose.scale / 2.4)})`;
      ringHost.style.opacity = String(pose.opacity);
    });
    return;
  }
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

export const promote = (plan) => {
  const registry = getCardRegistry();
  const rect = rectForInstance(plan.instanceId, registry);
  if (!rect) return;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-promote' });
  const glow = document.createElement('div');
  glow.className = 'fx-promote__glow';
  host.appendChild(glow);
  runPose(host, PROMOTE_MS, (t) => {
    const pose = promotePose(t);
    host.style.transform = `translate3d(0, ${pose.y}px, 0) scale(${pose.scale})`;
    glow.style.transform = `scale(${pose.glowScale})`;
    glow.style.opacity = String(pose.glowOpacity);
  });
};

// The discard pile lives inside the side's playmat iframe, same lookup shape
// as knockout-flight's; `#discardCover` is the pile's visible face.
const discardRectFor = (user) => {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  const cover = doc?.getElementById('discardCover');
  const el = cover?.querySelector('img') || cover;
  if (!el) return null;
  const rect = visualRectOf(el);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};

export const discard = (plan) => {
  const rect = discardRectFor(plan.user);
  if (!rect) return;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-discard-puff' });
  runPose(host, DISCARD_PUFF_MS, (t) => {
    const pose = discardPuffPose(t);
    host.style.transform = `translate3d(0, ${pose.y}px, 0) scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
  });
};
