import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPECS } from '../specs/index.mjs';
import { MAX_MOVES } from '../max-moves.mjs';
import { deriveFamily, validateSpec } from '../../move-spec.mjs';

test('every Max / G-Max spec is valid, tier S, keyed by its id, and matches its catalogue row', () => {
  for (const [key, spec] of Object.entries(MAX_SPECS)) {
    assert.deepEqual(validateSpec(spec), [], `${key}: ${validateSpec(spec).join('; ')} (family rule → ${deriveFamily(spec)})`);
    assert.equal(spec.tier, 'S', key);
    assert.equal(spec.id, key);
    assert.ok(Object.hasOwn(MAX_MOVES, key), `${key} is not in the catalogue`);
    assert.equal(spec.name, MAX_MOVES[key].name, key);
    assert.equal(spec.vgType, MAX_MOVES[key].vgType, key);
  }
});

test('the registry is frozen', () => {
  assert.ok(Object.isFrozen(MAX_SPECS));
});

test('every Max and G-Max Move of the catalogue has shipped its spec', () => {
  const missing = Object.keys(MAX_MOVES).filter((id) => !Object.hasOwn(MAX_SPECS, id));
  assert.deepEqual(missing, []);
});
