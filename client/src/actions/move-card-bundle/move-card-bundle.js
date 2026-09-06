import { socket, systemState } from '../../state.js';
import { processAction } from '../../setup/general/process-action.js';
import { splitEmitAndTail } from '../../setup/general/sync-action-args.mjs';
import { shouldEmitBoardResync } from '../../setup/general/sync-replay.mjs';
import { requestBoardSnapshot } from '../../setup/general/request-board-snapshot.js';
import { getZone } from '../../setup/zones/get-zone.js';
import {
  buildCardHint,
  hintMatchesAtIndex,
  resolveCardIndex,
} from '../../setup/zones/resolve-card-index.mjs';
import { moveCardMessage } from './move-card-message.js';
import { moveCard } from './move-card.js';
import { logSync } from '../../setup/general/sync-logger-bridge.js';

function requestHintResync(reason, extra = {}) {
  const { request, skipped } = shouldEmitBoardResync({
    selfCounter: systemState.selfCounter,
    oppCounter: systemState.oppCounter,
    syncReplaying: systemState.syncReplaying,
    isCatchingUp: systemState.isCatchingUp,
  });
  if (!request) {
    logSync('moveCardBundle.resync.skip', { reason, skipped, ...extra });
    if (skipped !== 'replaying') requestBoardSnapshot();
    return;
  }
  socket.emit('resyncActions', {
    roomId: systemState.roomId,
    reason: 'hint_mismatch',
    selfCounter: systemState.selfCounter,
    oppCounter: systemState.oppCounter,
  });
}

function buildMoveCardHints(user, oZoneId, dZoneId, index, targetIndex) {
  const oZone = getZone(user, oZoneId);
  const dZone = getZone(user, dZoneId);
  const resolvedIdx = resolveCardIndex(oZone, null, index);
  const movingCard = oZone?.array?.[resolvedIdx];
  if (!movingCard) return null;

  const hints = { moving: buildCardHint(movingCard) };
  if (targetIndex != null && targetIndex !== false) {
    const resolvedTarget = resolveCardIndex(dZone, null, targetIndex);
    if (resolvedTarget >= 0 && dZone?.array?.[resolvedTarget]) {
      hints.target = buildCardHint(dZone.array[resolvedTarget]);
    }
  }

  const cardType = movingCard.type2 || movingCard.type;
  const fromHandOrDeck = !['active', 'bench'].includes(oZoneId);
  const toActiveOrBench = ['active', 'bench'].includes(dZoneId);
  hints.isEvolution =
    !!hints.target &&
    cardType === 'Pokémon' &&
    fromHandOrDeck &&
    toActiveOrBench;

  return hints;
}

/** @internal exported for unit tests */
export { buildMoveCardHints };

function resolveMoveCardIndices(user, oZoneId, dZoneId, index, targetIndex, hints) {
  const oZone = getZone(user, oZoneId);
  const dZone = getZone(user, dZoneId);
  return {
    index: resolveCardIndex(oZone, hints?.moving, index),
    targetIndex:
      targetIndex != null && targetIndex !== false
        ? resolveCardIndex(dZone, hints?.target, targetIndex)
        : targetIndex,
  };
}

export const moveCardBundle = async (
  user,
  initiator,
  oZoneId,
  dZoneId,
  index,
  targetIndex,
  action,
  emitOrHints = true,
  maybeHintsOrEmit
) => {
  const { emit, tail: cardHints } = splitEmitAndTail(emitOrHints, maybeHintsOrEmit);
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    // This client is acting on its (possibly stale) mirror of the
    // opponent's zone and asking the real owner to apply the move via
    // 'requestAction'. Attach the same identity hints the self→opp mirror
    // path already sends, so the owner (who applies this to their real,
    // authoritative zone) can verify `index` still points at the intended
    // card instead of trusting a relay index that may have drifted — e.g.
    // a Judge/Boss's-Orders-style effect racing the owner's own concurrent
    // action on that zone. Without this, a stale index silently moves the
    // wrong card on the owner's authoritative board with no verification
    // and no resync trigger (see the isMirrorReplay/needsHintVerification
    // block below, previously unreachable for this direction).
    const requestHints = buildMoveCardHints(user, oZoneId, dZoneId, index, targetIndex);
    processAction(user, emit, 'moveCardBundle', [
      oInitiator,
      oZoneId,
      dZoneId,
      index,
      targetIndex,
      action,
      requestHints,
    ]);
    return;
  }

  let resolvedIndex = index;
  let resolvedTargetIndex = targetIndex;
  let syncOptions = {};
  // Hints only ever accompany a relayed call (mirror-apply of the
  // opponent's own move, or here, this owner applying a move the opponent
  // requested against our real zone) — never a fresh local UI action — so
  // gating on their presence is safe and covers both relay directions.
  const needsHintVerification =
    !!cardHints &&
    systemState.isTwoPlayer &&
    ((user === 'opp' && !emit) || (user === 'self' && emit));
  const isMirrorReplay = needsHintVerification;
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
    const oZone = getZone(user, oZoneId);
    if (
      cardHints.moving &&
      !hintMatchesAtIndex(oZone, resolvedIndex, cardHints.moving)
    ) {
      console.warn('moveCardBundle: hint mismatch after resolve — requesting resync', {
        oZoneId,
        relayIndex: index,
        resolvedIndex,
        hint: cardHints.moving,
      });
      logSync('moveCardBundle.mirror.abort', {
        reason: 'hint_mismatch',
        oZoneId,
        relayIndex: index,
        resolvedIndex,
        moving: cardHints.moving,
      });
      requestHintResync('hint_mismatch', {
        oZoneId,
        relayIndex: index,
        resolvedIndex,
      });
      return false;
    }
    if (!oZone.array[resolvedIndex]) {
      console.warn('moveCardBundle: no card at resolved index on mirror — requesting resync', {
        oZoneId,
        resolvedIndex,
      });
      logSync('moveCardBundle.mirror.abort', {
        reason: 'missing_card',
        oZoneId,
        resolvedIndex,
      });
      requestHintResync('missing_card', { oZoneId, resolvedIndex });
      return false;
    }
    syncOptions = { syncReplay: true };
    if (cardHints.isEvolution) {
      syncOptions.forceEvolution = true;
    }
    logSync('moveCardBundle.mirror.resolve', {
      oZoneId,
      dZoneId,
      relayIndex: index,
      resolvedIndex,
      resolvedTargetIndex,
      moving: cardHints.moving,
    });
  }

  // Capture sync hints BEFORE moveCard splices the origin zone — building
  // hints after the move reads the wrong card at the relayed index.
  const hintsToSend =
    emit && systemState.isTwoPlayer
      ? buildMoveCardHints(
          user,
          oZoneId,
          dZoneId,
          resolvedIndex,
          resolvedTargetIndex
        )
      : cardHints;

  moveCardMessage(
    user,
    initiator,
    oZoneId,
    dZoneId,
    resolvedIndex,
    resolvedTargetIndex,
    action
  );
  let moveResult;
  try {
    moveResult = await moveCard(
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
    return false;
  }

  if (!moveResult || moveResult.ok === false) {
    return false;
  }

  const actualDest = moveResult.destZoneId || dZoneId;

  processAction(user, emit, 'moveCardBundle', [
    oInitiator,
    oZoneId,
    actualDest,
    resolvedIndex,
    resolvedTargetIndex,
    action,
    hintsToSend,
  ]);
  return true;
};
