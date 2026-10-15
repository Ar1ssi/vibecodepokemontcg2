import { reset } from '../../../../actions/general/reset.js';
import { socket, systemState } from '../../../../state.js';
import { cleanActionData } from '../../../../setup/general/clean-action-data.js';
import { processAction } from '../../../../setup/general/process-action.js';
import { restoreOwnDeck } from '../../../../setup/deck-constructor/own-deck.mjs';
import { handleSpectatorButtons } from '../../../../setup/spectator/handle-spectator-buttons.js';
import {
  removeSyncIntervals,
  resetNetcodeForRoomChange,
} from '../../../socket-event-listeners/socket-event-listeners.js';
import {
  clearSeatToken,
  readSeatToken,
  seatTokenFor,
} from '../../../../setup/lobby/seat-token-store.mjs';

const RANDOM_USERNAMES = [
  'Froakie',
  'Shauna',
  'Avery',
  'Peonia',
  'Korrina',
  'Guzma',
  'Bridgette',
  'AZ',
  'Xerosic',
  'Colress',
  'Melony',
  'Serena',
  'Thorton',
  'Cyllene',
  'Acerola',
  'Marnie',
  'Arven',
  'Giovanni',
  'Judge',
  'Boss',
  'Penny',
  'Leon',
  'Cheren',
  'Elesa',
  'Volo',
  'Raihan',
  'Ash',
  'Brock',
  'Misty',
  'Cynthia',
  'Oak',
  'N',
  'Roxanne',
  'Iono',
  'Irida',
  'Lysandre',
  'Cyrus',
  'Hex',
  'Skyla',
  'Juniper',
  'Sycamore',
];

// A blank name box reuses the name this tab last sat in the room with (design 069), so a reload
// can reclaim its seat; otherwise a random trainer name.
const chooseUsername = (roomId) => {
  const typed = document.getElementById('nameInput').value.trim();
  if (typed !== '') return typed;
  const stored = readSeatToken(roomId);
  if (stored) return stored.username;
  return RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
};

/**
 * Joins a room as a player or a spectator: the code room's Join button and the public room
 * list's Join/Watch buttons (design 069).
 * @param {string} roomId
 * @param {{ spectate: boolean }} options
 */
export const joinRoomById = (roomId, { spectate }) => {
  if (!roomId) return;
  // The checkbox is the "am I spectating" state many handlers read.
  document.getElementById('spectatorModeCheckbox').checked = spectate;
  document.getElementById('roomIdInput').value = roomId;
  systemState.p2SelfUsername = chooseUsername(roomId);
  systemState.roomId = roomId;
  socket.emit(
    'joinGame',
    systemState.roomId,
    systemState.p2SelfUsername,
    spectate,
    seatTokenFor(roomId, systemState.p2SelfUsername)
  );
};

/** Puts the Multiplayer tab back in the lobby and restores this player's solo board. */
const returnToLobby = () => {
  const connectedRoom = document.getElementById('connectedRoom');
  const lobby = document.getElementById('lobby');
  const p2ExplanationBox = document.getElementById('p2ExplanationBox');
  const p2Chatbox = document.getElementById('p2Chatbox');
  lobby.style.display = 'block';
  p2ExplanationBox.style.display = 'block';
  document.getElementById('importState').style.display = 'inline';
  document.getElementById('flipBoardButton').style.display = 'inline-block';
  connectedRoom.style.display = 'none';
  clearSeatToken(systemState.roomId);
  systemState.isTwoPlayer = false;
  systemState.roomId = '';
  systemState.opponentSocketId = '';
  cleanActionData('self');
  cleanActionData('opp');
  reset('opp', true, true, false, true);

  // Put back the deck this player loaded (spectating or the room may have
  // replaced the self slot).
  restoreOwnDeck(systemState);

  reset('self', true, true, false, true);
  p2Chatbox.innerHTML = '';
  systemState.coachingMode = false;
  handleSpectatorButtons();
  removeSyncIntervals();
  // Design 002 slice 3.10: leaving must clear the renderer's registries
  // and client-seq counter, not just the sync intervals, so the next
  // room starts clean.
  resetNetcodeForRoomChange();
  document.dispatchEvent(new CustomEvent('room-changed'));
  systemState.spectatorId = '';
  // add the deck data back to the actiondata list
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
};

export const initializeRoomButtons = () => {
  const roomIdInput = document.getElementById('roomIdInput');

  const copyButton = document.getElementById('copyButton');
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(roomIdInput.value);

    copyButton.classList.add('copied');
    setTimeout(() => {
      copyButton.classList.remove('copied');
    }, 1000);
  });

  const roomHeaderCopyButton = document.getElementById('roomHeaderCopyButton');
  roomHeaderCopyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(roomIdInput.value).then(() => {
      roomHeaderCopyButton.classList.add('copied');
      setTimeout(() => {
        roomHeaderCopyButton.classList.remove('copied');
      }, 1000);
    });
  });

  const generateIdButton = document.getElementById('generateIdButton');
  generateIdButton.addEventListener('click', () => {
    roomIdInput.value = socket.id.toString() + '0';
  });

  const joinRoomButton = document.getElementById('joinRoomButton');
  joinRoomButton.addEventListener('click', () => {
    joinRoomById(roomIdInput.value.trim(), {
      spectate: document.getElementById('spectatorModeCheckbox').checked,
    });
  });

  // The server already freed this seat (design 069), so no leaveRoom is sent.
  document.addEventListener('room-seat-lost', () => {
    if (systemState.isTwoPlayer) returnToLobby();
  });

  const leaveRoomButton = document.getElementById('leaveRoomButton');
  leaveRoomButton.addEventListener('click', () => {
    if (
      window.confirm(
        'Are you sure you want to leave the room? Current game state will be lost.'
      )
    ) {
      const isSpectator =
        systemState.isTwoPlayer &&
        document.getElementById('spectatorModeCheckbox').checked;
      const username = isSpectator
        ? systemState.spectatorUsername
        : systemState.p2SelfUsername;
      const data = {
        roomId: systemState.roomId,
        username: username,
        isSpectator:
          document.getElementById('spectatorModeCheckbox').checked &&
          systemState.isTwoPlayer,
      };
      socket.emit('leaveRoom', data);
      returnToLobby();
    }
  });
};
