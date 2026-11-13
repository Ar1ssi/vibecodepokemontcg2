import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { materialFor } from '../../materials/index.js';
import { EARTH_SCALE } from '../earth.js';

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

test('rock and ground bodies are stones; their tongues stones stretched along the tongue', () => {
  for (const key of ['rock', 'ground']) {
    const { ctx, emits } = live();
    materialFor(key).body(ctx, 0, 0, 10, 1);
    materialFor(key).tongue(ctx, { x: 0, y: 0, angleDeg: -90, length: 60, width: 10, seed: 2 });
    // Design 089: each stone is drawn over its own contact shadow.
    assert.deepEqual(emits.map((e) => e.kind), ['sprite', 'debris', 'sprite', 'debris'], key);
    const stones = emits.filter((e) => e.kind === 'debris');
    assert.equal(stones[0].params.size, 10 * EARTH_SCALE.body);
    const shard = stones[1].params;
    assert.equal(shard.stretch, 4, 'capped');
    assert.equal(shard.headingDeg, -90);
    // Design 089: capped at 4 widths it is 52 long, shorter than its tongue: it stands on the
    // tongue's root (centre 26 up), where it used to hang 4 px above it (centre 30).
    assert.ok(Math.abs(shard.at.y - -26) < 1e-9, 'rooted on the tongue\'s base');
  }
});

test('design 089: a rock tongue wider than 0.42 card heights is a crown of rooted spires, not one boulder', () => {
  const { ctx, emits } = live();
  // Earthquake's pillar on a 100 px card: 70 wide, 210 tall, rising (−90°) from (0, 0).
  materialFor('ground').tongue(ctx, { x: 0, y: 0, angleDeg: -90, length: 210, width: 70, seed: 2 });
  const spires = emits.filter((e) => e.kind === 'debris').map((e) => e.params);
  assert.equal(spires.length, 4);
  for (const spire of spires) {
    assert.ok(spire.size * 2 < 40, `no spire is a boulder: ${spire.size * 2} px wide`);
    const tall = spire.size * 2 * spire.stretch;
    assert.ok(Math.abs(-spire.at.y - tall / 2) < tall * 0.08, 'stands on the ground line, not in the air');
  }
  assert.ok(Math.min(...spires.map((s) => s.at.x)) < -10 && Math.max(...spires.map((s) => s.at.x)) > 10, 'set across the column');
  assert.ok(new Set(spires.map((s) => Math.round(s.size * 2 * s.stretch))).size > 1, 'of different heights');
});

test('design 089: a stone darkens the cloth under it; a spire at its root; a stone high in the air leaves none', () => {
  const shadowsOf = (z, draw) => {
    const canvas = createGpuCanvas({ triangulate, debug: () => {} });
    const emits = [];
    canvas.ctx.fxElements = { live: false, emit: (kind, params) => (emits.push({ kind, params }), true) };
    canvas.begin({ layer: 'front', z, unit: 100 });
    draw(canvas.ctx);
    return emits.filter((e) => e.kind === 'sprite').map((e) => e.params);
  };
  const [low] = shadowsOf(3, (ctx) => materialFor('rock').body(ctx, 20, 10, 10, 0.8));
  assert.deepEqual(low.colour, [0, 0, 0]);
  assert.equal(low.blend, 'over', 'a shadow covers, it adds no light');
  assert.equal(low.at.x, 20);
  assert.ok(low.alpha > 0.2 && low.alpha < 0.8 * 0.5, `soft: ${low.alpha}`);
  assert.ok(low.size > 10 * EARTH_SCALE.body * 2, 'wider than the stone');
  // The same stone five of its own sizes up: no shadow under it.
  assert.deepEqual(shadowsOf(10 * EARTH_SCALE.body * 5 + 1, (ctx) => materialFor('rock').body(ctx, 20, 10, 10, 0.8)), []);
  // A spire's shadow is at the tongue's root, not its middle.
  const [root] = shadowsOf(0, (ctx) => materialFor('rock').tongue(ctx, { x: 5, y: 40, angleDeg: -90, length: 60, width: 10, seed: 2 }));
  assert.deepEqual([root.at.x, root.at.y], [5, 40]);
});

test('a thrown rock tumbles with time and trails dust; frozen time is stable', () => {
  const shot = { x: 0, y: 0, r: 10, headingDeg: 0, time: 0.5, seed: 1, tongues: 3 };
  const one = live();
  materialFor('rock').projectile(one.ctx, shot);
  assert.equal(one.emits.filter((e) => e.kind === 'smoke').length, 3);
  const stone = one.emits.find((e) => e.kind === 'debris').params;
  assert.equal(stone.spin, 0.5 * 4 + 1);
  const two = live();
  materialFor('rock').projectile(two.ctx, shot);
  assert.deepEqual(two.emits, one.emits);
});

test('a grass tongue is a leaf sprite along it, framed by its seed', () => {
  const { ctx, emits } = live();
  materialFor('grass').tongue(ctx, { x: 0, y: 0, angleDeg: 0, length: 40, width: 8, seed: 3 });
  assert.equal(emits[0].kind, 'sprite');
  assert.equal(emits[0].params.channel, 'rgba');
  assert.equal(emits[0].params.frame, 21 % 4);
  assert.equal(emits[0].params.size, 40 * EARTH_SCALE.leaf);
  assert.equal(emits.length, 1);
});

test('design 089: a long thin grass tongue (a slash) is leaves strung along it, none longer than a leaf', () => {
  const { ctx, emits } = live();
  // A slash arc's tongue: 90 long, 7 thick.
  materialFor('grass').tongue(ctx, { x: 0, y: 0, angleDeg: 0, length: 90, width: 7, seed: 3 });
  assert.ok(emits.length >= 3 && emits.length <= 6, `leaves: ${emits.length}`);
  for (const { kind, params } of emits) {
    assert.equal(kind, 'sprite');
    assert.ok(params.size <= 7 * 3.2 * 1.15 * EARTH_SCALE.leaf + 1e-9, `a leaf, not a blade: ${params.size}`);
    assert.ok(params.at.x > 0 && params.at.x < 90, 'on the sweep');
  }
  assert.ok(emits[0].params.at.x < emits.at(-1).params.at.x, 'in order along it');
  assert.ok(emits[0].params.alpha < emits.at(-1).params.alpha, 'the leading leaf is the whole one');
  const again = live();
  materialFor('grass').tongue(again.ctx, { x: 0, y: 0, angleDeg: 0, length: 90, width: 7, seed: 3 });
  assert.deepEqual(again.emits, emits, 'placed by the seed alone: a frozen frame stands still');
});
