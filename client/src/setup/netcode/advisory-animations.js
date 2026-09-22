// Design 009 slice 5: thin DOM caller for advisoryAnimationPlan (pure plan in
// advisory-animations.mjs). Wired as the `onAdvisoryEvent` handler on
// `applyView` in socket-event-listeners.js, so both players — originator
// included — animate from the SAME server event: one source, no double-play.
import { systemState } from '../../state.js';
import { advisoryAnimationPlan } from './advisory-animations.mjs';
import {
  getAuthoritativeDeckCount,
  getAuthoritativeZoneArray,
  getCardRegistry,
} from './apply-view.js';
import { shouldAnimateMirror } from '../image-logic/draw-flight-predicate.mjs';
import { playShuffleFlight } from '../image-logic/shuffle-flight.js';
import { playDrawToHand } from '../image-logic/draw-flight.js';
import { captureKnockoutGhost, playKnockoutGhost } from '../image-logic/knockout-flight.js';
import { fxDisabled, motionReduced } from '../image-logic/mat-fx.mjs';
import { onFxSettingsChanged } from '../image-logic/fx-settings.js';
import { playFx } from './mat-fx/index.js';
import { createFxQueue } from './mat-fx/fx-queue.mjs';
import { holdFor } from './mat-fx/fx-holds.mjs';
import { captureOrigins, discardOrigins } from './mat-fx/origins.mjs';

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

const playDrawPlan = (plan) => {
  const registry = getCardRegistry();
  for (const { instanceId } of plan.cards) {
    const record = registry.get(instanceId);
    if (!record?.element) continue;
    playDrawToHand(plan.user, { image: record.element });
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
  if (!Array.isArray(events) || selfPlayerId == null) return;
  const registry = getCardRegistry();
  for (const event of events) {
    if (!event || event.type !== 'pokemonKnockedOut' || event.instanceId == null) continue;
    const record = registry.get(event.instanceId);
    if (!record?.element) continue;
    const user = event.playerId === selfPlayerId ? 'self' : 'opp';
    const ghost = captureKnockoutGhost(user, record.element);
    if (ghost) pendingKnockoutGhosts.set(event.instanceId, ghost);
  }
  if (!fxDisabled() && !motionReduced()) {
    captureOrigins(events, registry, captureKnockoutGhost, (event) =>
      event.playerId === selfPlayerId ? 'self' : 'opp'
    );
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
    playShuffleFlight(plan.user, plan.zoneId, shuffleZoneCount(plan.user, plan.zoneId));
    return 0;
  }
  if (plan.kind === 'draw') {
    playDrawPlan(plan);
    return 0;
  }
  if (plan.kind === 'knockout') {
    const ghost = pendingKnockoutGhosts.get(plan.instanceId);
    pendingKnockoutGhosts.delete(plan.instanceId);
    if (!ghost) return 0;
    playKnockoutGhost(ghost);
    return holdFor('knockout');
  }
  if (plan.kind === 'fx') return playFx(plan);
  return 0;
}

// Cosmetic only: board state is already applied when plans arrive here, so the
// queue never gates input or rendering. `setTimeout` is injected rather than
// called inside fx-queue.mjs so the queue stays testable on a fake clock.
const fxQueue = createFxQueue({
  run: runPlan,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (id) => clearTimeout(id),
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
 * Handles one server advisory event: builds the plan (pure), then — unless
 * catch-up replay or a hidden tab (edge cases 5, 6) — queues the animation.
 * An event may produce several plans (an attack is a banner then a lunge);
 * they are queued in order.
 *
 * @param {object} event
 * @param {string|null} selfPlayerId
 */
export function handleAdvisoryEvent(event, selfPlayerId) {
  const planned = advisoryAnimationPlan(event, selfPlayerId);
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

  for (const plan of plans) fxQueue.push(plan);
}
