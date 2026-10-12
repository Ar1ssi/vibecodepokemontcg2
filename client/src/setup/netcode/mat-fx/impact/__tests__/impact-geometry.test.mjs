import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boundsCentre, drawOrder } from '../impact-draw-order.mjs';
import { ALIGN, RENDER, boardCamera, buildGeometry, buildTrailGeometry, frameRect, srgbToLinear, texcoordLayout } from '../impact-geometry.mjs';
import { DEG, quatEuler } from '../impact-math.mjs';
import { createEffect } from '../impact-sim.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'assets', 'fx', 'attack');
const camera = boardCamera();
const near = (actual, expected, tolerance = 1e-5) => [...actual].forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${[...actual]} vs ${expected}`));

const particle = (overrides = {}) => ({
  id: 1,
  age: 0.25,
  life: 1,
  pos: [0, 0, 0],
  vel: [0, 0, 0],
  move: [0, 0, 0],
  size: [2, 4, 1],
  rot: [0, 0, 0],
  threeAxis: false,
  align: null,
  color: [1, 0.5, 0, 0.5],
  frame: 0,
  custom: null,
  trail: null,
  ...overrides,
});
const system = (rendererOverrides = {}, particles = [particle()], specOverrides = {}) => ({
  spec: { ...specOverrides },
  rotation: [0, 0, 0, 1],
  position: [0, 0, 0],
  unit: 1,
  particles,
  renderer: { mode: RENDER.BILLBOARD, align: ALIGN.VIEW, pivot: [0, 0, 0], flip: [0, 0, 0], len: 2, velScale: 0, min: 0, max: 100, sort: 0, streams: [0, 1, 3, 4], ...rendererOverrides },
});
const vertex = (geometry, index) => [...geometry.position.slice(index * 3, index * 3 + 3)];
/** Twice a triangle's signed area on screen (+X right, +Z up): negative is clockwise, Unity's front face. */
const screenArea = (geometry, triangle = 0) => {
  const [a, b, c] = [0, 1, 2].map((corner) => vertex(geometry, geometry.indices[triangle * 3 + corner]));
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
};

test('a view billboard is a quad in the screen plane, wound clockwise toward the camera', () => {
  const geometry = buildGeometry(system(), camera);
  assert.equal(geometry.vertexCount, 4);
  assert.equal(geometry.indexCount, 6);
  // Screen right is +X, screen up is +Z: 2 wide, 4 tall, flat on the board plane.
  near(vertex(geometry, 0), [-1, 0, -2]);
  near(vertex(geometry, 3), [1, 0, 2]);
  near(geometry.normal.slice(0, 3), [0, 1, 0]);
  assert.ok(screenArea(geometry, 0) < 0 && screenArea(geometry, 1) < 0);
  near(geometry.texcoords[0].data, [0, 0, 1, 0, 0, 1, 1, 1]);
  assert.equal(geometry.texcoords[0].size, 2);
});

test('vertex colours are linear; alpha is untouched', () => {
  const geometry = buildGeometry(system(), camera);
  near(geometry.color.slice(0, 4), [1, srgbToLinear(0.5), 0, 0.5]);
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.21404) < 1e-4);
});

test('a positive angle turns a billboard clockwise on screen', () => {
  const geometry = buildGeometry(system({}, [particle({ rot: [0, 0, 90 * DEG], size: [2, 2, 2] })]), camera);
  // The corner that was at screen right-down (+X, −Z) … clockwise by 90° lands at left-down.
  near(vertex(geometry, 1), [-1, 0, -1]);
});

test('the pivot shifts a quad by a share of its size, and a sheet frame picks its UVs', () => {
  const sheet = { tx: 2, ty: 2 };
  const geometry = buildGeometry(system({ pivot: [0.5, 0, 0] }, [particle({ frame: 1 })], { uv: sheet }), camera);
  near(vertex(geometry, 0), [0, 0, -2]);
  near(vertex(geometry, 1), [2, 0, -2]);
  // Frame 1 of a 2 × 2 sheet is the top-right cell.
  assert.deepEqual(frameRect(sheet, 1), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(frameRect(sheet, 2), [0, 0, 0.5, 0.5]);
  assert.deepEqual(frameRect(undefined, 3), [0, 0, 1, 1]);
  near(geometry.texcoords[0].data.slice(0, 2), [0.5, 0.5]);
  near(geometry.texcoords[0].data.slice(6, 8), [1, 1]);
});

test('custom vertex streams pack after the UV, four floats to a TEXCOORD', () => {
  assert.deepEqual(texcoordLayout([0, 1, 3, 4]), [{ size: 2 }]);
  assert.deepEqual(texcoordLayout([0, 1, 3, 4, 34]), [{ size: 4 }, { size: 2 }]);
  assert.deepEqual(texcoordLayout([0, 1, 3, 4, 32]), [{ size: 4 }]);
  assert.deepEqual(texcoordLayout([0, 1, 3, 4, 34, 33]), [{ size: 4 }, { size: 4 }, { size: 1 }]);
  assert.throws(() => texcoordLayout([0, 4, 21]), /unsupported vertex stream 21/);
  const geometry = buildGeometry(system({ streams: [0, 1, 3, 4, 34] }, [particle({ custom: [0.1, 0.2, 0.3, 0.4] })]), camera);
  // TEXCOORD0 = (u, v, custom1.x, custom1.y); TEXCOORD1 = (custom1.z, custom1.w).
  near(geometry.texcoords[0].data.slice(12, 16), [1, 1, 0.1, 0.2]);
  near(geometry.texcoords[1].data.slice(6, 8), [0.3, 0.4]);
});

test('a local billboard lies in its system’s plane; the screen share caps its size', () => {
  const flat = system({ align: ALIGN.LOCAL }, [particle({ size: [2, 2, 2] })]);
  // Local alignment with no rotation: the quad stands in world XY, edge-on to the camera.
  near(vertex(buildGeometry(flat, camera), 3), [1, 1, 0]);
  flat.rotation = quatEuler(90 * DEG, 0, 0);
  near(vertex(buildGeometry(flat, camera), 3), [1, 0, 1]);
  // The view is 2 · 183 · tan(10°) ≈ 64.54 units tall: a 100-unit quad capped at half of it.
  const capped = buildGeometry(system({ max: 0.5 }, [particle({ size: [100, 100, 100] })]), camera);
  near([vertex(capped, 3)[0]], [(183 * Math.tan(10 * DEG)) / 2], 1e-3);
});

test('a stretched billboard runs its U axis along the motion, head at the particle', () => {
  const geometry = buildGeometry(system({ mode: RENDER.STRETCH, len: 2, velScale: 0.5 }, [particle({ move: [4, 0, 0], size: [1, 3, 1] })]), camera);
  // Length = 3 · 2 + 4 · 0.5 = 8 behind the particle, 1 wide.
  const xs = [0, 1, 2, 3].map((index) => vertex(geometry, index)[0]);
  const zs = [0, 1, 2, 3].map((index) => vertex(geometry, index)[2]);
  near([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], [-8, 0, -0.5, 0.5]);
  // u = 1 at the head.
  const head = [0, 1, 2, 3].find((index) => vertex(geometry, index)[0] === 0);
  assert.equal(geometry.texcoords[0].data[head * 2], 1);
  assert.ok(screenArea(geometry, 0) < 0 && screenArea(geometry, 1) < 0, 'same winding as a plain billboard');
});

test('a mesh particle scales, turns and tints its mesh', () => {
  const mesh = { p: [0, 0, 0, 1, 0, 0, 0, 1, 0], n: [0, 0, -1, 0, 0, -1, 0, 0, -1], c: [1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1], uv0: [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], i: [0, 2, 1] };
  const item = system({ mode: RENDER.MESH, align: ALIGN.LOCAL }, [particle({ pos: [10, 0, 0], size: [2, 3, 1], rot: [90 * DEG, 0, 0], threeAxis: true, color: [1, 1, 1, 1] })]);
  const geometry = buildGeometry(item, camera, mesh);
  assert.equal(geometry.vertexCount, 3);
  near(vertex(geometry, 1), [12, 0, 0]);
  // +90° about X carries the mesh's +Y to +Z.
  near(vertex(geometry, 2), [10, 0, 3]);
  near(geometry.color.slice(4, 8), [1, 1, 1, 0.5]);
  near(geometry.texcoords[0].data, [0, 0, 1, 0, 0, 1]);
  assert.equal(buildGeometry(item, camera, null), null);
});

test('nothing to draw is null; sort modes reorder the particles', () => {
  assert.equal(buildGeometry(system({}, []), camera), null);
  assert.equal(buildGeometry({ ...system(), renderer: null }, camera), null);
  const pair = [particle({ id: 1, age: 0.9, pos: [1, 0, 0] }), particle({ id: 2, age: 0.1, pos: [5, 0, 0] })];
  const firstX = (sort) => vertex(buildGeometry(system({ sort }, pair), camera), 0)[0];
  assert.equal(firstX(0), 0);
  // Oldest in front: the oldest is drawn last.
  assert.equal(firstX(2), 4);
  assert.equal(firstX(3), 0);
});

test('a trail is a ribbon from the particle back through its points', () => {
  const spec = { trail: { width: 1, sizeWidth: true, inherit: false, colorLife: [1, 1, 1, 1], colorTrail: { g: { color: [[0, [1, 1, 1]]], alpha: [[0, 1], [1, 0]] } } } };
  const moving = particle({ pos: [3, 0, 0], size: [2, 2, 2], trail: [{ pos: [0, 0, 0], time: 0 }, { pos: [1.5, 0, 0], time: 0.1 }] });
  const geometry = buildTrailGeometry(system({}, [moving], spec), camera);
  assert.equal(geometry.vertexCount, 6);
  assert.equal(geometry.indexCount, 12);
  // Head first, 2 wide across the motion.
  near(vertex(geometry, 0), [3, 0, 1]);
  near(vertex(geometry, 1), [3, 0, -1]);
  assert.ok([0, 1, 2, 3].every((triangle) => screenArea(geometry, triangle) < 0));
  near(geometry.color.slice(0, 4), [1, 1, 1, 1]);
  near(geometry.color.slice(16, 20), [1, 1, 1, 0]);
  assert.equal(buildTrailGeometry(system({}, [particle({ trail: [] })], spec), camera), null);
  assert.equal(buildTrailGeometry(system(), camera), null);
});

test('draw order: queue, then sorting order, then far to near with the fudge', () => {
  const eye = [0, 183, 0];
  const item = (name, queue, order, fudge, height = 0) => ({ name, queue, order, fudge, centre: [0, height, 0] });
  const names = (items) => drawOrder(items, eye).map((entry) => entry.name);
  assert.deepEqual(names([item('late', 3000, 1, 0), item('opaque', 2000, 5, 0), item('early', 3000, 0, 0)]), ['opaque', 'early', 'late']);
  // Farther from the camera draws first; a lower fudge reads as nearer and draws later.
  assert.deepEqual(names([item('high', 3000, 1, 0, 10), item('low', 3000, 1, 0, 0)]), ['low', 'high']);
  assert.deepEqual(names([item('pulled', 3000, 1, -100), item('pushed', 3000, 1, 200), item('plain', 3000, 1, 0)]), ['pushed', 'plain', 'pulled']);
  assert.deepEqual(names([item('a', 3000, 1, 0), item('b', 3000, 1, 0)]), ['a', 'b']);
  assert.deepEqual(boundsCentre({ particles: [], position: [1, 2, 3] }), [1, 2, 3]);
  assert.deepEqual(boundsCentre({ particles: [{ pos: [0, 0, 0] }, { pos: [4, 2, -6] }], position: [9, 9, 9] }), [2, 1, -3]);
});

test('every renderer of the 66 prefabs builds finite geometry mid-effect', () => {
  const meshes = JSON.parse(fs.readFileSync(path.join(ASSETS, 'meshes.json'), 'utf8'));
  let drawn = 0;
  for (const file of fs.readdirSync(ASSETS).filter((name) => /^[a-z]+\.json$/.test(name) && !['meshes.json', 'shaders.json', 'textures.json'].includes(name))) {
    const type = JSON.parse(fs.readFileSync(path.join(ASSETS, file), 'utf8'));
    for (const [variant, prefab] of Object.entries(type.prefabs)) {
      const effect = createEffect(prefab, { seed: 11 });
      for (const time of [0.1, 0.3, 0.8]) {
        effect.advanceTo(time);
        for (const entry of effect.systems) {
          if (!entry.renderer) continue;
          const geometry = buildGeometry(entry, camera, entry.renderer.mesh ? meshes[entry.renderer.mesh] : null);
          const trail = buildTrailGeometry(entry, camera);
          for (const built of [geometry, trail]) {
            if (!built) continue;
            drawn += 1;
            assert.ok(built.position.every(Number.isFinite) && built.color.every(Number.isFinite), `${file} ${variant} ${entry.name}`);
            assert.ok(built.texcoords.every((texcoord) => texcoord.data.every(Number.isFinite)), `${file} ${variant} ${entry.name}`);
            assert.ok(built.indices.every((index) => index < built.vertexCount), `${file} ${variant} ${entry.name}`);
          }
        }
      }
    }
  }
  assert.ok(drawn > 1000, `${drawn} draws`);
});
