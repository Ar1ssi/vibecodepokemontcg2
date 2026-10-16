import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOX_SPOT,
  CAMERA_FOV_DEG,
  CODE_SPOT,
  DECK_SPOT,
  EXTRAS_SPOT,
  LEAFLET_SPOT,
  MAT,
  PACK_ROW_X,
  PROMO_SPOT,
  REVEAL_SPOT,
  WRAP_BALL_RADIUS,
  WRAP_SPOT,
  cameraPose,
  fitDistance,
  packRowSpot,
  pileJitter,
  summarySlot,
  wrapperSpot,
} from '../layout.mjs';
import { CARD, LEAFLET, PACK, boxDimensions } from '../physical.mjs';

const DEG = Math.PI / 180;

// A flat thing's footprint on the table: an oriented rectangle, turned like three's rotation.y.
function footprint(spot, width, depth) {
  const yaw = (spot.rotYDeg || 0) * DEG;
  const across = [Math.cos(yaw), -Math.sin(yaw)];
  const along = [Math.sin(yaw), Math.cos(yaw)];
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([s, t]) => [
    spot.x + (across[0] * width * s + along[0] * depth * t) / 2,
    spot.z + (across[1] * width * s + along[1] * depth * t) / 2,
  ]);
  return { axes: [across, along], corners };
}

// Separating-axis test: two rectangles overlap unless some edge normal splits them.
function overlaps(a, b) {
  return [...a.axes, ...b.axes].every(([ax, az]) => {
    const project = (rect) => rect.corners.map(([x, z]) => x * ax + z * az);
    const pa = project(a);
    const pb = project(b);
    return Math.max(...pa) > Math.min(...pb) && Math.max(...pb) > Math.min(...pa);
  });
}

function tableLayout() {
  const box = boxDimensions(null);
  const things = [
    { name: 'box', rect: footprint(BOX_SPOT, box.width, box.depth) },
    { name: 'deck', rect: footprint(DECK_SPOT, CARD.width, CARD.height) },
    { name: 'promo', rect: footprint(PROMO_SPOT, CARD.width, CARD.height) },
    { name: 'code card', rect: footprint(CODE_SPOT, CARD.width, CARD.height) },
    { name: 'leaflet', rect: footprint(LEAFLET_SPOT, LEAFLET.width, LEAFLET.height), offMat: true },
    { name: 'wrap', rect: footprint(WRAP_SPOT, 2 * WRAP_BALL_RADIUS, 2 * WRAP_BALL_RADIUS) },
  ];
  for (let k = 0; k < 4; k += 1) {
    things.push({ name: `pack ${k}`, rect: footprint(packRowSpot(k, 4), PACK.width, PACK.height) });
    things.push({ name: `wrapper ${k}`, group: 'wrappers', rect: footprint(wrapperSpot(k), PACK.width, PACK.height) });
  }
  for (const [pile, spot] of [
    ['reveal', REVEAL_SPOT],
    ['extras', EXTRAS_SPOT],
  ]) {
    for (let k = 0; k < 10; k += 1) {
      const jitter = pileJitter(k);
      const at = { x: spot.x + jitter.dx, z: spot.z + jitter.dz, rotYDeg: spot.rotYDeg + jitter.rotYDeg };
      things.push({ name: `${pile} ${k}`, group: pile, rect: footprint(at, CARD.width, CARD.height) });
    }
  }
  return things;
}

test('nothing laid on the table overlaps anything else', () => {
  const things = tableLayout();
  for (let i = 0; i < things.length; i += 1) {
    for (let j = i + 1; j < things.length; j += 1) {
      const [a, b] = [things[i], things[j]];
      if (a.group && a.group === b.group) continue;
      assert.ok(!overlaps(a.rect, b.rect), `${a.name} overlaps ${b.name}`);
    }
  }
});

test('everything but the leaflet lies wholly on the mat', () => {
  const inside = ([x, z]) =>
    Math.abs(x - MAT.x) <= MAT.width / 2 && Math.abs(z - MAT.z) <= MAT.depth / 2;
  for (const thing of tableLayout()) {
    if (thing.offMat) continue;
    assert.ok(thing.rect.corners.every(inside), `${thing.name} hangs off the mat`);
  }
});

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
