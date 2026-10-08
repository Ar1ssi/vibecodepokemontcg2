import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE_SPECS } from '../specs/index.mjs';
import { SIGNATURE_MOVES } from '../signature-moves.mjs';
import { deriveFamily, validateSpec } from '../../move-spec.mjs';

// Type files that have shipped (grows slice by slice: design 065 slices 5–15).
const SHIPPED_TYPES = [
  ...new Set(Object.values(SIGNATURE_SPECS).map((s) => s.vgType)),
];

test('every signature spec is valid, tier S, keyed by its id, and matches its move row', () => {
  for (const [key, spec] of Object.entries(SIGNATURE_SPECS)) {
    assert.deepEqual(
      validateSpec(spec),
      [],
      `${key}: ${validateSpec(spec).join('; ')} (family rule → ${deriveFamily(spec)})`
    );
    assert.equal(spec.tier, 'S', key);
    assert.equal(spec.id, key);
    assert.ok(Object.hasOwn(SIGNATURE_MOVES, key), key);
    assert.equal(spec.vgType, SIGNATURE_MOVES[key].vgType, key);
  }
});

test('per shipped type, every move of that type has a spec', () => {
  for (const type of SHIPPED_TYPES) {
    for (const [id, m] of Object.entries(SIGNATURE_MOVES)) {
      if (m.vgType === type)
        assert.ok(SIGNATURE_SPECS[id], `${type}: missing ${id}`);
    }
  }
});

test('slice 1 ships the registry empty and frozen', () => {
  assert.ok(Object.isFrozen(SIGNATURE_SPECS));
});
