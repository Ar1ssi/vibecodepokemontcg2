/**
 * @file Resumable trainer card executor for server-authoritative netcode (Slice 6).
 * Manages trainer activation, Supporter once-per-turn rules, tool attachment, and discard cleanup.
 */

import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { executeSteps } from './executor.mjs';
import { findCard } from '../state.mjs';

function isToolCard(card) {
  const name = String(card?.name || '').toLowerCase();
  const type = String(card?.type || '').toLowerCase();
  const sub = String(card?.subtypes || '').toLowerCase();
  return sub.includes('tool') || type.includes('tool') || name.includes('tool');
}

function isStadium(card) {
  const type = String(card?.type || '').toLowerCase();
  const sub = String(card?.subtypes || '').toLowerCase();
  return sub.includes('stadium') || type.includes('stadium');
}

/**
 * Discards the currently active stadium card, moving it to its owner's discard zone.
 *
 * @param {object} draft Cloned GameState
 * @param {Array} [events=[]]
 * @param {string} [initiatorPlayerId=null]
 * @returns {object|null} The discarded stadium card or null
 */
export function discardCurrentStadium(draft, events = [], initiatorPlayerId = null) {
  if (!draft?.stadium) return null;

  const oldStadium = draft.stadium;
  draft.stadium = null;

  // Resolve owner of the stadium card
  let owner = null;
  const candidateOwnerId = oldStadium.ownerId || oldStadium.playerId;
  if (candidateOwnerId && draft.players?.[candidateOwnerId]) {
    owner = draft.players[candidateOwnerId];
  } else {
    for (const p of Object.values(draft.players || {})) {
      if (
        Array.isArray(p.deckList) &&
        p.deckList.some(
          (c) =>
            (c?.instanceId != null && c.instanceId === oldStadium.instanceId) ||
            (c?.syncInstance != null && c.syncInstance === oldStadium.syncInstance)
        )
      ) {
        owner = p;
        break;
      }
    }
  }

  if (!owner) {
    const playerIds = Object.keys(draft.players || {});
    if (playerIds.length === 1) {
      owner = draft.players[playerIds[0]];
    } else if (initiatorPlayerId && playerIds.length === 2) {
      const opponentId = playerIds.find((id) => id !== initiatorPlayerId);
      owner = draft.players[opponentId] || draft.players[initiatorPlayerId];
    } else if (draft.turn?.player && draft.players?.[draft.turn.player]) {
      owner = draft.players[draft.turn.player];
    } else if (playerIds.length > 0) {
      owner = draft.players[playerIds[0]];
    }
  }

  if (owner) {
    oldStadium.attachedTo = null;
    owner.zones.discard.push(oldStadium);
    if (Array.isArray(events)) {
      events.push({
        type: 'cardMoved',
        instanceId: oldStadium.instanceId,
        from: 'stadium',
        to: 'discard',
        playerId: owner.playerId,
      });
    }
  }

  return oldStadium;
}

/**
 * Executes a trainer card effect from hand or resumes a suspended trainer choice.
 *
 * @param {object} draft Cloned GameState
 * @param {object} params
 * @param {object} params.card
 * @param {string} params.playerId
 * @param {object} params.activeRng
 * @param {Array} [params.events=[]]
 * @param {Array<number>|null} [params.selection=null]
 * @param {object|null} [params.resumeToken=null]
 * @param {number|null} [params.targetInstanceId=null]
 * @returns {{ pendingChoice: object|null, completed: boolean }}
 */
