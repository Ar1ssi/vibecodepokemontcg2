import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineDeckData } from '../../setup/general/determine-deckdata.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { shuffleIndices } from '../../setup/general/shuffle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { drawHand, setOpeningPrizes } from '../zones/hand-actions.js';
import { shuffleZone } from '../zones/shuffle-zone.js';
import { reset } from './reset.js';
import { waitForDealOrder } from '../../setup/netcode/deal-order.js';

export const setup = async (user, indices, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'setup', [indices]);
    return;
  }
  // Only wipe/rebuild when we have a serialized list. A 2P setup action can
  // arrive before exchangeData; resetting then would empty the live deck and
  // skip prizes. Deal from the cards already on the mat in that case.
  if (determineDeckData(user)) {
    reset(user, true, true, true, false);
  }
  const deck = getZone(user, 'deck');
  indices = indices ? indices : shuffleIndices(deck.getCount());
  if (deck.getCount() > 0) {
    shuffleZone(user, user, 'deck', indices, false, false);
    await drawHand(user, user);
    appendMessage(
      user,
      determineUsername(user) + ' drew starting hand and set prizes',
      'player',
      false
    );
  }
  processAction(user, emit, 'setup', [indices]);
};

// Rules-mode setup step 1: shuffle deck and set prize cards only.
// Opening hands are drawn after the turn-order coin flip (rules-bridge).
export const setupPrizes = async (user, indices, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'setupPrizes', [indices]);
    return;
  }
  // Only wipe/rebuild when we have a serialized list. A 2P setup action can
  // arrive before exchangeData; resetting then would empty the live deck and
  // skip prizes. Deal from the cards already on the mat in that case.
  if (determineDeckData(user)) {
    reset(user, true, true, true, false);
  }
  const deck = getZone(user, 'deck');
  // Design 002 I17: in server-authoritative 2P, don't roll a local shuffle — it
  // would deal a different hand than the GameRoom simulation already dealt,
  // which fails every later moveCard from hand (stale_view). Wait for the
  // server's own deal order (emitted after its 'setup' command; syncInstance
  // order [prizes(6), hand(7), rest(deck)] — this function's own call sequence
  // below, shuffle-then-take-first-6-for-prizes, matches that layout) and use
  // it as this shuffle's indices instead. Falls back to a local shuffle (and
  // logs it) if the server never answers, rather than hanging setup forever —
  // that only desyncs a still-inert authoritative simulation, same as today.
  if (
    !indices &&
    user === 'self' &&
    systemState.isTwoPlayer &&
    systemState.serverAuthoritative
  ) {
    const serverOrder = await waitForDealOrder();
    // A 0-length order means the server dealt before this player's own deck had
    // loaded (see server.js's allDecksLoaded guard) — never usable as `indices`
    // (an empty array is truthy but is not a deal order — rearrangeArray would
    // leave the deck unshuffled and report a mismatch).
    if (Array.isArray(serverOrder) && serverOrder.length === deck.getCount()) {
      indices = serverOrder;
    } else {
      console.warn(
        'setupPrizes: no usable server deal order received, falling back to a local shuffle',
        serverOrder
      );
    }
  }
  indices = indices ? indices : shuffleIndices(deck.getCount());
  if (deck.getCount() > 0) {
    shuffleZone(user, user, 'deck', indices, false, false);
    await setOpeningPrizes(user, user);
    appendMessage(
      user,
      determineUsername(user) + ' set prizes',
      'player',
      false
    );
  }
  processAction(user, emit, 'setupPrizes', [indices]);
};
