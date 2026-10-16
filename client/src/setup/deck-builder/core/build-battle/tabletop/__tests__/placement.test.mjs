import test from 'node:test';
import assert from 'node:assert/strict';

import { TABLE_BOUNDS, clampToTable, clearOfBox, footprint, freeSpotNear, overlaps, restHeight } from '../placement.mjs';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

test('a footprint grows to hold a turned rectangle', () => {
  assert.deepEqual(footprint({ x: 10, z: -5 }, 30, 40), { minX: -20, maxX: 40, minZ: -45, maxZ: 35 });
  const quarter = footprint({ x: 0, z: 0, rotYDeg: 90 }, 30, 40);
  near(quarter.maxX, 40);
  near(quarter.maxZ, 30);
});

test('extents overlap only past the margin', () => {
  const a = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  assert.equal(overlaps(a, { minX: 5, maxX: 15, minZ: 5, maxZ: 15 }), true);
  assert.equal(overlaps(a, { minX: 10, maxX: 20, minZ: 0, maxZ: 10 }), false);
  assert.equal(overlaps(a, { minX: 9.5, maxX: 20, minZ: 0, maxZ: 10 }), false);
  assert.equal(overlaps(a, { minX: 30, maxX: 40, minZ: 30, maxZ: 40 }), false);
});

test('a spot past the table edge is pulled back so the whole thing stays in view', () => {
  const spot = clampToTable({ x: 1000, z: -1000, rotYDeg: 0 }, 30, 40);
  assert.equal(spot.x, TABLE_BOUNDS.maxX - 30);
  assert.equal(spot.z, TABLE_BOUNDS.minZ + 40);
  assert.deepEqual(clampToTable({ x: 5, z: 6, rotYDeg: 3 }, 30, 40), { x: 5, z: 6, rotYDeg: 3 });
});

test('a thing set down on the box is pushed out the nearest side', () => {
  const box = { x: 0, z: 0, rotYDeg: 0, width: 100, depth: 60 };
  // Just inside the front wall: out the front.
  const front = clearOfBox({ x: 10, z: 20, rotYDeg: 0 }, 10, box);
  near(front.x, 10);
  near(front.z, 30 + 10 + 6);
  // Near the right wall: out the right.
  const right = clearOfBox({ x: 48, z: 0, rotYDeg: 0 }, 10, box);
  near(right.x, 50 + 10 + 6);
  near(right.z, 0);
  // Well clear: untouched.
  const clear = { x: 200, z: 0, rotYDeg: 0 };
  assert.equal(clearOfBox(clear, 10, box), clear);
});

test('a turned box pushes along its own walls', () => {
  const box = { x: 0, z: 0, rotYDeg: 90, width: 100, depth: 60 };
  // Turned a quarter, the box's front faces +x: a spot at its centre goes out that way.
  const out = clearOfBox({ x: 1, z: 0, rotYDeg: 0 }, 10, box);
  near(out.x, 46);
  near(out.z, 0, 1e-3);
});

test('a thing rests on the highest support under it', () => {
  const extent = footprint({ x: 0, z: 0 }, 30, 40);
  const supports = [
    { extent: footprint({ x: 20, z: 0 }, 30, 40), top: 12 },
    { extent: footprint({ x: -10, z: 10 }, 30, 40), top: 3 },
    { extent: footprint({ x: 300, z: 0 }, 30, 40), top: 50 },
  ];
  assert.equal(restHeight(extent, 0.5, 2, supports), 14);
  assert.equal(restHeight(extent, 0.5, 2, []), 0.5);
});

test('taken out to its usual place, a thing finds the nearest bare floor when that place is taken', () => {
  const desired = { x: 0, z: 100, rotYDeg: 0 };
  assert.equal(freeSpotNear(desired, 30, 40), desired);
  const taken = [footprint({ x: 10, z: 100 }, 30, 40)];
  const spot = freeSpotNear(desired, 30, 40, { taken });
  assert.equal(overlaps(footprint(spot, 30, 40), taken[0], 0), false);
  assert.ok(Math.hypot(spot.x - desired.x, spot.z - desired.z) <= 6 * 36 + 1e-9);
  // Nowhere free: it is stacked where it was meant to go.
  const everywhere = [{ minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 }];
  assert.equal(freeSpotNear(desired, 30, 40, { taken: everywhere }), desired);
  // Never into the box.
  const box = { x: 0, z: 100, rotYDeg: 0, width: 100, depth: 60 };
  const out = freeSpotNear(desired, 30, 40, { box });
  assert.equal(clearOfBox(out, 32, box), out);
});
