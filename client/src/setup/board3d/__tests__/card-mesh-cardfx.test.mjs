import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { cameraFromCssTilt } from '../board-camera.mjs';
import { createCardMeshPool } from '../card-mesh.js';
import { FX_LAYER } from '../fx/fx-layers.mjs';

const camera = cameraFromCssTilt({ viewportW: 1920, viewportH: 1080 });
const REST = { x: 0, y: 300, z: 0, yawDeg: 0, widthPx: 90 };

async function makePool({ reduced = false, foil = null } = {}) {
  const clock = { t: 0, now() { return this.t; } };
  const group = new three.Group();
  const pool = createCardMeshPool({
    group,
    three,
    textures: { acquire: async () => new three.Texture(), release() {} },
    clock,
    foil,
    motionReduced: () => reduced,
    viewOrigin: () => ({ left: 0, top: 0 }),
  });
  pool.setCamera(camera);
  pool.acquire(7, { widthPx: 90 });
  pool.setPose(7, REST, 0);
  pool.setFaces(7, { src: 'front.png', backSrc: 'back.png', face: 'front', foilRecord: foil ? { tcglId: 1 } : null });
  await new Promise((resolve) => setTimeout(resolve, 0));
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

const twinOf = (mesh) => mesh.children.find((child) => child.name === 'board3d-card-glow') ?? null;

test('a burn runs its dissolve on the scene clock, then hands back the shared materials', async () => {
  const { pool, clock } = await makePool();
  const mesh = pool.meshOf(7);
  const shared = [...mesh.material];
  assert.equal(pool.cardFxOf(7), null, 'no effect at rest');
  const done = pool.cardFx(7, { at: (ms) => ({ dissolve: ms / 1000 }), ms: 1000, cut: true, edgeRgb: [255, 0, 0] });

  assert.deepEqual(pool.cardFxOf(7), { dissolve: 0, rim: 0 });
  mesh.material.forEach((material, index) => assert.notEqual(material, shared[index], `own copy of group ${index}`));
  assert.equal(mesh.material[0].map, shared[0].map, 'the copy shows the same art');
  assert.ok(mesh.customDepthMaterial, 'its shadow burns too');
  const twin = twinOf(mesh);
  assert.ok(twin, 'a glow twin rides on the card');
  assert.equal(twin.layers.mask, 1 << FX_LAYER);
  assert.deepEqual(twin.material.uniforms.uCardEdge.value.toArray(), [1, 0, 0]);

  clock.t = 400;
  assert.equal(pool.update(400), true, 'a burning card asks for frames');
  assert.ok(Math.abs(pool.cardFxOf(7).dissolve - 0.4) < 1e-9);
  assert.equal(mesh.material[0].map, shared[0].map);
  assert.equal(await settled(done), false);

  clock.t = 1000;
  pool.update(1000);
  assert.equal(await settled(done), true);
  assert.equal(pool.cardFxOf(7), null);
  assert.deepEqual([...mesh.material], shared, 'shared materials back');
  assert.equal(twinOf(mesh), null, 'twin gone');
  assert.equal(mesh.customDepthMaterial, undefined);
  assert.equal(twin.material.uniforms.uCardDissolve.value, 0, 'values back to 0');
});

test('a rim alone keeps the card’s own materials and only adds the twin', async () => {
  const { pool, clock } = await makePool();
  const mesh = pool.meshOf(7);
  const shared = [...mesh.material];
  const done = pool.cardFx(7, { at: (ms) => ({ rim: Math.sin((Math.PI * ms) / 500) }), ms: 500, rimRgb: [0, 255, 0] });
  assert.deepEqual([...mesh.material], shared);
  assert.equal(mesh.customDepthMaterial, undefined);
  const twin = twinOf(mesh);
  assert.deepEqual(twin.material.uniforms.uCardRimColor.value.toArray(), [0, 1, 0]);
  assert.equal(twin.layers.mask, 1, 'drawn in the board pass, not bloomed');
  clock.t = 250;
  pool.update(250);
  assert.ok(Math.abs(pool.cardFxOf(7).rim - 1) < 1e-9);
  assert.equal(pool.cardFxOf(7).dissolve, 0);
  clock.t = 500;
  pool.update(500);
  assert.equal(await settled(done), true);
  assert.equal(twinOf(mesh), null);
});

test('motion reduced: the burn still runs its whole time (the card leaving is information)', async () => {
  const { pool, clock } = await makePool({ reduced: true });
  const done = pool.cardFx(7, { at: (ms) => ({ dissolve: ms / 600 }), ms: 600, cut: true });
  clock.t = 300;
  pool.update(300);
  assert.ok(Math.abs(pool.cardFxOf(7).dissolve - 0.5) < 1e-9);
  assert.equal(await settled(done), false);
  clock.t = 600;
  pool.update(600);
  assert.equal(await settled(done), true);
});

test('motion reduced: a still tween holds its pose its whole time; a moving one lands at once', async () => {
  const { pool, clock } = await makePool({ reduced: true });
  const pose = () => ({ rect: { left: 100, top: 100, width: 90, height: 126 } });
  const still = pool.tween(7, pose, 600, { still: true });
  clock.t = 300;
  pool.update(300);
  assert.equal(await settled(still), false);
  clock.t = 600;
  pool.update(600);
  assert.equal(await settled(still), true);
  const moving = pool.tween(7, pose, 600);
  pool.update(600);
  assert.equal(await settled(moving), true);
});

test('a burn runs on under a flight, and the flight does not end it', async () => {
  const { pool, clock } = await makePool();
  const burn = pool.cardFx(7, { at: () => ({ dissolve: 0.5 }), ms: 800, cut: true });
  const flight = pool.tween(7, () => ({ rect: { left: 100, top: 100, width: 90, height: 126 } }), 400);
  clock.t = 200;
  pool.update(200);
  assert.equal(pool.cardFxOf(7).dissolve, 0.5);
  clock.t = 400;
  pool.update(400);
  assert.equal(await settled(flight), true);
  assert.equal(await settled(burn), false);
});

test('a foil card shows its plain art while it burns, and its foil again after', async () => {
  const foilMaterial = new three.ShaderMaterial();
  foilMaterial.ready = Promise.resolve();
  const foil = { createMaterial: () => foilMaterial, uv: { u0: 0.1, u1: 0.9, v0: 0.05, v1: 0.95 } };
  const { pool, clock } = await makePool({ foil });
  const mesh = pool.meshOf(7);
  assert.equal(mesh.material[0], foilMaterial);
  const done = pool.cardFx(7, { at: () => ({ dissolve: 0.3 }), ms: 100, cut: true });
  assert.ok(mesh.material[0].isMeshBasicMaterial, 'plain art copy');
  assert.equal(pool.wearsFoil(7), false);
  clock.t = 100;
  pool.update(100);
  assert.equal(await settled(done), true);
  assert.equal(mesh.material[0], foilMaterial);
  assert.equal(pool.wearsFoil(7), true);
});

test('a newer effect replaces the older; release and a throwing `at` end it', async () => {
  const { pool, clock } = await makePool();
  const first = pool.cardFx(7, { at: () => ({ rim: 1 }), ms: 500 });
  const second = pool.cardFx(7, { at: () => ({ rim: 0.5 }), ms: 500 });
  assert.equal(await settled(first), true);
  assert.equal(pool.meshOf(7).children.length, 1, 'one twin');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const failing = pool.cardFx(7, { at: () => { throw new Error('bad'); }, ms: 500, cut: true });
    assert.equal(await settled(second), true);
    clock.t = 10;
    pool.update(10);
    assert.equal(await settled(failing), true);
  } finally {
    console.warn = warn;
  }
  const last = pool.cardFx(7, { at: () => ({ dissolve: 1 }), ms: 500, cut: true });
  pool.release(7);
  assert.equal(await settled(last), true);
});

test('cardFx on a card the pool does not place, or without `at`, resolves at once', async () => {
  const { pool } = await makePool();
  assert.equal(await settled(pool.cardFx(99, { at: () => ({ rim: 1 }), ms: 100 })), true);
  assert.equal(await settled(pool.cardFx(7, { ms: 100 })), true);
  assert.equal(pool.cardFxOf(7), null);
});
