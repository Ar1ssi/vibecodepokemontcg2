import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_VOICES, voicesFor } from '../fx-audio.mjs';

test('fx-audio: a family voice list is frozen as well as the table', () => {
  for (const [family, voices] of Object.entries(FAMILY_VOICES)) {
    assert.ok(Object.isFrozen(voices), `${family} list is mutable`);
  }
});

test('fx-audio: the static and status voice lists a caller receives cannot be mutated', () => {
  assert.ok(Object.isFrozen(voicesFor('attack')));
  assert.ok(Object.isFrozen(voicesFor('status', { condition: 'Poisoned' })));
});
