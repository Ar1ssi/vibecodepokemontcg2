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
  hideDuring,
  rectForInstance,
  removeWhen,
  runPose,
  sampleKeyframes,
  spawnOverlay,
  spawnParticles,
} from '../../image-logic/mat-fx.mjs';
import { playBanner } from './banner.js';
import { classifyHitOnce, peekHit } from './damage-hit.mjs';
import {
  AURA_PULSE_MS,
  DAMAGE_POP_MS,
  HIT_FLASH_MS,
  HIT_RECOIL_MS,
  HIT_SPARKS_MS,
  LUNGE_IMPACT,
  LUNGE_MS,
  SCREEN_SHAKE_MS,
  TARGET_RING_MS,
  attackAngleDeg,
  attackBannerText,
  auraPulsePose,
  createImpactQueue,
  damagePopPose,
  hitDressingFor,
  hitFlashPose,
  hitRecoilPose,
  lungePoseFor,
  screenShakeAmplitude,
  screenShakeOffsets,
  shakePose,
  slashPose,
  stackOffset,
  targetRingPose,
} from './combat-pose.mjs';
import { brighten, fxRgbForCard, FX_NEUTRAL_RGB, rgbCss } from './fx-colors.mjs';
import { frameTurnOf } from './evolve-scene.js';
import { impactTypeFor, impactVariant, withoutImpactBeats } from './impact/impact-select.mjs';
import { impactReady, playImpact, prepareImpact } from './impact/impact-stage.js';
import { peekCombatOrigin, visibleStackRecord, zoneCardIds } from './origins.mjs';
import { playMove } from './moves/move-player.js';
import { hashString, moveFor, speciesFor } from './moves/move-select.mjs';
import { SPECS } from './moves/specs/index.mjs';
import { signatureFor, slugFor, withSignatureSpec } from './moves/signature/signature-select.mjs';
import { SIGNATURE_SPECS } from './moves/signature/specs/index.mjs';
import { attackSoundFields } from './moves/attack-sound.mjs';
import { burstParticles } from './particles.mjs';
import { hitDelayFor, hitDelaysOf, hitWaitMs, layoutHits, recoilVector } from './multi-hit.mjs';

const BACKSTOP_PAD_MS = 400;
const floatingCount = new Map();
const impacts = createImpactQueue({ setTimer: (fn, ms) => setTimeout(fn, ms) });
// The tilt owns `transform` on these; WAAPI `translate` composes without clobbering it.
const SHAKE_TARGET_IDS = ['battleMat', 'selfContainer', 'oppContainer', 'stadium'];

/**
 * The record of the card drawn on top of `instanceId`'s stack: an evolved Pokémon's id is its
 * Basic's, but the evolution on top is what fights (M Gardevoir-EX, not the Ralts under it).
 */
const shownRecord = (instanceId, registry) =>
  visibleStackRecord(registry, instanceId) || registry.get(instanceId) || null;

/** The shown card's data, or null. */
const combatCard = (instanceId, registry) => shownRecord(instanceId, registry)?.card || null;

/** Live rect, else the pre-diff snapshot (a KO'd card is already gone). */
const combatRect = (instanceId, registry) =>
  rectForInstance(shownRecord(instanceId, registry)?.instanceId ?? instanceId, registry) ||
  peekCombatOrigin(instanceId)?.rect ||
  null;

const combatSrc = (instanceId, registry) => {
  const element = shownRecord(instanceId, registry)?.element;
  return element?.currentSrc || element?.src || peekCombatOrigin(instanceId)?.src || null;
};

// When the last attack scene ends (performance.now clock); its queue hold ends earlier, at contact.
let attackSceneEnd = 0;
const markAttackScene = (durationMs) => {
  attackSceneEnd = performance.now() + durationMs;
};

/** When the last attack scene ends, on the `performance.now()` clock (0 before any attack). */
export const attackSceneEndsAt = () => attackSceneEnd;

/** Design 063: a move scene announces its own contact moment (ms from now) with its context. */
export const announceStrike = (ms, ctx = null) => impacts.strikeIn(ms, ctx);

// Design 069: each attack's contact (performance.now clock) and context, by its strike key — the
// `attackExecuted` event its plans share (advisory-animations `attackStrikes`). The queue holds an
// attack until contact, so its damage and knockout plans arrive after the impact queue flushed;
// they find the attack's context here instead.
const strikes = new WeakMap();

