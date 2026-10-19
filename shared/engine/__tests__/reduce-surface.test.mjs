// reduce.mjs is the engine's only public reducer entry; design 073 B (I250) split its body into
// reduce/<domain>.mjs behind the same three exports. This pins that surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as reduce from '../reduce.mjs';
import { validateLegality } from '../reduce/legality.mjs';
import { attackExtrasFor } from '../reduce/attack.mjs';

test('reduce.mjs exports exactly applyCommand, validateLegality and attackExtrasFor', () => {
  assert.deepEqual(Object.keys(reduce).sort(), ['applyCommand', 'attackExtrasFor', 'validateLegality']);
});

test('the re-exports are the domain modules’ own functions, with unchanged arity', () => {
  assert.equal(reduce.validateLegality, validateLegality);
  assert.equal(reduce.attackExtrasFor, attackExtrasFor);
  assert.equal(reduce.applyCommand.length, 2); // (state, command, rng = null)
  assert.equal(reduce.validateLegality.length, 2); // (state, command)
  assert.equal(reduce.attackExtrasFor.length, 2); // (state, card)
});

test('applyCommand still answers an unknown-shape command without throwing', () => {
  const result = reduce.applyCommand(null, { type: 'draw', payload: {}, playerId: 'p1' });
  assert.equal(result.error, 'bad_command');
  assert.equal(result.state, null);
});
