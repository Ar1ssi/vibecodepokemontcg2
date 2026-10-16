/**
 * @file Design 074 D7: the Solo tab plays through the server. Joining makes a private
 * `solo-` room whose two seats belong to this one socket; leaving puts the local board back
 * the way leaving a Multiplayer room does. The `joinGame` acknowledgement is handled in
 * socket-event-listeners.js (`handleSoloJoinGame`).
 *
 * A server without authority refuses solo rooms (`solo_needs_authority`); the Solo tab then
 * stays on the local board for the rest of the page's life.
 */

import { reset } from '../../actions/general/reset.js';
import { socket, systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { cleanActionData } from '../general/clean-action-data.js';
import { processAction } from '../general/process-action.js';
import { restoreOwnDeck } from '../deck-constructor/own-deck.mjs';
import { roomRejectMessage } from '../lobby/public-room-view.mjs';
import { chooseUsername } from '../../initialization/document-event-listeners/sidebox/p2/room-buttons.js';
import {
  removeSyncIntervals,
  resetNetcodeForRoomChange,
} from '../../initialization/socket-event-listeners/socket-event-listeners.js';
import { makeSoloRoomId, soloOwnerName } from './solo-seat.mjs';

let soloUnavailable = false;
let refusalListenerInstalled = false;

const onSoloRoomRefused = (event) => {
  const reason = event.detail?.reason;
  // A solo room this socket could not reclaim (reconnect) is gone: back to the local board.
  if (!leaveSoloRoom()) systemState.roomId = '';
  if (reason === 'solo_needs_authority') soloUnavailable = true;
  appendMessage('', roomRejectMessage(reason).replace('\n', ' '), 'announcement', false);
};

const installRefusalListener = () => {
  if (refusalListenerInstalled) return;
  refusalListenerInstalled = true;
  document.addEventListener('solo-room-refused', onSoloRoomRefused);
};

/**
 * Asks the server for a fresh solo room. No-op while already in (or joining) a room, and
 * once the server has said it cannot host one.
 *
 * @returns {boolean} true when a join was sent
 */
export function joinSoloRoom() {
  installRefusalListener();
  if (soloUnavailable || systemState.solo || systemState.isTwoPlayer || systemState.roomId) {
    return false;
  }
  const roomId = makeSoloRoomId();
  systemState.roomId = roomId;
  systemState.p2SelfUsername = chooseUsername(roomId);
  socket.emit('joinGame', roomId, systemState.p2SelfUsername, false, null, { solo: true });
  return true;
}

/**
 * Leaves the solo room and restores the local board with this player's decks, as leaving a
 * Multiplayer room does.
 *
 * @returns {boolean} true when a solo room was left
 */
export function leaveSoloRoom() {
  if (!systemState.solo) return false;
  socket.emit('leaveRoom', {
    roomId: systemState.roomId,
    username: soloOwnerName(systemState),
    isSpectator: false,
  });
  systemState.solo = false;
  systemState.nearSeat = 'p1';
  systemState.isTwoPlayer = false;
  systemState.serverAuthoritative = false;
  systemState.roomId = '';
  cleanActionData('self');
  cleanActionData('opp');
  reset('opp', true, true, false, true);
  restoreOwnDeck(systemState);
  reset('self', true, true, false, true);
  removeSyncIntervals();
  resetNetcodeForRoomChange();
  document.dispatchEvent(new CustomEvent('room-changed'));
  if (systemState.selfDeckData) {
    processAction('self', true, 'loadDeckData', [
      systemState.selfDeckData,
      systemState.deckFormat.self,
    ]);
  }
  if (systemState.p1OppDeckData) {
    processAction('opp', true, 'loadDeckData', [
      systemState.p1OppDeckData,
      systemState.deckFormat.p1Opp,
    ]);
  }
  return true;
}
