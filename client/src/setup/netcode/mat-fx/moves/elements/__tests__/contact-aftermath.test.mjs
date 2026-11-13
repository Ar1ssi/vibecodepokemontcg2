// Design 089 D7: each material lands in its own contact style and leaves its own aftermath.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { ELEMENT_KINDS } from '../../../../../board3d/fx/elements/index.js';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { materialFor } from '../../materials/index.js';
import { MATERIAL_KEYS } from '../../move-spec.mjs';
import { AFTERMATHS, aftermathFor } from '../_aftermath.js';
import { CONTACT_STYLE } from '../_shared-beats.js';

const TEXTURE_DIR = fileURLToPath(new URL('../../../../../../assets/fx/attack/textures/', import.meta.url));

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const live = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  const emits = [];
  canvas.ctx.fxElements = { live: false, emit: (kind, params) => (emits.push({ kind, params }), true) };
  canvas.begin({ layer: 'top', z: 4, unit: 126 });
  return { ctx: canvas.ctx, emits };
};
const lane = localLane(laneGeometry({ left: 0, top: 300, width: 90, height: 126 }, { left: 0, top: 0, width: 90, height: 126 }), { left: 0, top: 0 });
const CARD = { x: 45, y: 63, w: 90, h: 126 };
const flashInfo = (key) => {
  const material = materialFor(key);
  return { material, materialAt: () => material, params: {}, elapsedMs: 1000, time: 1, seed: 5, spec: {}, beatMs: 400 };
};
const texturesOf = (emits) => emits.filter((e) => e.kind === 'sprite').map((e) => e.params.texture);
const finite = (value) => (Array.isArray(value) ? value.every(finite) : typeof value === 'object' && value !== null ? Object.values(value).every(finite) : typeof value !== 'number' || Number.isFinite(value));

const flashOf = (key, s = 0.2) => {
  const { ctx, emits } = live();
  DRAWERS.impactFlash.draw(ctx, lane, s, flashInfo(key));
  return emits;
};

test('every material has a contact style or is a blow, and the styles really differ', () => {
  for (const key of Object.keys(CONTACT_STYLE)) assert.ok(MATERIAL_KEYS.includes(key), `${key} is a material`);
  const blows = MATERIAL_KEYS.filter((key) => !Object.hasOwn(CONTACT_STYLE, key));
  assert.deepEqual(blows.sort(), ['aura', 'fighting', 'normal']);
  // One representative per style: no two styles draw the same set of textures.
  const looks = ['normal', 'fire', 'water', 'electric', 'rock', 'steel', 'grass'].map((key) => texturesOf(flashOf(key)).join(','));
  assert.equal(new Set(looks).size, looks.length, looks.join('\n'));
});

test('a contact draws for every material, with finite params, from textures that exist', () => {
  for (const key of MATERIAL_KEYS) {
    for (const s of [0.05, 0.2, 0.7]) {
      const emits = flashOf(key, s);
      assert.ok(emits.length > 0, `${key} at ${s}`);
      assert.ok(emits.every((e) => finite(e.params)), `${key} at ${s}: finite params`);
      for (const texture of texturesOf(emits)) assert.ok(existsSync(TEXTURE_DIR + texture), `${key}: ${texture}`);
    }
  }
});

test('water splashes through its frames; a shatter throws its shards outward', () => {
  const frames = [0.05, 0.3, 0.55, 0.8].map((s) => flashOf('water', s).find((e) => e.params.texture === 'T_VFX_Water_Splash_2x2.webp').params.frame);
  assert.deepEqual(frames, [0, 1, 2, 3]);
  const reach = (s) => {
    const shards = flashOf('rock', s).filter((e) => e.params.texture === 'TEX_VFX_Diamond_Shard.webp');
    assert.ok(shards.length >= 6);
    const centre = flashOf('rock', s).find((e) => e.params.texture === 'TEX_VFX_Impact_Ring.webp').params.at;
    return Math.max(...shards.map((e) => Math.hypot(e.params.at.x - centre.x, e.params.at.y - centre.y)));
  };
  assert.ok(reach(0.6) > reach(0.1) * 1.5);
});

test('every material leaves an aftermath of its own kind on the struck card', () => {
  const kinds = new Set();
  for (const key of MATERIAL_KEYS) {
    const aftermath = aftermathFor(key);
    assert.equal(typeof aftermath, 'function', `${key} leaves something`);
    const material = materialFor(key);
    const seen = [];
    for (const s of [0.1, 0.35, 0.6, 0.85]) {
      const { ctx, emits } = live();
      aftermath(ctx, CARD, s, { palette: material.palette, time: 1 + s, seed: 7 });
      assert.ok(emits.every((e) => finite(e.params)), `${key} at ${s}: finite params`);
      for (const e of emits) {
        assert.ok(Object.hasOwn(ELEMENT_KINDS, e.kind), `${key}: ${e.kind} is an element kind`);
        if (e.kind === 'sprite') assert.ok(existsSync(TEXTURE_DIR + e.params.texture), `${key}: ${e.params.texture}`);
      }
      seen.push(...emits);
    }
    assert.ok(seen.length >= 4, `${key} draws (${seen.length} emits over its run)`);
    kinds.add(aftermath);
  }
  assert.ok(kinds.size >= 12, `${kinds.size} different aftermaths`);
  assert.equal(aftermathFor('nope'), null);
  assert.ok(Object.isFrozen(AFTERMATHS));
});

test('an aftermath stands still on a frozen clock, and is gone at its end', () => {
  for (const key of ['fire', 'electric', 'grass', 'ghost', 'flying']) {
    const material = materialFor(key);
    const run = (s, time) => {
      const { ctx, emits } = live();
      aftermathFor(key)(ctx, CARD, s, { palette: material.palette, time, seed: 3 });
      return emits;
    };
    assert.deepEqual(run(0.4, 1.4), run(0.4, 1.4), `${key} is repeatable`);
    const last = run(0.999, 2);
    assert.ok(last.every((e) => !(e.params.alpha > 0.06)), `${key} has faded by its end`);
  }
});

test('the residue stays round the card it struck', () => {
  for (const key of MATERIAL_KEYS) {
    const material = materialFor(key);
    const { ctx, emits } = live();
    aftermathFor(key)(ctx, CARD, 0.5, { palette: material.palette, time: 1.5, seed: 9 });
    for (const e of emits) {
      const at = e.params.at ?? e.params.a;
      assert.ok(Math.abs(at.x - CARD.x) < CARD.h * 1.3 && Math.abs(at.y - CARD.y) < CARD.h * 1.3, `${key}: ${e.kind} at ${at.x}, ${at.y}`);
      assert.ok(at.z >= 0 && at.z < CARD.h, `${key}: ${e.kind} height ${at.z}`);
    }
  }
});
