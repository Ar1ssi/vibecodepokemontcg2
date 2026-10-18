import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { cameraFromCssTilt, projectToScreen } from '../board-camera.mjs';
import { createCardMeshPool } from '../card-mesh.js';

const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
const RECT = { left: 800, top: 300, width: 120, height: 168 };
const REST = { x: 0, y: 300, z: 0, yawDeg: 0, widthPx: 90 };

function makePool({ reduced = false, origin = { left: 0, top: 0 } } = {}) {
  const clock = { t: 0, now() { return this.t; } };
  const group = new three.Group();
  const pool = createCardMeshPool({
    group,
    three,
    textures: { acquire: () => new Promise(() => {}), release() {} },
    clock,
    motionReduced: () => reduced,
    viewOrigin: () => origin,
  });
  pool.setCamera(camera);
  pool.acquire(7, { widthPx: 90 });
  pool.setPose(7, REST, 0);
  return { pool, clock, group };
}

const centreOnScreen = (mesh) => projectToScreen(camera, mesh.position.toArray());
const settled = (promise) => {
  let done = false;
  promise.then(() => {
    done = true;
  });
  return () => done;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('tween: the mesh follows poseFn on the scene clock, shown though hidden, and resolves at t = 1', async () => {
  const { pool, clock } = makePool({ origin: { left: 10, top: 20 } });
  pool.setHidden(7, true);
  assert.equal(pool.meshOf(7).visible, false);
  const seen = [];
  const done = settled(
    pool.tween(7, (t) => {
      seen.push(t);
      return { rect: { ...RECT, left: RECT.left + 100 * t }, lift: 30 };
    }, 200, { ease: (t) => t })
  );
  assert.equal(pool.meshOf(7).visible, true, 'forced visible for the flight');

  clock.t = 100;
  assert.equal(pool.update(clock.now()), true);
  assert.equal(seen.at(-1), 0.5);
  const mid = centreOnScreen(pool.meshOf(7));
  assert.ok(Math.abs(mid.x - (RECT.left + 50 + RECT.width / 2 - 10)) < 0.5, `x ${mid.x}`);
  assert.ok(Math.abs(mid.y - (RECT.top + RECT.height / 2 - 20)) < 0.5, `y ${mid.y}`);
  await flush();
  assert.equal(done(), false);

  clock.t = 200;
  pool.update(clock.now());
  assert.equal(seen.at(-1), 1, 'the last pose is t = 1 exactly');
  await flush();
  assert.equal(done(), true);
  assert.equal(pool.meshOf(7).visible, true, 'stays shown for a beat after landing');

  clock.t = 210;
  assert.equal(pool.update(clock.now()), true, 'one more frame puts the mesh on its own pose');
  const rest = pool.meshOf(7).position.clone();
  assert.ok(Math.abs(centreOnScreen(pool.meshOf(7)).x - (mid.x + 50)) > 1, 'back on the card pose');
  clock.t = 400;
  assert.equal(pool.update(clock.now()), false);
  assert.equal(pool.meshOf(7).visible, false, 'its hidden state applies again');
  assert.deepEqual(pool.meshOf(7).position.toArray(), rest.toArray());
});

test('tween eases with easeOutCubic by default', () => {
  const { pool, clock } = makePool();
  const seen = [];
  pool.tween(7, (t) => (seen.push(t), { rect: RECT }), 100);
  clock.t = 50;
  pool.update(clock.now());
  assert.ok(Math.abs(seen.at(-1) - 0.875) < 1e-9, `${seen.at(-1)}`);
});

test('tween: a second tween on the card replaces the first, which resolves', async () => {
  const { pool, clock } = makePool();
  const first = settled(pool.tween(7, () => ({ rect: RECT }), 500));
  await flush();
  assert.equal(first(), false);
  const second = settled(pool.tween(7, () => ({ rect: { ...RECT, top: 100 } }), 500));
  await flush();
  assert.equal(first(), true);
  assert.equal(second(), false);
  clock.t = 100;
  pool.update(clock.now());
  const centre = centreOnScreen(pool.meshOf(7));
  assert.ok(Math.abs(centre.y - (100 + RECT.height / 2)) < 0.5, 'the newer pose drives the mesh');
});

test('tween: setPose during a flight does not move the mesh; releasing the card resolves it', async () => {
  const { pool, clock } = makePool();
  const done = settled(pool.tween(7, () => ({ rect: RECT }), 500));
  const before = pool.meshOf(7).position.toArray();
  pool.setPose(7, { ...REST, x: 400 }, 0);
  assert.deepEqual(pool.meshOf(7).position.toArray(), before);
  clock.t = 50;
  pool.update(clock.now());
  assert.deepEqual(pool.meshOf(7).position.toArray(), before);
  pool.release(7);
  await flush();
  assert.equal(done(), true);
  assert.equal(pool.has(7), false);
});

test('tween: motion reduced resolves after one frame at poseFn(1)', async () => {
  const { pool, clock } = makePool({ reduced: true });
  const seen = [];
  const done = settled(pool.tween(7, (t) => (seen.push(t), { rect: RECT }), 600));
  await flush();
  assert.equal(done(), false, 'not before a frame');
  assert.equal(seen.at(-1), 1);
  clock.t = 16;
  pool.update(clock.now());
  await flush();
  assert.equal(done(), true);
});

test('tween: a card the scene does not draw, a bad poseFn or no camera resolves at once', async () => {
  const { pool } = makePool();
  await pool.tween(99, () => ({ rect: RECT }), 100);
  await pool.tween(7, null, 100);
  const bare = createCardMeshPool({
    group: new three.Group(),
    three,
    textures: { acquire: () => new Promise(() => {}), release() {} },
    clock: { now: () => 0 },
  });
  bare.acquire(1, { widthPx: 90 });
  bare.setPose(1, REST, 0);
  await bare.tween(1, () => ({ rect: RECT }), 100);
});

test('tween: a poseFn that throws ends the flight instead of breaking the frame', async () => {
  const { pool, clock } = makePool();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const done = settled(pool.tween(7, () => { throw new Error('boom'); }, 100));
    clock.t = 16;
    pool.update(clock.now());
    await flush();
    assert.equal(done(), true);
  } finally {
    console.warn = warn;
  }
});

test('placed: true once a card has a pose, hidden or not', () => {
  const { pool } = makePool();
  pool.acquire(8, { widthPx: 90 });
  assert.equal(pool.placed(8), false);
  pool.setPose(8, REST, 0);
  pool.setHidden(8, true);
  assert.equal(pool.placed(8), true);
  assert.equal(pool.placed(404), false);
});
