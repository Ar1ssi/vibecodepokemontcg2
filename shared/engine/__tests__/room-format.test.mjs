import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRoomFormatAction,
  clearRoomFormatProposal,
  emptyRoomFormat,
} from '../room-format.mjs';

const seated = ['Ash', 'Gary'];
const act = (state, action) => applyRoomFormatAction(state, { seated, ...action });

test('053 row 3/3a: a proposal applies only once the other player accepts it', () => {
  const proposed = act(emptyRoomFormat(), { type: 'propose', format: 'build-battle', username: 'Ash' });
  assert.equal(proposed.ok, true);
  assert.deepEqual(proposed.state, { format: null, proposal: { format: 'build-battle', by: 'Ash' } });

  const accepted = act(proposed.state, { type: 'accept', format: 'build-battle', username: 'Gary' });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.state, { format: 'build-battle', proposal: null });
});

test('053 row 3b: a counter-proposal replaces the live one and swaps who answers', () => {
  const first = act(emptyRoomFormat(), { type: 'propose', format: 'build-battle', username: 'Ash' }).state;
  const counter = act(first, { type: 'propose', format: 'tcg', username: 'Gary' });
  assert.deepEqual(counter.state.proposal, { format: 'tcg', by: 'Gary' });
  assert.equal(act(counter.state, { type: 'accept', format: 'tcg', username: 'Ash' }).state.format, 'tcg');
});

test('053 row 3c: nobody accepts their own proposal or a format that is no longer proposed', () => {
  const proposed = act(emptyRoomFormat(), { type: 'propose', format: 'build-battle', username: 'Ash' }).state;
  assert.equal(act(proposed, { type: 'accept', format: 'build-battle', username: 'Ash' }).reason, 'own_proposal');
  assert.equal(act(proposed, { type: 'accept', format: 'tcg', username: 'Gary' }).reason, 'stale_proposal');
  assert.equal(act(emptyRoomFormat(), { type: 'accept', format: 'tcg', username: 'Gary' }).reason, 'no_proposal');
});

test('053: only the proposer withdraws a proposal, and the agreed format survives it', () => {
  const agreed = { format: 'tcg', proposal: { format: 'build-battle', by: 'Ash' } };
  assert.equal(act(agreed, { type: 'cancel', username: 'Gary' }).reason, 'own_proposal');
  assert.deepEqual(act(agreed, { type: 'cancel', username: 'Ash' }).state, { format: 'tcg', proposal: null });
});

test('053 rows 4-6: spectators, unknown formats and a dealt game are refused unchanged', () => {
  const start = emptyRoomFormat();
  const spectator = act(start, { type: 'propose', format: 'tcg', username: 'Misty' });
  assert.deepEqual([spectator.ok, spectator.reason, spectator.state], [false, 'not_seated', start]);
  assert.equal(act(start, { type: 'propose', format: 'pocket', username: 'Ash' }).reason, 'invalid_format');
  assert.equal(act(start, { type: 'propose', format: 'tcg', username: 'Ash', dealt: true }).reason, 'already_dealt');
  assert.equal(act({ format: 'tcg', proposal: null }, { type: 'propose', format: 'tcg', username: 'Ash' }).reason, 'already_agreed');
  assert.equal(act(start, { type: 'shout', username: 'Ash' }).reason, 'invalid_action');
});

test('053 row 10: a player leaving lapses the proposal but keeps the agreed format', () => {
  assert.deepEqual(clearRoomFormatProposal({ format: 'build-battle', proposal: { format: 'tcg', by: 'Ash' } }), {
    format: 'build-battle',
    proposal: null,
  });
  assert.deepEqual(clearRoomFormatProposal(undefined), emptyRoomFormat());
});
