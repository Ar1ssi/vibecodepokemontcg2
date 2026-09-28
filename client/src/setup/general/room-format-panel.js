import { socket, systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { openBuildBattleWindow } from '../../initialization/document-event-listeners/sidebox/deck-builder-window.js';
import { DECK_FORMAT_BUILD_BATTLE, formatLabel } from '../../../../shared/engine/formats.mjs';
import { roomFormatView } from './room-format-view.mjs';

// Design 053: the format both seated players agree on, shown under the room header.

const REJECTION_TEXT = Object.freeze({
  already_dealt: 'The format is fixed once the cards are dealt. Reset the game to change it.',
  stale_proposal: 'That proposal changed before you answered. Check the new one.',
  no_proposal: 'That proposal was withdrawn.',
  not_seated: 'Only the two seated players choose the format.',
});

const isSpectating = () =>
  systemState.isTwoPlayer && Boolean(document.getElementById('spectatorModeCheckbox')?.checked);

const currentView = () => {
  const room = systemState.roomFormat;
  if (!systemState.isTwoPlayer || room.roomId !== systemState.roomId) {
    return roomFormatView({ seated: [] });
  }
  return roomFormatView({
    format: room.format,
    proposal: room.proposal,
    seated: room.seated,
    self: systemState.p2SelfUsername,
    spectator: isSpectating(),
    dealt: room.dealt,
  });
};

const setBlockedNote = (panel, blocked) => {
  const note = panel.querySelector('.room-format-blocked');
  if (note) note.hidden = !blocked;
};

const openBox = (panel) => setBlockedNote(panel, !openBuildBattleWindow());

export const renderRoomFormatPanel = () => {
  const panel = document.getElementById('roomFormatPanel');
  if (!panel) return;
  const view = currentView();
  panel.hidden = view.mode === 'hidden';
  panel.dataset.mode = view.mode;
  if (view.mode === 'hidden') {
    panel.replaceChildren();
    return;
  }
  const text = document.createElement('p');
  text.className = 'room-format-text';
  text.textContent = view.text;
  const buttons = document.createElement('div');
  buttons.className = 'room-format-buttons';
  for (const spec of view.buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = spec.id === 'accept' || spec.id === 'open-box' ? 'self-color' : 'neutral-color';
    button.dataset.roomFormatButton = spec.id;
    button.textContent = spec.label;
    if (spec.action) button.dataset.action = JSON.stringify(spec.action);
    buttons.append(button);
  }
  const blocked = document.createElement('p');
  blocked.className = 'room-format-blocked';
  blocked.hidden = true;
  blocked.textContent = 'Your browser blocked the new tab. Allow pop-ups for this site, then press the button again.';
  panel.replaceChildren(text, buttons, blocked);
};

const onPanelClick = (event) => {
  const button = event.target.closest('[data-room-format-button]');
  const panel = document.getElementById('roomFormatPanel');
  if (!button || !panel) return;
  if (button.dataset.roomFormatButton === 'open-box') {
    openBox(panel);
    return;
  }
  let action;
  try {
    action = JSON.parse(button.dataset.action || 'null');
  } catch {
    return;
  }
  if (!action) return;
  // Accepting Build & Battle opens the box now, while the click still counts as a user gesture.
  if (action.type === 'accept' && action.format === DECK_FORMAT_BUILD_BATTLE) openBox(panel);
  socket.emit('roomFormatAction', { roomId: systemState.roomId, ...action });
};

const onRoomFormat = (data) => {
  if (!data || data.roomId !== systemState.roomId) return;
  const before = systemState.roomFormat;
  systemState.roomFormat = {
    roomId: data.roomId,
    format: data.format ?? null,
    proposal: data.proposal ?? null,
    seated: Array.isArray(data.seated) ? data.seated : [],
    // Server-authoritative only: cards are dealt, so the format is fixed until a reset.
    dealt: data.dealt === true,
  };
  const agreedNow = data.format && data.format !== before.format && before.roomId === data.roomId;
  if (agreedNow) {
    appendMessage('', `Both players agreed: this match plays ${formatLabel(data.format)}.`, 'announcement', false);
  }
  renderRoomFormatPanel();
};

const onRoomFormatRejected = (data) => {
  if (!data || data.roomId !== systemState.roomId) return;
  appendMessage('', REJECTION_TEXT[data.reason] || 'That format choice was not accepted.', 'announcement', false);
};

export const initializeRoomFormatPanel = () => {
  document.getElementById('roomFormatPanel')?.addEventListener('click', onPanelClick);
  socket.on('roomFormat', onRoomFormat);
  socket.on('roomFormatRejected', onRoomFormatRejected);
  document.addEventListener('room-changed', renderRoomFormatPanel);
};
