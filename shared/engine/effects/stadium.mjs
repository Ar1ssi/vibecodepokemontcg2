/**
 * @file Resumable Stadium card executor for server-authoritative netcode (Slice 6).
 * Manages once-per-turn stadium activation, effect steps, and choice resumption.
 */

import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { parseStadiumOncePerTurn } from '../rules/stadium-effects.mjs';
import { executeSteps } from './executor.mjs';

/**
 * Executes the active stadium effect or resumes a suspended stadium choice.
 *
 * @param {object} draft Cloned GameState
 * @param {object} params
 * @param {string} params.playerId
 * @param {object} params.activeRng
 * @param {Array} [params.events=[]]
 * @param {Array<number>|null} [params.selection=null]
 * @param {object|null} [params.resumeToken=null]
 * @returns {{ pendingChoice: object|null, completed: boolean }}
 */
export function executeStadium(draft, {
  playerId,
  activeRng,
  events = [],
  selection = null,
  resumeToken = null,
}) {
  const actingPlayerId = resumeToken?.initiatorPlayerId || playerId;
  const player = draft.players[actingPlayerId];
  if (!player || !draft.stadium) return { pendingChoice: null, completed: true };

  const stadium = draft.stadium;

  if (resumeToken) {
    // Resuming suspended stadium step
    const steps = resumeToken.steps || [];
    const stepIndex = resumeToken.stepIndex || 0;
    const budget = { count: resumeToken.budgetCount || 0 };

    const result = executeSteps(draft, {
      steps,
      fromStepIndex: stepIndex,
      effectType: 'stadium',
      sourceCard: stadium,
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

  // Mark stadium used for this player's turn
  if (!player.flags) player.flags = {};
  player.flags.stadiumUsedThisTurn = true;

  events.push({
    type: 'stadiumEffectUsed',
    instanceId: stadium.instanceId,
    name: stadium.name,
    playerId,
  });

  const text = stadium.text || stadium.effect || stadium.cardText || '';
  let steps = [];

  const opt = parseStadiumOncePerTurn(stadium);
  if (opt) {
    if (opt.kind === 'search-bench') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'Basic Pokémon',
        destination: 'bench',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'search-hand' || opt.kind === 'search-deck') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'card',
        destination: 'hand',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'draw') {
      steps.push({ type: 'draw', count: opt.n || 1 });
    } else if (opt.kind === 'heal-all') {
      steps.push({ type: 'heal', amount: opt.n || 10 });
    } else if (opt.kind === 'discard-draw') {
      if (opt.cost?.type === 'discard-hand') {
        steps.push({ type: 'discardCost', count: opt.cost.n || 1 });
      }
      steps.push({ type: 'draw', count: opt.n || 1 });
    }
  }

  if (steps.length === 0) {
    const parsed = parseTrainerEffect(text);
    steps = (parsed?.steps || []).filter((s) => s.type !== 'passive');
  }

  if (steps.length === 0) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  const result = executeSteps(draft, {
    steps,
    fromStepIndex: 0,
    effectType: 'stadium',
    sourceCard: stadium,
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
