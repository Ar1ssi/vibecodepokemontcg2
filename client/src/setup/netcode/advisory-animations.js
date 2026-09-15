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
}

/**
 * Handles one server advisory event: builds the plan (pure), then — unless
 * catch-up replay or a hidden tab (edge cases 5, 6) — plays the animation.
 *
 * @param {object} event
 * @param {string|null} selfPlayerId
 */
export function handleAdvisoryEvent(event, selfPlayerId) {
  const plan = advisoryAnimationPlan(event, selfPlayerId);
  if (!plan) return;
  if (
    !shouldAnimateMirror({
      syncReplaying: !!systemState.syncReplaying,
      isCatchingUp: !!systemState.isCatchingUp,
      hidden: typeof document !== 'undefined' && !!document.hidden,
    })
  ) {
    if (plan.kind === 'knockout') pendingKnockoutGhosts.delete(plan.instanceId);
    return;
  }

  if (plan.kind === 'shuffle') {
    playShuffleFlight(plan.user, plan.zoneId, shuffleZoneCount(plan.user, plan.zoneId));
  } else if (plan.kind === 'draw') {
    playDrawPlan(plan);
  } else if (plan.kind === 'knockout') {
    const ghost = pendingKnockoutGhosts.get(plan.instanceId);
    pendingKnockoutGhosts.delete(plan.instanceId);
    if (ghost) playKnockoutGhost(ghost);
  }
}
