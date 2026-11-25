// Design 090: the page joins its solo room by itself at load (edge-case rows 1-3).
// `shouldAutoJoinSolo` is the pure decision; `autoJoinSoloAtLoad` runs it against a fake socket.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { shouldAutoJoinSolo } from '../solo-at-load.mjs';

const STUBS = {
  'state.js': 'export const socket = globalThis.__solo.socket; export const systemState = globalThis.__solo.state;',
  'actions/general/reset.js': 'export const reset = () => {};',
  'setup/chatbox/append-message.js': 'export const appendMessage = (...a) => globalThis.__solo.messages.push(a[1]);',
  'setup/general/clean-action-data.js': 'export const cleanActionData = () => {};',
  'setup/general/process-action.js': 'export const processAction = () => {};',
  'setup/deck-constructor/own-deck.mjs': 'export const restoreOwnDeck = () => {};',
  'initialization/document-event-listeners/sidebox/p2/room-buttons.js': 'export const chooseUsername = () => "Tester";',
  'initialization/socket-event-listeners/socket-event-listeners.js':
    'export const removeSyncIntervals = () => {}; export const resetNetcodeForRoomChange = () => {};',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

/** The few socket.io client members solo-room.js uses. */
function fakeSocket() {
  const listeners = new Map();
  const socket = {
    connected: false,
    emitted: [],
    emit: (...args) => socket.emitted.push(args),
    on: (event, fn) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
    once(event, fn) {
      const wrapped = (...args) => {
        socket.off(event, wrapped);
        fn(...args);
      };
      socket.on(event, wrapped);
    },
    off: (event, fn) => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)),
    fire: (event, ...args) => [...(listeners.get(event) ?? [])].forEach((fn) => fn(...args)),
    listenerCount: (event) => (listeners.get(event) ?? []).length,
    reset() {
      socket.connected = false;
      socket.emitted = [];
      listeners.clear();
    },
  };
  return socket;
}

const listeners = new Map();
globalThis.document = {
  addEventListener: (type, fn) => listeners.set(type, fn),
  dispatchEvent: (event) => listeners.get(event.type)?.(event),
};
globalThis.CustomEvent = class {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
const loadWindow = (pathname, search = '') => {
  globalThis.window = { location: { pathname, search }, __PTCG_E2E_ALLOWED: search.includes('e2e=1') };
};

// The stubbed state.js binds these objects once, so each test resets them in place.
globalThis.__solo = { socket: fakeSocket(), messages: [], state: {} };

beforeEach(() => {
  const solo = globalThis.__solo;
  solo.socket.reset();
  solo.messages.length = 0;
  Object.assign(solo.state, { solo: false, isTwoPlayer: false, roomId: '' });
  loadWindow('/');
});

const { autoJoinSoloAtLoad, joinSoloRoom } = await import('../solo-room.js');

test('shouldAutoJoinSolo: the game page joins; the builder windows and the e2e harness do not', () => {
  assert.equal(shouldAutoJoinSolo({ pathname: '/', search: '' }), true);
  assert.equal(shouldAutoJoinSolo({ pathname: '/deck-builder' }), false);
  assert.equal(shouldAutoJoinSolo({ pathname: '/build-and-battle' }), false);
  assert.equal(shouldAutoJoinSolo({ pathname: '/build-and-battle-legacy' }), false);
  assert.equal(shouldAutoJoinSolo({ pathname: '/homebrew-battle' }), false);
  assert.equal(shouldAutoJoinSolo({ pathname: '/', search: '?e2e=1', e2eMode: true }), false);
  assert.equal(shouldAutoJoinSolo({ pathname: '/', search: '?e2e=1&autosolo=1', e2eMode: true }), true);
  // `?e2e=1` alone, with the bridge not armed server-side, is an ordinary visit.
  assert.equal(shouldAutoJoinSolo({ pathname: '/', search: '?e2e=1', e2eMode: false }), true);
  assert.equal(shouldAutoJoinSolo(), true);
});

test('row 1: before the socket connects nothing is sent; the join goes out once, on connect', () => {
  const { socket, state } = globalThis.__solo;
  assert.equal(autoJoinSoloAtLoad(), true);
  assert.deepEqual(socket.emitted, []);
  assert.equal(state.roomId, '', 'no room is claimed before the join is sent');
  socket.connected = true;
  socket.fire('connect');
  assert.equal(socket.emitted.length, 1);
  assert.equal(socket.emitted[0][0], 'joinGame');
  assert.match(socket.emitted[0][1], /^solo-[0-9a-z]{8}$/);
  assert.deepEqual(socket.emitted[0][5], { solo: true });
  // A reconnect later must not join a second room.
  socket.fire('connect');
  assert.equal(socket.emitted.length, 1);
});

test('an already connected socket joins at once, as the Solo tab does', () => {
  const { socket, state } = globalThis.__solo;
  socket.connected = true;
  assert.equal(autoJoinSoloAtLoad(), true);
  assert.equal(socket.emitted.length, 1);
  assert.equal(state.roomId, socket.emitted[0][1]);
});

test('row 2: the builder window and the e2e harness do not join', () => {
  const { socket } = globalThis.__solo;
  socket.connected = true;
  loadWindow('/deck-builder');
  assert.equal(autoJoinSoloAtLoad(), false);
  loadWindow('/', '?e2e=1');
  assert.equal(autoJoinSoloAtLoad(), false);
  assert.deepEqual(socket.emitted, []);
  assert.equal(socket.listenerCount('connect'), 0);
});

test('row 3: an unreachable server gets one visible message, and no retry loop', () => {
  const { socket, messages } = globalThis.__solo;
  autoJoinSoloAtLoad();
  socket.fire('connect_error', new Error('xhr poll error'));
  socket.fire('connect_error', new Error('xhr poll error'));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Cannot reach the server/);
  assert.deepEqual(socket.emitted, []);
});

test('row 3: a refused solo join leaves the board empty with one visible message, and is not retried', () => {
  const { socket, state, messages } = globalThis.__solo;
  socket.connected = true;
  autoJoinSoloAtLoad();
  assert.equal(socket.emitted.length, 1);
  document.dispatchEvent(new CustomEvent('solo-room-refused', { detail: { reason: 'solo_unavailable' } }));
  assert.equal(state.roomId, '');
  assert.equal(state.solo, false);
  assert.equal(messages.length, 1);
  assert.equal(socket.emitted.length, 1, 'no second join was sent');
});

test('the automatic join is a no-op when a room is already being joined', () => {
  const { socket, state } = globalThis.__solo;
  state.roomId = 'solo-existing';
  assert.equal(joinSoloRoom(), false);
  assert.deepEqual(socket.emitted, []);
});
