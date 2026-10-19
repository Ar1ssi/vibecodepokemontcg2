// Design 009 slice 5: thin DOM caller for advisoryAnimationPlan (pure plan in
// advisory-animations.mjs). Wired as the `onAdvisoryEvent` handler on
// `applyView` in socket-event-listeners.js, so both players — originator
// included — animate from the SAME server event: one source, no double-play.
import { systemState } from '../../state.js';
import { fxSettleHoldMs } from '../board3d/board-rects.js';
import { rulesState } from '../../../../shared/engine/rules/rules-state.mjs';
import {
  advisoryAnimationPlan,
  attackLeads,
  coinFlipRuns,
  deckShuffles,
  attackHitIds,
  attackStrikes,
  deckRevealRuns,
  effectKnockoutIds,
  drawnCards,
  strikeKnockouts,
  supersededDeals,
} from './advisory-animations.mjs';
import {
  getAuthoritativeDeckCount,
  getAuthoritativeZoneArray,
  getCardRegistry,
} from './apply-view.js';
import { shouldAnimateMirror } from '../image-logic/draw-flight-predicate.mjs';
import { playShuffleFlight } from '../image-logic/shuffle-flight.js';
import { hideForFlight, playDrawBatch, showAfterFlight, takePrizeHandoff } from '../image-logic/draw-flight.js';
import { captureKnockoutGhost, playKnockoutGhost } from '../image-logic/knockout-flight.js';
import { fxDisabled, motionReduced } from '../image-logic/mat-fx.mjs';
import { onFxSettingsChanged } from '../image-logic/fx-settings.js';
import { playFx } from './mat-fx/index.js';
import { pinKnockoutOrigins, pinSlideOrigins, releaseSlidePins } from './mat-fx/lifecycle.js';
import { afterHit, attackSceneEndsAt, knockoutHoldFor } from './mat-fx/combat.js';
import { seedDamageBaselines } from './mat-fx/damage-hit.mjs';
import { playDeckReveal } from './mat-fx/deck-reveal.js';
import { playFxSound } from './mat-fx/fx-audio.js';
import { createFxQueue } from './mat-fx/fx-queue.mjs';
import { holdFor, turnBannerLead } from './mat-fx/fx-holds.mjs';
import { drawSceneHold } from './mat-fx/draw-scene.mjs';
import { flightSrcOf } from './mat-fx/card-flight.mjs';
import { captureOrigins, discardOrigins, knockoutStack } from './mat-fx/origins.mjs';

// instanceId -> ghost, captured by handleBeforeApply (card still on board)
// and consumed by handleAdvisoryEvent's 'knockout' branch (card already
// gone from the DOM diff by then). Edge case 17: capture failure just means
// no entry lands here, so the plan's lookup falls through to a no-op.
const pendingKnockoutGhosts = new Map();

const sideFor = (user) => (user === 'self' ? 'you' : 'them');

const shuffleZoneCount = (user, zoneId) => {
  const side = sideFor(user);
  return zoneId === 'deck'
    ? getAuthoritativeDeckCount(side)
    : getAuthoritativeZoneArray(side, zoneId).length;
};

// Deals a later mulligan replaced in the batch being applied (design 044).
let skippedDeals = new Set();
// Revealed by this if their plan never runs (the queue was cleared). Covers the
// opening coin ceremony the opening deal waits behind (holdFxQueue).
const HELD_DRAW_BACKSTOP_MS = 9000;
// Design 045: where each taken prize sat before the diff moved it to the hand.
let prizeSeats = new Map();
// Coin flips of the batch being applied, merged into one ceremony per run.
let coinRuns = new Map();
// The batch's deck shuffles that animate, each mapped to its sound (deckShuffles).
let shuffleSounds = new Map();
// Design 059: each player's deck → hand reveals in the batch, keyed by the reveal that plays them.
let revealRuns = new Map();
// Design 064: the batch being applied arrived before the opening Active placement finished.
let batchInSetup = false;
// Design 064: the batch's knockouts no damage caused.
let effectKnockouts = new Set();
// The batch's attacks, keyed by the first hit each one plays ahead of (attackLeads).
let leadingAttacks = new Map();
let movedAttacks = new Set();
// Design 069: the cards each of the batch's attacks damaged (attackHitIds).
let attackHits = new Map();
// Design 069: the attack each of the batch's attacks, damages and knockouts belongs to.
let strikesOf = new Map();
// Design 069: each attack's knockouts, moved after its last damage (strikeKnockouts).
let strikeKos = { after: new Map(), moved: new Set(), notLast: new Set() };

