import test from 'node:test';
import assert from 'node:assert/strict';

import { loopPart, STATUS_LOOP_PARTS } from '../../netcode/mat-fx/status-loop.mjs';
import { CARD_ASPECT } from '../../netcode/mat-fx/status-units.mjs';
import {
  STATUS_LOOP_PAINT,
  easeInOut,
  loopBoxOffset,
  loopPartFrame,
  statusLoopLayers,
} from '../status-loop-frame.mjs';

const close = (actual, expected, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('easeInOut: CSS ease-in-out endpoints, symmetry and midpoint', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  close(easeInOut(0.5), 0.5, 'midpoint');
  close(easeInOut(0.25) + easeInOut(0.75), 1, 'symmetric');
  assert.ok(easeInOut(0.1) < 0.1, 'slow start');
});

test('a faded part: hidden before its delay, ramps to peak, drifts and grows, hides after its window', () => {
  // period 4000, life 1000 → window k = 4: visible for the first 1000 ms of each cycle.
  const part = loopPart({ sprite: 'z', size: 2, pos: [0, 0], period: 4000, life: 1000, delay: 500, fade: true, peak: 0.8, grow: [0.5, 1], rise: [0, 6.62] });
  assert.equal(loopPartFrame(part, 499), null, 'before delay');
  assert.equal(loopPartFrame(part, 500), null, 'keyframe 0 has opacity 0');
  close(loopPartFrame(part, 500 + 75).alpha, 0.4, 'half way up the 15 % ramp');
  const mid = loopPartFrame(part, 500 + 500);
  close(mid.alpha, 0.8, 'peak');
  close(mid.scale, 0.75, 'grown half way');
  close(mid.y - part.y, part.dy / 2, 'drifted half way');
  close(loopPartFrame(part, 500 + 875).alpha, 0.4, 'half way down the last 25 %');
  assert.equal(loopPartFrame(part, 500 + 1000), null, 'window over');
  assert.equal(loopPartFrame(part, 500 + 3999), null, 'rest of the cycle');
  close(loopPartFrame(part, 4500 + 500).alpha, 0.8, 'next cycle');
});

test('an always-on part rests at its peak with no drift', () => {
  const part = loopPart({ sprite: 'mainFire', size: 3, pos: [1, 1], period: 600, run: [3, 3] });
  const frame = loopPartFrame(part, 12345);
  assert.equal(frame.alpha, 1);
  assert.equal(frame.scale, 1);
  close(frame.x, part.x, 'x');
});

test('flipbook run: columns step over life / rows, rows over life', () => {
  const part = loopPart({ sprite: 'mainFire', size: 3, pos: [0, 0], period: 600, run: [3, 3] });
  // life 600, 3 rows: a column every 66.7 ms, a row every 200 ms.
  assert.deepEqual([loopPartFrame(part, 0).col, loopPartFrame(part, 0).row], [0, 0]);
  assert.deepEqual([loopPartFrame(part, 70).col, loopPartFrame(part, 70).row], [1, 0]);
  assert.deepEqual([loopPartFrame(part, 210).col, loopPartFrame(part, 210).row], [0, 1]);
  assert.deepEqual([loopPartFrame(part, 599).col, loopPartFrame(part, 599).row], [2, 2]);
  assert.equal(loopPartFrame(part, 0).cols, 3);
});

test('a still cell and the rock tilt', () => {
  const still = loopPart({ sprite: 'cloud', cell: 3, size: 3, pos: [0, 0], period: 1000 });
  assert.deepEqual([loopPartFrame(still, 0).col, loopPartFrame(still, 0).row], [1, 1]);
  const ring = loopPart({ sprite: 'ring', size: 18, period: 1000, delay: 0, run: [2, 2], rock: 15, turn: 270 });
  close(loopPartFrame(ring, 0).rotateDeg, 270, 'rest');
  close(loopPartFrame(ring, 250).rotateDeg, 285, '+rock at 25 %');
  close(loopPartFrame(ring, 750).rotateDeg, 255, '-rock at 75 %');
});

test('box offset: card parts in card widths; sideways sky parts scale by the footprint', () => {
  const part = { x: 0.2, y: 0.4 };
  const frame = { x: 0.25, y: 0.4 };
  assert.deepEqual(loopBoxOffset(frame, part), { x: 0.25, y: 0.4 });
  assert.deepEqual(loopBoxOffset(frame, part, { sky: true }), { x: 0.25, y: 0.4 });
  const side = loopBoxOffset(frame, part, { sky: true, sideways: true });
  close(side.x, 0.2 * CARD_ASPECT + 0.05, 'x share of the card height');
  close(side.y, 0.4 / CARD_ASPECT, 'y share of the card width');
});

test('layers: glows under, card parts and sky parts; every sprite has a paint', () => {
  const layers = statusLoopLayers(['poison', 'burn', 'sleep', 'paralyze', 'confusion']);
  assert.deepEqual(layers.under.map((p) => p.sprite).sort(), ['burnGlow', 'paralyzeGlow', 'sleepGlow']);
  assert.ok(layers.card.some((p) => p.sprite === 'ring'));
  assert.ok(layers.sky.some((p) => p.sprite === 'z'));
  for (const parts of Object.values(STATUS_LOOP_PARTS)) {
    for (const part of parts) assert.ok(STATUS_LOOP_PAINT[part.sprite], part.sprite);
  }
  assert.deepEqual(statusLoopLayers([]), { under: [], card: [], sky: [] });
  assert.deepEqual(statusLoopLayers(['nope']), { under: [], card: [], sky: [] });
});
