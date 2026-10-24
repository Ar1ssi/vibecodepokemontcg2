/**
 * @file Authoritative state reducer for server-authoritative netcode.
 * Implements pure and total applyCommand(state, command, rng) -> { state, events, pendingChoice, error? }.
 * Enforces Invariants 2, 3, 6, 7, 8.
 */

import { clearDetachedCardMarkers, cloneGameState, findCard, createGameState } from './state.mjs';
import { validateCommandShape } from './commands.mjs';
import { createRng, withForcedCoin, withForcedCoinOnce } from './rng.mjs';
import { abilityForcesOpponentTails } from './rules/ability-combat.mjs';
import { settleFossilCards } from './rules/fossil.mjs';
import { stampRevealedArt } from './rules/reveal-picks.mjs';
import { settleSpecialEnergyPassives } from './effects/special-energy.mjs';
import { abilitySideContext } from './reduce/shared.mjs';
import { validateReferences, validateLegality } from './reduce/legality.mjs';
import { attackCommand } from './reduce/attack.mjs';
import {
  settlePromotionChoices, stampHealedPokemon, stampActivePromotions, settleKoEnergyMoves, settleKoSearches,
  settlePrizeEntitlements, resolveDamageCounterKnockouts, takePrizesCommand,
  takePrizesByIndexCommand, promoteCommand,
} from './reduce/knockout.mjs';
import {
  discardBenchedAttachedTrainers, setupCommand, takeTurnCommand, loadDeckCommand, cardStatsCommand,
} from './reduce/turn.mjs';
import { retreatCommand } from './reduce/retreat.mjs';
import { attachCardCommand } from './reduce/attach.mjs';
import { promoteTrainerPlay, playTrainerCommand, stadiumEffectCommand } from './reduce/trainer.mjs';
import { promoteSelfAttachDrop, useAbilityCommand, useVStarGXCommand } from './reduce/ability.mjs';
import {
  clearFaceDownOffBoard, moveCardCommand, drawCommand, addDamageCounterCommand,
  updateDamageCounterCommand, removeDamageCounterCommand, addSpecialConditionCommand,
  updateSpecialConditionCommand, removeSpecialConditionCommand, removeAbilityCounterCommand,
  changeTypeCommand, rotateCardCommand, playRandomCardFaceDownCommand, shuffleIntoDeckCommand,
  moveToDeckTopCommand, switchWithDeckTopCommand, shuffleZoneCommand, shuffleBottomCommand,
  shuffleAllCommand, discardAllCommand, lostZoneAllCommand, handAllCommand, leaveAllCommand,
  discardAndDrawCommand, shuffleAndDrawCommand, shuffleBottomAndDrawCommand,
  shufflePrizesToDeckBottomCommand, revealShortcutCommand, hideShortcutCommand, revealCardsCommand,
  hideCardsCommand, discardBoardCommand, handBoardCommand, shuffleBoardCommand,
  lostZoneBoardCommand,
} from './reduce/board.mjs';
import { resolveChoiceCommand } from './reduce/choice.mjs';

// The engine's public surface: applyCommand (below), validateLegality and attackExtrasFor.
export { validateLegality };
export { attackExtrasFor } from './reduce/attack.mjs';

// undo (design 002 slice 3.4e / D6, I16): deterministic commandLog replay minus tail,
// rebuilt from a fresh seeded state. Returns directly — the replayed state already carries
// its own correct commandLog/stateVersion/rngCursor, so the common tail below (which would
// append this 'undo' command itself) must not run. Undo commands are therefore never
// themselves present in commandLog — only real game actions are, which is what keeps replay
// well-defined (no undo-of-undo bookkeeping to unwind).
function undoCommand({ payload, state }) {
  const removeCount =
    Number.isInteger(payload?.count) && payload.count > 0
      ? payload.count
      : 1;
  const log = state.commandLog;
  // Edge Case 18: never rewind past the start of this game's log.
  if (log.length < removeCount) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'nothing_to_undo',
      reason: `Cannot undo ${removeCount} action(s); command log only has ${log.length}`,
    };
  }

  const keptLog = log.slice(0, log.length - removeCount);

  let replayState = createGameState({
    gameId: state.gameId,
    seed: state.seed,
    rulesEnabled: state.rulesEnabled,
    players: Object.fromEntries(
      Object.entries(state.players).map(([pid, p]) => [
        pid,
        { playerId: pid, username: p.username },
      ])
    ),
  });

  const replayRng = createRng(state.seed);
  for (const loggedCommand of keptLog) {
    const result = applyCommand(replayState, loggedCommand, replayRng);
    if (result.error) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'undo_replay_failed',
        reason: `Replay diverged at logged command "${loggedCommand.type}": ${result.reason || result.error}`,
      };
    }
    replayState = result.state;
  }

  return {
    state: replayState,
    events: [
      { type: 'undo', count: removeCount, remaining: keptLog.length },
    ],
    pendingChoice: replayState.pendingChoice,
    error: null,
  };
}

