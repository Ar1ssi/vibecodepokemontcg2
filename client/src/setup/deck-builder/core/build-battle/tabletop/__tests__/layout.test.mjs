import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMERA_FOV_DEG,
  PACK_ROW_X,
  cameraPose,
  fitDistance,
  packRowSpot,
  pileJitter,
  summarySlot,
  wrapperSpot,
} from '../layout.mjs';
import { CARD, PACK } from '../physical.mjs';

test('the pack row is centred on its column and its packs never overlap', () => {
  const spots = [0, 1, 2, 3].map((index) => packRowSpot(index, 4));
  assert.ok(Math.abs(spots[0].x + spots[3].x - 2 * PACK_ROW_X) < 1e-9, 'symmetric');
  for (let i = 1; i < 4; i += 1) assert.ok(spots[i].x - spots[i - 1].x > PACK.width);
  assert.equal(packRowSpot(0, 1).x, PACK_ROW_X);
});

test('summary slots lay ten cards in two rows of five without overlap', () => {
  const slots = Array.from({ length: 10 }, (_, k) => summarySlot(k, 10));
  assert.equal(new Set(slots.map((slot) => slot.y)).size, 2);
  for (let k = 1; k < 5; k += 1) assert.ok(slots[k].x - slots[k - 1].x > CARD.width);
  assert.ok(slots[0].y - slots[5].y > CARD.height);
  assert.ok(Math.abs(slots[0].x + slots[4].x) < 1e-9);
  assert.ok(slots.every((slot) => slot.z < 0), 'in front of the eye');
});

test('jitter and wrapper heaps stay small and repeatable', () => {
  for (let k = 0; k < 30; k += 1) {
    const j = pileJitter(k);
    assert.ok(Math.abs(j.dx) <= 4 && Math.abs(j.dz) <= 3 && Math.abs(j.rotYDeg) <= 5);
    assert.deepEqual(wrapperSpot(k), wrapperSpot(k));
  }
});

test('the fitted distance shows the whole region at any aspect', () => {
  const tan = Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180));
  for (const aspect of [0.5, 1, 16 / 9, 3]) {
    const d = fitDistance(200, 100, CAMERA_FOV_DEG, aspect);
    assert.ok(d * tan >= 100 - 1e-9);
    assert.ok(d * tan * aspect >= 200 - 1e-9);
  }
  assert.ok(fitDistance(200, 100, 30, 0) > 0, 'a zero aspect falls back to 1');
});

test('camera poses look down at their target from above and in front', () => {
  for (const name of ['box', 'open', 'table']) {
    const pose = cameraPose(name, 16 / 9);
    assert.ok(pose.position.y > pose.target.y);
    assert.ok(pose.position.z > pose.target.z);
    assert.equal(pose.fov, CAMERA_FOV_DEG);
  }
  const portrait = cameraPose('table', 0.5);
  const landscape = cameraPose('table', 2);
  assert.ok(portrait.position.y > landscape.position.y, 'a narrow screen steps back');
  assert.deepEqual(cameraPose('nope', 1), cameraPose('box', 1));
});
