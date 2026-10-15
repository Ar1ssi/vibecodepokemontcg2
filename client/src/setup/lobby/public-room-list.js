import { socket, systemState } from '../../state.js';
import { joinRoomById } from '../../initialization/document-event-listeners/sidebox/p2/room-buttons.js';
import { publicRoomRows } from './public-room-view.mjs';
import { readSeatToken } from './seat-token-store.mjs';

// Design 069: the always-open rooms in the Multiplayer tab. The server pushes `lobbyRooms` to
// subscribed sockets and drops the subscription itself when this socket joins a room.

const textElement = (tag, className, text) => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

const roomButton = (label, className, onClick) => {
  const button = textElement('button', `public-room-button ${className}`, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
};

const renderRow = (row) => {
  const item = document.createElement('li');
  item.className = 'public-room';
  item.dataset.roomId = row.id;

  const details = document.createElement('div');
  details.className = 'public-room-details';
  const heading = document.createElement('div');
  heading.className = 'public-room-heading';
  heading.append(textElement('span', 'public-room-name', row.name));
  if (row.formatLabel) heading.append(textElement('span', 'public-room-format', row.formatLabel));
  details.append(heading, textElement('div', 'public-room-status', row.statusLabel));
  if (row.playersLabel) details.append(textElement('div', 'public-room-players', row.playersLabel));
  if (row.spectatorsLabel) {
    details.append(textElement('div', 'public-room-spectators', row.spectatorsLabel));
  }

  const actions = document.createElement('div');
  actions.className = 'public-room-actions';
  if (row.canJoin) {
    actions.append(
      roomButton(row.joinLabel, 'public-room-join', () =>
        joinRoomById(row.id, { spectate: false })
      )
    );
  }
  if (row.canWatch) {
    actions.append(
      roomButton('Watch', 'public-room-watch', () => joinRoomById(row.id, { spectate: true }))
    );
  }

  item.append(details, actions);
  return item;
};

const renderRooms = (rooms) => {
  const list = document.getElementById('publicRoomList');
  if (!list) return;
  const heldSeatName = (roomId) => readSeatToken(roomId)?.username ?? null;
  list.replaceChildren(...publicRoomRows(rooms, heldSeatName).map(renderRow));
};

const subscribeWhileInLobby = () => {
  if (!systemState.isTwoPlayer) socket.emit('lobbySubscribe');
};

export const initializePublicRoomList = () => {
  socket.on('lobbyRooms', (data) => renderRooms(data?.rooms));
  // A reconnect is a new server-side socket with no subscription.
  socket.on('connect', subscribeWhileInLobby);
  document.addEventListener('room-changed', subscribeWhileInLobby);
  if (socket.connected) subscribeWhileInLobby();
};