// Design 069: each damaged card's total before this batch, from its counter on the board (no
// counter = 0). Read before the diff applies the new totals.
const damageBaselinesBefore = (events, registry) =>
  events
    .filter((event) => event?.type === 'damageUpdated' && event.instanceId != null)
    .map((event) => ({ event, element: registry.get(event.instanceId)?.element }))
    .filter(({ element }) => element)
    .map(({ event, element }) => ({ instanceId: event.instanceId, damage: Number(element.dataset?.damage ?? 0) }));

const capturePrizeSeats = (events, registry, selfPlayerId) => {
  prizeSeats = new Map();
  for (const event of events) {
    if (event?.type !== 'prizesTaken' && event?.type !== 'prizeTaken') continue;
    const user = event.playerId === selfPlayerId ? 'self' : 'opp';
    for (const { instanceId } of drawnCards(event.cards)) {
      const element = registry.get(instanceId)?.element;
      const ghost = element && captureKnockoutGhost(user, element);
      if (ghost) prizeSeats.set(instanceId, { rect: ghost.rect, turn: ghost.turn || 0 });
    }
  }
};

// A taken prize starts at its fan sleeve, else where it sat on the mat.
const prizeStartOf = (instanceId) => {
  const seat = prizeSeats.get(instanceId) || null;
  prizeSeats.delete(instanceId);
  return takePrizeHandoff(instanceId) || seat;
};

/**
 * Design 044: the drawn cards are in the hand as soon as the view applies.
 * Hide them now, so they do not show while earlier effects play; they fly in
 * when their plan runs. Cards no longer in the hand (a mulligan put them back)
 * are left out.
 */
const holdDrawnCards = (plan) => {
  const registry = getCardRegistry();
  const drawn = [];
  for (const { instanceId } of plan.cards) {
    const record = registry.get(instanceId);
    if (!record?.element?.isConnected || record.zone !== 'hand') continue;
    drawn.push({
      image: record.element,
      wrapper: record.holoCard?.wrapper,
      redacted: !!record.isRedacted,
      from: plan.source === 'prizes' ? prizeStartOf(instanceId) : null,
    });
  }
  drawn.forEach(hideForFlight);
  const backstop = setTimeout(() => {
    for (const card of drawn) {
      card.from?.release?.();
      showAfterFlight(card);
    }
  }, HELD_DRAW_BACKSTOP_MS);
  return { ...plan, drawn, backstop };
};

// Your own draw holds the queue for its scene; the opponent's flies alongside.
const playDrawPlan = (plan) => {
  clearTimeout(plan.backstop);
  const played = playDrawBatch(plan.user, plan.drawn || []);
  return plan.user === 'self' ? drawSceneHold(played) : 0;
};

// Design 059: the reveal is a mat effect like the Trainer preview it reuses, so it
// is skipped with effects off or reduced motion and the cards simply show.
const revealSceneAllowed = () => !fxDisabled() && !motionReduced();

/**
 * Design 059: the revealed cards are in the hand as soon as the view applies. Hide
 * them now, so they do not show while earlier effects play; they fly in when their
 * plan runs. A card no longer in the hand is left out. The art is the event's
 * (the opponent's hand shows only their sleeve), else the card's own face.
 */
const holdRevealedCards = (plan) => {
  const registry = getCardRegistry();
  const held = [];
  for (const { instanceId, src } of plan.cards) {
    const record = registry.get(instanceId);
    if (!record?.element?.isConnected || record.zone !== 'hand') continue;
    const redacted = !!record.isRedacted;
    const ownFace = redacted ? null : record.element.currentSrc || record.element.src || null;
    held.push({ image: record.element, wrapper: record.holoCard?.wrapper, redacted, faceSrc: src || ownFace });
  }
  if (!revealSceneAllowed()) return { ...plan, held };
  held.forEach(hideForFlight);
  const backstop = setTimeout(() => held.forEach(showAfterFlight), HELD_DRAW_BACKSTOP_MS);
  return { ...plan, held, backstop };
};

// Sound for a plan that never reaches the fx dispatcher. Audio is best-effort: it never breaks the plan.
const soundPlan = (plan) => {
  try {
    playFxSound(plan);
  } catch (err) {
    console.warn(`[mat-fx] ${plan.effect} sound failed`, err);
  }
};

const playRevealSound = (user) => soundPlan({ effect: 'deck-reveal', user });

