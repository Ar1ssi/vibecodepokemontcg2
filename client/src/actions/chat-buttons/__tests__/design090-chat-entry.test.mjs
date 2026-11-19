// Design 090: attack, retreat, pass and stadiumEffect are entry points only. Each sends exactly
// one server command through the authoritative gate; a refused dispatch (no room, a gate miss,
// an opponent seat this client does not drive) leaves one chat line and changes nothing; a relayed
// mirror call (emit false) runs nothing.
// chat-buttons.js imports browser paths ('/shared/…') and DOM-bound client modules, so this file
// maps '/shared/' onto the repo and stubs the DOM-bound modules before importing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__entry[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__entry?.${name}?.(...args);`).join('\n');

const STUBS = {
  'state.js': 'export const systemState = globalThis.__entrySystemState;',
  'setup/chatbox/append-message.js': forward(['appendMessage']),
  'log/sync-log.js': forward(['logSync']),
  'setup/netcode/authoritative-dispatch.js': forward([
    'dispatchAuthoritativeAction',
    'isAuthoritativeDispatchActive',
    'readCardInstanceId',
  ]),
};

globalThis.__entrySystemState = { isTwoPlayer: true, solo: false };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('/shared/')) {
      return { url: pathToFileURL(path.join(repoRoot, specifier)).href, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const { attack, retreat, pass, stadiumEffect } = await import('../chat-buttons.js');
const { rulesState } = await import('../../../../../shared/engine/rules/rules-state.mjs');

// Runs one entry point against a stubbed gate. `dispatched` is what the gate answers;
// `active` is whether a room is live (the refusal line differs).
const run = async ({ dispatched = true, active = true, call, state = {} }) => {
  const sent = [];
  const chat = [];
  const logs = [];
  Object.assign(globalThis.__entrySystemState, { isTwoPlayer: true, solo: false }, state);
  globalThis.__entry = {
    dispatchAuthoritativeAction: (action, params) => {
      sent.push({ action, ...params });
      return dispatched;
    },
    isAuthoritativeDispatchActive: () => active,
    readCardInstanceId: (el) => (el?.dataset?.instanceId != null ? Number(el.dataset.instanceId) : null),
    appendMessage: (user, text) => chat.push({ user, text }),
    logSync: (event, detail) => logs.push({ event, detail }),
  };
  const before = JSON.stringify(rulesState);
  const result = await call();
  return { sent, chat, logs, result, rulesUnchanged: JSON.stringify(rulesState) === before };
};

const ENTRY_POINTS = [
  { name: 'attack', command: 'attack', call: () => attack('self', true, 1), args: [1, {}] },
  { name: 'retreat', command: 'retreat', call: () => retreat('self'), args: [] },
  { name: 'pass', command: 'pass', call: () => pass('self'), args: [{}] },
  {
    name: 'stadiumEffect',
    command: 'stadium-effect',
    call: () => stadiumEffect('self', { action: 'draw' }),
    args: [{ action: 'draw' }],
  },
];

for (const entry of ENTRY_POINTS) {
  test(`${entry.name} sends exactly one ${entry.command} command and says nothing`, async () => {
    const { sent, chat, result } = await run({ call: entry.call });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].action, entry.command);
    assert.equal(sent[0].user, 'self');
    assert.equal(sent[0].emit, true);
    assert.deepEqual(sent[0].commandArgs, entry.args);
    assert.deepEqual(chat, []);
    assert.equal(result, true);
  });

  test(`${entry.name} refused by the gate in a room: one chat line, one log line, nothing mutated`, async () => {
    const { sent, chat, logs, result, rulesUnchanged } = await run({
      dispatched: false,
      active: true,
      call: entry.call,
    });
    assert.equal(sent.length, 1, 'one attempt, no fall-through to a second path');
    assert.equal(chat.length, 1);
    assert.match(chat[0].text, /could not be sent to the server/);
    assert.deepEqual(
      logs.map((l) => l.event),
      ['dispatch.refused']
    );
    assert.equal(result, false);
    assert.equal(rulesUnchanged, true);
  });

  // With no room the dispatcher refuses by itself (it posts the join-a-room line and answers
  // true, authoritative-dispatch.test.mjs): this module must not add a second line.
  test(`${entry.name} with no room leaves the refusal to the dispatcher`, async () => {
    const { chat, result, rulesUnchanged } = await run({ dispatched: true, active: false, call: entry.call });
    assert.deepEqual(chat, []);
    assert.equal(result, true);
    assert.equal(rulesUnchanged, true);
  });
}

test('a relayed mirror call (emit false) sends nothing and says nothing', async () => {
  const calls = [
    () => attack('opp', 0, {}, false),
    () => retreat('opp', 0, false),
    () => pass('opp', {}, false),
    () => stadiumEffect('opp', { action: 'draw' }, false),
  ];
  for (const call of calls) {
    const { sent, chat, logs, result } = await run({ call });
    assert.deepEqual(sent, []);
    assert.deepEqual(chat, []);
    assert.deepEqual(logs, []);
    assert.equal(result, false);
  }
});

test('retreat names the dragged bench card by its server instanceId', async () => {
  const droppedOn = { dataset: { instanceId: '42' } };
  const { sent } = await run({ call: () => retreat('self', true, droppedOn) });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].commandArgs, [42]);
});

test('retreat with a bench index from a relay names no card', async () => {
  const { sent } = await run({ call: () => retreat('self', 2, true) });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].commandArgs, []);
});

test('attack in a solo room acts for whoever holds the turn', async () => {
  const savedTurn = rulesState.turnPlayer;
  const savedEnabled = rulesState.enabled;
  try {
    rulesState.enabled = true;
    rulesState.turnPlayer = 'opp';
    const { sent } = await run({
      call: () => attack('self', true, 0),
      state: { isTwoPlayer: false, solo: true },
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].user, 'opp');
  } finally {
    rulesState.turnPlayer = savedTurn;
    rulesState.enabled = savedEnabled;
  }
});

test('the old opponent relay is gone: an opp call in a two-player room goes to the gate, not processAction', async () => {
  const { sent } = await run({ dispatched: false, call: () => attack('opp', true, 0) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].user, 'opp');
});