const strikeOf = (plan) => (plan?.strike && typeof plan.strike === 'object' ? strikes.get(plan.strike) : undefined);

/** Announce a contact for the impact queue, and under `key` for the hits that arrive after it. */
const announceFor = (key) => (ms, ctx = null) => {
  if (key && typeof key === 'object') strikes.set(key, { ctx, contactAt: performance.now() + ms });
  impacts.strikeIn(ms, ctx);
};

/**
 * Design 069: run `job(ctx)` when `plan`'s hit lands — at its attack's contact plus its ripple
 * delay — with that attack's context. Without a known attack it runs when the current batch's
 * attack connects (the impact queue), as every hit did before.
 */
export const afterHit = (plan, job) =>
  impacts.add((queued) => {
    const strike = strikeOf(plan);
    const ctx = strike?.ctx ?? queued ?? null;
    const wait = hitWaitMs(strike?.contactAt ?? null, hitDelayFor(ctx, plan?.instanceId), performance.now());
    if (wait > 0) setTimeout(() => job(ctx), wait);
    else job(ctx);
  });

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

// Design 063: the attacking move's family decides what the hit adds (`hitDressingFor`).
const strikeTarget = (rect, hit, ctx, dressing) => {
  const rgb = hitRgbFor(ctx, hit);
  const direction = ctx?.direction ?? -90;
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-hit' });
  host.style.setProperty('--fx-hit-rgb', rgb.join(', '));

  const flash = document.createElement('div');
  flash.className = 'fx-hit__flash';
  if (dressing.flashScale !== 1) flash.style.transform = `scale(${dressing.flashScale})`;
  const slash = document.createElement('div');
  slash.className = 'fx-hit__slash';
  slash.style.rotate = `${direction + 90 + (Math.random() - 0.5) * 30}deg`;
  const sparkLayer = document.createElement('div');
  sparkLayer.className = 'fx-hit__sparks';
  host.append(flash, sparkLayer);
  if (dressing.slash) host.insertBefore(slash, sparkLayer);
  const impactRing = dressing.ring ? document.createElement('div') : null;
  if (impactRing) {
    impactRing.className = 'fx-hit__ring';
    host.appendChild(impactRing);
  }

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
  const ringFrames = [
    { transform: 'scale(0.6)', opacity: 1 },
    { transform: 'scale(1.4)', opacity: 0 },
  ];
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
    ...(dressing.slash ? [animateFrames(slash, slashFrames, { duration: HIT_FLASH_MS })] : []),
    ...(impactRing ? [animateFrames(impactRing, ringFrames, { duration: HIT_FLASH_MS })] : []),
    ...spawnParticles(sparkLayer, sparks, {
      className: 'fx-particle--streak',
      color: rgbCss(rgb),
      duration: HIT_SPARKS_MS,
    }),
  ];
  removeWhen(host, done, HIT_SPARKS_MS + BACKSTOP_PAD_MS);
};

/**
 * Design 068: the TCG Live impact prefab an attack's hits play, or null while its assets are
 * still loading — that attack keeps today's dressing, and the load goes on for the next one.
 */
const readyImpactType = (card, vgType) => {
  const type = impactTypeFor(card, vgType);
  prepareImpact(type);
  return impactReady(type) ? type : null;
};

const WARMUP_DELAY_MS = 600;
let warmupInstalled = false;

/**
 * Design 068: once the board settles, load the impact prefabs of both Active Pokémon's printed
 * types, so the first hit of a game already has its prefab. Safe to call more than once.
 */
export function installImpactWarmup() {
  if (warmupInstalled || typeof document === 'undefined') return;
  warmupInstalled = true;
  let timer = 0;
  const warm = () => {
    const registry = getCardRegistry();
    for (const user of ['self', 'opp']) {
      for (const id of zoneCardIds(registry, user, 'active')) {
        const card = combatCard(id, registry);
        if (card) prepareImpact(impactTypeFor(card));
      }
    }
  };
  document.addEventListener('board-view-applied', () => {
    clearTimeout(timer);
    timer = setTimeout(warm, WARMUP_DELAY_MS);
  });
}

