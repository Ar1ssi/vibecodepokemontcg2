import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { cameraFromCssTilt, tableToWorld } from '../board-camera.mjs';
import { createCardMeshPool } from '../card-mesh.js';
import { OCCLUDER_LAYER } from '../fx/fx-layers.mjs';

const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
const REST = { x: 0, y: 300, z: 0, yawDeg: 0, widthPx: 90 };

function makePool() {
  const clock = { t: 0, now() { return this.t; } };
  const group = new three.Group();
  const pool = createCardMeshPool({
    group,
    three,
    textures: { acquire: () => new Promise(() => {}), release() {} },
    clock,
    viewOrigin: () => ({ left: 0, top: 0 }),
  });
  pool.setCamera(camera);
  pool.acquire(7, { widthPx: 90 });
  pool.setPose(7, REST, 0);
  pool.update(0);
  return { pool, clock };
}

const settled = async (promise) => {
  let done = false;
  promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

test('card meshes sit on the occluder layer the FX depth prepass draws', () => {
  const { pool } = makePool();
  const layers = new three.Layers();
  layers.set(OCCLUDER_LAYER);
  assert.ok(pool.meshOf(7).layers.test(layers));
});

test('a drive adds its table offset onto the rest pose, then hands the card back', async () => {
  const { pool, clock } = makePool();
  const rest = pool.meshOf(7).position.clone();
  const done = pool.drive(7, (ms) => ({ dx: ms / 10, dy: 0, dz: 0, yawDeg: 0, scale: 1, scaleAlong: 1, scaleAcross: 1 }), 400);
  clock.t = 200;
  assert.equal(pool.update(200), true, 'a driven card asks for frames');
  const moved = pool.meshOf(7).position;
  const expected = tableToWorld({ x: 20, y: 300, z: 0 }, camera);
  assert.ok(Math.abs(moved.x - expected[0]) < 1e-6, `x ${moved.x} vs ${expected[0]}`);
  assert.equal(await settled(done), false);
  clock.t = 400;
  pool.update(400);
  assert.equal(await settled(done), true);
  pool.update(401);
  assert.ok(pool.meshOf(7).position.distanceTo(rest) < 1e-6, 'back on its own pose');
});

test('lift and scale come from the offset; the lane squash scales the card axes', () => {
  const { pool, clock } = makePool();
  const restZ = pool.meshOf(7).position.z;
  pool.drive(7, () => ({ dx: 0, dy: 0, dz: 30, yawDeg: 0, scale: 1.2, scaleAlong: 0.8, scaleAcross: 1.1, laneAngleDeg: 90 }), 500);
  clock.t = 100;
  pool.update(100);
  const mesh = pool.meshOf(7);
  assert.ok(mesh.position.z > restZ + 20, 'raised off the cloth');
  // A vertical lane runs along the card's y axis: y takes scaleAlong, x scaleAcross.
  assert.ok(Math.abs(mesh.scale.x - 1.2 * 1.1) < 1e-9);
  assert.ok(Math.abs(mesh.scale.y - 1.2 * 0.8) < 1e-9);
});

test('a newer drive replaces the older one, which resolves', async () => {
  const { pool } = makePool();
  const first = pool.drive(7, () => null, 500);
  pool.drive(7, () => null, 500);
  assert.equal(await settled(first), true);
});

test('a tween on a driven card ends the drive; the tween owns the mesh', async () => {
  const { pool } = makePool();
  const driven = pool.drive(7, () => null, 500);
  pool.tween(7, () => ({ rect: { left: 0, top: 0, width: 90, height: 126 } }), 300);
  assert.equal(await settled(driven), true);
});

test('releasing a driven card resolves its drive; unknown and lifted cards resolve at once', async () => {
  const { pool } = makePool();
  const driven = pool.drive(7, () => null, 500);
  pool.release(7);
  assert.equal(await settled(driven), true);
  assert.equal(await settled(pool.drive(99, () => null, 500)), true);
});

test('a throwing offset ends the drive with a warning instead of breaking the frame', async () => {
  const { pool, clock } = makePool();
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const driven = pool.drive(7, () => {
      throw new Error('bad pose');
    }, 500);
    clock.t = 50;
    pool.update(50);
    assert.equal(await settled(driven), true);
    assert.ok(warnings.some((line) => line.includes('drive offset failed')));
  } finally {
    console.warn = warn;
  }
});

test('tablePoseOf gives the own pose with its drawn size; frontMapOf is null before the art loads', () => {
  const { pool } = makePool();
  const pose = pool.tablePoseOf(7);
  assert.equal(pose.x, 0);
  assert.equal(pose.y, 300);
  assert.ok(pose.widthPx > 0 && pose.heightPx > pose.widthPx);
  assert.equal(pool.tablePoseOf(99), null);
  assert.equal(pool.frontMapOf(7), null);
});
