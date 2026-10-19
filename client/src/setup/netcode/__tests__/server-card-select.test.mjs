import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachCandidateIds, canStartAttach, registrySideOf } from '../server-card-select.mjs';

const rec = (instanceId, side, zone, attachedTo = null) => ({ instanceId, side, zone, card: { attachedTo } });

test('registrySideOf maps the clicked card owner to the registry side', () => {
  assert.equal(registrySideOf('self'), 'you');
  assert.equal(registrySideOf('opp'), 'them');
});

test('attach targets are the owner\'s in-play roots only', () => {
  const records = [
    rec(1, 'you', 'active'),
    rec(2, 'you', 'bench'),
    rec(3, 'you', 'bench', 2),
    rec(4, 'you', 'hand'),
    rec(5, 'them', 'active'),
    null,
  ];
  assert.deepEqual(attachCandidateIds(records, { cardUser: 'self' }), [1, 2]);
  assert.deepEqual(attachCandidateIds(records, { cardUser: 'opp' }), [5]);
  assert.deepEqual(attachCandidateIds(null, { cardUser: 'self' }), []);
});

test('attach mode starts from a card outside play or one attached in play', () => {
  assert.equal(canStartAttach(rec(1, 'you', 'hand')), true);
  assert.equal(canStartAttach(rec(1, 'you', 'discard')), true);
  assert.equal(canStartAttach(rec(1, 'you', 'bench', 7)), true);
  assert.equal(canStartAttach(rec(1, 'you', 'active')), false);
  assert.equal(canStartAttach(null), false);
});