/** Design 068: what the prefab needs of a damaged card, read while the card is still on the board. */
const impactTargetFor = (instanceId, rect, hit, registry) => {
  const record = shownRecord(instanceId, registry);
  const benched = [...zoneCardIds(registry, 'self', 'bench'), ...zoneCardIds(registry, 'opp', 'bench')];
  return {
    rect,
    // The game plays the condensed (`_C`) prefab on a Bench card.
    bench: benched.includes(instanceId) || benched.includes(record?.instanceId),
    turn: frameTurnOf(record?.element || null),
    cardSrc: combatSrc(instanceId, registry),
    seed: hashString(`${instanceId}|${hit.amount}|impact`),
  };
};

/**
 * Design 068: play the prefab on a hit card; false when the attack's scene did not make room
 * for it, or when it could not play — the caller then shows today's dressing.
 */
const playImpactPrefab = (ctx, target, hit) => {
  if (!ctx?.impactType) return false;
  try {
    return Boolean(playImpact({ type: ctx.impactType, variant: impactVariant(hit.amount, target.bench), ...target }));
  } catch (error) {
    console.debug('impact prefab failed', ctx.impactType, error);
    return false;
  }
};

/**
 * Design 068: the scene leaves its contact dressing to the prefab only when its defender takes
 * a hit. A status move by name keeps its own. Design 069: the defender is the attack's primary
 * hit, so a Bench snipe's target counts.
 */
const sceneSpecFor = (spec, impactType, defenderHit) => (impactType && defenderHit ? withoutImpactBeats(spec) : spec);

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

/**
 * Design 069: knock a card the attack reached after its main target back from the attacker
 * (WAAPI `translate`, added onto whatever the card already plays).
 */
const recoilCard = (instanceId, rect, ctx, registry) => {
  const element = shownRecord(instanceId, registry)?.element;
  if (!element?.isConnected || typeof element.animate !== 'function') return;
  const push = recoilVector(ctx?.attackerRect, rect, frameTurnOf(element), element.offsetHeight || rect.height);
  if (!push) return;
  const frames = sampleKeyframes(
    hitRecoilPose,
    (p) => ({ translate: `${(push.x * p.along).toFixed(2)}px ${(push.y * p.along).toFixed(2)}px` }),
    16
  );
  try {
    element.animate(frames, { duration: HIT_RECOIL_MS, composite: 'add' });
  } catch (error) {
    console.debug('hit recoil failed', error);
  }
};

/** A ripple hit's sparks and slash fly from the attacker to this card, not along the main lane. */
const hitContextFor = (ctx, rect) =>
  ctx?.attackerRect ? { ...ctx, direction: attackAngleDeg(ctx.attackerRect, rect) } : ctx;