// Sound follows the dispatcher's rule: off with effects off, on under reduced motion;
// with the scene it plays as the cards leave the deck.
const playRevealPlan = (plan) => {
  clearTimeout(plan.backstop);
  const held = plan.held || [];
  if (held.length === 0 || fxDisabled()) {
    held.forEach(showAfterFlight);
    return 0;
  }
  if (motionReduced()) {
    playRevealSound(plan.user);
    held.forEach(showAfterFlight);
    return 0;
  }
  held.forEach(hideForFlight);
  try {
    return playDeckReveal(plan.user, held, showAfterFlight, { onStart: () => playRevealSound(plan.user) });
  } catch (err) {
    console.warn('[mat-fx] deck-reveal failed', err);
    held.forEach(showAfterFlight);
    return 0;
  }
};

/**
 * Called by apply-view.js's `onBeforeApply` hook, BEFORE the DOM diff removes
 * any knocked-out card. Captures a ghost snapshot (rect + image src) for each
 * `pokemonKnockedOut` event while the real card element still exists, keyed
 * by instanceId for `handleAdvisoryEvent`'s later 'knockout' branch to find.
 *
 * @param {object[]} events
 * @param {string|null} selfPlayerId
 */
export function handleBeforeApply(events, selfPlayerId) {
  skippedDeals = supersededDeals(events);
  coinRuns = coinFlipRuns(events);
  shuffleSounds = deckShuffles(events);
  revealRuns = deckRevealRuns(events);
  batchInSetup = !rulesState.startingActiveDone;
  effectKnockouts = effectKnockoutIds(events);
  leadingAttacks = attackLeads(events);
  movedAttacks = new Set(leadingAttacks.values());
  attackHits = attackHitIds(events);
  strikesOf = attackStrikes(events);
  strikeKos = strikeKnockouts(events);
  if (!Array.isArray(events) || selfPlayerId == null) return;
  // Design 074 §D6: on the 3D board the batch's effects start once its moved cards have landed.
  holdFxQueue(fxSettleHoldMs(events));
  const registry = getCardRegistry();
  seedDamageBaselines(damageBaselinesBefore(events, registry));
  capturePrizeSeats(events, registry, selfPlayerId);
  for (const event of events) {
    if (!event || event.type !== 'pokemonKnockedOut' || event.instanceId == null) continue;
    // Design 042: the card drawn on top (an evolution sits over its Basic),
    // plus the cards it goes down with, which fan out and fly with it.
    const { shown, rest } = knockoutStack(registry, event.instanceId);
    if (!shown?.element) continue;
    const user = event.playerId === selfPlayerId ? 'self' : 'opp';
    const ghost = captureKnockoutGhost(user, shown.element);
    if (!ghost) continue;
    // The ids let the knockout scene fly each card's own mesh on the 3D board (design 074 H1).
    const attached = rest
      .map((member) => ({ src: flightSrcOf(member.element), instanceId: member.card?.instanceId }))
      .filter((a) => a.src);
    pendingKnockoutGhosts.set(event.instanceId, { ...ghost, attached, instanceId: shown.card?.instanceId });
  }
  if (!fxDisabled() && !motionReduced()) {
    captureOrigins(events, registry, captureKnockoutGhost, (event) =>
      event.playerId === selfPlayerId ? 'self' : 'opp'
    );
    pinSlideOrigins(events, registry);
    pinKnockoutOrigins(events, registry);
    fxQueue.whenIdle().then(releaseSlidePins);
  }
}

/**
 * Plays one plan and returns its choreography hold in ms (design 024). Every
 * plan kind goes through here, not just `fx`, so a batch that mixes a lunge, a
 * damage pop and a knockout still plays in the order the engine emitted it.
 *
 * @param {object} plan
 * @returns {number}
 */
function runPlan(plan) {
  if (plan.kind === 'shuffle') {
    const hold = playShuffleFlight(plan.user, plan.zoneId, shuffleZoneCount(plan.user, plan.zoneId));
    soundPlan({ effect: plan.sound || 'shuffle-flight', user: plan.user });
    return hold;
  }
  if (plan.kind === 'draw') return playDrawPlan(plan);
  if (plan.kind === 'reveal') return playRevealPlan(plan);
  if (plan.kind === 'knockout') {
    const ghost = pendingKnockoutGhosts.get(plan.instanceId);
    pendingKnockoutGhosts.delete(plan.instanceId);
    soundPlan({ effect: 'knockout', user: plan.user, ruleBoxes: plan.ruleBoxes, effectKo: plan.effectKo });
    if (!ghost) return 0;
    // Design 069: a knockout lands on its own card's hit (a ripple hit lands after the contact).
    playKnockoutGhost(ghost, { deferStart: (start) => afterHit(plan, start) });
    return knockoutHoldFor(plan, holdFor('knockout'));
  }
  if (plan.kind === 'fx') return playFx(plan);
  if (plan.kind === 'wait') return plan.ms;
  return 0;
}

