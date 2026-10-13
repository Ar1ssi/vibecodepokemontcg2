import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { textureFiles } from '../import-tcgl-coins.mjs';

// The committed output of import-tcgl-coins.mjs: every reference in it must resolve.
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'client', 'src', 'assets', 'coins', 'tcgl');
const read = (name) => JSON.parse(fs.readFileSync(path.join(ASSETS, name), 'utf8'));

const { coins, materials } = read('coins.json');
const shaders = read('shaders.json');
const textures = read('textures.json');
const mesh = read('coin-mesh.json');

test('every coin has a front material, and its back when it has one, both in range', () => {
  const ids = Object.keys(coins);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const { front, back } = coins[id];
    assert.ok(Number.isInteger(front) && front >= 0 && front < materials.length, `${id}: front ${front}`);
    assert.ok(back === null || (Number.isInteger(back) && back >= 0 && back < materials.length), `${id}: back ${back}`);
  }
});

test('every material names a shader that was imported', () => {
  for (const material of materials) {
    assert.ok(material.shader >= 0 && material.shader < shaders.length, `${material.n}: shader ${material.shader}`);
  }
});

test('every texture a material binds is imported, and every imported texture file is on disk', () => {
  for (const material of materials) {
    for (const name of material.tex) {
      if (name.startsWith('#')) continue;
      assert.ok(name in textures, `${material.n}: texture ${name} is not in textures.json`);
    }
  }
  for (const [name, texture] of Object.entries(textures)) {
    for (const file of textureFiles(texture)) {
      assert.ok(fs.existsSync(path.join(ASSETS, 'textures', file)), `${name}: ${file} is missing`);
    }
  }
});

test('every cube sampler, the reflection probes included, gets an imported cube map', () => {
  for (const material of materials) {
    shaders[material.shader].textures.forEach((sampler, index) => {
      if (sampler.type !== 'samplerCube') return;
      const name = material.tex[index];
      assert.ok(textures[name]?.cube, `${material.n}: ${sampler.uniform} is bound to ${name}, not a cube map`);
    });
  }
});

test('the coin disc indexes only its own vertices and its submeshes cover every triangle', () => {
  const vertexCount = mesh.p.length / 3;
  assert.equal(mesh.n.length / 3, vertexCount);
  assert.equal(mesh.uv.length / 2, vertexCount);
  assert.equal(mesh.i.length % 3, 0);
  assert.ok(mesh.i.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount));
  const covered = mesh.submeshes.reduce((total, submesh) => total + submesh.count, 0);
  assert.equal(covered, mesh.i.length);
});
