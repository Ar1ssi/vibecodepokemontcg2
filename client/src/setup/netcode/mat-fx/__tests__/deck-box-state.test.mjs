import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeckBoxState } from '../deck-box-state.mjs';

test('each side starts on the default box, full and shut', () => {
  const state = createDeckBoxState();
  assert.equal(state.idFor('self'), null);
  assert.equal(state.idFor('opp'), null);
  assert.equal(state.isDealt('self'), false);
});

test('setId keeps catalog-shaped ids and reads anything else as the default box', () => {
  const state = createDeckBoxState();
  state.setId('self', 'db_151_sv3-5_etb');
  assert.equal(state.idFor('self'), 'db_151_sv3-5_etb');
  state.setId('opp', '<img onerror=x>');
  assert.equal(state.idFor('opp'), null);
  state.setId('nobody', 'db_x');
  assert.equal(state.idFor('nobody'), null);
});

test('listeners hear changes only', () => {
  const state = createDeckBoxState();
  let heard = 0;
  const stop = state.subscribe(() => heard++);
  state.setId('self', 'db_a');
  state.setId('self', 'db_a');
  state.setDealt('self', true);
  state.setDealt('self', true);
  state.clearDealt();
  state.clearDealt();
  assert.equal(heard, 3);
  stop();
  state.setId('self', 'db_b');
  assert.equal(heard, 3);
});

test('clearDealt shuts only the named sides', () => {
  const state = createDeckBoxState();
  state.setDealt('self', true);
  state.setDealt('opp', true);
  state.clearDealt(['opp']);
  assert.equal(state.isDealt('self'), true);
  assert.equal(state.isDealt('opp'), false);
});
