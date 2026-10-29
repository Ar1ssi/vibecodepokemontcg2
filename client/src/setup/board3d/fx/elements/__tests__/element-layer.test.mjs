import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { createElementLayer } from '../element-layer.js';
import { defineSprite, SPRITE_CAPACITY } from '../sprite.js';

const LAYER = 1;

const fakeRenderer = () => ({
  copies: 0,
  resets: 0,
  getDrawingBufferSize: (v) => v.set(640, 360),
  resetState() {
    this.resets += 1;
  },
  copyFramebufferToTexture() {
    this.copies += 1;
  },
});

const fakeTextures = (ready = true) => ({
  get: (name) => ({ texture: ready ? new three.Texture() : null, grid: name.includes('2x2') ? { cols: 2, rows: 2 } : { cols: 1, rows: 1 }, ready }),
  dispose() {},
});

/** A kind that records what reached it and can ask for the board. */
const probeKind = (log, { board = false } = {}) => ({ uniforms }) => ({
  kind: 'probe',
  object3d: new three.Group(),
  needsBoard: () => board && log.pushed.length > 0,
  begin: () => log.pushed.splice(0),
  push: (params) => (log.pushed.push(params), true),
  finish: (u) => log.finished.push(u === uniforms),
  dispose: () => log.disposed.push(true),
});

const make = (kinds, options = {}) => {
  const debug = [];
  const group = new three.Group();
  const renderer = fakeRenderer();
  const layer = createElementLayer({ three, renderer, group, layer: LAYER, kinds, textures: fakeTextures(options.ready), debug: (...a) => debug.push(a.join(' ')) });
  return { layer, group, renderer, debug };
};

test('emits reach a kind only while live; unknown kinds are refused with one debug line', () => {
  const log = { pushed: [], finished: [], disposed: [] };
  const { layer, debug } = make({ probe: probeKind(log) });
  layer.begin();
  assert.equal(layer.emitter.emit('probe', { a: 1 }), false, 'not live yet');
  layer.emitter.live = true;
  assert.equal(layer.emitter.emit('probe', { a: 2 }), true);
  assert.equal(layer.emitter.emit('nope', {}), false);
  assert.equal(layer.emitter.emit('nope', {}), false);
  assert.deepEqual(log.pushed, [{ a: 2 }]);
  assert.equal(debug.filter((line) => line.includes('unknown kind')).length, 1);
  layer.finish({ timeSeconds: 1000.5, stageToWorld: new Float32Array(16).fill(0) });
  assert.equal(layer.emitter.live, false, 'finish closes the frame');
  assert.deepEqual(log.finished, [true], 'kinds get the shared uniforms');
});

test('finish wraps time like gpu-canvas and sets the viewport; dispose frees every kind', () => {
  let seen = null;
  const capture = ({ uniforms }) => ({
    object3d: new three.Group(),
    needsBoard: () => false,
    begin() {},
    push: () => true,
    finish: (u) => {
      seen = { time: u.uTime.value, viewport: [u.uViewport.value.x, u.uViewport.value.y], same: u === uniforms };
    },
    dispose: () => log.disposed.push(true),
  });
  const log = { disposed: [] };
  const { layer, group } = make({ capture });
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].layers.mask, 1 << LAYER, 'kinds draw on the FX layer');
  layer.begin();
  layer.finish({ timeSeconds: 1000.5 });
  assert.deepEqual(seen, { time: 1000.5 - 512, viewport: [640, 360], same: true });
  layer.dispose();
  assert.deepEqual(log.disposed, [true]);
  assert.equal(group.children.length, 0);
});

test('the board is copied only when a kind drawing this frame needs it (edge 1, 9)', () => {
  const log = { pushed: [], finished: [], disposed: [] };
  const { layer, renderer } = make({ probe: probeKind(log, { board: true }) });
  layer.begin();
  assert.equal(layer.captureBoard(), false, 'nothing emitted: no copy');
  assert.equal(renderer.copies, 0);
  layer.emitter.live = true;
  layer.emitter.emit('probe', {});
  assert.equal(layer.captureBoard(), true);
  assert.equal(renderer.copies, 1);
  assert.equal(renderer.resets, 1, 'three state is reset first, so the copy binds the real texture');
});

