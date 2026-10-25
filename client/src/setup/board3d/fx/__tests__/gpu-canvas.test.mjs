import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { FX_MODS, MAX_CLIP_DEPTH, MAX_IMAGES, PAINT_KIND, PAINT_TEXELS, STYLE_IDS, VERTEX_FLOATS, createGpuCanvas, parseColour } from '../gpu-canvas.mjs';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

const make = (options = {}) => {
  const logs = [];
  const canvas = createGpuCanvas({ triangulate, debug: (...args) => logs.push(args.join(' ')), ...options });
  canvas.begin({ layer: 'front', z: 3, unit: 100, seed: 2 });
  return { ...canvas, logs };
};

const PAINT_FLOATS = PAINT_TEXELS * 4;
const paintRow = (rec, row) => rec.paints.subarray(row * PAINT_FLOATS, (row + 1) * PAINT_FLOATS);
const vertexAt = (rec, i) => rec.vertices.subarray(i * VERTEX_FLOATS, (i + 1) * VERTEX_FLOATS);
const interior = (rec) => {
  const out = [];
  for (let i = 0; i < rec.vertexCount; i += 1) {
    const v = vertexAt(rec, i);
    if (v[5] < 0 && v[3] === 1) out.push(v);
  }
  return out;
};
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('colours: rgb, rgba, hex, junk', () => {
  assert.deepEqual([...parseColour('rgb(255, 0, 0)')], [1, 0, 0, 1]);
  assert.deepEqual([...parseColour('rgba(0,255,0,0.5)')], [0, 1, 0, 0.5]);
  assert.deepEqual([...parseColour('#00f')], [0, 0, 1, 1]);
  assert.deepEqual([...parseColour('#ff0000')], [1, 0, 0, 1]);
  assert.deepEqual([...parseColour('not a colour')], [0, 0, 0, 0]);
  assert.deepEqual([...parseColour(undefined)], [0, 0, 0, 0]);
});

test('a solid rect fill: two triangles plus a feather band, one solid paint row', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(0, 0, 10, 10);
  const rec = recording();
  assert.equal(rec.paintCount, 1);
  const row = paintRow(rec, 0);
  assert.equal(row[0], PAINT_KIND.solid);
  assert.deepEqual([...row.subarray(36, 40)], [1, 0, 0, 1]);
  // 2 interior triangles (6 vertices) + 4 edges × 6 band vertices.
  assert.equal(rec.vertexCount, 6 + 24);
  const bandOuter = [];
  for (let i = 0; i < rec.vertexCount; i += 1) if (vertexAt(rec, i)[3] === 0) bandOuter.push(vertexAt(rec, i));
  assert.ok(bandOuter.every((v) => v[0] < 0 || v[0] > 10 || v[1] < 0 || v[1] > 10), 'the band lies outside the rect');
  assert.equal(vertexAt(rec, 0)[2], 3, 'z is the pass height');
  assert.equal(rec.runs.length, 1);
  assert.deepEqual(
    { layer: rec.runs[0].layer, blend: rec.runs[0].blend, first: rec.runs[0].first, count: rec.runs[0].count },
    { layer: 'front', blend: 'over', first: 0, count: 30 }
  );
});

test('globalAlpha is folded into the stop alpha (colours stay straight)', () => {
  const { ctx, recording } = make();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);
  assert.deepEqual([...paintRow(recording(), 0).subarray(36, 40)], [1, 0, 0, 0.5]);
});

