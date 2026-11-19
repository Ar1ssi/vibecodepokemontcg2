// undo(): the server replays the undo (design 090 removed the local replay arm). An opponent
// undo in a 2P room is relayed before any state is set; a self undo announces and sends one
// command; with no room it refuses through authoritative-dispatch's helper and sends nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const STUBS = {
  'state.js': 'export const systemState = globalThis.__undoState;',
  'setup/chatbox/append-message.js': 'export const appendMessage = (...a) => globalThis.__undo.messages.push(a[1]);',
  'setup/general/determine-username.js': 'export const determineUsername = (user) => user;',
  'setup/general/process-action.js': 'export const processAction = (...a) => globalThis.__undo.processed.push(a.slice(0, 3));',
  'setup/netcode/authoritative-dispatch.js':
    'export const refuseWithoutRoom = (options) => { globalThis.__undo.refusalChecks.push(options.action); return globalThis.__undo.noRoom; };',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

globalThis.__undoState = {};

function arrange(state, { noRoom = false } = {}) {
  Object.assign(globalThis.__undoState, { isTwoPlayer: false, solo: false, ...state });
  globalThis.__undo = { messages: [], processed: [], refusalChecks: [], noRoom };
}

const { undo } = await import('../undo.js');

test('an opponent undo in a 2P room is relayed once, before any room check or announcement', () => {
  arrange({ isTwoPlayer: true });
  undo('opp', undefined, true);
  assert.deepEqual(globalThis.__undo.processed, [['opp', true, 'undo']]);
  assert.deepEqual(globalThis.__undo.refusalChecks, []);
  assert.deepEqual(globalThis.__undo.messages, []);
});

test('a self undo in a room announces it and sends one undo command', () => {
  arrange({ isTwoPlayer: true, solo: true });
  undo('self', undefined, true);
  assert.deepEqual(globalThis.__undo.refusalChecks, ['undo']);
  assert.deepEqual(globalThis.__undo.messages, ['self took back their last move!']);
  assert.deepEqual(globalThis.__undo.processed, [['self', true, 'undo']]);
});

test('undo with no room refuses: nothing is announced or sent (design 090 row 4)', () => {
  arrange({}, { noRoom: true });
  undo('self', undefined, true);
  assert.deepEqual(globalThis.__undo.refusalChecks, ['undo']);
  assert.deepEqual(globalThis.__undo.messages, []);
  assert.deepEqual(globalThis.__undo.processed, []);
});

test('a relayed undo (emit false) is never refused for want of a room', () => {
  arrange({}, { noRoom: true });
  undo('opp', undefined, false);
  assert.deepEqual(globalThis.__undo.refusalChecks, []);
  assert.deepEqual(globalThis.__undo.processed, [['opp', false, 'undo']]);
});
