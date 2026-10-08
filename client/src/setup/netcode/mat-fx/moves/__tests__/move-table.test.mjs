import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_MOVES,
  MOVE_TABLE,
  STAT_CLASSES,
  TIERS,
  VG_TYPES,
  cellLookup,
} from '../move-table.mjs';

test('table covers the 17 main-series types and 154 distinct moves', () => {
  assert.equal(VG_TYPES.length, 17);
  assert.equal(ALL_MOVES.length, 154);
});

test('table matches spec cells (spot checks incl. slash and comma cells)', () => {
  assert.deepEqual(MOVE_TABLE.water.physical[1], ['waterfall', 'liquidation']);
  assert.deepEqual(MOVE_TABLE.grass.special[2], [
    'leaf-storm',
    'solar-beam',
    'seed-flare',
    'petal-dance',
    'energy-ball',
  ]);
  assert.deepEqual(MOVE_TABLE.electric.special[0], ['thunder-shock']);
  assert.deepEqual(MOVE_TABLE.bug.physical[0], [
    'fell-stinger',
    'fury-cutter',
    'pin-missile',
    'twineedle',
  ]);
  assert.deepEqual(MOVE_TABLE.ground.physical[0], ['sand-tomb', 'mud-slap']);
  assert.deepEqual(MOVE_TABLE.ground.special[0], ['mud-slap']);
  assert.deepEqual(MOVE_TABLE.fairy.special[2], ['moonblast']);
});

test('exactly the 7 spec N/A cells are null', () => {
  const missing = [];
  for (const vgType of VG_TYPES) {
    for (const statClass of STAT_CLASSES) {
      for (const tier of TIERS) {
        if (MOVE_TABLE[vgType][statClass][tier - 1] === null) {
          missing.push(`${vgType}.${statClass}.${tier}`);
        }
      }
    }
  }
  assert.deepEqual(missing.sort(), [
    'dark.special.1',
    'dragon.physical.1',
    'fairy.physical.1',
    'psychic.physical.1',
    'psychic.physical.3',
    'rock.special.1',
    'steel.special.1',
  ]);
});

test('every cell resolves to a non-empty list; N/A resolves at its own tier through the other class', () => {
  for (const vgType of VG_TYPES) {
    for (const statClass of STAT_CLASSES) {
      for (const tier of TIERS) {
        const found = cellLookup(vgType, statClass, tier);
        assert.ok(found?.length, `${vgType} ${statClass} ${tier}`);
      }
    }
  }
  assert.deepEqual(cellLookup('psychic', 'physical', 1), ['confusion']);
  assert.deepEqual(cellLookup('dark', 'special', 1), ['pursuit']);
  assert.deepEqual(cellLookup('psychic', 'physical', 3), [
    'psychic',
    'future-sight',
  ]);
  assert.deepEqual(cellLookup('fairy', 'physical', 1), [
    'disarming-voice',
    'fairy-wind',
  ]);
});

test('cellLookup: unknown type or class is null; out-of-range tier clamps', () => {
  assert.equal(cellLookup('normal', 'physical', 1), null);
  assert.equal(cellLookup('fire', 'status', 1), null);
  assert.deepEqual(cellLookup('fire', 'physical', 9), ['fire-punch']);
  assert.deepEqual(cellLookup('fire', 'physical', NaN), ['flame-charge']);
});
