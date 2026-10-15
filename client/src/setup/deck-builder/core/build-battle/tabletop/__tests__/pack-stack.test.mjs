import test from 'node:test';
import assert from 'node:assert/strict';

import { BASIC_ENERGY_LABELS } from '../../box-catalog.mjs';
import { packEnergyLabel, packStack, poolCardsBefore, stackPositionFor } from '../pack-stack.mjs';

test('an ME pack comes out code card, Basic Energy, then its ten cards in slot order', () => {
  const stack = packStack({ cardCount: 10, era: 'me', seed: 42, packIndex: 0 });
  assert.equal(stack.length, 12);
  assert.deepEqual(stack[0], { kind: 'code' });
  assert.equal(stack[1].kind, 'energy');
  assert.ok(BASIC_ENERGY_LABELS.includes(stack[1].energyLabel));
  assert.deepEqual(
    stack.slice(2).map((item) => item.cardIndex),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
  assert.equal(stack.at(-1).cardIndex, 9, 'the rare slot is seen last');
});

test('an SM pack carries only the code card before its cards', () => {
  const stack = packStack({ cardCount: 10, era: 'sm', seed: 7, packIndex: 2 });
  assert.equal(stack.length, 11);
  assert.deepEqual(stack[0], { kind: 'code' });
  assert.equal(stack[1].kind, 'card');
});

test('the pack Energy is seeded per pack and never moves with other streams', () => {
  assert.equal(packEnergyLabel(42, 0), packEnergyLabel(42, 0));
  const labels = new Set();
  for (let seed = 1; seed <= 60; seed += 1) labels.add(packEnergyLabel(seed, seed % 4));
  assert.ok(labels.size >= 5, 'the stream reaches most Energy types');
  const perPack = [0, 1, 2, 3].map((index) => packEnergyLabel(1234, index));
  assert.ok(new Set(perPack).size >= 2, 'packs of one box differ');
});

test('junk card counts give an extras-only stack', () => {
  assert.equal(packStack({ cardCount: -3, era: 'me', seed: 1, packIndex: 0 }).length, 2);
  assert.equal(packStack({ cardCount: Number.NaN, era: 'xy', seed: 1, packIndex: 0 }).length, 1);
});

test('pool cards before a position skip the extras', () => {
  const stack = packStack({ cardCount: 10, era: 'me', seed: 42, packIndex: 0 });
  assert.equal(poolCardsBefore(stack, 0), 0);
  assert.equal(poolCardsBefore(stack, 2), 0);
  assert.equal(poolCardsBefore(stack, 5), 3);
  assert.equal(poolCardsBefore(stack, 99), 10);
  assert.equal(poolCardsBefore(stack, -1), 0);
});

test('a reload resumes on the code card at 0 revealed, else past the extras', () => {
  const stack = packStack({ cardCount: 10, era: 'me', seed: 42, packIndex: 0 });
  assert.equal(stackPositionFor(stack, 0), 0);
  assert.equal(stackPositionFor(stack, 3), 5);
  assert.equal(stackPositionFor(stack, 10), 12);
  assert.equal(stackPositionFor(stack, 50), 12);
  assert.equal(stackPositionFor(stack, Number.NaN), 0);
  const sm = packStack({ cardCount: 10, era: 'sm', seed: 42, packIndex: 0 });
  assert.equal(stackPositionFor(sm, 3), 4);
});
