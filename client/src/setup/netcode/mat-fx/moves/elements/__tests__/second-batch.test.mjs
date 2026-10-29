import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { MATERIALS, materialFor } from '../../materials/index.js';
import { ELEMENT_KITS } from '../index.js';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const live = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  const emits = [];
  canvas.ctx.fxElements = { live: false, emit: (kind, params) => (emits.push({ kind, params }), true) };
  canvas.begin({ layer: 'front', z: 3, unit: 100 });
  return { canvas, ctx: canvas.ctx, emits };
};
const lane = localLane(laneGeometry({ left: 0, top: 300, width: 90, height: 126 }, { left: 0, top: 0, width: 90, height: 126 }), { left: 0, top: 0 });
const info = (key, params = {}) => {
  const material = materialFor(key);
  return { material, materialAt: () => material, params, elapsedMs: 400, time: 0.4, seed: 5, spec: {}, beatMs: 600 };
};
const textures = (emits) => emits.filter((e) => e.kind === 'sprite').map((e) => e.params.texture);

test('every material has an element kit (no type is left on canvas only)', () => {
  for (const key of Object.keys(MATERIALS)) assert.ok(Object.hasOwn(ELEMENT_KITS, key), key);
});

test('shared impact flash: glow, ring, spikes and flash lines for every type, normal included (no white)', () => {
  for (const key of ['normal', 'steel', 'fire', 'bug']) {
    const { ctx, emits } = live();
    DRAWERS.impactFlash.draw(ctx, lane, 0.2, info(key));
    assert.deepEqual(textures(emits), [
      'TEX_VFX_Gradient_Radial.webp',
      'TEX_VFX_Impact_Ring.webp',
      'TEX_VFX_ImpactSpikes_White.webp',
      'TEX_VFX_Impact_Flash.webp',
    ], key);
    assert.ok(emits.every((e) => e.params.colour.every(Number.isFinite)), `${key} colours are numbers`);
  }
});

test('shared slash: the type tongue plus a slash streak aligned along each arc', () => {
  const { ctx, emits } = live();
  DRAWERS.slashArc.draw(ctx, lane, 0.5, info('dark', { count: 2 }));
  const slashes = emits.filter((e) => e.kind === 'sprite' && e.params.texture === 'T_VFX_Slash_1x4.webp');
  assert.ok(slashes.length > 0);
  assert.ok(slashes.every((s) => Number.isFinite(s.params.alignDeg)));
});

test('shared aura: glow, inner glow and an energy ring', () => {
  const { ctx, emits } = live();
  DRAWERS.aura.draw(ctx, lane, 0.5, info('fighting'));
  assert.deepEqual(textures(emits), ['TEX_VFX_Gradient_Radial.webp', 'TEX_VFX_Ring_InnerGlow.webp', 'TEX_VFX_Energy_Ring_Soft.webp']);
});

test('dragon burns with the fire kinds in its own palette', () => {
  const { ctx, emits } = live();
  materialFor('dragon').tongue(ctx, { x: 0, y: 0, angleDeg: 0, length: 30, width: 8, seed: 1 });
  assert.equal(emits[0].kind, 'flameJet');
  assert.deepEqual(emits[0].params.palette.body, MATERIALS.dragon.palette.body.map((v) => v / 255));
});

test('fighting orbs are force spheres; steel and gem bodies spheres of light; ice bodies glass drops', () => {
  const kinds = {};
  for (const key of ['fighting', 'aura', 'steel', 'gem', 'ice']) {
    const { ctx, emits } = live();
    materialFor(key).body(ctx, 0, 0, 10, 1);
    kinds[key] = emits.at(-1);
  }
  assert.equal(kinds.fighting.kind, 'plasma');
  assert.ok(kinds.fighting.params.shell > kinds.fighting.params.arcs);
  assert.equal(kinds.steel.kind, 'plasma');
  assert.equal(kinds.steel.params.arcs, 0);
  assert.equal(kinds.gem.kind, 'plasma');
  assert.equal(kinds.ice.kind, 'waterDrop');
});

test('ice, steel and bug tongues are glossy stretched shards; bug needles thinnest', () => {
  const shard = (key) => {
    const { ctx, emits } = live();
    materialFor(key).tongue(ctx, { x: 0, y: 0, angleDeg: 30, length: 40, width: 10, seed: 2 });
    return emits[0];
  };
  const ice = shard('ice');
  const bug = shard('bug');
  assert.equal(ice.kind, 'debris');
  assert.ok(ice.params.gloss > 0.5);
  assert.ok(Math.abs(ice.params.headingDeg - 30) < 1e-9);
  assert.ok(bug.params.size < ice.params.size);
  assert.ok(bug.params.stretch > ice.params.stretch);
});

test('flying gusts are swipes aligned along the gust; flying smoke is white air', () => {
  const { ctx, emits } = live();
  materialFor('flying').tongue(ctx, { x: 0, y: 0, angleDeg: 45, length: 40, width: 8, seed: 3 });
  assert.equal(emits[0].params.texture, 'T_VFX_Slash02_1x4.webp');
  assert.ok(Math.abs(emits[0].params.alignDeg - 45) < 1e-9);
  const air = live();
  DRAWERS.cloud.draw(air.ctx, lane, 0.5, info('flying', { target: 'defender' }));
  assert.ok(air.emits.some((e) => e.kind === 'smoke'));
});

test('poison is a liquid with its own glowing gas; petals are tinted petal sprites', () => {
  const { ctx, emits } = live();
  materialFor('poison').body(ctx, 0, 0, 10, 1);
  assert.equal(emits[0].kind, 'waterDrop');
  const gas = live();
  DRAWERS.smoke.draw(gas.ctx, lane, 0.5, info('poison', { count: 3 }));
  const puffs = gas.emits.filter((e) => e.kind === 'smoke');
  assert.ok(puffs.length > 0 && puffs.every((p) => p.params.glow > 0));
  const petal = live();
  materialFor('petal').tongue(petal.ctx, { x: 0, y: 0, angleDeg: 0, length: 20, width: 6, seed: 1 });
  assert.equal(petal.emits[0].params.texture, 'T_VFX_Fairy_Petal_Soft_2x2.webp');
  assert.deepEqual(petal.emits[0].params.colour, MATERIALS.petal.palette.body.map((v) => (v / 255) * 1.1));
});
