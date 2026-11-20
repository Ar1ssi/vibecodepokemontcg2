import { socket, systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { homebrewClockView } from './homebrew-clock-view.mjs';

// Design 090: the homebrew clock under the room header — the pre-deal toggle, then both banks.

const TICK_MS = 250;
const REJECTION_TEXT = Object.freeze({
  already_dealt: 'The clock setting is fixed once the cards are dealt. Reset the game to change it.',
  not_seated: 'Only the two seated players set the clock.',
});

let snapshot = null;
let receivedAt = 0;
let ticker = null;

const isSpectating = () =>
  systemState.isTwoPlayer && Boolean(document.getElementById('spectatorModeCheckbox')?.checked);

const currentView = () => {
  if (!systemState.isTwoPlayer || snapshot?.roomId !== systemState.roomId) return { mode: 'hidden' };
  const room = systemState.roomFormat;
  return homebrewClockView({
    snapshot,
    elapsedMs: Date.now() - receivedAt,
    dealt: room.roomId === systemState.roomId && room.dealt,
    self: isSpectating() ? '' : systemState.p2SelfUsername,
    spectator: isSpectating(),
  });
};

const toggleNode = (view) => {
  const label = document.createElement('label');
  label.className = 'homebrew-clock-toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = view.checked;
  box.disabled = view.disabled;
  box.dataset.homebrewClockToggle = '';
  const text = document.createElement('span');
  text.textContent = view.label;
  label.append(box, text);
  const hint = document.createElement('p');
  hint.className = 'homebrew-clock-hint';
  hint.textContent = view.hint;
  return [label, hint];
};

const rowNode = (row) => {
  const node = document.createElement('div');
  node.className = 'homebrew-clock-row';
  node.dataset.running = String(row.running);
  node.dataset.low = String(row.low);
  node.dataset.out = String(row.out);
  const name = document.createElement('span');
  name.className = 'homebrew-clock-name';
  name.textContent = row.name;
  const time = document.createElement('span');
  time.className = 'homebrew-clock-time';
  time.textContent = row.time;
  node.append(name, time);
  return node;
};

export const renderHomebrewClockPanel = () => {
  const panel = document.getElementById('homebrewClockPanel');
  if (!panel) return;
  const view = currentView();
  panel.hidden = view.mode === 'hidden';
  panel.dataset.mode = view.mode;
  const running = view.mode === 'clock' && view.rows.some((row) => row.running);
  if (running && !ticker) ticker = setInterval(renderHomebrewClockPanel, TICK_MS);
  if (!running && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  if (view.mode === 'hidden') {
    panel.replaceChildren();
    return;
  }
  if (view.mode === 'clock') {
    panel.replaceChildren(...view.rows.map(rowNode));
    return;
  }
  // Re-rendering the toggle mid-click would drop the user's focus; only rebuild when it changed.
  const box = panel.querySelector('[data-homebrew-clock-toggle]');
  if (box && box.checked === view.checked && box.disabled === view.disabled) return;
  panel.replaceChildren(...toggleNode(view));
};

const onPanelChange = (event) => {
  const box = event.target.closest('[data-homebrew-clock-toggle]');
  if (!box) return;
  // The server's broadcast decides; until then show the setting as it stands.
  const wanted = box.checked;
  box.checked = !wanted;
  socket.emit('roomClockAction', { roomId: systemState.roomId, enabled: wanted });
};

// Kept even when it names another room: a joining client can hear it before its own room switch
// lands, and the room-changed render then shows it.
const onHomebrewClock = (data) => {
  if (!data?.roomId) return;
  snapshot = data;
  receivedAt = Date.now();
  renderHomebrewClockPanel();
};

const onRoomClockChanged = (data) => {
  if (!data || data.roomId !== systemState.roomId) return;
  const state = data.enabled ? 'on' : 'off';
  appendMessage('', `${data.by} turned the homebrew clock ${state}.`, 'announcement', false);
};

const onRoomClockRejected = (data) => {
  if (!data || data.roomId !== systemState.roomId) return;
  appendMessage('', REJECTION_TEXT[data.reason] || 'That clock setting was not accepted.', 'announcement', false);
};

export const initializeHomebrewClockPanel = () => {
  document.getElementById('homebrewClockPanel')?.addEventListener('change', onPanelChange);
  socket.on('homebrewClock', onHomebrewClock);
  socket.on('roomClockChanged', onRoomClockChanged);
  socket.on('roomClockRejected', onRoomClockRejected);
  // The deal (roomFormat `dealt`) swaps the toggle for the clocks.
  socket.on('roomFormat', () => queueMicrotask(renderHomebrewClockPanel));
  document.addEventListener('room-changed', renderHomebrewClockPanel);
};
