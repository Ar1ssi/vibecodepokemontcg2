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
          draft.stadium = foundBoardCard;
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
      draft.stadium = played;
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
