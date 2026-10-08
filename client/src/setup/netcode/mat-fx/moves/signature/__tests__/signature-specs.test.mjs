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

test('slice 5: the Fire and Grass signatures ship, material per § Options 4', () => {
  const ids = ['blue-flare', 'fusion-flare', 'magma-storm', 'sacred-fire', 'searing-shot', 'v-create', 'ivy-cudgel', 'seed-flare'];
  for (const id of ids) {
    const spec = SIGNATURE_SPECS[id];
    assert.ok(spec, id);
    assert.deepEqual(validateSpec(spec), [], id);
    assert.equal(spec.tier, 'S', id);
    // The spec's own material is the move row's; Ivy Cudgel's mask material is applied at play time.
    assert.equal(spec.material, SIGNATURE_MOVES[id].material, id);
  }
  assert.equal(SIGNATURE_SPECS['ivy-cudgel'].material, 'grass');
});

test('slice 6: the Water and Ice signatures ship, material per § Options 4', () => {
  const ids = ['hydro-steam', 'origin-pulse', 'steam-eruption', 'surging-strikes', 'freeze-shock', 'glacial-lance', 'glaciate', 'ice-burn'];
  for (const id of ids) {
    const spec = SIGNATURE_SPECS[id];
    assert.ok(spec, id);
    assert.deepEqual(validateSpec(spec), [], id);
    assert.equal(spec.tier, 'S', id);
    assert.equal(spec.material, SIGNATURE_MOVES[id].material, id);
  }
});

test('slice 7: the Electric signatures ship, material per § Options 4', () => {
  const ids = ['bolt-strike', 'electro-drift', 'fusion-bolt', 'plasma-fists', 'thunder-cage', 'thunderclap', 'wildbolt-storm'];
  for (const id of ids) {
    const spec = SIGNATURE_SPECS[id];
    assert.ok(spec, id);
    assert.deepEqual(validateSpec(spec), [], id);
    assert.equal(spec.tier, 'S', id);
    assert.equal(spec.material, SIGNATURE_MOVES[id].material, id);
  }
});

test('slice 8: the Ground and Rock signatures ship, material per § Options 4', () => {
  const ids = ['lands-wrath', 'precipice-blades', 'sandsear-storm', 'thousand-arrows', 'thousand-waves', 'diamond-storm', 'mighty-cleave'];
  for (const id of ids) {
    const spec = SIGNATURE_SPECS[id];
    assert.ok(spec, id);
    assert.deepEqual(validateSpec(spec), [], id);
    assert.equal(spec.tier, 'S', id);
    assert.equal(spec.material, SIGNATURE_MOVES[id].material, id);
  }
});