export const damage = (plan) => {
  const hit = classifyHitOnce(plan);
  if (!hit) return 0;
  const registry = getCardRegistry();
  const rect = combatRect(plan.instanceId, registry);
  if (!rect) return 0;
  const target = impactTargetFor(plan.instanceId, rect, hit, registry);
  // Design 069: every hit of a multi-target attack lands on that attack's clock, so none holds
  // the FX queue — a held primary would dispatch the ripple hits after their own times.
  const ripple = Object.keys(strikeOf(plan)?.ctx?.hitDelays ?? {}).length > 0;
  afterHit(plan, (strikeCtx) => {
    const secondary = hitDelayFor(strikeCtx, plan.instanceId) > 0;
    const ctx = secondary ? hitContextFor(strikeCtx, rect) : strikeCtx;
    showDamageNumber(plan.instanceId, rect, hit);
    if (hit.kind !== 'hit') return;
    const dressing = hitDressingFor(ctx?.family);
    if (!playImpactPrefab(ctx, target, hit)) strikeTarget(rect, hit, ctx, dressing);
    shakeTable(hit.amount * dressing.shakeMul);
    if (secondary) recoilCard(plan.instanceId, rect, ctx, registry);
  });
  return ripple ? 0 : undefined;
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

const isZeroDamage = (plan) => plan.damage === 0 && !(plan.benchDealt > 0);

/** The move an attack plays: pure, so `soundPlanFor` and `attack` agree on it. */
const pickMove = (plan, card) =>
  card
    ? moveFor(
        card,
        {
          instanceId: plan.attackerId,
          attackName: plan.attackName,
          species: speciesFor(card),
          damage: plan.damage,
          benchDealt: plan.benchDealt,
        },
        SPECS
      )
    : null;

/**
 * Design 065: the signature move this attack plays (name match, else the legendary's strongest
 * attack), with the card's material; null when none or its spec has not shipped. Pure.
 */
const pickSignature = (plan, card) => {
  if (!card) return null;
  const sig = signatureFor(card, {
    attackName: plan.attackName,
    slug: slugFor(card),
    seed: hashString(`${plan.attackerId}|${plan.attackName}|${plan.damage}`),
  });
  return withSignatureSpec(sig, SIGNATURE_SPECS);
};

/**
 * What the attack's sound needs (design 064 Addendum A): sound family, tier, contact time and the
 * attacker's type, from the same signature / move picks `attack()` makes.
 */
export const attackSoundFor = (plan) => {
  const card = combatCard(plan.attackerId, getCardRegistry());
  const signatureSpec = pickSignature(plan, card)?.spec ?? null;
  const zeroDamage = isZeroDamage(plan);
  const pick = signatureSpec || zeroDamage ? null : pickMove(plan, card);
  return attackSoundFields({ signatureSpec, zeroDamage, pick, card });
};

/** The opponent's Active card id (the target when the plan names no defender), else null. */
const opponentActiveId = (user, registry) => {
  const opponent = user === 'self' ? 'opp' : user === 'opp' ? 'self' : null;
  if (!opponent) return null;
  return zoneCardIds(registry, opponent, 'active').find((id) => combatRect(id, registry)) ?? null;
};

// Design 063: a zero-damage attack has nothing to hit; a type-coloured pulse hugs the attacker.
const playAuraPulse = (rect, rgb) => {
  const host = spawnOverlay({ rect, className: 'fx-overlay fx-aura-pulse' });
  host.style.setProperty('--fx-aura-rgb', rgb.join(', '));
  const ring = document.createElement('div');
  ring.className = 'fx-aura-pulse__ring';
  host.appendChild(ring);
  const frames = sampleKeyframes(auraPulsePose, (p) => ({ transform: `scale(${p.scale})`, opacity: p.opacity }), 16);
  removeWhen(host, [animateFrames(ring, frames, { duration: AURA_PULSE_MS })], AURA_PULSE_MS + BACKSTOP_PAD_MS);
};

const moveSide = (instanceId, rect, src, registry) => {
  const element = shownRecord(instanceId, registry)?.element || null;
  return { rect, src, turn: frameTurnOf(element), element };
};

/** The generic lunge: the attacker's ghost rears back, strikes the defender and recoils. */
const playLunge = (plan, registry, card, from, to, src, hits) => {
  const pose = lungePoseFor(from, to);
  if (!pose) return 0;
  const contactMs = LUNGE_MS * LUNGE_IMPACT;
  markAttackScene(Math.max(LUNGE_MS, hits.rippleEndMs(contactMs)));
  announceFor(plan.strike)(contactMs, {
    direction: attackAngleDeg(from, to),
    attackerCard: card,
    impactType: readyImpactType(card, null),
    ...hits.strikeContext,
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
  hideDuring(shownRecord(plan.attackerId, registry)?.element, mainDone, LUNGE_MS + BACKSTOP_PAD_MS);
};

/**
 * Design 069: the attack's hits that can be drawn — real hits (not heals) whose card has a rect —
 * as `layoutHits` targets.
 */
const hitTargetsOf = (plan, registry) =>
  (Array.isArray(plan.hits) ? plan.hits : [])
    .map((hit) => ({ hit, read: peekHit(hit), rect: combatRect(hit?.instanceId, registry) }))
    .filter(({ read, rect }) => read?.kind === 'hit' && rect)
    .map(({ hit, read, rect }) => ({
      id: hit.instanceId,
      rect,
      amount: read.amount,
      isDefender: hit.instanceId === plan.defenderId,
    }));

/**
 * Design 069: what the scene needs of the attack's hits: the layout (null when the plan names
 * none), the extra strike context, the branch lanes and when the last ripple hit has played.
 */
const hitsFor = (plan, registry, from) => {
  const layout = layoutHits(hitTargetsOf(plan, registry));
  const secondaries = layout?.secondaries ?? [];
  const lastDelay = Math.max(0, ...secondaries.map((secondary) => secondary.delayMs));
  return {
    layout,
    strikeContext: { attackerRect: from, hitDelays: hitDelaysOf(layout) },
    branches: secondaries
      .filter((secondary) => secondary.lane)
      .map((secondary) => ({ rect: combatRect(secondary.id, registry), delayMs: secondary.delayMs }))
      .filter((branch) => branch.rect),
    rippleEndMs: (contactMs) => (secondaries.length > 0 ? contactMs + lastDelay + HIT_SPARKS_MS : 0),
  };
};

export const attack = (plan) => {
  const registry = getCardRegistry();
  const card = combatCard(plan.attackerId, registry);
  const from = combatRect(plan.attackerId, registry);
  const src = combatSrc(plan.attackerId, registry);
  if (!from || !src) return 0;
  const hits = hitsFor(plan, registry, from);
  // Design 069: the scene plays against the primary hit (a Bench snipe's target, not the Active).
  const defenderId =
    hits.layout?.primaryId ?? (combatRect(plan.defenderId, registry) ? plan.defenderId : opponentActiveId(plan.user, registry));
  const defenderHit = hits.layout ? true : plan.damage > 0;
  const announce = { strikeIn: announceFor(plan.strike) };
  const sceneEnd = (played) => Math.max(played.durationMs, played.branchEndMs || 0, hits.rippleEndMs(played.contactMs));
  const to = defenderId == null ? null : combatRect(defenderId, registry);
  // Design 065: a signature plays before the zero-damage check (a status move by name still plays).
  const sig = to ? pickSignature(plan, card) : null;
  const sigDefenderSrc = sig ? combatSrc(defenderId, registry) : null;
  if (sig && sigDefenderSrc) {
    const impactType = readyImpactType(card, sig.spec.vgType);
    const played = playMove({
      spec: sceneSpecFor(sig.spec, impactType, defenderHit),
      attacker: moveSide(plan.attackerId, from, src, registry),
      defender: moveSide(defenderId, to, sigDefenderSrc, registry),
      seed: hashString(`${plan.attackerId}|${plan.attackName}|${plan.damage}`),
      impacts: announce,
      attackerCard: card,
      strikeContext: { impactType, ...hits.strikeContext },
      branches: hits.branches,
    });
    if (played) {
      markAttackScene(sceneEnd(played));
      return played.holdMs;
    }
  }
  if ((isZeroDamage(plan) && !hits.layout) || !to) {
    markAttackScene(AURA_PULSE_MS);
    playAuraPulse(from, card ? brighten(fxRgbForCard(card), 0.3) : FX_NEUTRAL_RGB);
    return;
  }

  const pick = pickMove(plan, card);
  const defenderSrc = combatSrc(defenderId, registry);
  if (pick?.score && defenderSrc) {
    const impactType = readyImpactType(card, pick.vgType);
    const played = playMove({
      spec: sceneSpecFor(pick.score, impactType, defenderHit),
      attacker: moveSide(plan.attackerId, from, src, registry),
      defender: moveSide(defenderId, to, defenderSrc, registry),
      seed: hashString(`${plan.attackerId}|${plan.attackName}|${plan.damage}`),
      impacts: announce,
      attackerCard: card,
      strikeContext: { impactType, ...hits.strikeContext },
      branches: hits.branches,
    });
    if (played) {
      markAttackScene(sceneEnd(played));
      return played.holdMs;
    }
  }
  return playLunge(plan, registry, card, from, to, src, hits);
};

const MAX_TARGET_RINGS = 6;

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
  const attacker = combatCard(plan.attackerId, registry);
  const attackerName = attacker?.name;
  // Design 068: the banner leads the hit by its hold; start loading the impact it will play.
  if (attacker) prepareImpact(impactTypeFor(attacker, pickSignature(plan, attacker)?.spec.vgType ?? pickMove(plan, attacker)?.vgType ?? null));
  const text = attackBannerText(plan.attackName, attackerName);
  if (!text) return 0;
  playBanner(text, plan.user, 'attack');
  // Design 069: every card the attack damages is marked, not only the Active.
  const hitRects = hitTargetsOf(plan, registry).slice(0, MAX_TARGET_RINGS).map((target) => target.rect);
  if (hitRects.length > 0) {
    hitRects.forEach(showTargetRing);
    return;
  }
  // A fizzled attack has no defender; the banner still plays, there is just nothing to ring (edge 9).
  const defenderRect = rectForInstance(shownRecord(plan.defenderId, registry)?.instanceId ?? plan.defenderId, registry);
  if (defenderRect) showTargetRing(defenderRect);
};
