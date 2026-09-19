/**
 * @file Resumable Stadium card executor for server-authoritative netcode (Slice 6).
 * Manages once-per-turn stadium activation, effect steps, and choice resumption.
 */

import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { parseStadiumOncePerTurn } from '../rules/stadium-effects.mjs';
import { executeSteps, matchesEnergyTypeFilter } from './executor.mjs';

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

  // Parsed once up front: the resume branch below must know whether the
  // activation ends the turn even though it re-enters without the preview.
  const preview = parseStadiumOncePerTurn(stadium);
  const turnEndsOnResolve = !!preview?.turnEnds;
  const isEnergy = (c) =>
    /energy/i.test(String(c?.type || '') + String(c?.name || ''));

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
      context: resumeToken?.context || {},
      budget,
    });

    if (result.pendingChoice) {
      draft.pendingChoice = result.pendingChoice;
      return result;
    }

    draft.pendingChoice = null;
    return {
      pendingChoice: null,
      completed: true,
      // Lumiose City only ends the turn if the deck was actually searched.
      turnEnds: turnEndsOnResolve && (selection?.length ?? 0) > 0,
    };
  }

  // A "may discard a [typed] Energy" cost can't be paid if the hand holds no
  // matching Energy. Since the discard is optional, the effect simply does
  // nothing and the once-per-turn activation is not consumed.
  if (
    preview?.cost?.type === 'discard-energy' &&
    !(player.zones.hand || []).some(
      (c) => isEnergy(c) && matchesEnergyTypeFilter(c, preview.cost.types)
    )
  ) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
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
        ...(opt.searchFilter ? { nameFilter: opt.searchFilter } : {}),
      });
    } else if (opt.kind === 'search-hand' || opt.kind === 'search-deck') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'card',
        // Fossil Quarry sends "Antique" Items to the Bench, not to hand.
        destination: opt.destination || 'hand',
        count: opt.n || 1,
        ...(opt.searchFilter ? { nameFilter: opt.searchFilter } : {}),
      });
    } else if (opt.kind === 'search-evolve') {
      steps.push({
        type: 'searchEvolve',
        chainStage2: !!opt.chainStage2,
      });
    } else if (opt.kind === 'draw') {
      steps.push({ type: 'draw', count: opt.n || 1 });
    } else if (opt.kind === 'heal-all') {
      steps.push({
        type: 'heal',
        amount: opt.n || 10,
        target: 'each of your Pokémon',
        ...(opt.types ? { types: opt.types } : {}),
      });
    } else if (opt.kind === 'heal') {
      steps.push({ type: 'healAmount', amount: opt.n || 10, target: 'Active Pokémon' });
    } else if (opt.kind === 'discard-draw') {
      const cost = opt.cost || {};
      const discardStep = { type: 'discardCost', count: cost.n || 1 };
      if (cost.type === 'discard-energy') discardStep.energyOnly = true;
      if (Array.isArray(cost.types) && cost.types.length) {
        discardStep.energyTypes = cost.types;
      }
      steps.push(discardStep);
      steps.push({ type: 'draw', count: opt.n || 1 });
    } else if (opt.kind === 'draw-until-type') {
      // Mystery Garden: pay the Energy cost, then draw until the hand reaches
      // the count of matching Pokémon in play (evaluated at execution time).
      const cost = opt.cost || {};
      const discardStep = { type: 'discardCost', count: cost.n || 1 };
      if (cost.type === 'discard-energy') discardStep.energyOnly = true;
      if (Array.isArray(cost.types) && cost.types.length) {
        discardStep.energyTypes = cost.types;
      }
      steps.push(discardStep);
      steps.push({
        type: 'drawUntil',
        ...(opt.targetType ? { targetType: opt.targetType } : { target: 5 }),
      });
    } else if (opt.kind === 'recover-energy') {
      steps.push({
        type: 'recoverEnergy',
        count: opt.n || 1,
        ...(opt.typeFilter ? { energyTypes: [opt.typeFilter] } : {}),
      });
    } else if (opt.kind === 'hand-to-deck-top') {
      steps.push({ type: 'putHandOnTop', count: opt.n || 1 });
    } else if (opt.kind === 'switch-type') {
      steps.push({ type: 'switchOwn' });
    } else if (opt.kind === 'discard-to-bench') {
      const energyType = opt.typeFilter
        ? `Basic {${opt.typeFilter.charAt(0).toUpperCase()}} Energy`
        : 'Basic Energy';
      const count = opt.n || 2;
      steps.push({
        type: count > 1 ? 'attachMultipleFromDiscard' : 'attachFromDiscard',
        energy: energyType,
        count,
        target: '1 of your Benched Pokémon',
      });
    } else if (opt.kind === 'energy') {
      steps.push({
        type: 'searchDeck',
        what: 'Energy',
        destination: 'hand',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'search') {
      steps.push({
        type: 'searchDeck',
        what: 'card',
        destination: 'hand',
        count: opt.n || 1,
      });
    }
  }

  if (steps.length === 0) {
    const parsed = parseTrainerEffect(text);
    steps = (parsed?.steps || []).filter((s) => s.type !== 'passive');
  }

  if (steps.length === 0) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
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
  // A synchronously-resolved activation never actually searched, so Lumiose
  // City's "if a player searches … their turn ends" does not trigger.
  return { pendingChoice: null, completed: true, turnEnds: false };
}
