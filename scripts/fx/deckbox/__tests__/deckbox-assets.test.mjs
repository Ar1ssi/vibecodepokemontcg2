import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'client', 'src', 'assets', 'deckbox');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));

test('every catalog box has an atlas and a thumbnail, and the default is listed', () => {
  const catalog = readJson('boxes.json');
  assert.ok(catalog.boxes.length > 300);
  assert.ok(catalog.boxes.some((box) => box.id === catalog.default));
  const ids = new Set();
  for (const box of catalog.boxes) {
    assert.ok(!ids.has(box.id), `${box.id} listed twice`);
    ids.add(box.id);
    assert.ok(box.name.length > 0, `${box.id} has no name`);
    assert.ok(!/[<>�]/.test(box.name), `${box.id} name has leftover markup: ${box.name}`);
    assert.ok(fs.existsSync(path.join(DIR, box.atlas)), `${box.atlas} missing`);
    assert.ok(fs.existsSync(path.join(DIR, box.thumb)), `${box.thumb} missing`);
  }
});

test('scene poses are finite with unit quaternions for all three slots', () => {
  const scene = readJson('scene.json');
  const poses = [];
  for (const slot of ['box', 'sleeve', 'coin']) {
    const entry = scene.slots[slot];
    poses.push(entry.grouped, entry.focused, entry.shadow);
    if (entry.mesh) poses.push(entry.mesh);
  }
  for (const { p, q, s } of poses) {
    assert.ok([...p, ...q, ...s].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 0.01, `quaternion ${q} is not unit length`);
  }
  assert.ok(scene.fov > 0 && scene.distance > 0);
});

test('meshes are indexed in range and every submesh covers whole triangles', () => {
  for (const [file, submeshCount] of [
    ['deck-box.mesh.json', 2],
    ['card.mesh.json', 3],
  ]) {
    const mesh = readJson(file);
    const vertices = mesh.p.length / 3;
    assert.equal(mesh.n.length, mesh.p.length);
    assert.equal(mesh.uv.length / 2, vertices);
    assert.ok(mesh.i.every((index) => Number.isInteger(index) && index >= 0 && index < vertices));
    assert.equal(mesh.submeshes.length, submeshCount);
    assert.equal(mesh.submeshes.reduce((sum, submesh) => sum + submesh.count, 0), mesh.i.length);
    assert.ok(mesh.submeshes.every((submesh) => submesh.count % 3 === 0));
  }
});
