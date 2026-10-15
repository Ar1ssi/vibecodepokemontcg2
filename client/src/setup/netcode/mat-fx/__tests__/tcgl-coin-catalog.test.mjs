import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tcglCoin, tcglCoinIds, tcglMaterial } from '../tcgl-coin-catalog.mjs';

// The committed slice 1 import (scripts/fx/coin/import-tcgl-coins.mjs). Every coin must resolve.
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'assets', 'coins', 'tcgl');
const read = (name) => JSON.parse(fs.readFileSync(path.join(ASSETS, name), 'utf8'));

const assets = {
  ...read('coins.json'),
  shaders: read('shaders.json'),
  textures: read('textures.json'),
};

test('every committed coin resolves to a known family with a front material', () => {
  const ids = tcglCoinIds(assets);
  assert.equal(ids.length, 445);
  for (const id of ids) {
    const coin = tcglCoin(assets, id);
    assert.equal(coin.front.name, assets.materials[assets.coins[id].front].n);
    assert.ok(coin.front.family, `${id}: family`);
    assert.equal(typeof coin.front.foil, 'boolean', `${id}: foil`);
    assert.ok(coin.back === null || coin.back.family, `${id}: back family`);
  }
});

test('every material binds what its shader declares, at the size the shader declares', () => {
  for (let index = 0; index < assets.materials.length; index += 1) {
    const material = tcglMaterial(assets, index);
    const { shader } = material;
    assert.equal(material.vectors.length, shader.buffers.v.length, `${material.name}: v blocks`);
    material.vectors.forEach((block, blockIndex) => {
      assert.equal(block.length, shader.buffers.v[blockIndex].length * 4, `${material.name}: v${blockIndex} size`);
    });
    assert.equal(material.floats.length, shader.buffers.f.length, `${material.name}: f blocks`);
    material.floats.forEach((block, blockIndex) => {
      assert.equal(block.length, shader.buffers.f[blockIndex].length * 4, `${material.name}: f${blockIndex} size`);
    });
    assert.equal(material.textures.length, shader.textures.length, `${material.name}: samplers`);
  }
});

test('every texture a committed coin references is imported and its files are on disk', () => {
  const referenced = new Set();
  for (const id of tcglCoinIds(assets)) {
    const coin = tcglCoin(assets, id);
    for (const material of [coin.front, coin.back]) {
      if (!material) continue;
      for (const { source } of material.textures) {
        if (source.builtin) continue;
        referenced.add(source.name);
        const files = source.cube ? source.faces : [source.file];
        for (const file of files) {
          assert.ok(fs.existsSync(path.join(ASSETS, 'textures', file)), `${id}: ${file} is missing`);
        }
      }
    }
  }
  assert.ok(referenced.size > 0);
});

test('a metal coin uses the plain metal shader; a holofoil coin uses a foil family', () => {
  const metal = tcglCoin(assets, 'cn_alcremievanillacreamstrawberry_tcgl-sc_mtl');
  assert.equal(metal.front.family, 'BumpSpec Relective');
  assert.equal(metal.front.foil, false);
  assert.equal(metal.back.name, 'Back');

  const holo = tcglCoin(assets, 'cn_absolmega_slvi');
  assert.equal(holo.front.family, 'Cracked_Ice');
  assert.equal(holo.front.foil, true);
  assert.equal(holo.back, null);
});

test('a coin id the import does not have throws', () => {
  assert.throws(() => tcglCoin(assets, 'cn_does_not_exist'), /no TCG Live coin/);
  assert.throws(() => tcglCoin(assets, '__proto__'), /no TCG Live coin/);
});

const fakeAssets = (overrides = {}) => ({
  coins: { c: { front: 0, back: null } },
  materials: [{ n: 'M', shader: 0, queue: 2000, v: [], f: [], tex: ['#white'] }],
  shaders: [
    {
      name: 'TPCi/Coins/Foil/Rainbow',
      buffers: { v: [], f: [] },
      textures: [{ uniform: 'ftex0', type: 'sampler2D' }],
    },
  ],
  textures: {},
  ...overrides,
});

test('a shader outside the known list throws, not a silently wrong coin', () => {
  const unknown = fakeAssets({ shaders: [{ name: 'TPCi/Coins/Foil/Hologram', buffers: { v: [], f: [] }, textures: [{ uniform: 'ftex0', type: 'sampler2D' }] }] });
  assert.throws(() => tcglMaterial(unknown, 0), /Hologram" has no known family/);
});

test('a material whose texture count disagrees with its shader throws', () => {
  const mismatched = fakeAssets({ materials: [{ n: 'M', shader: 0, queue: 2000, v: [], f: [], tex: [] }] });
  assert.throws(() => tcglMaterial(mismatched, 0), /binds 0 textures, shader/);
});

test('a built-in texture must be one the stage supplies; an imported one must exist', () => {
  const badBuiltin = fakeAssets({ materials: [{ n: 'M', shader: 0, queue: 2000, v: [], f: [], tex: ['#nope'] }] });
  assert.throws(() => tcglMaterial(badBuiltin, 0), /is not a built-in/);

  const missing = fakeAssets({ materials: [{ n: 'M', shader: 0, queue: 2000, v: [], f: [], tex: ['Gone'] }] });
  assert.throws(() => tcglMaterial(missing, 0), /"Gone" is not in textures.json/);
});

test('the grab texture and built-ins resolve without an imported file', () => {
  const grab = fakeAssets({ materials: [{ n: 'M', shader: 0, queue: 2000, v: [], f: [], tex: ['#grab'] }] });
  assert.deepEqual(tcglMaterial(grab, 0).textures[0].source, { builtin: 'grab' });
});

test('an unknown material index throws', () => {
  assert.throws(() => tcglMaterial(fakeAssets(), 5), /material 5 does not exist/);
});