test('radial gradients keep both circles and their stops', () => {
  const { ctx, recording } = make();
  const g = ctx.createRadialGradient(5, 5, 0, 5, 5, 10);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  g.addColorStop(0, '#fff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(5, 5, 10, 0, Math.PI * 2);
  ctx.fill();
  const row = paintRow(recording(), 0);
  assert.equal(row[0], PAINT_KIND.radial);
  assert.equal(row[1], 2);
  assert.deepEqual([...row.subarray(4, 7)], [5, 5, 0]);
  assert.deepEqual([...row.subarray(8, 11)], [5, 5, 10]);
  assert.deepEqual([row[28], row[29]], [0, 1], 'stops sorted by offset');
  assert.deepEqual([...row.subarray(36, 40)], [1, 1, 1, 1]);
  assert.deepEqual([...row.subarray(40, 44)], [1, 1, 1, 0]);
});

test('composite modes split runs; equal states merge', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillRect(10, 0, 4, 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillRect(20, 0, 4, 4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillRect(30, 0, 4, 4);
  assert.deepEqual(
    recording().runs.map((run) => run.blend),
    ['over', 'add', 'over']
  );
});

test('transforms apply to points as they are added', () => {
  const { ctx, recording } = make();
  ctx.translate(100, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 0);
  ctx.lineTo(10, 10);
  ctx.fill();
  const xs = interior(recording()).map((v) => [Math.round(v[0]), Math.round(v[1])]);
  assert.ok(xs.some(([x, y]) => x === 100 && y === 10), 'rotated (10,0) lands on (100,10)');
  assert.ok(xs.some(([x, y]) => x === 90 && y === 10), 'rotated (10,10) lands on (90,10)');
});

test('degenerate paths record nothing and never produce NaN', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(5, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, -3, 0, Math.PI);
  ctx.arc(Number.NaN, 0, 3, 0, Math.PI);
  ctx.fill();
  ctx.lineWidth = 0;
  ctx.stroke();
  const rec = recording();
  assert.equal(rec.vertexCount, 0);
  assert.ok(rec.vertices.every(Number.isFinite));
});

test('unsupported calls are inert and logged once', () => {
  const { ctx, recording, logs } = make();
  ctx.fillText('x', 0, 0);
  ctx.fillText('x', 0, 0);
  assert.equal(recording().vertexCount, 0);
  assert.equal(logs.filter((line) => line.includes('fillText')).length, 1);
});

test('drawImage fills the destination rect with an image paint in a frame slot', () => {
  const { ctx, recording, logs } = make();
  const art = { image: { width: 600, height: 825 } };
  ctx.globalAlpha = 0.4;
  ctx.drawImage(art, 10, 20, 90, 126);
  ctx.drawImage(art, 0, 0);
  const rec = recording();
  assert.deepEqual(rec.images, [art]);
  const row = paintRow(rec, 0);
  assert.equal(row[0], PAINT_KIND.image);
  assert.deepEqual([...row.subarray(4, 8)], [10, 20, 90, 126]);
  assert.equal(row[8], 0, 'slot 0');
  assert.deepEqual([...paintRow(rec, 1).subarray(4, 8)], [0, 0, 600, 825], 'natural size');
  close(row[39], 0.4);
  for (let i = 0; i < MAX_IMAGES + 1; i += 1) ctx.drawImage({ width: 1, height: 1 }, 0, 0);
  assert.equal(recording().images.length, MAX_IMAGES);
  assert.ok(logs.some((line) => line.includes('images')));
});

test('the paint cap drops further draws with one log line', () => {
  const { ctx, recording, logs } = make({ size: 2 });
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i += 1) ctx.fillRect(i * 10, 0, 4, 4);
  assert.equal(recording().paintCount, 2);
  assert.equal(logs.filter((line) => line.includes('cap')).length, 1);
});

test('a hole wholly inside its outer ring with opposite winding is cut out', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 0);
  ctx.lineTo(10, 10);
  ctx.lineTo(0, 10);
  ctx.closePath();
  ctx.moveTo(3, 3);
  ctx.lineTo(3, 7);
  ctx.lineTo(7, 7);
  ctx.lineTo(7, 3);
  ctx.closePath();
  ctx.fill();
  const triangles = interior(recording()).length / 3;
  // The 8 interior triangles of a square frame vs 2 for a plain square; plus band triangles.
  assert.ok(triangles > 8, `${triangles} interior + band triangles`);
});

