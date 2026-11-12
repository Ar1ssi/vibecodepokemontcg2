import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePayload } from '../payload-policy.mjs';

test('view summarizes version, events, choice', () => {
  const view = { stateVersion: 7, lastClientSeq: 3, events: [{ type: 'attack' }], pendingChoice: { choiceId: 'c1' } };
  const out = summarizePayload('view', [view]);
  assert.equal(out.sv, 7);
  assert.equal(out.lastClientSeq, 3);
  assert.deepEqual(out.events, ['attack']);
  assert.equal(out.choice, 'c1');
  assert.ok(out.bytes > 0);
  assert.equal('args' in out, false);
  assert.deepEqual(summarizePayload('view', [view], { trace: true }).args, [view]);
  assert.deepEqual(summarizePayload('view', []).events, []);
});

test('log:* is never logged', () => {
  assert.equal(summarizePayload('log:batch', [{ lines: [] }]), null);
});

test('bulk events carry bytes and keys only', () => {
  const out = summarizePayload('instanceMap', [{ a: 1, b: 2 }]);
  assert.deepEqual(Object.keys(out), ['bytes', 'keys']);
  assert.deepEqual(out.keys, ['a', 'b']);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
  assert.equal(summarizePayload('storeGameState', [many]).keys.length, 20);
});

test('relay events forward the 16 KB hint, others plain args', () => {
  const args = [{ x: 1 }];
  assert.deepEqual(summarizePayload('pushAction', args).maxBytes, 16384);
  assert.equal(summarizePayload('peerLog', args).args, args);
  const plain = summarizePayload('cmd', args);
  assert.equal('maxBytes' in plain, false);
  assert.equal(plain.args, args);
});

test('bytes is 0 for unserializable-by-failure input and never throws', () => {
  const cyc = {};
  cyc.self = cyc;
  assert.doesNotThrow(() => summarizePayload('cmd', [cyc]));
});
