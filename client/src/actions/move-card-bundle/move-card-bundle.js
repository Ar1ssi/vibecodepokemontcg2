import { systemState } from '../../state.js';
import { processAction } from '../../setup/general/process-action.js';
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
  const isMirrorReplay =
    cardHints && systemState.isTwoPlayer && !emit && user === 'opp';
  if (isMirrorReplay) {
    ({ index: resolvedIndex, targetIndex: resolvedTargetIndex } =
      resolveMoveCardIndices(
        user,
        oZoneId,
        dZoneId,
        index,
        targetIndex,
        cardHints
      ));
    syncOptions = { syncReplay: true };
    if (cardHints.isEvolution) {
      syncOptions.forceEvolution = true;
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
    // Do not call refreshBoard here — it used to invoke moveCard on every
    // active/bench Pokémon, recreating play-containers and re-firing rules
    // hooks. Array sync is handled by the socket replay itself; refreshBoard
    // remains available for resize / flip-board / manual image reload.
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
