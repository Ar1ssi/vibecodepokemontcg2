import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckFormatOf, deckFormatSlot, resolveFormatAndEmit } from '../deck-format-args.mjs';

test('the format slot carries the deck format and emit follows it', () => {
  assert.deepEqual(resolveFormatAndEmit('build-battle', false), { format: 'build-battle', emit: false });
  assert.deepEqual(resolveFormatAndEmit('tcg', true), { format: 'tcg', emit: true });
});

test('a local call without format or emit loads Standard and emits', () => {
  assert.deepEqual(resolveFormatAndEmit(undefined, undefined), { format: 'tcg', emit: true });
  assert.deepEqual(resolveFormatAndEmit('build-battle'), { format: 'build-battle', emit: true });
});

test('a pre-format packet replays emit in the format slot; it stays emit, not a format', () => {
  assert.deepEqual(resolveFormatAndEmit(false, undefined), { format: 'tcg', emit: false });
  assert.deepEqual(resolveFormatAndEmit(true, undefined), { format: 'tcg', emit: true });
});

test('an unknown format reads as Standard', () => {
  assert.deepEqual(resolveFormatAndEmit('pocket', false), { format: 'tcg', emit: false });
  assert.deepEqual(resolveFormatAndEmit(null, false), { format: 'tcg', emit: false });
});

test('the solo alt deck and a room opponent keep separate format slots (I204)', () => {
  assert.equal(deckFormatSlot('self', true), 'self');
  assert.equal(deckFormatSlot('opp', false), 'p1Opp');
  assert.equal(deckFormatSlot('opp', true), 'p2Opp');
  const state = { deckFormat: { self: 'build-battle', p1Opp: 'tcg', p2Opp: 'build-battle' }, isTwoPlayer: true };
  assert.equal(deckFormatOf(state, 'opp'), 'build-battle');
  // Leaving the Build & Battle room: the solo alt deck deals its own 6 Prizes again.
  state.isTwoPlayer = false;
  assert.equal(deckFormatOf(state, 'opp'), 'tcg');
  assert.equal(deckFormatOf(state, 'self'), 'build-battle');
});

test('a missing or unknown slot reads as Standard', () => {
  assert.equal(deckFormatOf({}, 'opp'), 'tcg');
  assert.equal(deckFormatOf({ deckFormat: { self: 'pocket' } }, 'self'), 'tcg');
  assert.equal(deckFormatOf(null, 'self'), 'tcg');
});
