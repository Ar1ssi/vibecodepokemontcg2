import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { drawParticle, parseCssColour, PARTICLE_SPRITES } from '../../particle-shapes.mjs';
import { MATERIALS } from '../../materials/index.js';
import { alphaOf, dissolveOf, emit, stageAngle, stageLen, stageOf } from '../_emit.js';
import { elementKit, withElements } from '../_kit.js';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

/** A gpu-canvas recorder with a recording emitter attached, as fx-layer attaches the real one. */
const recorderWithEmitter = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  const emits = [];
  canvas.ctx.fxElements = { live: false, emit: (kind, params) => (emits.push({ kind, params }), true) };
  return { canvas, ctx: canvas.ctx, emits };
};

test('begin turns elements live for a lit pass and off for a cast pass', () => {
  const { canvas, ctx } = recorderWithEmitter();
  canvas.begin({ layer: 'front', z: 3, unit: 100 });
  assert.equal(ctx.fxElements.live, true);
  canvas.begin({ layer: 'back', z: 0.25, unit: 100, cast: {} });
  assert.equal(ctx.fxElements.live, false);
  const bare = createGpuCanvas({ triangulate, debug: () => {} });
  bare.begin({ layer: 'front' });
  assert.equal(bare.ctx.fxElements, null, 'no emitter attached: nothing to toggle');
});

test('stagePoint follows the transform and the 076 lift; stageScale and stageAngle follow the transform', () => {
  const { canvas, ctx } = recorderWithEmitter();
  canvas.begin({ layer: 'front', z: 3, unit: 100 });
  ctx.translate(10, 20);
  ctx.scale(2, 2);
  ctx.fxLift = { z: 0.5 };
  assert.deepEqual(stageOf(ctx, 5, 5), { x: 20, y: 30, z: 53 });
  assert.equal(stageLen(ctx, 7), 14);
  ctx.rotate(Math.PI / 2);
  assert.ok(Math.abs(stageAngle(ctx, 0) - 90) < 1e-9);
  assert.equal(ctx.stageUnit(), 100);
});

test('alphaOf folds globalAlpha; dissolveOf reads the drawer dissolve; emit is false without a live layer', () => {
  assert.equal(alphaOf({ globalAlpha: 0.5 }, 0.8), 0.4);
  assert.equal(alphaOf({ globalAlpha: undefined }, 2), 1);
  assert.equal(dissolveOf({ fxMod: { dissolve: { amount: 0.3 } } }), 0.3);
  assert.equal(dissolveOf({}), 0);
  assert.equal(emit({}, 'sprite', {}), false);
  assert.equal(emit({ fxElements: { emit: () => false } }, 'sprite', {}), false);
});

test('withElements routes overridden methods only while live; the canvas kit otherwise (edges 7, 8)', () => {
  const calls = [];
  const kit = Object.freeze({
    key: 'k',
    palette: { body: [1, 2, 3] },
    body: (ctx, x) => calls.push(['canvas body', x]),
    glow: (ctx, x) => calls.push(['canvas glow', x]),
    withPalette: (palette) => ({ ...kit, palette }),
  });
  const elements = elementKit({
    body(ctx, x) {
      calls.push(['element body', x, this.base.palette.body]);
    },
    beats: { bolt: () => 'element bolt' },
  });
  const merged = withElements(kit, elements);
  const live = { fxElements: { live: true } };
  const cast = { fxElements: { live: false } };
  merged.body(live, 1);
  merged.body(cast, 2);
  merged.body({}, 3);
  merged.glow(live, 4);
  assert.deepEqual(calls, [
    ['element body', 1, [1, 2, 3]],
    ['canvas body', 2],
    ['canvas body', 3],
    ['canvas glow', 4],
  ]);
  assert.equal(merged.drawBeat('bolt', live)(), 'element bolt');
  assert.equal(merged.drawBeat('bolt', cast), null);
  assert.equal(merged.drawBeat('beam', live), null);
  calls.length = 0;
  merged.withPalette({ body: [9, 9, 9] }).body(live, 5);
  assert.deepEqual(calls, [['element body', 5, [9, 9, 9]]], 'a tinted kit keeps its elements');
  assert.equal(withElements(kit, undefined), kit);
  assert.throws(() => elementKit({ body: 3 }), /not a function/);
});

