import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { cameraFromCssTilt, projectToScreen, tableToWorld } from '../board-camera.mjs';
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

// ── lift / unlift (card focus, design 074 H2)
// A card-shaped rect: the focus card covers it exactly once it faces the screen.
const cardRect = (left, top, height) => ({ left, top, width: (height * 6.397) / 8.9, height });
const FOCUS = { rect: cardRect(300, 60, 588), tiltXDeg: -camera.tiltDeg, lift: 180 };
const boxOf = (pool, id, options) => {
  const points = pool.cornersOf(id, options).map((corner) => projectToScreen(camera, corner));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};
const assertBox = (actual, expected, tol = 1) => {
  for (const key of ['left', 'top', 'width', 'height']) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= tol, `${key}: ${actual[key]} vs ${expected[key]}`);
  }
};

test('lift: flies from the card to the held pose, square-on at the rect, and stays there', async () => {
  const { pool, clock } = makePool({ origin: { left: 10, top: 20 } });
  const restBox = boxOf(pool, 7);
  const restPosition = pool.meshOf(7).position.toArray();
  const done = settled(pool.lift(7, FOCUS, { ms: 200, ease: (t) => t }));
  assert.equal(pool.liftedId(), 7);
  assert.deepEqual(pool.meshOf(7).position.toArray(), restPosition, 'starts exactly where the card stands');

  clock.t = 100;
  assert.equal(pool.update(clock.now()), true);
  const mid = boxOf(pool, 7);
  assert.ok(mid.width > restBox.width && mid.width < FOCUS.rect.width, `mid width ${mid.width}`);
  await flush();
  assert.equal(done(), false);

  clock.t = 200;
  assert.equal(pool.update(clock.now()), false, 'a held card asks for no more frames');
  await flush();
  assert.equal(done(), true);
  const held = boxOf(pool, 7);
  assertBox(held, { ...FOCUS.rect, left: FOCUS.rect.left - 10, top: FOCUS.rect.top - 20 });

  clock.t = 5000;
  pool.update(clock.now());
  assertBox(boxOf(pool, 7), held, 0.01);
  assert.equal(pool.liftedId(), 7, 'held until unlift');
});

test('lift: the model pose is suspended while held; hidden or hover re-poses do not move the mesh', () => {
  const { pool, clock } = makePool();
  pool.setHidden(7, true);
  pool.lift(7, FOCUS, { ms: 0 });
  assert.equal(pool.meshOf(7).visible, true, 'forced visible though the card is hidden');
  const held = pool.meshOf(7).position.toArray();
  pool.setPose(7, { ...REST, x: 400, z: 30 }, 0);
  pool.setPose(7, { ...REST, x: -200 }, 180);
  clock.t = 50;
  pool.update(clock.now());
  assert.deepEqual(pool.meshOf(7).position.toArray(), held);
  assert.equal(pool.meshOf(7).visible, true);
  pool.setHidden(7, true);
  assert.equal(pool.meshOf(7).visible, true);
});

test('lift: ms 0 and motion reduced hold the pose at once and resolve', async () => {
  const instant = makePool();
  await instant.pool.lift(7, FOCUS, { ms: 0 });
  assertBox(boxOf(instant.pool, 7), FOCUS.rect);
  const reduced = makePool({ reduced: true });
  const done = settled(reduced.pool.lift(7, FOCUS, { ms: 250 }));
  assertBox(boxOf(reduced.pool, 7), FOCUS.rect);
  await flush();
  assert.equal(done(), true);
});

test('lift again on a held card: ms 0 re-targets without a flight, ms > 0 flies from the held pose', async () => {
  const { pool, clock } = makePool();
  await pool.lift(7, FOCUS, { ms: 0 });
  const next = { ...FOCUS, rect: cardRect(100, 40, 420) };
  const retarget = settled(pool.lift(7, next, { ms: 0 }));
  assertBox(boxOf(pool, 7), next.rect);
  assert.equal(pool.update(clock.now()), false, 'no flight was started');
  await flush();
  assert.equal(retarget(), true);

  const flown = settled(pool.lift(7, FOCUS, { ms: 100, ease: (t) => t }));
  clock.t = 50;
  assert.equal(pool.update(clock.now()), true);
  const mid = boxOf(pool, 7);
  assert.ok(mid.width > next.rect.width && mid.width < FOCUS.rect.width);
  clock.t = 100;
  pool.update(clock.now());
  await flush();
  assert.equal(flown(), true);
  assertBox(boxOf(pool, 7), FOCUS.rect);
});