export function executeTrainer(draft, {
  card,
  playerId,
  activeRng,
  events = [],
  selection = null,
  resumeToken = null,
  targetInstanceId = null,
}) {
  const actingPlayerId = resumeToken?.initiatorPlayerId || playerId;
  const player = draft.players[actingPlayerId];
  if (!player) return { pendingChoice: null, completed: true };

  if (resumeToken) {
    // Resuming suspended execution
    const steps = resumeToken.steps || [];
    const stepIndex = resumeToken.stepIndex || 0;
    const budget = { count: resumeToken.budgetCount || 0 };

    const result = executeSteps(draft, {
      steps,
      fromStepIndex: stepIndex,
      effectType: 'trainer',
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

    // Effect completed: clean up trainer card from board to discard (unless tool/stadium)
    if (card?.instanceId != null) {
      let foundBoardCard = null;
      let ownerPlayer = player;
      const boardIdx = (player.zones.board || []).findIndex((c) => c.instanceId === card.instanceId);
      if (boardIdx >= 0) {
        [foundBoardCard] = player.zones.board.splice(boardIdx, 1);
      } else {
        // Fallback: locate card across player boards in case of mismatch
        const cardRef = findCard(draft, card.instanceId);
        if (cardRef && cardRef.zoneId === 'board' && draft.players[cardRef.playerId]) {
          ownerPlayer = draft.players[cardRef.playerId];
          const bIdx = ownerPlayer.zones.board.findIndex((c) => c.instanceId === card.instanceId);
          if (bIdx >= 0) {
            [foundBoardCard] = ownerPlayer.zones.board.splice(bIdx, 1);
          }
        }
      }


      if (foundBoardCard) {
        if (isStadium(foundBoardCard)) {
          if (draft.stadium && draft.stadium.instanceId !== foundBoardCard.instanceId) {
            discardCurrentStadium(draft, events, actingPlayerId);
          }
          foundBoardCard.ownerId = foundBoardCard.ownerId || actingPlayerId;
          draft.stadium = foundBoardCard;
          for (const p of Object.values(draft.players || {})) {
            if (p.flags) p.flags.stadiumUsedThisTurn = false;
          }
        } else {
          ownerPlayer.zones.discard.push(foundBoardCard);
        }
      }
    }

    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  // Initial play: move card from hand to board (or discard)
  const handIdx = (player.zones.hand || []).findIndex((c) => c.instanceId === card.instanceId);
  if (handIdx >= 0) {
    const [played] = player.zones.hand.splice(handIdx, 1);
    if (isStadium(played)) {
      if (draft.stadium && draft.stadium.instanceId !== played.instanceId) {
        discardCurrentStadium(draft, events, playerId);
      }
      played.ownerId = played.ownerId || playerId;
      draft.stadium = played;
      for (const p of Object.values(draft.players || {})) {
        if (p.flags) p.flags.stadiumUsedThisTurn = false;
      }
    } else {
      player.zones.board.push(played);
    }
  }

  // Supporter turn restriction
  const typeStr = String(card.type || '').toLowerCase();
  const subStr = String(card.subtypes || '').toLowerCase();
  const isSupporter = typeStr.includes('supporter') || subStr.includes('supporter');
  if (isSupporter) {
    if (!player.flags) player.flags = {};
    player.flags.supporterPlayed = true;
  }

  // Tool attachment: attach to target in play
  if (isToolCard(card) && targetInstanceId != null) {
    const targetRef = findCard(draft, targetInstanceId);
    if (targetRef && ['active', 'bench'].includes(targetRef.zoneId) && targetRef.playerId === playerId) {
      const boardIdx = (player.zones.board || []).findIndex((c) => c.instanceId === card.instanceId);
      if (boardIdx >= 0) {
        const [toolCard] = player.zones.board.splice(boardIdx, 1);
        toolCard.attachedTo = targetInstanceId;
        const targetZone = player.zones[targetRef.zoneId];
        targetZone.push(toolCard);
        events.push({
          type: 'cardAttached',
          instanceId: card.instanceId,
          targetInstanceId,
          playerId,
        });
        draft.pendingChoice = null;
        return { pendingChoice: null, completed: true };
      }
    }
  }

  // Parse trainer effect steps
  const text = card.text || card.effect || card.cardText || '';
  const parsed = parseTrainerEffect(text);

  if (!parsed || !parsed.steps || parsed.steps.length === 0) {
    // No steps or passive only: clean up to discard
    const bIdx = (player.zones.board || []).findIndex((c) => c.instanceId === card.instanceId);
    if (bIdx >= 0) {
      const [boardCard] = player.zones.board.splice(bIdx, 1);
      player.zones.discard.push(boardCard);
    }
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true };
  }

  // Run parsed steps
  const result = executeSteps(draft, {
    steps: parsed.steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: card,
    playerId,
    activeRng,
    events,
  });

  if (result.pendingChoice) {
    draft.pendingChoice = result.pendingChoice;
    return result;
  }

  // Completed without choices: move from board to discard
  const bIdx = (player.zones.board || []).findIndex((c) => c.instanceId === card.instanceId);
  if (bIdx >= 0) {
    const [boardCard] = player.zones.board.splice(bIdx, 1);
    player.zones.discard.push(boardCard);
  }

  draft.pendingChoice = null;
  return { pendingChoice: null, completed: true };
}
