// undo(): relaying the opponent's undo must not leave this client stuck in "Loading…", and a
// replay with no earlier reset starts from the first recorded action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const STUBS = {
  'state.js': 'export const systemState = globalThis.__undoState;',
  'setup/chatbox/append-message.js': 'export const appendMessage = (...a) => globalThis.__undo.messages.push(a[1]);',
  'setup/general/accept-action.js': 'export const acceptAction = async (...a) => { globalThis.__undo.accepted.push(a[1]); };',
  'setup/general/determine-username.js': 'export const determineUsername = (user) => user;',
  'setup/general/process-action.js': 'export const processAction = (...a) => globalThis.__undo.processed.push(a.slice(0, 3));',
  'setup/netcode/authoritative-dispatch.js': 'export const isAuthoritativeDispatchActive = () => false;',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

globalThis.__undoState = {};
const button = { textContent: 'Undo' };
globalThis.document = { getElementById: () => button };
globalThis.requestAnimationFrame = (fn) => fn();

function arrange(state) {
  Object.assign(globalThis.__undoState, { isUndoInProgress: false, isTwoPlayer: false, solo: false, selfActionData: [], oppActionData: [], ...state });
  globalThis.__undo = { messages: [], accepted: [], processed: [] };
  button.textContent = 'Undo';
}

const { undo } = await import('../undo.js');

test('an opponent undo in a 2P room is relayed once and leaves this client idle', async () => {
  arrange({ isTwoPlayer: true });
  await undo('opp', undefined, true);
  assert.deepEqual(globalThis.__undo.processed, [['opp', true, 'undo']]);
  assert.equal(globalThis.__undoState.isUndoInProgress, false);
  assert.equal(button.textContent, 'Undo');
  assert.deepEqual(globalThis.__undo.messages, []);
});

test('undo replays the recorded actions except the last, from the start when no reset was recorded', async () => {
  arrange({
    selfActionData: [
      { action: 'draw', parameters: [] },
      { action: 'shuffleZone', parameters: [] },
      { action: 'moveCard', parameters: [] },
    ],
  });
  await undo('self', undefined, true);
  assert.deepEqual(globalThis.__undo.accepted, ['draw', 'shuffleZone']);
  assert.equal(globalThis.__undoState.isUndoInProgress, false);
});

test('undo with nothing recorded ends quietly and re-enables the button', async () => {
  arrange({});
  await undo('self', undefined, true);
  assert.equal(button.textContent, 'Undo');
  assert.equal(globalThis.__undoState.isUndoInProgress, false);
  assert.deepEqual(globalThis.__undo.accepted, []);
});