test('lift: a held pose re-fits when the camera changes (resize), without a new call', () => {
  const { pool } = makePool();
  pool.lift(7, FOCUS, { ms: 0 });
  const wide = boxOf(pool, 7);
  const small = cameraFromCssTilt({ viewportW: 1100, viewportH: 700 });
  pool.setCamera(small);
  pool.update(0);
  const points = pool.cornersOf(7).map((corner) => projectToScreen(small, corner));
  const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  assert.ok(Math.abs(height - FOCUS.rect.height) < 1, `height ${height}`);
  assert.ok(wide.height > 0);
});

test('unlift: flies back to the card pose, releases it, and the hidden state applies again', async () => {
  const { pool, clock } = makePool();
  pool.setHidden(7, true);
  const restPosition = pool.meshOf(7).position.toArray();
  await pool.lift(7, FOCUS, { ms: 0 });
  const done = settled(pool.unlift(7, { ms: 200, ease: (t) => t }));
  assert.equal(pool.liftedId(), 7, 'still lifted while it flies back');
  clock.t = 100;
  assert.equal(pool.update(clock.now()), true);
  assert.notDeepEqual(pool.meshOf(7).position.toArray(), restPosition);
  await flush();
  assert.equal(done(), false);

  clock.t = 200;
  pool.update(clock.now());
  await flush();
  assert.equal(done(), true);
  assert.equal(pool.liftedId(), null);
  const landed = pool.meshOf(7).position.toArray();
  landed.forEach((value, axis) => assert.ok(Math.abs(value - restPosition[axis]) < 1e-6, `axis ${axis}`));
  assert.equal(pool.meshOf(7).visible, false, 'the card was hidden, so the mesh hides again');

  pool.setPose(7, { ...REST, x: 400 }, 0);
  pool.setHidden(7, false);
  clock.t = 300;
  pool.update(clock.now());
  assert.notDeepEqual(pool.meshOf(7).position.toArray(), restPosition, 'the model pose owns it again');
});

test('unlift: flies back to where the card is now, not where it was lifted from', async () => {
  const { pool, clock } = makePool();
  await pool.lift(7, FOCUS, { ms: 0 });
  pool.setPose(7, { ...REST, x: 300 }, 0);
  const done = settled(pool.unlift(7, { ms: 100, ease: (t) => t }));
  clock.t = 100;
  pool.update(clock.now());
  await flush();
  assert.equal(done(), true);
  const x = projectToScreen(camera, pool.meshOf(7).position.toArray()).x;
  const expected = projectToScreen(camera, tableToWorld({ x: 300, y: REST.y, z: 0 }, camera)).x;
  assert.ok(Math.abs(x - expected) < 6, `x ${x} vs ${expected}`);
});

test('unlift mid-flight starts from where the mesh is; ms 0 and unknown cards release at once', async () => {
  const { pool, clock } = makePool();
  pool.lift(7, FOCUS, { ms: 200, ease: (t) => t });
  clock.t = 100;
  pool.update(clock.now());
  const mid = boxOf(pool, 7);
  const back = settled(pool.unlift(7, { ms: 200, ease: (t) => t }));
  assertBox(boxOf(pool, 7), mid, 0.01);
  await flush();
  assert.equal(back(), false);
  await pool.unlift(7, { ms: 0 });
  assert.equal(pool.liftedId(), null);
  await pool.unlift(7);
  await pool.unlift(404);
  await pool.lift(404, FOCUS, { ms: 100 });
  await pool.lift(7, { rect: { left: 0, top: 0, width: 0, height: 0 } }, { ms: 100 });
  assert.equal(pool.liftedId(), null, 'an unusable rect lifts nothing');
});

test('lift: releasing the card, or a lift with no camera, settles the promise', async () => {
  const { pool } = makePool();
  const done = settled(pool.lift(7, FOCUS, { ms: 500 }));
  pool.release(7);
  await flush();
  assert.equal(done(), true);
  assert.equal(pool.liftedId(), null);

  const bare = createCardMeshPool({
    group: new three.Group(),
    three,
    textures: { acquire: () => new Promise(() => {}), release() {} },
    clock: { now: () => 0 },
  });
  bare.acquire(1, { widthPx: 90 });
  bare.setPose(1, REST, 0);
  await bare.lift(1, FOCUS, { ms: 100 });
  assert.equal(bare.liftedId(), null);
});

test('lift: a lifted card ignores tween; cornersOf rest reports the slot, not the lifted mesh', async () => {
  const { pool } = makePool();
  const slot = boxOf(pool, 7);
  await pool.lift(7, FOCUS, { ms: 0 });
  await pool.tween(7, () => ({ rect: RECT }), 100);
  assertBox(boxOf(pool, 7), FOCUS.rect);
  assertBox(boxOf(pool, 7, { rest: true }), slot, 0.01);
});
