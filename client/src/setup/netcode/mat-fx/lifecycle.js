// Design 022 slice 4: lifecycle effects — evolution (design 041), energy attach snap,
// retreat/switch slide, trainer/stadium card presentation. All are detached
// overlays; every one no-ops when its card or rect cannot be resolved.
import { getEnergyTokenFront, isEnergyCard } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { oppContainerDocument, selfContainerDocument } from '../../../state.js';
import { visualRectOf } from '../../image-logic/iframe-rect.mjs';
import { docForSide } from './side-doc.mjs';
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
import { signatureEntryKind } from './entry-kind.mjs';
import { playSignatureEntry } from './entry.js';
import { frameTurnOf, playEvolveScene } from './evolve-scene.js';
import { brighten, fxRgbForCard, rgbCss } from './fx-colors.mjs';
import { burstParticles } from './particles.mjs';
import {
  CARD_PRESENT_MS,
  DEVOLVE_BURST_MS,
  DISCARD_PUFF_MS,
  ENERGY_SNAP_MS,
  PROMOTE_MS,
  RETREAT_SLIDE_MS,
  devolveBurstPose,
  discardPuffPose,
  energySnapPose,
  moveIdsForEvent,
  presentDimPose,
  presentPoseFor,
  presentSrcFor,
  presentTargetRect,
  promotePose,
  slidePoseFor,
} from './lifecycle-pose.mjs';
import { sweepPose } from './flow-pose.mjs';
import { holdFor } from './fx-holds.mjs';
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
  // Taken first so a snapshot never outlives its evolution.
  const origin = takeOrigin(plan.instanceId);
  const id = rectForInstance(plan.instanceId, registry) ? plan.instanceId : plan.targetInstanceId;
  const rect = rectForInstance(id, registry);
  if (!rect) return 0;
  // Design 027: a Mega or Tera evolution plays its signature entry instead.
  const evolved = registry.get(plan.instanceId)?.card;
  if (playSignatureEntry(signatureEntryKind(evolved), rect, plan.instanceId, evolved)) return;
  // Design 041: every other evolution plays the Scarlet/Violet scene.
  playEvolveScene({
    rect,
    turn: frameTurnOf(registry.get(id)?.element),
    fromSrc: origin?.src || null,
    toSrc: cardSrc(registry.get(plan.instanceId)?.element),
  });
  return holdFor('evolve-scene');
};

// Devolving: the ring collapses inward and the card shrinks.
export const devolve = (plan) => {
  const registry = getCardRegistry();
  const rect = rectForInstance(plan.instanceId, registry) || rectForInstance(plan.targetInstanceId, registry);
  if (!rect) return 0;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-evolve-burst fx-devolve-burst' });
  const ring = document.createElement('div');
  ring.className = 'fx-evolve-burst__ring';
  host.appendChild(ring);
  runPose(host, DEVOLVE_BURST_MS, (t) => {
    const pose = devolveBurstPose(t);
    host.style.transform = `scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
    ring.style.transform = `scale(${pose.ringScale})`;
    ring.style.opacity = String(pose.ringOpacity);
  });
};

export const attach = (plan) => {
  const registry = getCardRegistry();
  const attached = registry.get(plan.instanceId)?.card;
  // No card record at all is "we don't know what this is", not "it's a Tool":
  // isEnergyCard(undefined) is false, so without this an Energy whose record
  // has not landed yet would draw the quiet Tool ring instead of its token.
  if (!attached) return 0;
  const targetRect = rectForInstance(plan.targetInstanceId, registry);
  if (!targetRect) return 0;
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
    // Both branches arrive as the `attach` effect, so the Tool's shorter hold
    // has to be named explicitly rather than read from the plan.
    return holdFor('tool-attach');
  }
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
    const frames = sampleKeyframes(
      pose,
      (p) => ({ transform: `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`, opacity: p.opacity }),
      24
    );
    removeWhen(host, [animateFrames(host, frames, { duration: RETREAT_SLIDE_MS })], RETREAT_SLIDE_MS + BACKSTOP_PAD_MS);
  }
};

const presentCard = (src, fromRect) => {
  const viewport = { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 };
  if (!src || viewport.width < 2 || viewport.height < 2) return 0;
  const target = presentTargetRect(viewport.width, viewport.height);
  const pose = presentPoseFor(fromRect, target);
  const dim = spawnOverlay({
    rect: { left: 0, top: 0, width: viewport.width, height: viewport.height },
    className: 'fx-overlay fx-present-dim',
  });
  const host = spawnOverlay({ rect: target, className: 'fx-overlay fx-card-present' });
  const card = document.createElement('div');
  card.className = 'fx-card-present__card';
  card.appendChild(buildImage(src));
  const shine = document.createElement('div');
  shine.className = 'fx-card-present__shine';
  card.appendChild(shine);
  host.appendChild(card);

  const cardFrames = sampleKeyframes(
    pose,
    (p) => ({
      transform: `translate3d(${p.x}px, ${p.y}px, 0) perspective(900px) rotateY(${p.rotateY}deg) scale(${p.scale})`,
      opacity: p.opacity,
    }),
    32
  );
  const shineFrames = sampleKeyframes(
    (t) => sweepPose(t, { start: 0.2, end: 0.5 }),
    (p) => ({ transform: `translateX(${p.x * 160}%) skewX(-18deg)`, opacity: p.opacity }),
    20
  );
  const dimFrames = sampleKeyframes(presentDimPose, (p) => ({ opacity: p.opacity }), 16);
  removeWhen(
    host,
    [
      animateFrames(card, cardFrames, { duration: CARD_PRESENT_MS }),
      animateFrames(shine, shineFrames, { duration: CARD_PRESENT_MS }),
    ],
    CARD_PRESENT_MS + BACKSTOP_PAD_MS
  );
  removeWhen(dim, [animateFrames(dim, dimFrames, { duration: CARD_PRESENT_MS })], CARD_PRESENT_MS + BACKSTOP_PAD_MS);
};

export const trainerPlay = (plan) => {
  const origin = takeOrigin(plan.instanceId);
  const element = getCardRegistry().get(plan.instanceId)?.element;
  presentCard(presentSrcFor(origin, element), origin?.rect || null);
};

export const stadiumPlay = (plan) => {
  const element = getCardRegistry().get(plan.instanceId)?.element;
  presentCard(element?.currentSrc || element?.src, null);
};

export const promote = (plan) => {
  const registry = getCardRegistry();
  const rect = rectForInstance(plan.instanceId, registry);
  if (!rect) return 0;
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
  const doc = docForSide(user, selfContainerDocument, oppContainerDocument);
  const cover = doc?.getElementById('discardCover');
  const el = cover?.querySelector('img') || cover;
  if (!el) return null;
  const rect = visualRectOf(el);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};

export const discard = (plan) => {
  const rect = discardRectFor(plan.user);
  if (!rect) return 0;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-discard-puff' });
  runPose(host, DISCARD_PUFF_MS, (t) => {
    const pose = discardPuffPose(t);
    host.style.transform = `translate3d(0, ${pose.y}px, 0) scale(${pose.scale})`;
    host.style.opacity = String(pose.opacity);
  });
};
