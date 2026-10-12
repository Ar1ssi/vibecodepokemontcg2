// Design 068: the committed attack-impact assets are whole — every type has its six prefabs,
// and everything a prefab points at (material, shader, texture file, mesh) is there.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUNDLE_TYPES, PREFAB_VARIANTS } from '../import-tcgl-attack-fx.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'client', 'src', 'assets', 'fx', 'attack');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ASSETS, name), 'utf8'));
const shaders = readJson('shaders.json');
const meshes = readJson('meshes.json');
const textures = readJson('textures.json');
const TYPE_IDS = Object.values(BUNDLE_TYPES).map(([typeId]) => typeId);
const DEFAULT_TEXTURES = new Set(['#white', '#black', '#gray', '#bump', '#red', '#grab']);

const walk = (node, visit) => {
  visit(node);
  (node.c ?? []).forEach((child) => walk(child, visit));
};

test('the 11 types × 6 variants = 66 prefabs are present', () => {
  assert.equal(TYPE_IDS.length, 11);
  let prefabs = 0;
  for (const typeId of TYPE_IDS) {
    const file = readJson(`${typeId}.json`);
    assert.equal(file.type, typeId);
    assert.deepEqual(Object.keys(file.prefabs), [...PREFAB_VARIANTS]);
    prefabs += Object.keys(file.prefabs).length;
  }
  assert.equal(prefabs, 66);
});

test('every renderer points at a material, shader, textures and mesh that exist', () => {
  let systems = 0;
  for (const typeId of TYPE_IDS) {
    const file = readJson(`${typeId}.json`);
    for (const material of file.materials) {
      const shader = shaders[material.shader];
      assert.ok(shader, `${typeId} ${material.n}: shader ${material.shader}`);
      assert.equal(material.v.length, shader.buffers.v.length);
      assert.equal(material.f.length, shader.buffers.f.length);
      material.v.forEach((data, index) => assert.equal(data.length, shader.buffers.v[index].length * 4));
      material.f.forEach((data, index) => assert.equal(data.length, shader.buffers.f[index].length * 4));
      assert.equal(material.tex.length, shader.textures.length);
      for (const texture of material.tex) {
        assert.ok(DEFAULT_TEXTURES.has(texture) || texture in textures, `${typeId} ${material.n}: texture ${texture}`);
      }
      assert.equal(material.tex.includes('#grab'), shader.grab, `${typeId} ${material.n}: grab texture and GrabPass disagree`);
    }
    for (const [variant, prefab] of Object.entries(file.prefabs)) {
      walk(prefab, (node) => {
        if (!node.r) return;
        systems += 1;
        assert.ok(node.ps, `${typeId} ${variant} ${node.n}: a renderer without a system`);
        assert.ok(file.materials[node.r.mat], `${typeId} ${variant} ${node.n}: material ${node.r.mat}`);
        if (node.r.mode === 4) assert.ok(meshes[node.r.mesh], `${typeId} ${variant} ${node.n}: mesh ${node.r.mesh}`);
        if (node.r.trailMat !== undefined) assert.ok(file.materials[node.r.trailMat]);
      });
      const subIds = new Set();
      walk(prefab, (node) => node.subId && subIds.add(node.subId));
      walk(prefab, (node) => (node.ps?.sub ?? []).forEach((sub) => assert.ok(subIds.has(sub.id), `${typeId} ${variant} ${node.n}: sub-emitter ${sub.id}`)));
    }
  }
  assert.ok(systems > 1000, `${systems} drawn systems`);
});

test('every texture file is committed and every shader is GLSL ES 3.00 on both stages', () => {
  for (const [name, texture] of Object.entries(textures)) {
    assert.ok(fs.existsSync(path.join(ASSETS, 'textures', texture.file)), `missing ${name}`);
    assert.ok(texture.w > 0 && texture.h > 0);
  }
  assert.equal(shaders.length, 32);
  for (const shader of shaders) {
    assert.ok(shader.vs.startsWith('#version 300 es'), shader.name);
    assert.ok(shader.fs.startsWith('#version 300 es'), shader.name);
    assert.ok(shader.attributes.some((attribute) => attribute.semantic === 'POSITION'), shader.name);
    assert.ok(shader.buffers.v.some((buffer) => buffer.dynamic.some((entry) => entry.kind === 'viewProjection')), `${shader.name}: no view-projection`);
  }
  for (const [name, mesh] of Object.entries(meshes)) {
    assert.equal(mesh.p.length % 3, 0, name);
    assert.ok(mesh.i.length % 3 === 0 && mesh.i.every((index) => index < mesh.p.length / 3), name);
  }
});
