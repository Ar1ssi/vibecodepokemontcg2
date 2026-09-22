/**
 * @file Resumable Pokémon ability executor for server-authoritative netcode (Slice 6).
 * Handles activated once-per-turn abilities, step planning, and choice resumption.
 */

import { parseAbility } from '../rules/abilities.mjs';
import { planAbilitySteps } from '../rules/ability-step-plan.mjs';
import { executeSteps } from './executor.mjs';

/**
 * Executes a Pokemon ability or resumes a suspended ability choice.
 *
 * @param {object} draft Cloned GameState
 * @param {object} params
 * @param {object} params.card
 * @param {number} [params.abilityIndex=0]
 * @param {string} params.playerId
 * @param {object} params.activeRng
 * @param {Array} [params.events=[]]
 * @param {Array<number>|null} [params.selection=null]
 * @param {object|null} [params.resumeToken=null]
 * @returns {{ pendingChoice: object|null, completed: boolean }}
 */
export function executeAbility(draft, {
  card,
  abilityIndex = 0,
  playerId,
  activeRng,
  events = [],
  selection = null,
  resumeToken = null,
}) {
  const actingPlayerId = resumeToken?.initiatorPlayerId || playerId;
  const player = draft.players[actingPlayerId];
  if (!player) return { pendingChoice: null, completed: true };

  if (resumeToken) {
    // Resuming suspended ability step
    const steps = resumeToken.steps || [];
    const stepIndex = resumeToken.stepIndex || 0;
    const budget = { count: resumeToken.budgetCount || 0 };

    const result = executeSteps(draft, {
      steps,
      fromStepIndex: stepIndex,
      effectType: 'ability',
      sourceCard: card,
      playerId: actingPlayerId,
      activeRng,
      events,
      selection,
      context: resumeToken?.context || {},
      budget,
    });

    if (result.pendingChoice) {
      draft.pendingChoice = result.pendingChoice;
      return result;
    }

    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  // Do not spend the once-per-turn ability before we know it has anything to do:
  // `actionableSteps.length === 0` means the parser found only non-interactive
  // steps, and an all-`effectStepSkipped` completion means the effect's own
  // precondition failed (no damaged Pokémon to heal, empty Bench to switch).
  // Marking up front consumed the ability with no effect and locked out a retry.
  const markUsed = () => {
    card.abilityUsed = true;
    if (!player.flags) player.flags = {};
    if (!player.flags.abilitiesUsed) player.flags.abilitiesUsed = {};
    // instanceId first: two Pokémon sharing a name must not share one used-flag
    // slot, or using one blocks the other's separate ability (I48).
    player.flags.abilitiesUsed[card.instanceId != null ? card.instanceId : card.name] = true;
    events.push({
      type: 'abilityUsed',
      instanceId: card.instanceId,
      name: card.name,
      playerId,
    });
  };

  // Parse and plan ability steps
  const ability = card.abilities?.[abilityIndex];
  const text = typeof ability === 'string'
    ? ability
    : ability?.text || card.abilityText || card.text || card.effect || '';
  const parsedSteps = parseAbility(text);
  const steps = Array.isArray(parsedSteps) ? parsedSteps : (parsedSteps?.steps || []);
  const planned = planAbilitySteps(steps, { mode: 'interactive' });
  const actionableSteps = planned
    .filter((p) => p.action !== 'skip')
    .map((p) => p.step);

  if (actionableSteps.length === 0) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  const eventsBefore = events.length;
  const result = executeSteps(draft, {
    steps: actionableSteps,
    fromStepIndex: 0,
    effectType: 'ability',
    sourceCard: card,
    playerId,
    activeRng,
    events,
  });

  if (result.pendingChoice) {
    // The ability is in progress (choice pending); it counts as used so a second
    // command cannot start it again while the choice is outstanding.
    markUsed();
    draft.pendingChoice = result.pendingChoice;
    return result;
  }

  const newEvents = events.slice(eventsBefore);
  const skippedOnly =
    newEvents.length > 0 &&
    newEvents.every(
      (e) => e.type === 'effectStepSkipped' || e.type === 'effectLoopAborted'
    );
  if (!skippedOnly) markUsed();

  draft.pendingChoice = null;
  return { pendingChoice: null, completed: true };
}
