import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_TYPED,
  MASK_MATERIAL,
  SIGNATURE_BY_SLUG,
  SIGNATURE_MOVES,
  TCG_TO_MATERIAL,
} from '../signature-moves.mjs';
import { SIGNATURE_BY_NAME } from '../signature-select.mjs';
import { MATERIAL_KEYS } from '../../move-spec.mjs';
import { VG_TYPES } from '../../move-table.mjs';

// `normal` and `stellar` materials land in slice 3 (design 065 § New pieces G).
const MATERIALS_065 = new Set([...MATERIAL_KEYS, 'normal', 'stellar']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('81 signature moves, each row well-formed', () => {
  const rows = Object.entries(SIGNATURE_MOVES);
  assert.equal(rows.length, 81);
  for (const [id, m] of rows) {
    assert.match(id, SLUG, id);
    assert.ok(typeof m.name === 'string' && m.name.trim(), id);
    assert.ok(
      VG_TYPES.includes(m.vgType) || m.vgType === 'normal',
      `${id} vgType ${m.vgType}`
    );
    assert.ok(
      ['physical', 'special', 'status'].includes(m.statClass),
      `${id} statClass`
    );
    assert.ok(
      m.power === null || (Number.isInteger(m.power) && m.power > 0),
      `${id} power`
    );
    assert.ok(Array.isArray(m.owners) && m.owners.length > 0, `${id} owners`);
    for (const o of m.owners) assert.match(o, SLUG, `${id} owner ${o}`);
    assert.ok(MATERIALS_065.has(m.material), `${id} material ${m.material}`);
    assert.ok(Object.isFrozen(m) && Object.isFrozen(m.owners), `${id} frozen`);
  }
  assert.ok(Object.isFrozen(SIGNATURE_MOVES));
});

test('material = vgType except Tera Starstorm (stellar)', () => {
  for (const [id, m] of Object.entries(SIGNATURE_MOVES)) {
    assert.equal(
      m.material,
      id === 'tera-starstorm' ? 'stellar' : m.vgType,
      id
    );
  }
});

test('every SIGNATURE_BY_SLUG value is null or a move id; every move id but name-only ones reachable by slug', () => {
  for (const [slug, id] of Object.entries(SIGNATURE_BY_SLUG)) {
    assert.match(slug, SLUG);
    assert.ok(
      id === null || Object.hasOwn(SIGNATURE_MOVES, id),
      `${slug} → ${id}`
    );
  }
  const bySlug = new Set(Object.values(SIGNATURE_BY_SLUG));
  const nameOnly = Object.keys(SIGNATURE_MOVES)
    .filter((id) => !bySlug.has(id))
    .sort();
  assert.deepEqual(nameOnly, [
    'dynamax-cannon',
    'fusion-bolt',
    'fusion-flare',
    'searing-shot',
    'thousand-waves',
  ]);
});

test('the six self-status moves are absent', () => {
  for (const id of [
    'burning-bulwark',
    'jungle-healing',
    'geomancy',
    'lunar-dance',
    'lunar-blessing',
    'take-heart',
  ]) {
    assert.ok(!Object.hasOwn(SIGNATURE_MOVES, id), id);
  }
});

test('every move id is reachable by name', () => {
  assert.equal(SIGNATURE_BY_NAME.size, 81);
  assert.deepEqual(
    [...SIGNATURE_BY_NAME.values()].sort(),
    Object.keys(SIGNATURE_MOVES).sort()
  );
});

test('material tables', () => {
  assert.deepEqual([...CARD_TYPED].sort(), [
    'judgment',
    'multi-attack',
    'techno-blast',
  ]);
  for (const m of Object.values(TCG_TO_MATERIAL))
    assert.ok(MATERIALS_065.has(m), m);
  for (const m of Object.values(MASK_MATERIAL))
    assert.ok(MATERIALS_065.has(m), m);
});
