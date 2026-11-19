/**
 * @file Design 074 D7: the Solo tab plays through the server; design 090 joins it at page load
 * too (`autoJoinSoloAtLoad`). Joining makes a private
 * `solo-` room whose two seats belong to this one socket; leaving puts the local board back
 * the way leaving a Multiplayer room does. The `joinGame` acknowledgement is handled in
 * socket-event-listeners.js (`handleSoloJoinGame`).
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
import { isE2eMode } from '../general/e2e-mode.mjs';
import { makeSoloRoomId, soloOwnerName } from './solo-seat.mjs';
import { shouldAutoJoinSolo } from './solo-at-load.mjs';

const SERVER_UNREACHABLE_MESSAGE =
  'Cannot reach the server yet. The board stays empty until it connects, then your solo game starts.';

let refusalListenerInstalled = false;

const onSoloRoomRefused = (event) => {
  const reason = event.detail?.reason;
  // A solo room this socket could not reclaim (reconnect) is gone: back to the local board.
  if (!leaveSoloRoom()) systemState.roomId = '';
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
  if (systemState.solo || systemState.isTwoPlayer || systemState.roomId) {
    return false;
  }
  const roomId = makeSoloRoomId();
  systemState.roomId = roomId;
  systemState.p2SelfUsername = chooseUsername(roomId);
  socket.emit('joinGame', roomId, systemState.p2SelfUsername, false, null, { solo: true });
  return true;
}

/**
 * Design 090: the page joins its solo room by itself, as the Solo tab does, once the socket is
 * connected (a join sent earlier would not be acknowledged), unless the page was opened for
 * something else (`shouldAutoJoinSolo`). One attempt: a refused join is reported by
 * `onSoloRoomRefused` and leaves the board empty; an unreachable server gets one message and
 * the join goes out when the socket first connects.
 *
 * @returns {boolean} true when the page set out to join solo
 */
export function autoJoinSoloAtLoad() {
  const { pathname, search } = window.location;
  if (!shouldAutoJoinSolo({ pathname, search, e2eMode: isE2eMode(search) })) return false;
  if (socket.connected) {
    joinSoloRoom();
    return true;
  }
  const onConnectError = () => {
    socket.off('connect_error', onConnectError);
    appendMessage('', SERVER_UNREACHABLE_MESSAGE, 'announcement', false);
  };
  socket.once('connect', () => {
    socket.off('connect_error', onConnectError);
    joinSoloRoom();
  });
  socket.on('connect_error', onConnectError);
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
