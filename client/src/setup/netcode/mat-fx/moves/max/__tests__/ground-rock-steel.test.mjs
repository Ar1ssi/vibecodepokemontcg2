import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { createGpuCanvas } from '../../../../../board3d/fx/gpu-canvas.mjs';
import { monolithPose } from '../ground-rock-steel-poses.mjs';
import { GROUND_ROCK_STEEL_MAX_SPECS } from '../specs/ground-rock-steel.mjs';
import { materialFor } from '../../materials/index.js';
import { rockElements } from '../../elements/earth.js';
import { monolithBase } from '../../move-drawers.js';
import { withoutImpactBeats } from '../../../impact/impact-select.mjs';

const H = 100;
const steps = (n = 100) => Array.from({ length: n + 1 }, (_, i) => i / n);

test('monolithPose: drops from `drop` heights out of the sky, faster and faster, onto its foot at `land`', () => {
  const p = { drop: 2, land: 0.6 };
  assert.equal(monolithPose(0, H, p).height, 2 * H);
  assert.equal(monolithPose(0.6, H, p).height, 0);
  const fell = (a, b) => monolithPose(a, H, p).height - monolithPose(b, H, p).height;
  assert.ok(fell(0.5, 0.55) > 2 * fell(0.05, 0.1), 'it accelerates');
  assert.equal(monolithPose(0, H, p).alpha, 0, 'it comes out of the sky');
  assert.ok(monolithPose(0.3, H, p).alpha > 0.99);
  assert.ok(monolithPose(0.1, H, p).scale > monolithPose(0.55, H, p).scale, 'nearer the camera high up');
  assert.equal(monolithPose(0.6, H, p).scale, 1);
});

test('monolithPose: its shadow darkens as it nears; it bites in on landing, stands, sinks and fades', () => {
  const p = { land: 0.5, hold: 0.1 };
  assert.ok(monolithPose(0.1, H, p).shadow < monolithPose(0.45, H, p).shadow);
  const landed = monolithPose(0.52, H, p);
  assert.ok(landed.landed && landed.impact > 0.8, 'the jolt peaks as it lands');
  assert.equal(monolithPose(0.49, H, p).impact, 0);
  assert.equal(monolithPose(0.8, H, p).impact, 0, 'the jolt is over');
  assert.ok(monolithPose(0.58, H, p).alpha > 0.99, 'it stands through the hold');
  assert.ok(monolithPose(0.9, H, p).sink > monolithPose(0.65, H, p).sink, 'it sinks');
  assert.equal(monolithPose(1, H, p).alpha, 0);
  for (const s of steps()) {
    const pose = monolithPose(s, H, p);
    for (const key of ['height', 'sink', 'scale', 'lean', 'alpha', 'shadow', 'impact']) assert.ok(Number.isFinite(pose[key]), `${key} at ${s}`);
    assert.ok(pose.alpha >= 0 && pose.alpha <= 1 && pose.shadow >= 0 && pose.shadow <= 1);
    assert.ok(pose.sink < pose.tall, 'never sinks out of sight before it fades');
  }
  assert.deepEqual(monolithPose(-1, H, p), monolithPose(0, H, p));
  assert.deepEqual(monolithPose(Number.NaN, H, p), monolithPose(0, H, p));
  assert.deepEqual(monolithPose(2, H, p), monolithPose(1, H, p));
});

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((pt) => new Vector2(pt.x, pt.y)),
    holes.map((hole) => hole.map((pt) => new Vector2(pt.x, pt.y)))
  );

const liveCtx = () => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  const emits = [];
  canvas.ctx.fxElements = { live: true, emit: (kind, params) => (emits.push({ kind, params }), true) };
  canvas.begin({ layer: 'back', z: 0.25, unit: H });
  return { ctx: canvas.ctx, emits };
};

const LANE = { ax: 0, ay: 300, bx: 0, by: 0, h: H, ux: 0, uy: -1, nx: 1, ny: 0, angleDeg: -90, length: 300 };
const monolithInfo = (params) => ({ material: materialFor('rock'), params: { target: 'defender', back: 0.25, w: 0.55, tall: 1, drop: 2, land: 0.5, hold: 0.1, lean: 6, ...params }, seed: 4, beatMs: 1400 });

test('the earth kit draws the monolith as one stone stretched up the screen over its shadow, dust only as it lands', () => {
  const falling = liveCtx();
  assert.equal(rockElements.beats.monolith(falling.ctx, LANE, 0.3, monolithInfo()), true);
  assert.deepEqual(falling.emits.map((e) => e.kind), ['sprite', 'debris']);
  const stone = falling.emits[1].params;
  assert.ok(stone.stretch > 1.5, `a slab, not a ball: stretch ${stone.stretch}`);
  assert.ok(stone.at.y < monolithBase(LANE, { target: 'defender', back: 0.25 }).y - H, 'high over its foot while it falls');
  assert.equal(falling.emits[0].params.colour.join(), '0,0,0', 'its shadow on the cloth');

  const landing = liveCtx();
  rockElements.beats.monolith(landing.ctx, LANE, 0.52, monolithInfo());
  assert.ok(landing.emits.filter((e) => e.kind === 'smoke').length >= 4, 'dust thrown out round its foot');

  const gone = liveCtx();
  rockElements.beats.monolith(gone.ctx, LANE, 1, monolithInfo());
  assert.equal(gone.emits.length, 0);
});

test("each move keeps its own matter in a game: the impact prefab's strip leaves its drawn beats after contact", () => {
  for (const [id, spec] of Object.entries(GROUND_ROCK_STEEL_MAX_SPECS)) {
    const played = withoutImpactBeats(spec);
    const after = played.beats.filter((beat) => beat.until > spec.contactMs + 200 && beat.drawer !== 'vignette' && beat.drawer !== 'terrain');
    assert.ok(after.length > 0, `${id}: nothing of its own after contact`);
    assert.ok(played.beats.some((beat) => beat.at <= spec.contactMs && beat.until > spec.contactMs && beat.drawer !== 'vignette'), `${id}: nothing at contact`);
  }
});
