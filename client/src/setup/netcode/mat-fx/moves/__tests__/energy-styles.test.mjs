// Design 075 slice 11: the energy kits' GPU style hints. Electric, psychic, fairy, normal and
// stellar record their fills and strokes as the energy style (stellar's crystal tongue is ice's
// and styled there; its fringe is energy), and every call leaves the hint cleared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { PAINT_TEXELS, STYLE_IDS, STYLE_PARAMS, createGpuCanvas } from '../../../../board3d/fx/gpu-canvas.mjs';
import { electric } from '../materials/electric.js';
import { fairy } from '../materials/fairy.js';
import { normal } from '../materials/normal.js';
import { psychic } from '../materials/psychic.js';
import { stellar } from '../materials/stellar.js';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const PAINT_FLOATS = PAINT_TEXELS * 4;
const rowsOf = (rec) =>
  Array.from({ length: rec.paintCount }, (_, row) => rec.paints.subarray(row * PAINT_FLOATS, (row + 1) * PAINT_FLOATS));
const styleOf = (row) => row[2];

/** Record `draw(ctx)` and return its paint rows and the hint left on the context after. */
const record = (draw) => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: 100, seed: 1 });
  canvas.ctx.globalCompositeOperation = 'lighter';
  draw(canvas.ctx);
  return { rows: rowsOf(canvas.recording()), after: canvas.ctx.fxStyle };
};

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 });
const SHOT = Object.freeze({ x: 100, y: 100, r: 20, headingDeg: 0, time: 0.2, seed: 5, tongues: 2 });

const allEnergy = (name, draw) => {
  const { rows, after } = record(draw);
  assert.ok(rows.length > 0, `${name}: drew something`);
  rows.forEach((row, i) => assert.equal(styleOf(row), STYLE_IDS.energy, `${name}: row ${i}`));
  assert.equal(after, null, `${name}: hint cleared`);
};

test('electric: jags, the crackling ball, its halo and the bolt strokes all run the energy style', () => {
  allEnergy('tongue', (ctx) => electric.tongue(ctx, TONGUE));
  allEnergy('glow', (ctx) => electric.glow(ctx, 50, 50, 40, 0.5));
  allEnergy('body', (ctx) => electric.body(ctx, 50, 50, 20, 1, 1));
  allEnergy('projectile', (ctx) => electric.projectile(ctx, SHOT));
  allEnergy('bolt', (ctx) =>
    electric.jagStroke(ctx, [[[0, 0], [20, 10], [40, -5], [60, 8]]], { width: 6, alpha: 1 })
  );
});

test('electric: the bolt core gains, its halo only shimmers', () => {
  const { rows } = record((ctx) => electric.jagStroke(ctx, [[[0, 0], [30, 12], [60, 0]]], { width: 6, alpha: 1 }));
  // Halo, the wrapping filament's back run, body, centre, its front run (design 076 § Depth).
  assert.equal(rows.length, 5);
  const gain = (row) => row[22];
  assert.equal(gain(rows[0]), 0, 'halo: no gain');
  assert.ok(rows.slice(1).every((row) => gain(row) > 0), 'filament, core and centre gain');
});

test('psychic: ribbons, lens rings, haze and the wave rings run the energy style', () => {
  allEnergy('tongue', (ctx) => psychic.tongue(ctx, TONGUE));
  allEnergy('tongue without its centre line', (ctx) => psychic.tongue(ctx, TONGUE, { hot: 0 }));
  allEnergy('glow', (ctx) => psychic.glow(ctx, 50, 50, 40, 0.5));
  allEnergy('body', (ctx) => psychic.body(ctx, 50, 50, 20, 1, 1));
  allEnergy('projectile', (ctx) => psychic.projectile(ctx, SHOT));
  allEnergy('sigil', (ctx) => psychic.sigil(ctx, 60, 60, 40, 0.4));
});

test('fairy: twinkles, trails, the moon and the star run the energy style', () => {
  allEnergy('tongue', (ctx) => fairy.tongue(ctx, TONGUE));
  allEnergy('tongue without twinkles', (ctx) => fairy.tongue(ctx, TONGUE, { hot: 0 }));
  allEnergy('sparkle shard', (ctx) => fairy.tongue(ctx, TONGUE, { jag: 1 }));
  allEnergy('sparkle shard, no core', (ctx) => fairy.tongue(ctx, TONGUE, { jag: 1, hot: 0 }));
  allEnergy('glow', (ctx) => fairy.glow(ctx, 50, 50, 40, 0.5));
  allEnergy('body', (ctx) => fairy.body(ctx, 50, 50, 20, 1, 1, 0.3));
  allEnergy('projectile', (ctx) => fairy.projectile(ctx, SHOT));
  allEnergy('sigil', (ctx) => fairy.sigil(ctx, 60, 60, 40, 0.4));
});

test('fairy: the moon and the trails carry no gain, so the moon never blooms into a disc', () => {
  const { rows } = record((ctx) => fairy.glow(ctx, 50, 50, 40, 1));
  assert.equal(rows[0][22], 0);
});

test('normal: pressure light, its tongues and rings run the energy style; the body has no gain', () => {
  allEnergy('tongue', (ctx) => normal.tongue(ctx, TONGUE));
  allEnergy('glow', (ctx) => normal.glow(ctx, 50, 50, 40, 0.5));
  allEnergy('body', (ctx) => normal.body(ctx, 50, 50, 20, 1, 1));
  allEnergy('projectile', (ctx) => normal.projectile(ctx, SHOT));
  const { rows } = record((ctx) => normal.body(ctx, 50, 50, 20, 1, 1));
  assert.equal(rows[0][22], 0);
});

test('stellar: mist, faceted head and the prismatic fringe run the energy style', () => {
  allEnergy('glow', (ctx) => stellar.glow(ctx, 50, 50, 40, 0.5));
  allEnergy('body', (ctx) => stellar.body(ctx, 50, 50, 20, 1, 1));
  const { rows, after } = record((ctx) => stellar.tongue(ctx, TONGUE));
  assert.equal(styleOf(rows.at(-1)), STYLE_IDS.energy, 'the fringe');
  assert.equal(after, null);
});

test('the energy defaults keep a low gain, so only packet and filament centres bloom', () => {
  const gain = STYLE_PARAMS.energy.find(([key]) => key === 'gain')[1];
  assert.ok(gain <= 1, `energy gain ${gain}`);
});

test('rootFaded: one colour along the tongue, clear at its root, full from ROOT_FADE to the tip', async () => {
  const { ROOT_FADE, rootFaded } = await import('../materials/_root-fade.js');
  const stops = [];
  let line = null;
  const ctx = {
    createLinearGradient: (...args) => {
      line = args;
      return { addColorStop: (at, colour) => stops.push([at, colour]) };
    },
  };
  rootFaded(ctx, { x: 10, y: 20, angleDeg: 0, length: 50 }, [255, 0, 0], 0.8);
  assert.deepEqual(line, [10, 20, 60, 20]);
  assert.deepEqual(
    stops.map(([at]) => at),
    [0, ROOT_FADE, 1]
  );
  assert.match(stops[0][1], /, 0\)$/);
  assert.match(stops[1][1], /, 0\.8\)$/);
  assert.match(stops[2][1], /, 0\.8\)$/);
});