test('a self-intersecting outline triangulates without throwing', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 10);
  ctx.lineTo(10, 0);
  ctx.lineTo(0, 10);
  ctx.fill();
  assert.ok(recording().vertices.every(Number.isFinite));
});

test('strokes: butt quad of half-width + feather; round caps add fans', () => {
  const { ctx, recording } = make();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  let rec = recording();
  assert.equal(rec.vertexCount, 6);
  const v = vertexAt(rec, 0);
  close(v[5], 2, 1e-9);
  close(Math.abs(v[4]), 2 + 0.75);
  close(Math.abs(v[1]), 2.75);
  const round = make();
  round.ctx.strokeStyle = '#fff';
  round.ctx.lineWidth = 4;
  round.ctx.lineCap = 'round';
  round.ctx.beginPath();
  round.ctx.moveTo(0, 0);
  round.ctx.lineTo(20, 0);
  round.ctx.stroke();
  rec = round.recording();
  assert.equal(rec.vertexCount, 6 + 2 * 8 * 3);
});

test('blur filters widen the feather', () => {
  const { ctx, recording } = make();
  ctx.filter = 'blur(8px)';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 10, 10);
  assert.equal(vertexAt(recording(), 0)[6], 12);
  ctx.filter = 'none';
  ctx.fillRect(20, 0, 10, 10);
  const rec = recording();
  assert.equal(vertexAt(rec, rec.vertexCount - 1)[6], 0.75);
});

test('dashes: the paint row carries the pattern, vertices carry the distance along', () => {
  const { ctx, recording } = make();
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(30, 0);
  ctx.stroke();
  const rec = recording();
  assert.deepEqual([...paintRow(rec, 0).subarray(24, 28)], [5, 7, 2, 1]);
  const along = [...Array(rec.vertexCount).keys()].map((i) => vertexAt(rec, i)[7]);
  assert.equal(Math.min(...along), 0);
  assert.equal(Math.max(...along), 30);
});

test('patterns record kind 3 and expose their image', () => {
  const { ctx, recording } = make();
  const tile = { width: 64, height: 64 };
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, 10, 10);
  const rec = recording();
  assert.equal(paintRow(rec, 0)[0], PAINT_KIND.pattern);
  assert.equal(paintRow(rec, 0)[4], 64);
  assert.equal(rec.pattern, tile);
});

test('clip: write, test, then clear on restore', () => {
  const { ctx, recording } = make();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-20, -20, 40, 40);
  ctx.restore();
  ctx.fillRect(50, 0, 4, 4);
  const ops = recording().runs.map((run) => `${run.stencil.op}:${run.stencil.ref}:${run.colorWrite}`);
  assert.deepEqual(ops, ['write:1:false', 'test:1:true', 'clear:1:false', 'none:0:true']);
});

test('clips nest at most MAX_CLIP_DEPTH deep; restore with nothing saved is a no-op', () => {
  const { ctx, recording, logs } = make();
  ctx.restore();
  for (let i = 0; i < MAX_CLIP_DEPTH + 1; i += 1) {
    ctx.beginPath();
    ctx.rect(-10, -10, 20, 20);
    ctx.clip();
  }
  const writes = recording().runs.filter((run) => run.stencil.op === 'write');
  assert.equal(writes.length, MAX_CLIP_DEPTH);
  assert.ok(logs.some((line) => line.includes('clip depth')));
});

test('fxStyle hints land in the paint row with their defaults; null returns to flat', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.fxStyle = { id: 'flame', gain: 3 };
  ctx.fillRect(0, 0, 4, 4);
  ctx.fxStyle = null;
  ctx.fillRect(10, 0, 4, 4);
  const rec = recording();
  assert.equal(paintRow(rec, 0)[2], STYLE_IDS.flame);
  assert.deepEqual([...paintRow(rec, 0).subarray(20, 24)].map((v) => Math.round(v * 100) / 100), [0.45, 1.6, 3, 100]);
  assert.equal(paintRow(rec, 1)[2], STYLE_IDS.flat);
});

