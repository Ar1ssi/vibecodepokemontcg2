import test from 'node:test';
import assert from 'node:assert/strict';

import { CRYSTAL_ATTRIBUTES, CRYSTAL_FLOATS, GEM_RINGS, crystalSamples, gemMesh, normalizeCrystal, packCrystal } from '../crystal.mjs';
import { ELEMENT_KINDS, ELEMENT_SAMPLES } from '../index.js';
import { SHELL_ATTRIBUTES, SHELL_FLOATS, normalizeShell, packShell, shellSamples } from '../shell.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-6;

test('crystal: defaults, angles in radians, a shoulder kept on the gem, refusals, packed row', () => {
  const gem = normalizeCrystal({ at: { x: 1, y: 2 }, length: 80, width: 20, headingDeg: 90, elevationDeg: 45, rollDeg: 180, shoulder: 0.1 });
  assert.equal(gem.at.z, 0);
  assert.ok(near(gem.heading, Math.PI / 2) && near(gem.elevation, Math.PI / 4) && near(gem.roll, Math.PI));
  assert.equal(gem.shoulder, 0.4, 'the point never starts at the root');
  assert.equal(normalizeCrystal({ at: { x: 0, y: 0 }, length: 80, width: 20, shoulder: 5 }).shoulder, 0.9);
  assert.deepEqual([gem.alpha, gem.dissolve, gem.gloss], [1, 0, 1]);
  for (const bad of [null, { length: 10, width: 4 }, { at: { x: 0, y: 0 }, length: 0, width: 4 }, { at: { x: 0, y: 0 }, length: 10, width: -1 }, { at: { x: 0, y: 0 }, length: 10, width: 4, alpha: 0 }]) {
    assert.equal(normalizeCrystal(bad), null);
  }
  assert.equal(CRYSTAL_FLOATS, CRYSTAL_ATTRIBUTES.length * 4);
  const out = new Float32Array(CRYSTAL_FLOATS);
  packCrystal(
    normalizeCrystal({ at: { x: 1, y: 2, z: 3 }, length: 80, width: 20, headingDeg: 0, elevationDeg: 0, colour: [0.5, 0.25, 1], deep: [0, 0.5, 0.25], light: [1, 1, 0.5], alpha: 0.5, seed: 6, dissolve: 0.25, gloss: 0.5, fire: 0.75, shoulder: 0.5, bend: 8 }),
    out,
    0
  );
  assert.deepEqual([...out], [1, 2, 3, 80, 0.5, 0.25, 1, 0.5, 1, 1, 0.5, 6, 10, 0, 0, 0, 0.25, 0.5, 0.75, 0.5, 0, 0.5, 0.25, 8], 'width packs as the radius');
});

test('gemMesh: a closed six-sided point, root at 0 and tip at 1 on its axis', () => {
  const { positions } = gemMesh();
  assert.equal(positions.length, 24 * 3 * 3, '6 root faces, 12 wall triangles, 6 tip faces');
  const edges = new Map();
  const key = (p) => p.map((v) => v.toFixed(5)).join(',');
  for (let i = 0; i < positions.length; i += 9) {
    const tri = [positions.slice(i, i + 3), positions.slice(i + 3, i + 6), positions.slice(i + 6, i + 9)];
    for (const p of tri) {
      const radius = Math.hypot(p[1], p[2]);
      assert.ok(p[0] >= 0 && p[0] <= 1);
      assert.ok(near(radius, 0) || near(radius, 1), 'on the axis or on a ring');
      if (near(radius, 1)) assert.ok(near(p[0], GEM_RINGS.base) || near(p[0], GEM_RINGS.shoulder));
    }
    for (let e = 0; e < 3; e += 1) {
      const edge = [key(tri[e]), key(tri[(e + 1) % 3])].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((count) => count === 2), 'every edge is shared by two faces: no hole');
});

test('shell: defaults, clamps, refusals, packed row', () => {
  const shell = normalizeShell({ at: { x: 0, y: 0 }, radius: 50, crack: 3, dissolve: -1, bend: 9, thickness: 0.5 });
  assert.deepEqual([shell.crack, shell.dissolve, shell.bend, shell.thickness, shell.heat, shell.turn, shell.alpha], [1, 0, 1, 0.5, 0, 0, 1]);
  for (const bad of [null, { radius: 4 }, { at: { x: 0, y: 0 }, radius: 0 }, { at: { x: 0, y: 0 }, radius: 4, alpha: 0 }]) assert.equal(normalizeShell(bad), null);
  assert.equal(SHELL_FLOATS, SHELL_ATTRIBUTES.length * 4);
  const out = new Float32Array(SHELL_FLOATS);
  packShell(
    normalizeShell({ at: { x: 1, y: 2, z: 3 }, radius: 40, alpha: 0.5, seed: 7, colour: [1, 0, 0.5], deep: [0.25, 0, 0.5], hot: [1, 0.5, 0], rim: [0, 0.5, 1], crack: 0.25, dissolve: 0.75, turn: 2, bend: 0.5, heat: 0.25, thickness: 0.75 }),
    out,
    0
  );
  assert.deepEqual([...out], [1, 2, 3, 40, 1, 0, 0.5, 0.5, 0.25, 0, 0.5, 7, 1, 0.5, 0, 0.25, 0, 0.5, 1, 0.75, 2, 0.5, 0.25, 0.75]);
});

test('both kinds are registered with samples that draw', () => {
  for (const [name, samples, normalize] of [['crystal', crystalSamples, normalizeCrystal], ['shell', shellSamples, normalizeShell]]) {
    assert.equal(typeof ELEMENT_KINDS[name], 'function', name);
    assert.equal(ELEMENT_SAMPLES[name], samples);
    assert.ok(samples().length >= 3 && samples().every((params) => normalize(params) !== null), `${name} samples are valid`);
  }
});
