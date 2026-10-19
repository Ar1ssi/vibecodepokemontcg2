// Design 075 slice 10: the water, ice/aurora and poison kits' GPU style hints. Water and venom
// record the liquid style (sheets on an axis gradient base → tip, drops on their radial), ice
// and aurora the crystal style (crystal bodies on an axis gradient, edges, spokes and rings as
// strokes, a flake's heart radial); lit facets, glints, rims, mist and thrown drops stay flat.
// Water (drops, sheets, thrown drops), venom, a crystal's ice fill and the aurora rings cover
// what is under them (over blend), so they keep their colour over a bright card face; gloss,
// glints, edges and mist stay additive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { PAINT_KIND, PAINT_TEXELS, STYLE_IDS, VERTEX_FLOATS, createGpuCanvas } from '../../../../board3d/fx/gpu-canvas.mjs';
import { aurora, ice } from '../materials/ice.js';
import { poison } from '../materials/poison.js';
import { water } from '../materials/water.js';
import { recordingContext } from './recording-context.mjs';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const PAINT_FLOATS = PAINT_TEXELS * 4;
const rowsOf = (rec) =>
  Array.from({ length: rec.paintCount }, (_, row) => rec.paints.subarray(row * PAINT_FLOATS, (row + 1) * PAINT_FLOATS));
const kindOf = (row) => row[0];
const styleOf = (row) => row[2];
const paramsOf = (row) => [row[20], row[21], row[22]];

const recorder = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  canvas.begin({ layer: 'front', z: 0, unit: 100, seed: 1 });
  canvas.ctx.globalCompositeOperation = 'lighter';
  return canvas;
};

/** Each paint row's blend ('add' | 'over'), read off the runs whose vertices use it. */
const blendsOf = (rec) => {
  const blends = new Map();
  for (const run of rec.runs) {
    for (let v = run.first; v < run.first + run.count; v += 1) blends.set(rec.vertices[v * VERTEX_FLOATS + VERTEX_FLOATS - 1], run.blend);
  }
  return Array.from({ length: rec.paintCount }, (_, row) => blends.get(row));
};

const TONGUE = Object.freeze({ x: 50, y: 50, angleDeg: -90, length: 80, width: 30, time: 0.4, seed: 3 });

/** The row's linear paint runs from the tongue's base (50, 50) to its tip 80 px up. */
const assertBaseToTip = (row) => {
  assert.equal(kindOf(row), PAINT_KIND.linear);
  assert.ok(Math.abs(row[4] - 50) < 1e-6 && Math.abs(row[5] - 50) < 1e-6, 'base');
  assert.ok(Math.abs(row[6] - 50) < 1e-6 && Math.abs(row[7] + 30) < 1e-6, 'tip');
};

test('water sheet: a liquid body on an axis gradient that covers (over), a flat additive edge glint, covering drops', () => {
  const { ctx, recording } = recorder();
  water.tongue(ctx, TONGUE);
  const rec = recording();
  const rows = rowsOf(rec);
  const blends = blendsOf(rec);
  assert.equal(rows.length, 3, 'sheet, edge line, drops');
  assert.equal(styleOf(rows[0]), STYLE_IDS.liquid);
  assertBaseToTip(rows[0]);
  assert.equal(blends[0], 'over', 'the sheet covers what is under it');
  assert.ok(rows.slice(1).every((row) => styleOf(row) === STYLE_IDS.flat));
  assert.deepEqual(blends.slice(1), ['add', 'over'], 'the edge glint lights up; the shed drops cover');
  assert.equal(ctx.fxStyle, null);
  assert.equal(ctx.globalCompositeOperation, 'lighter', 'the caller composite is restored');
});

test('water drop: a liquid radial that covers and is clearer than a sheet; rim and specular flat and additive', () => {
  const { ctx, recording } = recorder();
  water.body(ctx, 50, 50, 20, 1, 1);
  const rec = recording();
  const rows = rowsOf(rec);
  const blends = blendsOf(rec);
  assert.equal(rows.length, 3, 'sphere, rim, specular');
  assert.equal(styleOf(rows[0]), STYLE_IDS.liquid);
  assert.equal(kindOf(rows[0]), PAINT_KIND.radial);
  assert.equal(blends[0], 'over');
  assert.deepEqual(blends.slice(1), ['add', 'add']);
  assert.ok(rows.slice(1).every((row) => styleOf(row) === STYLE_IDS.flat));
  const sheet = recorder();
  water.tongue(sheet.ctx, TONGUE);
  const [, , dropClarity] = paramsOf(rows[0]);
  const [, , sheetClarity] = paramsOf(rowsOf(sheet.recording())[0]);
  assert.ok(dropClarity > sheetClarity, 'a drop is clear in the middle');
  assert.equal(ctx.fxStyle, null);
});

test('water switches to source-over only inside its own save/restore', () => {
  const rec = recordingContext();
  const changes = [];
  const probe = new Proxy(rec.ctx, {
    set(target, key, value) {
      if (key === 'globalCompositeOperation') changes.push({ value, depth: rec.state.depth });
      return Reflect.set(target, key, value);
    },
  });
  water.glow(probe, 10, 20, 40, 0.8);
  water.body(probe, 10, 20, 40, 0.8, 0.9);
  water.tongue(probe, TONGUE, { alpha: 0.9, hot: 1 });
  water.projectile(probe, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0.2, seed: 5, tongues: 3 });
  assert.ok(changes.length > 0);
  for (const change of changes) {
    assert.equal(change.value, 'source-over');
    assert.ok(change.depth >= 1, 'set inside a save');
  }
  assert.equal(rec.state.depth, 0, 'balanced');
});

