import assert from 'node:assert/strict';
import test from 'node:test';
import { createChoiceGate } from '../choice-gate.mjs';
import { waitForDealOrder } from '../deal-order.js';
import { onEntry } from '../../../log/client-log.js';

test('choice gate: a waiter that throws is reported to onError and the gate still opens', async () => {
  const errors = [];
  const gate = createChoiceGate({
    queueIdle: () => {
      throw new Error('queue gone');
    },
    knockoutScenes: () => [],
    attackSceneEndsAt: () => 0,
    now: () => 0,
    sleep: () => new Promise(() => {}),
    onError: (error) => errors.push(error.message),
  });
  await gate();
  assert.deepEqual(errors, ['queue gone']);
});

test('waitForDealOrder: a timeout resolves null and leaves a client-log warning with the seat', async () => {
  const entries = [];
  const off = onEntry((entry) => entries.push(JSON.parse(entry.line)));
  try {
    assert.equal(await waitForDealOrder(5, 'p2'), null);
  } finally {
    off();
  }
  const warning = entries.find((e) => e.ev === 'dealOrder.timeout');
  assert.ok(warning);
  assert.equal(warning.lvl, 'warn');
  assert.deepEqual(warning.d, { seat: 'p2', timeoutMs: 5 });
});