export function applyCommand(state, command, rng = null) {
  if (!state || typeof state !== 'object') {
    return {
      state: null,
      events: [],
      pendingChoice: null,
      error: 'bad_command',
      reason: 'Invalid state',
    };
  }

  // Step 1: Shape check
  const shapeResult = validateCommandShape(command);
  if (!shapeResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: shapeResult.reason,
    };
  }

  command = promoteSelfAttachDrop(state, promoteTrainerPlay(state, command));
  if (command.pendingDataReason) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'card_data_pending',
      reason: command.pendingDataReason,
    };
  }
  const { type, payload, playerId } = command;
  if (!playerId || typeof playerId !== 'string') {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: 'Missing playerId',
    };
  }

  // Step 2: Turn gate / PendingChoice gate
  if (state.pendingChoice) {
    if (type !== 'resolveChoice') {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'waiting_for_choice',
        reason: `Waiting for choice from player ${state.pendingChoice.player}`,
      };
    }
    // Edge Case 11: Choice resolved by wrong player -> rejected not_your_choice
    if (state.pendingChoice.player !== playerId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'not_your_choice',
        reason: `Choice must be resolved by player ${state.pendingChoice.player}`,
      };
    }
    if (payload.choiceId && state.pendingChoice.choiceId !== payload.choiceId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'stale_choice',
        reason: 'Choice ID does not match current pending choice',
      };
    }
  } else if (type === 'resolveChoice') {
    return {
      state,
      events: [],
      pendingChoice: null,
      error: 'no_pending_choice',
      reason: 'There is no pending choice to resolve',
    };
  }

  // Edge Case 12: Selection validation for resolveChoice
  if (type === 'resolveChoice') {
    const selection = payload.selection || [];
    const min = state.pendingChoice.min ?? 0;
    const max = state.pendingChoice.max ?? Infinity;
    if (selection.length < min || selection.length > max) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'invalid_selection',
        reason: `Selection count (${selection.length}) must be between ${min} and ${max}`,
      };
    }
    const optionIds = new Set(
      (state.pendingChoice.options || []).map((o) => o.instanceId)
    );
    for (const sId of selection) {
      if (!optionIds.has(sId)) {
        return {
          state,
          events: [],
          pendingChoice: state.pendingChoice,
          error: 'invalid_selection',
          reason: `Selected card ${sId} is not in choice options`,
        };
      }
    }
  }

  // Step 3: Reference check (stale client view detection)
  const refResult = validateReferences(state, command);
  if (!refResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: refResult.error || 'stale_view',
    };
  }

  // Step 4: Legality check (skipped when rulesEnabled === false)
  const legalityResult = validateLegality(state, command);
  if (!legalityResult.allowed) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: legalityResult.reason,
    };
  }

  // Step 5: Apply to cloned draft
  const draft = cloneGameState(state);
  let activeRng = rng || createRng(state.seed || 0);
  if (state.rngCursor && !rng) {
    while (activeRng.cursor < state.rngCursor) {
      activeRng.next();
    }
  }
  // Malamar Contrary / Shiftry Unlucky Wind: the turn player's coin flips are tails. Flips by
  // the other player (surviveKnockOutCoin) and Checkup draw raw RNG, so they are unaffected.
  const turnOpponentId = Object.keys(state.players || {}).find((id) => id !== state.turn?.player);
  // Cofagrigus Slap of Misfortune / Unown E Hidden Power: an attack forced the turn player's
  // coins to tails for this turn (effects/attack-steps.mjs atkOppCoinsTails).
  const turnPlayerCoinsTails = state.players?.[state.turn?.player]?.coinsTailsTurn === state.turn?.number;
  if (
    state.turn?.player &&
    turnOpponentId &&
    (turnPlayerCoinsTails || abilityForcesOpponentTails(abilitySideContext(state, turnOpponentId)))
  ) {
    activeRng = withForcedCoin(activeRng, 'tails');
  }
  // Will: the turn player chose the face of their next first coin flip this
  // turn. The force is one-shot — flipCoin clears it on use.
  const willPlayerId =
    state.turn?.player && draft.players?.[state.turn.player]?.flags?.willFirstCoin
      ? state.turn.player
      : null;
  let willCoinUsed = null;
  if (willPlayerId) {
    activeRng = withForcedCoinOnce(activeRng, draft.players[willPlayerId].flags.willFirstCoin);
    willCoinUsed = activeRng.forcedCoinUsed;
  }
  const events = [];

  switch (type) {
    case 'moveCard':
      moveCardCommand({ payload, draft, playerId, events, activeRng });
      break;
    case 'draw':
      drawCommand({ payload, draft, playerId, events });
      break;
    case 'attachCard':
      attachCardCommand({ draft, payload, playerId, activeRng, events });
      break;
    case 'addDamageCounter':
      addDamageCounterCommand({ draft, payload, events });
      break;
    case 'updateDamageCounter':
      updateDamageCounterCommand({ draft, payload, events });
      break;
    case 'removeDamageCounter':
      removeDamageCounterCommand({ draft, payload, events });
      break;
    case 'addSpecialCondition':
      addSpecialConditionCommand({ draft, payload, events });
      break;
    case 'updateSpecialCondition':
      updateSpecialConditionCommand({ draft, payload, events });
      break;
    case 'removeSpecialCondition':
      removeSpecialConditionCommand({ draft, payload, events });
      break;
    case 'removeAbilityCounter':
      removeAbilityCounterCommand({ draft, payload, events });
      break;
    case 'changeType':
      changeTypeCommand({ draft, payload, events });
      break;
    case 'rotateCard':
      rotateCardCommand({ draft, payload, events });
      break;
    case 'playRandomCardFaceDown':
      playRandomCardFaceDownCommand({ draft, playerId, activeRng, events });
      break;
    case 'setup': {
      const result = setupCommand({ state, draft, payload, activeRng, events });
      if (result) return result;
      break;
    }
    case 'attack':
      attackCommand({ draft, playerId, payload, activeRng, events });
      break;
    case 'retreat':
      retreatCommand({ draft, playerId, payload, events, activeRng });
      break;
    case 'pass':
    case 'takeTurn':
      takeTurnCommand({ draft, activeRng, events, playerId });
      break;
    case 'takePrizes':
      takePrizesCommand({ payload, draft, playerId, events });
      break;
    case 'takePrizesByIndex':
      takePrizesByIndexCommand({ payload, draft, playerId, events });
      break;
    case 'promote':
      promoteCommand({ draft, playerId, payload, events });
      break;
    case 'playTrainer':
      playTrainerCommand({ draft, payload, playerId, activeRng, events });
      break;
    case 'useAbility':
      useAbilityCommand({ draft, payload, playerId, activeRng, events });
      break;
    case 'stadium-effect':
      stadiumEffectCommand({ draft, playerId, activeRng, events });
      break;
    case 'useVStarGX':
      useVStarGXCommand({ draft, command, playerId, events, payload });
      break;
    case 'resolveChoice':
      resolveChoiceCommand({ draft, playerId, activeRng, events, payload });
      break;
    case 'shuffleIntoDeck':
      shuffleIntoDeckCommand({ draft, playerId, payload, activeRng, events });
      break;
    case 'moveToDeckTop':
      moveToDeckTopCommand({ draft, playerId, payload, events });
      break;
    case 'switchWithDeckTop':
      switchWithDeckTopCommand({ draft, playerId, payload, events });
      break;
    case 'shuffleZone':
      shuffleZoneCommand({ draft, playerId, payload, activeRng, events });
      break;
    case 'shuffleBottom':
      shuffleBottomCommand({ draft, playerId, activeRng, payload, events });
      break;
    case 'shuffleAll':
      shuffleAllCommand({ draft, playerId, payload, activeRng, events });
      break;
    case 'discardAll':
      discardAllCommand({ draft, playerId, payload, events });
      break;
    case 'lostZoneAll':
      lostZoneAllCommand({ draft, playerId, payload, events });
      break;
    case 'handAll':
      handAllCommand({ draft, playerId, payload, events });
      break;
    case 'leaveAll':
      leaveAllCommand({ draft, playerId, payload, events });
      break;
    case 'discardAndDraw':
      discardAndDrawCommand({ draft, playerId, payload, events });
      break;
    case 'shuffleAndDraw':
      shuffleAndDrawCommand({ draft, playerId, activeRng, payload, events });
      break;
    case 'shuffleBottomAndDraw':
      shuffleBottomAndDrawCommand({ draft, playerId, activeRng, payload, events });
      break;
    case 'shufflePrizesToDeckBottom':
      shufflePrizesToDeckBottomCommand({ draft, playerId, activeRng, events });
      break;
    case 'revealShortcut':
      revealShortcutCommand({ draft, playerId, payload, events });
      break;
    case 'hideShortcut':
      hideShortcutCommand({ draft, playerId, payload, events });
      break;
    case 'revealCards':
      revealCardsCommand({ draft, playerId, payload, events });
      break;
    case 'hideCards':
      hideCardsCommand({ draft, playerId, payload, events });
      break;
    case 'discardBoard':
      discardBoardCommand({ draft, playerId, events });
      break;
    case 'handBoard':
      handBoardCommand({ draft, playerId, events });
      break;
    case 'shuffleBoard':
      shuffleBoardCommand({ draft, playerId, activeRng, events });
      break;
    case 'lostZoneBoard':
      lostZoneBoardCommand({ draft, playerId, events });
      break;
    case 'loadDeck':
      loadDeckCommand({ draft, playerId, payload, events });
      break;
    case 'cardStats':
      cardStatsCommand({ draft, playerId, payload, events });
      break;
    case 'undo':
      return undoCommand({ payload, state });

    default:
      break;
  }

  if (draft.rulesEnabled) {
    settleSpecialEnergyPassives(draft, { events });
    discardBenchedAttachedTrainers(draft, { events });
  }
  resolveDamageCounterKnockouts(draft, { events });
  settlePromotionChoices(draft, { events });
  settleKoEnergyMoves(draft, { events });
  settleKoSearches(draft, { events });
  settlePrizeEntitlements(draft, { events });
  stampActivePromotions(state, draft);
  stampHealedPokemon(state, draft);
  clearFaceDownOffBoard(draft);
  clearDetachedCardMarkers(draft);
  settleFossilCards(draft);
  delete draft.__attackEffectPhase;
  delete draft.__attackLostZoneKnockouts;
  // Design 059: a public reveal carries each card's art, so the opponent can draw a card
  // their view still shows face down (the revealed card is in its owner's hand).
  stampRevealedArt(events, (instanceId) => findCard(draft, instanceId)?.card?.src);

  // Will is consumed by the first flip; clear the marker once it fired.
  if (willPlayerId && willCoinUsed?.value) {
    delete draft.players[willPlayerId].flags.willFirstCoin;
  }

  // Advance state version and append to commandLog
  draft.stateVersion = (state.stateVersion || 0) + 1;
  draft.commandLog.push({
    ...command,
    stateVersion: draft.stateVersion,
  });

  if (activeRng && typeof activeRng.cursor === 'number') {
    draft.rngCursor = activeRng.cursor;
  }

  return {
    state: draft,
    events,
    pendingChoice: draft.pendingChoice,
    error: null,
  };
}