test('a drawer hands its whole beat to the element kit while live, and draws itself otherwise', () => {
  const lane = localLane(laneGeometry({ left: 0, top: 300, width: 90, height: 126 }, { left: 0, top: 0, width: 90, height: 126 }), { left: 0, top: 0 });
  const seen = [];
  const material = withElements(MATERIALS.fire, elementKit({ beats: { impactFlash: (ctx, l, s) => seen.push(['element', s]) } }));
  const { canvas, ctx } = recorderWithEmitter();
  canvas.begin({ layer: 'front', z: 3, unit: lane.h });
  const info = { material, materialAt: () => material, params: {}, elapsedMs: 0, time: 0, seed: 1, spec: {} };
  DRAWERS.impactFlash.draw(ctx, lane, 0.3, info);
  assert.deepEqual(seen, [['element', 0.3]]);
  canvas.begin({ layer: 'back', z: 0.25, unit: lane.h, cast: {} });
  const before = canvas.recording().vertexCount;
  DRAWERS.impactFlash.draw(ctx, lane, 0.3, { ...info, params: { size: 1 } });
  assert.equal(seen.length, 1, 'cast pass: the drawer itself draws');
  assert.ok(canvas.recording().vertexCount >= before);
});

test('drawParticle: a mapped kind emits its TCG Live sprite while live; zzz and a 2D context keep shapes', () => {
  const { canvas, ctx, emits } = recorderWithEmitter();
  canvas.begin({ layer: 'top', z: 4, unit: 100 });
  const state = { x: 10, y: -5, rotateDeg: 45, scale: 0.5, opacity: 0.8 };
  drawParticle(ctx, 'ember', state, { originX: 100, originY: 50, size: 12, colour: 'rgba(255, 128, 0, 0.5)', frame: 3 });
  assert.equal(emits.length, 1);
  const { kind, params } = emits[0];
  assert.equal(kind, 'sprite');
  assert.equal(params.texture, PARTICLE_SPRITES.ember.texture);
  assert.deepEqual(params.at, { x: 110, y: 45, z: 4 });
  assert.ok(Math.abs(params.size - 12 * 0.5 * PARTICLE_SPRITES.ember.grow) < 1e-9);
  assert.ok(Math.abs(params.alpha - 0.4) < 1e-9);
  assert.equal(params.frame, 3);
  const before = canvas.recording().vertexCount;
  drawParticle(ctx, 'zzz', state, { size: 12 });
  assert.equal(emits.length, 1, 'zzz has no sprite');
  assert.ok(canvas.recording().vertexCount > before, 'it draws its shape');
  canvas.begin({ layer: 'back', unit: 100, cast: {} });
  drawParticle(ctx, 'ember', state, { size: 12 });
  assert.equal(emits.length, 1, 'cast pass: shapes, so the cast keeps shadows and light pools');
});

test('parseCssColour reads hex and rgb()/rgba(), white otherwise', () => {
  assert.deepEqual(parseCssColour('#f80'), [1, 136 / 255, 0, 1]);
  assert.deepEqual(parseCssColour('#00ff00'), [0, 1, 0, 1]);
  assert.deepEqual(parseCssColour('rgba(255, 0, 51, 0.25)'), [1, 0, 0.2, 0.25]);
  assert.deepEqual(parseCssColour('rgb(0 0 255)'), [0, 0, 1, 1]);
  assert.deepEqual(parseCssColour('blue'), [1, 1, 1, 1]);
  assert.deepEqual(parseCssColour(null), [1, 1, 1, 1]);
});
