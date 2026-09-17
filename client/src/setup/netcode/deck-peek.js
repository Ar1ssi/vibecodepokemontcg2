/**
 * @file Design 012: "look at the top/bottom N cards of a deck" under server authority.
 *
 * The client holds no deck contents (the view sends only a count), so the legacy look —
 * moving cards from the client's own deck copy into `viewCards` — shows the wrong cards.
 * This asks the server for the cards (`peekDeck`, answered to this socket only), shows them
 * in the card picker, and takes picked cards from the deck with ordinary `moveCard` commands.
 */

import { socket, systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { determineUsername } from '../general/determine-username.js';
import { openCardPicker } from '../image-logic/card-picker.js';
import { isAuthoritativeDispatchActive } from './authoritative-dispatch.js';
import { emitCmd } from './cmd-emitter.js';
import { buildDeckPeekPickerRequest } from './deck-peek-request.mjs';

const PEEK_TIMEOUT_MS = 5000;

const announce = (message) => appendMessage('', message, 'announcement', false);

function requestPeek(request) {
  return new Promise((resolve) => {
    socket
      .timeout(PEEK_TIMEOUT_MS)
      .emit('peekDeck', { roomId: systemState.roomId, ...request }, (err, reply) => {
        if (err) resolve({ ok: false, reason: 'The server did not answer.' });
        else resolve(reply && typeof reply === 'object' ? reply : { ok: false, reason: 'Bad reply.' });
      });
  });
}

async function takeIntoHand(instanceIds) {
  for (const instanceId of instanceIds) {
    const result = await emitCmd({
      socket,
      roomId: systemState.roomId,
      type: 'moveCard',
      payload: { instanceId, from: 'deck', to: 'hand' },
    });
    if (!result.success) {
      announce(`Command failed to send: ${result.reason || result.error}`);
      return;
    }
  }
}

/**
 * @param {object} input
 * @param {string} input.user whose deck, from this client's seat ('self' | 'opp')
 * @param {number} input.count cards to look at
 * @param {boolean} input.top top of the deck (else bottom)
 * @returns {boolean} true when handled here (the legacy look must not run)
 */
export function peekServerDeck({ user, count, top }) {
  if (!isAuthoritativeDispatchActive() || !systemState.isTwoPlayer) return false;

  const side = user === 'self' ? 'you' : 'them';
  const fromTop = top !== false;
  requestPeek({ side, count, fromTop }).then((reply) => {
    if (!reply.ok) {
      announce(`Can't look at the deck: ${reply.reason}`);
      return;
    }
    const shown = reply.cards.length;
    const owner = side === 'you' ? 'their' : `${determineUsername('opp')}'s`;
    appendMessage(
      'self',
      `${determineUsername('self')} looked at the ${fromTop ? 'top' : 'bottom'} ${shown} card(s) of ${owner} deck`,
      'player',
      true
    );
    const request = buildDeckPeekPickerRequest({
      cards: reply.cards,
      side,
      fromTop,
      onTake: takeIntoHand,
    });
    if (!request) return;
    openCardPicker(request).catch((err) => console.error('[deck-peek] picker failed:', err));
  });
  return true;
}
