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
      budget,
    });

    if (result.pendingChoice) {
      draft.pendingChoice = result.pendingChoice;
      return result;
    }

    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  // Mark ability used for card and turn flags
  card.abilityUsed = true;
  if (!player.flags) player.flags = {};
  if (!player.flags.abilitiesUsed) player.flags.abilitiesUsed = {};
  player.flags.abilitiesUsed[card.name || card.instanceId] = true;

  events.push({
    type: 'abilityUsed',
    instanceId: card.instanceId,
    name: card.name,
    playerId,
  });

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
    draft.pendingChoice = result.pendingChoice;
    return result;
  }

  draft.pendingChoice = null;
  return { pendingChoice: null, completed: true };
}