test('the axis gradients have one stop, so Canvas2D paints the same flat colour as before', () => {
  for (const draw of [(ctx) => water.tongue(ctx, TONGUE), (ctx) => ice.tongue(ctx, TONGUE), (ctx) => poison.tongue(ctx, TONGUE)]) {
    const rec = recordingContext();
    const stops = [];
    const probe = new Proxy(rec.ctx, {
      get(target, key) {
        if (key !== 'createLinearGradient') return Reflect.get(target, key);
        return (...args) => {
          const g = { count: 0, addColorStop: () => (g.count += 1) };
          stops.push(g);
          return g;
        };
      },
    });
    draw(probe);
    assert.ok(stops.length >= 1);
    for (const g of stops) assert.equal(g.count, 1);
  }
});

test('ice crystal: a covering crystal body on an axis gradient, a flat lit facet, a crystal edge stroke', () => {
  const { ctx, recording } = recorder();
  ice.tongue(ctx, TONGUE, { alpha: 1, hot: 1 });
  const rec = recording();
  const rows = rowsOf(rec);
  assert.equal(rows.length, 3);
  assert.deepEqual(blendsOf(rec), ['over', 'add', 'add'], 'the ice fill covers; facet and edge light up');
  assert.equal(styleOf(rows[0]), STYLE_IDS.crystal);
  assertBaseToTip(rows[0]);
  assert.equal(styleOf(rows[1]), STYLE_IDS.flat, 'the lit facet');
  assert.equal(styleOf(rows[2]), STYLE_IDS.crystal, 'the edge glints');
  assert.equal(ctx.fxStyle, null);
});

test('snowflake: a crystal heart and crystal spokes; the mist stays flat; ice never leaves the additive pass', () => {
  const { ctx, recording } = recorder();
  ice.projectile(ctx, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0.2, seed: 5, tongues: 0 });
  const rec = recording();
  const rows = rowsOf(rec);
  assert.equal(rows.length, 4, 'mist, heart, two spoke passes');
  assert.equal(styleOf(rows[0]), STYLE_IDS.flat);
  assert.equal(kindOf(rows[1]), PAINT_KIND.radial);
  assert.ok(rows.slice(1).every((row) => styleOf(row) === STYLE_IDS.crystal));
  assert.ok(blendsOf(rec).every((blend) => blend === 'add'));
  assert.equal(ctx.fxStyle, null);
});

test('aurora: the three rings shimmer (crystal strokes) and cover, keeping their hues; the mist is flat and additive', () => {
  const { ctx, recording } = recorder();
  aurora.body(ctx, 100, 100, 30, 1, 1);
  const rec = recording();
  const rows = rowsOf(rec);
  assert.equal(rows.length, 4);
  assert.deepEqual(blendsOf(rec), ['add', 'over', 'over', 'over']);
  assert.equal(styleOf(rows[0]), STYLE_IDS.flat);
  assert.deepEqual(rows.slice(1).map(styleOf), [STYLE_IDS.crystal, STYLE_IDS.crystal, STYLE_IDS.crystal]);
  assert.equal(ctx.fxStyle, null);
});

test('poison: an opaque liquid glob and drip, a liquid ooze on an axis gradient; rim, glints and barbs flat', () => {
  const glob = recorder();
  poison.body(glob.ctx, 50, 50, 20, 1, 1);
  const globRec = glob.recording();
  const globRows = rowsOf(globRec);
  assert.deepEqual(blendsOf(globRec), ['over', 'over', 'over', 'add'], 'glob, drip and dark rim cover; the glint lights up');
  assert.deepEqual(globRows.slice(0, 2).map(styleOf), [STYLE_IDS.liquid, STYLE_IDS.liquid], 'glob and drip');
  assert.equal(paramsOf(globRows[0])[2], 0, 'venom is opaque (no clarity)');
  assert.ok(globRows.slice(2).every((row) => styleOf(row) === STYLE_IDS.flat), 'rim and glint');
  assert.equal(glob.ctx.fxStyle, null);

  const stream = recorder();
  poison.tongue(stream.ctx, TONGUE, { alpha: 1, hot: 1 });
  const streamRows = rowsOf(stream.recording());
  assert.equal(styleOf(streamRows[0]), STYLE_IDS.liquid);
  assertBaseToTip(streamRows[0]);
  assert.ok(streamRows.slice(1).every((row) => styleOf(row) === STYLE_IDS.flat), 'globs and glints');

  const barb = recorder();
  poison.tongue(barb.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.ok(rowsOf(barb.recording()).every((row) => styleOf(row) === STYLE_IDS.flat));

  const pool = recorder();
  poison.sigil(pool.ctx, 100, 100, 80, 0.5);
  const poolRows = rowsOf(pool.recording());
  assert.equal(styleOf(poolRows[0]), STYLE_IDS.liquid, 'the pool');
  assert.ok(poolRows.slice(1).every((row) => styleOf(row) === STYLE_IDS.flat), 'its rim and bubbles');
});
