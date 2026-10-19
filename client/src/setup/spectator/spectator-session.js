// Design 069: a spectator of a server-authoritative room. Server views arrive here instead of
// going straight to applyView: they are mapped onto the chosen perspective first, and the last
// one is kept so the top-left switch can redraw the board from another seat at once.
import { systemState } from '../../state.js';
import { applyView, clearRenderedBoard } from '../netcode/apply-view.js';
import {
  DEFAULT_SPECTATOR_MODE,
  isSpectatorMode,
  spectatorModeLabel,
  spectatorPerspective,
} from './spectator-view.mjs';

const SWITCH_ID = 'spectatorViewSwitch';

let active = false;
let mode = DEFAULT_SPECTATOR_MODE;
let lastRawView = null;
let lastOptions = {};
let switchWired = false;

export const isSpectatingAuthoritative = () => active;
export const getSpectatorMode = () => mode;

/** `{ playerId: username }` for every seat of the last spectator view (battle-log lines). */
export const spectatorPlayerNames = () => {
  const names = {};
  for (const [id, player] of Object.entries(lastRawView?.players || {})) {
    names[id] = player?.username || id;
  }
  return names;
};

/**
 * The username of the watched seat on a board side, so turn banners and the HUD can say whose
 * turn it is instead of "your"/"opponent's". Null when not spectating.
 *
 * @param {'self'|'opp'} user
 * @returns {string|null}
 */
export const spectatorSeatName = (user) => {
  if (!active) return null;
  if (user === 'self') return systemState.p2SelfUsername || null;
  if (user === 'opp') return systemState.p2OppUsername || null;
  return null;
};

const syncBodyClasses = () => {
  const body = document.body;
  if (!body) return;
  const broadcast = active && mode === 'broadcast';
  body.classList.toggle('spectating', active);
  body.classList.toggle('spectator-broadcast', broadcast);
};

const renderSwitch = () => {
  const container = document.getElementById(SWITCH_ID);
  if (!container) return;
  container.hidden = !active;
  for (const button of container.querySelectorAll('button[data-mode]')) {
    const selected = button.dataset.mode === mode;
    button.textContent = spectatorModeLabel(lastRawView, button.dataset.mode);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
};

const wireSwitch = () => {
  if (switchWired) return;
  const container = document.getElementById(SWITCH_ID);
  if (!container) return;
  switchWired = true;
  container.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-mode]');
    if (button) setSpectatorMode(button.dataset.mode);
  });
};

// Name plates and legacy announcements read the seated usernames; a spectator borrows the
// watched seats' names (its own name stays in systemState.spectatorUsername).
const syncUsernames = (view) => {
  if (view?.you?.username) systemState.p2SelfUsername = view.you.username;
  if (view?.them?.username) systemState.p2OppUsername = view.them.username;
};

// The broadcast layout turns both boards without resizing their frames: the table tilt
// re-lays the mat on board-layout-changed, card overlays re-measure on resize.
const announceLayoutChange = () => {
  requestAnimationFrame(() => {
    document.dispatchEvent(new CustomEvent('board-layout-changed'));
    window.dispatchEvent(new Event('resize'));
  });
};

const isOlder = (view, than) =>
  typeof view?.stateVersion === 'number' &&
  typeof than?.stateVersion === 'number' &&
  view.stateVersion < than.stateVersion;

export function startSpectatorSession() {
  active = true;
  lastRawView = null;
  lastOptions = {};
  wireSwitch();
  syncBodyClasses();
  renderSwitch();
}

export function endSpectatorSession() {
  const wasBroadcast = active && mode === 'broadcast';
  // syncUsernames lent this client the watched seat's name; give its own back.
  if (active && systemState.spectatorUsername) {
    systemState.p2SelfUsername = systemState.spectatorUsername;
  }
  active = false;
  mode = DEFAULT_SPECTATOR_MODE;
  lastRawView = null;
  lastOptions = {};
  syncBodyClasses();
  renderSwitch();
  if (wasBroadcast) announceLayoutChange();
}

/**
 * Renders one server spectator view from the current perspective.
 *
 * @param {object} rawView the server's spectator view
 * @param {object[]} events advisory events
 * @param {object} options applyView options
 */
export function applySpectatorView(rawView, events = [], options = {}) {
  const view = spectatorPerspective(rawView, mode);
  if (!view) return { applied: false, reason: 'not_spectator_view' };
  if (!isOlder(rawView, lastRawView)) {
    lastRawView = rawView;
    lastOptions = options;
  }
  syncUsernames(view);
  renderSwitch();
  return applyView(view, events, options);
}

/**
 * Switches the spectator perspective and redraws the board from the last view.
 *
 * @param {'p1'|'p2'|'broadcast'} nextMode
 * @returns {boolean} false for an unknown mode
 */
export function setSpectatorMode(nextMode) {
  if (!isSpectatorMode(nextMode)) return false;
  if (nextMode === mode) return true;
  const layoutChanged = (nextMode === 'broadcast') !== (mode === 'broadcast');
  mode = nextMode;
  syncBodyClasses();
  renderSwitch();
  if (active && lastRawView) {
    // Every card may change board (you <-> them) or face (a hand hidden or shown).
    clearRenderedBoard(lastOptions);
    const view = spectatorPerspective(lastRawView, mode);
    syncUsernames(view);
    applyView(view, [], lastOptions);
  }
  if (layoutChanged) announceLayoutChange();
  return true;
}
