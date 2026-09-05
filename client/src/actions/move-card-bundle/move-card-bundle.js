import { systemState } from '../../state.js';
import { processAction } from '../../setup/general/process-action.js';
import { refreshBoard } from '../../setup/sizing/refresh-board.js';
import { getZone } from '../../setup/zones/get-zone.js';
import {
  buildCardHint,
  resolveCardIndex,
} from '../../setup/zones/resolve-card-index.mjs';
import { moveCardMessage } from './move-card-message.js';
import { moveCard } from './move-card.js';

function buildMoveCardHints(user, oZoneId, dZoneId, index, targetIndex) {
  const oZone = getZone(user, oZoneId);
  const dZone = getZone(user, dZoneId);
  const movingCard = oZone.array[index];
  if (!movingCard) return null;

  const hints = { moving: buildCardHint(movingCard) };
  if (typeof targetIndex === 'number') {
    hints.target = buildCardHint(dZone.array[targetIndex]);
  }

  const fromHandOrDeck = !['active', 'bench'].includes(oZoneId);
  const toActiveOrBench = ['active', 'bench'].includes(dZoneId);
  hints.isEvolution =
    !!hints.target &&
    movingCard.type === 'Pokémon' &&
    fromHandOrDeck &&
    toActiveOrBench;

  return hints;
}

function resolveMoveCardIndices(user, oZoneId, dZoneId, index, targetIndex, hints) {
  if (!hints) {
    return { index, targetIndex };
  }
  const oZone = getZone(user, oZoneId);
  const dZone = getZone(user, dZoneId);
  return {
    index: resolveCardIndex(oZone, hints.moving, index),
    targetIndex:
      typeof targetIndex === 'number'
        ? resolveCardIndex(dZone, hints.target, targetIndex)
        : targetIndex,
  };
}

export const moveCardBundle = (
  user,
  initiator,
  oZoneId,
  dZoneId,
  index,
  targetIndex,
  action,
  emit = true,
  cardHints = null
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'moveCardBundle', [
      oInitiator,
      oZoneId,
      dZoneId,
      index,
      targetIndex,
      action,
      cardHints,
    ]);
    return;
  }

  let resolvedIndex = index;
  let resolvedTargetIndex = targetIndex;
  let syncOptions = {};
  if (cardHints && systemState.isTwoPlayer && !emit && user === 'opp') {
    ({ index: resolvedIndex, targetIndex: resolvedTargetIndex } =
      resolveMoveCardIndices(
        user,
        oZoneId,
        dZoneId,
        index,
        targetIndex,
        cardHints
      ));
    if (cardHints.isEvolution) {
      syncOptions = { forceEvolution: true };
    }
  }

  moveCardMessage(
    user,
    initiator,
    oZoneId,
    dZoneId,
    resolvedIndex,
    resolvedTargetIndex,
    action
  );
  try {
    moveCard(
      user,
      initiator,
      oZoneId,
      dZoneId,
      resolvedIndex,
      resolvedTargetIndex,
      syncOptions
    );
    refreshBoard(); //refreshing the board rearranges the array of the cards on the active/bench. to prevent desyncs, refresh the board whenever a user moves a card to ensure that the array for both users is the same
    // the issue arised when one player would refresh their board by flipping board/resizing window, changing their arrays, but the other player would still have the original arrays.
  } catch (e) {
    console.error('Error in moveCardBundle:', e, {
      user,
      oZoneId,
      dZoneId,
      index: resolvedIndex,
      targetIndex: resolvedTargetIndex,
      action,
    });
    return;
  }

  const hints =
    emit && systemState.isTwoPlayer
      ? buildMoveCardHints(user, oZoneId, dZoneId, resolvedIndex, resolvedTargetIndex)
      : cardHints;

  processAction(user, emit, 'moveCardBundle', [
    oInitiator,
    oZoneId,
    dZoneId,
    resolvedIndex,
    resolvedTargetIndex,
    action,
    hints,
  ]);
};