// Cosmetic only: board state is already applied when plans arrive here, so the
// queue never gates input or rendering. `setTimeout` is injected rather than
// called inside fx-queue.mjs so the queue stays testable on a fake clock.
const fxQueue = createFxQueue({
  run: runPlan,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (id) => clearTimeout(id),
  leadIn: (plan) => turnBannerLead(plan, attackSceneEndsAt(), performance.now()),
});

// Two ways choreography must stop mid-chain (edge 11):
// turning effects off — the dispatcher would skip each remaining plan anyway,
// but the queue would keep ticking timers to do it — and a restart or a player
// leaving, where the plans describe a board that no longer exists.
onFxSettingsChanged((settings) => {
  if (settings.fxOff) fxQueue.clear();
});

if (typeof document !== 'undefined') {
  document.addEventListener('game-restarted', () => fxQueue.clear());
}

/**
 * Holds the FX queue for `ms` while something outside it covers the board (the
 * opening coin ceremony), so the plans that arrive meanwhile — the opening deal —
 * play after it instead of under it.
 *
 * @param {number} ms
 */
export function holdFxQueue(ms) {
  if (!(ms > 0)) return;
  fxQueue.push({ kind: 'wait', ms, blocking: true });
}

/**
 * Resolves once every queued effect has played out its hold (the opening deal, so the
 * Starting Active picker opens after it instead of over it). The backstop keeps a caller
 * that gates input on this from waiting forever.
 *
 * @returns {Promise<void>}
 */
export function whenFxQueueIdle() {
  return new Promise((resolve) => {
    const backstop = setTimeout(resolve, HELD_DRAW_BACKSTOP_MS);
    fxQueue.whenIdle().then(() => {
      clearTimeout(backstop);
      resolve();
    });
  });
}

/**
 * Handles one server advisory event: builds the plan (pure), then — unless
 * catch-up replay or a hidden tab (edge cases 5, 6) — queues the animation.
 * An event may produce several plans (an attack is a banner then a lunge);
 * they are queued in order. An attack is queued ahead of the hits it caused,
 * which the engine emits before it (attackLeads).
 *
 * @param {object} event
 * @param {string|null} selfPlayerId
 */
export function handleAdvisoryEvent(event, selfPlayerId) {
  if (movedAttacks.has(event) || strikeKos.moved.has(event)) return;
  const attack = leadingAttacks.get(event);
  if (attack) queueEvent(attack, selfPlayerId);
  queueEvent(event, selfPlayerId);
  for (const knockout of strikeKos.after.get(event) ?? []) queueEvent(knockout, selfPlayerId);
}

function queueEvent(event, selfPlayerId) {
  if (skippedDeals.has(event)) return;
  const planned = advisoryAnimationPlan(event, selfPlayerId, coinRuns.get(event), {
    shuffleSound: shuffleSounds.get(event),
    revealRun: revealRuns.get(event),
    setup: batchInSetup,
    effectKo: effectKnockouts,
    hits: attackHits.get(event) ?? null,
    strike: strikesOf.get(event) ?? null,
    moreKnockouts: strikeKos.notLast.has(event),
  });
  if (!planned) return;
  const plans = Array.isArray(planned) ? planned : [planned];
  if (plans.length === 0) return;

  if (
    !shouldAnimateMirror({
      syncReplaying: !!systemState.syncReplaying,
      isCatchingUp: !!systemState.isCatchingUp,
      hidden: typeof document !== 'undefined' && !!document.hidden,
    })
  ) {
    for (const plan of plans) {
      if (plan.kind === 'knockout') pendingKnockoutGhosts.delete(plan.instanceId);
    }
    // Once per EVENT: a fanned-out event's plans all share the same origins.
    if (plans.some((plan) => plan.kind === 'fx')) discardOrigins(event);
    fxQueue.clear();
    return;
  }

  for (const plan of plans) fxQueue.push(queuedPlan(plan));
}

// Cards a plan flies into the hand are hidden from the moment it is queued.
const queuedPlan = (plan) => {
  if (plan.kind === 'draw') return holdDrawnCards(plan);
  if (plan.kind === 'reveal') return holdRevealedCards(plan);
  return plan;
};
