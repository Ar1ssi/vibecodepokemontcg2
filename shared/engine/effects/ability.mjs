/**
 * @file Resumable Pokémon ability executor for server-authoritative netcode (Slice 6).
 * Handles activated once-per-turn abilities, step planning, and choice resumption.
 */

import { findCard } from '../state.mjs';
import { parseAbility } from '../rules/abilities.mjs';
import { planAbilitySteps } from '../rules/ability-step-plan.mjs';
import { parseAbilityEffectSteps, resolveCoinGates } from '../rules/attack-steps.mjs';
import { executeSteps, isExecutableStepType } from './executor.mjs';
import { flipCoin } from '../rng.mjs';

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
    // A card the ability moved out of play (Stance Change's old Aegislash) keeps no marker;
    // advanceTurn only resets in-play cards.
    const zoneAfter = findCard(draft, card.instanceId)?.zoneId;
    if (zoneAfter === 'active' || zoneAfter === 'bench') card.abilityUsed = true;
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

  const ability = card.abilities?.[abilityIndex];
  const text = typeof ability === 'string'
    ? ability
    : ability?.text || card.abilityText || card.text || card.effect || '';
  const plan = resolveAbilitySteps(text, { selfName: card.name });
  let actionableSteps = plan.steps;
  const holderZone = plan.holderZone;

  if (plan.source === 'template') {
    const zone = findCard(draft, card.instanceId)?.zoneId;
    if (holderZone && zone !== holderZone) {
      events.push({ type: 'effectStepSkipped', reason: `holder_not_${holderZone}`, step: 'ability' });
      draft.pendingChoice = null;
      return { pendingChoice: null, completed: true };
    }
    let flip = { coin: null, headsCount: 0 };
    if (actionableSteps.some((step) => step.gate || step.perHeads)) {
      const face = flipCoin(activeRng);
      events.push({ type: 'coinFlipped', playerId, face });
      flip = { coin: face, headsCount: face === 'heads' ? 1 : 0 };
    }
    actionableSteps = resolveCoinGates(actionableSteps, flip);
    if (actionableSteps.length === 0) {
      // Tails on a heads-only effect: the flip was the Ability's use.
      markUsed();
      draft.pendingChoice = null;
      return { pendingChoice: null, completed: true };
    }
  } else if (isHeadsGatedAbility(text, actionableSteps)) {
    // "Flip a coin. If heads, …": the flip is the ability's use; tails spends it with no effect.
    const face = flipCoin(activeRng);
    events.push({ type: 'coinFlipped', playerId, face });
    if (face === 'tails') {
      markUsed();
      draft.pendingChoice = null;
      return { pendingChoice: null, completed: true };
    }
  }

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

/**
 * The steps an activated ability runs: the parser's actionable (non-passive) steps, or the
 * shared effect templates when the parser reads none or leaves one without an executor (I89)
 * or reads the effect as passive only (I95). `source` is 'parser' | 'template'; `holderZone`
 * is the template's position clause. Pure — the ability-behaviour audit reads the same plan.
 */
export function resolveAbilitySteps(text, { selfName } = {}) {
  const parsedSteps = parseAbility(text);
  const steps = Array.isArray(parsedSteps) ? parsedSteps : (parsedSteps?.steps || []);
  const actionable = planAbilitySteps(steps, { mode: 'interactive' })
    .filter((p) => p.action !== 'skip')
    .map((p) => p.step);
  const { steps: templateSteps, holderZone } = parseAbilityEffectSteps(text, { selfName });
  const parserFallsShort =
    actionable.length === 0 || actionable.some((step) => !isExecutableStepType(step.type));
  if (parserFallsShort && templateSteps.length > 0) {
    return { source: 'template', steps: templateSteps, holderZone, parsedSteps: steps };
  }
  // "When you play this Pokémon …" is the trigger, not an effect — abilityActivationBlockReason
  // enforces its window. Dropped only beside other steps, so a marker-only read still reports
  // the effect as unexecutable instead of running as nothing.
  const effects = actionable.filter((step) => step.type !== 'whenPlayedAbility');
  return {
    source: 'parser',
    steps: effects.length > 0 ? effects : actionable,
    holderZone: null,
    parsedSteps: steps,
  };
}

// A single "flip a coin. If heads, …" gate on the whole effect. Texts with their own tails
// branch or per-heads scaling, and steps that flip for themselves, are left to the steps.
const HEADS_GATE = /flip a coin\.\s*if heads,/;
const SELF_FLIPPING_STEPS = new Set(['statusAbility']);

function isHeadsGatedAbility(text, steps) {
  const lower = String(text || '').toLowerCase();
  if (!HEADS_GATE.test(lower) || /if tails|for each heads/.test(lower)) return false;
  return !steps.some((step) => SELF_FLIPPING_STEPS.has(step.type) && step.coinFlip);
}