test('a kind that throws on push or finish is contained and logged once', () => {
  const debug = [];
  const group = new three.Group();
  const throwing = () => ({
    object3d: new three.Group(),
    needsBoard: () => false,
    begin() {},
    push() {
      throw new Error('bad push');
    },
    finish() {
      throw new Error('bad finish');
    },
    dispose() {},
  });
  const layer = createElementLayer({ three, renderer: fakeRenderer(), group, layer: LAYER, kinds: { bad: throwing }, textures: fakeTextures(), debug: (...a) => debug.push(a.join(' ')) });
  layer.begin();
  layer.emitter.live = true;
  assert.equal(layer.emitter.emit('bad', {}), false);
  assert.equal(layer.emitter.emit('bad', {}), false);
  layer.finish();
  layer.finish();
  assert.equal(debug.length, 2, debug.join('\n'));
  assert.equal(group.children[0].visible, false, 'a kind that fails to upload hides');
});

test('sprite: buckets per texture/blend/channel, counts reset each frame, invalid params dropped', () => {
  const { layer, group } = make({ sprite: defineSprite });
  layer.begin();
  layer.emitter.live = true;
  const base = { at: { x: 0, y: 0, z: 5 }, size: 10 };
  assert.equal(layer.emitter.emit('sprite', { ...base, texture: 'a.webp' }), true);
  assert.equal(layer.emitter.emit('sprite', { ...base, texture: 'a.webp' }), true);
  assert.equal(layer.emitter.emit('sprite', { ...base, texture: 'a.webp', blend: 'over' }), true);
  assert.equal(layer.emitter.emit('sprite', { ...base, texture: 'b_2x2.webp', channel: 'rgba' }), true);
  assert.equal(layer.emitter.emit('sprite', { ...base, texture: 'a.webp', size: -1 }), false, 'edge 2');
  layer.finish();
  assert.deepEqual(layer.counts().sprite, { 'a.webp|add|r': 2, 'a.webp|over|r': 1, 'b_2x2.webp|add|rgba': 1 });
  const meshes = group.children[0].children;
  assert.equal(meshes.length, 3);
  for (const mesh of meshes) assert.equal(mesh.layers.mask, 1 << LAYER, 'bucket meshes draw on the FX layer');
  const leaves = meshes.find((mesh) => mesh.geometry.instanceCount === 1 && mesh.material.uniforms.uChannel.value === 2);
  assert.deepEqual([leaves.material.uniforms.uGrid.value.x, leaves.material.uniforms.uGrid.value.y], [2, 2]);
  assert.equal(leaves.material.uniforms.uHasTex.value, 1);
  layer.begin();
  layer.finish();
  assert.deepEqual(Object.values(layer.counts().sprite), [0, 0, 0], 'edge 1: an empty frame draws nothing');
  assert.ok(meshes.every((mesh) => mesh.visible === false));
});

test('sprite: a texture not loaded yet draws its fallback dot (edge 5); capacity drops the rest (edge 3)', () => {
  const { layer, debug } = make({ sprite: defineSprite }, { ready: false });
  layer.begin();
  layer.emitter.live = true;
  let accepted = 0;
  for (let i = 0; i < SPRITE_CAPACITY + 5; i += 1) accepted += layer.emitter.emit('sprite', { texture: 'a.webp', at: { x: i, y: 0 }, size: 2 }) ? 1 : 0;
  layer.finish();
  assert.equal(accepted, SPRITE_CAPACITY);
  assert.equal(debug.filter((line) => line.includes('capacity')).length, 1);
  assert.equal(layer.counts().sprite['a.webp|add|r'], SPRITE_CAPACITY);
});

test('two scenes in one frame (a move and a multi-hit impact) queue into the same buckets (edge 4)', () => {
  const { layer } = make({ sprite: defineSprite });
  layer.begin();
  layer.emitter.live = true;
  const sceneA = () => layer.emitter.emit('sprite', { texture: 'a.webp', at: { x: 0, y: 0 }, size: 4 });
  const sceneB = () => layer.emitter.emit('sprite', { texture: 'a.webp', at: { x: 9, y: 9 }, size: 4 });
  sceneA();
  sceneB();
  layer.finish();
  assert.equal(layer.counts().sprite['a.webp|add|r'], 2);
});