test('a by-kind hint styles each paint by its kind; strokes and missing kinds have their own say', () => {
  const { ctx, recording } = make();
  ctx.fxStyle = { byKind: { linear: { id: 'shadow', fray: 0.7 }, radial: { id: 'orb' }, stroke: { id: 'energy' } } };
  const linear = ctx.createLinearGradient(0, 0, 10, 0);
  linear.addColorStop(0, '#fff');
  linear.addColorStop(1, '#000');
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, 4, 4);
  const radial = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
  radial.addColorStop(0, '#fff');
  radial.addColorStop(1, '#000');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 4, 4);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  const rec = recording();
  assert.equal(paintRow(rec, 0)[2], STYLE_IDS.shadow);
  assert.equal(Math.round(paintRow(rec, 0)[22] * 100) / 100, 0.7, 'the entry carries its own params');
  assert.equal(paintRow(rec, 1)[2], STYLE_IDS.orb);
  assert.equal(paintRow(rec, 2)[2], STYLE_IDS.flat, 'no solid entry: flat');
  assert.equal(paintRow(rec, 3)[2], STYLE_IDS.energy);
});

test('fxMod modifiers land in their texels with defaults; null and save/restore return to none', () => {
  const { ctx, recording } = make();
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.fxMod = { dissolve: { amount: 1.4, edge: [255, 128, 0] }, distort: { strength: 0.2, angle: 180 }, detail: { amount: 0.5 } };
  ctx.fillRect(0, 0, 4, 4);
  ctx.restore();
  ctx.fillRect(10, 0, 4, 4);
  const rec = recording();
  const at = (row, texel) => [...paintRow(rec, row).subarray(texel * 4, texel * 4 + 4)].map((v) => Math.round(v * 100) / 100);
  assert.deepEqual(at(0, FX_MODS.dissolve.texel), [1, 0.12, 1.5, 3], 'amount clamps to 1, the rest default');
  assert.deepEqual(at(0, 18), [1, 0.5, 0, 1], 'edge colour normalised, flagged');
  assert.deepEqual(at(0, FX_MODS.distort.texel), [0.2, 1, 3, 3.14], 'angle in radians');
  assert.deepEqual(at(0, FX_MODS.detail.texel), [0.5, 1, 4, -1.57]);
  for (const texel of [17, 18, 19, 20]) assert.deepEqual(at(1, texel), [0, 0, 0, 0], `restored paint has no texel ${texel}`);
});

test('a dissolve-only hint leaves distort and detail off', () => {
  const { ctx, recording } = make();
  ctx.fxMod = { dissolve: { amount: 0.3 } };
  ctx.fillRect(0, 0, 4, 4);
  const row = paintRow(recording(), 0);
  assert.equal(row[FX_MODS.distort.texel * 4], 0);
  assert.equal(row[FX_MODS.detail.texel * 4], 0);
  assert.equal(row[18 * 4 + 3], 0, 'no edge colour: the shader uses the paint');
});

test('reset empties the recording; begin restarts the drawing state', () => {
  const canvas = make();
  canvas.ctx.fillStyle = '#fff';
  canvas.ctx.globalAlpha = 0.2;
  canvas.ctx.fillRect(0, 0, 4, 4);
  canvas.reset();
  assert.equal(canvas.recording().vertexCount, 0);
  canvas.begin({ layer: 'back', z: 0.25, depthTest: true });
  assert.equal(canvas.ctx.globalAlpha, 1);
  canvas.ctx.fillRect(0, 0, 4, 4);
  const run = canvas.recording().runs[0];
  assert.deepEqual([run.layer, run.z, run.depthTest], ['back', 0.25, true]);
});
