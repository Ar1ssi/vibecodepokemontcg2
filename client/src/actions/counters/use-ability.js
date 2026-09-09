import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { splitEmitAndTail } from '../../setup/general/sync-action-args.mjs';
import { getZone } from '../../setup/zones/get-zone.js';
import { buildCardHint, resolveCardIndex } from '/shared/engine/zones/resolve-card-index.mjs';
import { addAbilityCounter } from './ability-counter.js';
import { dispatchAuthoritativeUseAbility } from '../../setup/netcode/authoritative-dispatch.js';

export const useAbility = (
  user,
  initiator,
  zoneId,
  index,
  emitOrHint = true,
  maybeEmit,
  authoritativeId = null
) => {
  const { emit, tail: hintIn } = splitEmitAndTail(emitOrHint, maybeEmit);
  const zone = getZone(user, zoneId);
  const resolved = resolveCardIndex(zone, hintIn, index);
  const card = zone?.array?.[resolved];
  const hint = hintIn || buildCardHint(card);
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'useAbility', [oInitiator, zoneId, resolved, hint]);
    return;
  }

  // design 003 slice 5: the legacy hint is built from the legacy zone array, which is empty
  // under authoritative rendering — identity comes from the interaction site instead
  // (`mouseClick.cardInstanceId`) and is resolved against the authoritative registry.
  if (
    dispatchAuthoritativeUseAbility({
      user,
      emit,
      incomingHint: hintIn,
      oInitiator,
      zoneId,
      index: resolved,
      authoritativeId,
    })
  )
    return;

  if (!card) return;
  const cardName = card.name;
  addAbilityCounter(user, zoneId, resolved);
  if (zoneId !== 'stadium') {
    appendMessage(
      initiator,
      determineUsername(initiator) + ' used ' + cardName + "'s ability",
      'player',
      false
    );
  } else {
    appendMessage(
      initiator,
      determineUsername(initiator) + ' used ' + cardName,
      'player',
      false
    );
  }

  processAction(user, emit, 'useAbility', [oInitiator, zoneId, resolved, hint]);
};
