import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_LOOP_PARTS, statusLoopBox, statusLoopKeys } from '../status-loop.mjs';
import { STATUS_CONDITION_KEYS } from '../sfx-cues.mjs';

test('statusLoopKeys: Poison and Burn stack with the rotation condition, in Checkup order', () => {
  assert.deepEqual(statusLoopKeys({ poisoned: true, burned: true, specialCondition: 'Asleep' }), [
    'poison',
    'burn',
    'sleep',
  ]);
  assert.deepEqual(statusLoopKeys({ specialCondition: 'Confused' }), ['confusion']);
  assert.deepEqual(statusLoopKeys({}), []);
  assert.deepEqual(statusLoopKeys(null), []);
});

test('every condition key has a loop, and every loop draws something', () => {
  for (const key of Object.values(STATUS_CONDITION_KEYS)) {
    const parts = STATUS_LOOP_PARTS[key];
    assert.ok(parts, `no loop for ${key}`);
    assert.ok(parts.card.length + parts.sky.length > 0, `${key} loop is empty`);
  }
});

test('statusLoopBox: an upright card is its own footprint, offset into the zone', () => {
  const box = statusLoopBox({
    rect: { left: 130, top: 60, width: 90, height: 126 },
    zoneRect: { left: 100, top: 50 },
    rotation: 0,
  });
  assert.deepEqual(box, { left: 30, top: 10, width: 90, height: 126, cardWidth: 90, cardHeight: 126, rotation: 0 });
});

test('statusLoopBox: a sideways card swaps its sides back; a turned-over one does not', () => {
  const rect = { left: 0, top: 0, width: 126, height: 90 };
  for (const rotation of [90, -90, '270']) {
    const box = statusLoopBox({ rect, zoneRect: null, rotation });
    assert.deepEqual([box.cardWidth, box.cardHeight], [90, 126], `rotation ${rotation}`);
    assert.deepEqual([box.width, box.height], [126, 90], 'the footprint stays the measured box');
  }
  const flipped = statusLoopBox({ rect: { left: 0, top: 0, width: 90, height: 126 }, rotation: 180 });
  assert.deepEqual([flipped.cardWidth, flipped.cardHeight, flipped.rotation], [90, 126, 180]);
});

test('statusLoopBox: no box for an unmeasured card', () => {
  assert.equal(statusLoopBox({ rect: { left: 0, top: 0, width: 0, height: 0 } }), null);
  assert.equal(statusLoopBox({ rect: null }), null);
  assert.equal(statusLoopBox({}), null);
});
