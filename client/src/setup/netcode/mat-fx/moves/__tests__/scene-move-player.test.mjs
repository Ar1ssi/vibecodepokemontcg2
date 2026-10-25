import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeUtils, Vector2 } from 'three';

import { PAINT_TEXELS, createGpuCanvas } from '../../../../board3d/fx/gpu-canvas.mjs';
import { LAYER_Z } from '../../../../board3d/fx/fx-stage.mjs';
import { CAST, playMoveInScene } from '../scene-move-player.js';
import { SPECS } from '../specs/index.mjs';
import { fireBlast } from '../specs/fire.mjs';

const triangulate = (contour, holes) =>
  ShapeUtils.triangulateShape(
    contour.map((p) => new Vector2(p.x, p.y)),
    holes.map((hole) => hole.map((p) => new Vector2(p.x, p.y)))
  );

/** A board-scene stand-in: table poses by id, recorded drives, FX entries run on demand. */
/** Card 1 is the near Active, 2 the far Active, 3 a far Bench card (flat table px, y up the table). */
function fakeScene(poses = { 1: { x: 0, y: 100 }, 2: { x: 0, y: 500 }, 3: { x: 200, y: 500 } }) {
  const clock = { t: 5000, now() { return this.t; } };
  const drives = [];
  const entries = [];
  return {
    clock,
    drives,
    entries,
    cardTablePose: (id) => (poses[id] ? { ...poses[id], z: 0, yawDeg: 0, widthPx: 90, heightPx: 126 } : null),
    cardFrontMap: () => ({ isTexture: true, flipY: true, image: { width: 600, height: 825 } }),
    drive: (id, offsetAt, ms) => {
      drives.push({ id, offsetAt, ms });
      return Promise.resolve();
    },
    fx: { add: (entry) => (entries.push(entry), () => {}) },
  };
}

/** Runs the scene's FX entry at `ms` into a fresh recorder; returns the recording and whether it continues. */
const frameAt = (scene, ms) => {
  const canvas = createGpuCanvas({ triangulate, debug: () => {} });
  scene.clock.t = 5000 + ms;
  const keep = scene.entries[0].frame(scene.clock.now(), canvas);
  return { keep, recording: canvas.recording() };
};

const strikes = () => {
  const calls = [];
  return { calls, strikeIn: (ms, context) => calls.push({ ms, context }) };
};

test('fire blast plays with the 2D contract and announces contact once', () => {
  const scene = fakeScene();
  const impacts = strikes();
  const played = playMoveInScene({ scene, spec: fireBlast, attackerId: 1, defenderId: 2, seed: 7, impacts, strikeContext: { impactType: 'fire' } });
  assert.deepEqual(played, { holdMs: 1040, durationMs: 1900, contactMs: 1000, branchEndMs: 0 });
  assert.equal(impacts.calls.length, 1);
  assert.equal(impacts.calls[0].ms, 1000);
  assert.equal(impacts.calls[0].context.move, 'fire-blast');
  assert.equal(impacts.calls[0].context.impactType, 'fire');
  assert.equal(impacts.calls[0].context.direction, -90, 'near card attacks up the screen');
  assert.deepEqual(scene.drives.map(({ id, ms }) => [id, ms]), [
    [1, 1900],
    [2, 1900],
  ]);
});

test('the drives move the attacker toward the defender around contact', () => {
  const scene = fakeScene();
  playMoveInScene({ scene, spec: fireBlast, attackerId: 1, defenderId: 2 });
  const [attacker, defender] = scene.drives;
  // rear-lurch: the attacker rears back (down the table) while charging, then lurches up it.
  assert.ok(attacker.offsetAt(600).dy < 0, 'rears back while charging');
  assert.ok(attacker.offsetAt(800).dy > 0, 'lurches toward the far card');
  // knock: the defender is pushed back along the lane (further up the table).
  assert.ok(defender.offsetAt(1100).dy > 0, 'knocked away from the attacker');
  assert.equal(attacker.offsetAt(0).dx, 0);
});

test('a frame just after contact records back, front and top runs; the entry ends after the scene', () => {
  const scene = fakeScene();
  playMoveInScene({ scene, spec: fireBlast, attackerId: 1, defenderId: 2, seed: 7 });
  const { keep, recording } = frameAt(scene, 1060);
  assert.equal(keep, true);
  const layers = new Set(recording.runs.map((run) => run.layer));
  assert.deepEqual([...layers].sort(), ['back', 'front', 'top']);
  assert.ok(recording.runs.some((run) => run.layer === 'back' && run.depthTest));
  assert.ok(recording.vertexCount > 0);
  assert.equal(frameAt(scene, 1900 + 760 + 1001).keep, false);
});

test('design 076: a cast pass lays the move on the cloth first, as shadow and light pools', () => {
  const scene = fakeScene();
  playMoveInScene({ scene, spec: fireBlast, attackerId: 1, defenderId: 2, seed: 7 });
  const { recording } = frameAt(scene, 1060);
  const first = recording.runs[0];
  assert.equal(first.layer, 'back');
  assert.equal(first.depthTest, true);
  const vertex = recording.vertices.subarray(first.first * 9, first.first * 9 + 9);
  const row = recording.paints.subarray(vertex[8] * PAINT_TEXELS * 4, (vertex[8] + 1) * PAINT_TEXELS * 4);
  assert.equal(row[2], 0, 'cast paints run flat');
  assert.ok(row[39] <= Math.max(CAST.light, CAST.shadow) + 1e-6, 'cast alpha is scaled down');
});

test('the same scene time records the same drawing (a frozen preview stands still)', () => {
  const scene = fakeScene();
  playMoveInScene({ scene, spec: fireBlast, attackerId: 1, defenderId: 2, seed: 7 });
  const a = frameAt(scene, 820).recording;
  const b = frameAt(scene, 820).recording;
  assert.equal(a.vertexCount, b.vertexCount);
  assert.deepEqual([...a.vertices], [...b.vertices]);
});

/** The heights (vertex z above the run's pass) of every vertex in `runs`. */
const heightsOf = (recording, runs, passZ) => {
  const heights = [];
  for (const run of runs) {
    for (let v = run.first; v < run.first + run.count; v += 1) heights.push(recording.vertices[v * 9 + 2] - passZ);
  }
  return heights;
};
const CARD_H = 126;

test('design 076 depth: burst particles fly up off the struck card and cast onto the cloth', () => {
  const scene = fakeScene();
  const particlesOnly = { ...SPECS['zap-cannon'], beats: [] };
  playMoveInScene({ scene, spec: particlesOnly, attackerId: 1, defenderId: 2, seed: 7 });
  const { recording } = frameAt(scene, 1000);
  const top = recording.runs.filter((run) => run.layer === 'top');
  const lifted = heightsOf(recording, top, LAYER_Z.top);
  assert.ok(lifted.length > 0, 'particles draw in the top pass');
  assert.ok(Math.max(...lifted) > 0.3 * CARD_H, `thrown up off the card (${Math.max(...lifted).toFixed(1)} px)`);
  const cast = recording.runs[0];
  assert.equal(cast.layer, 'back');
  assert.ok(cast.count > 0, 'their shadows and light pools are cast');
  assert.ok(heightsOf(recording, [cast], LAYER_Z.back).every((h) => Math.abs(h) < 1e-6), 'the cast lies on the cloth');
});

test('design 076 depth: Thunder\'s bolt stands as a column over the defender, not a decal up the table', () => {
  const scene = fakeScene();
  playMoveInScene({ scene, spec: SPECS.thunder, attackerId: 1, defenderId: 2, seed: 7 });
  const { recording } = frameAt(scene, 760);
  const front = recording.runs.filter((run) => run.layer === 'front' && !run.depthTest);
  const heights = heightsOf(recording, front, LAYER_Z.front);
  assert.ok(Math.max(...heights) > CARD_H, `the column stands over a card height tall (${Math.max(...heights).toFixed(1)} px)`);
});

test('a card the scene does not draw, coincident cards, or no fx → null', () => {
  assert.equal(playMoveInScene({ scene: fakeScene(), spec: fireBlast, attackerId: 1, defenderId: 99 }), null);
  const same = fakeScene({ 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 } });
  assert.equal(playMoveInScene({ scene: same, spec: fireBlast, attackerId: 1, defenderId: 2 }), null);
  assert.equal(playMoveInScene({ scene: { ...fakeScene(), fx: null }, spec: fireBlast, attackerId: 1, defenderId: 2 }), null);
});

test('a beatless spec still drives the cards and keeps the contract', () => {
  const scene = fakeScene();
  const spec = { ...fireBlast, beats: [], particles: [] };
  const played = playMoveInScene({ scene, spec, attackerId: 1, defenderId: 2 });
  assert.equal(played.contactMs, 1000);
  assert.equal(scene.drives.length, 2);
  assert.equal(frameAt(scene, 500).keep, true);
});

test('a throwing drawer is skipped; the other beats still draw', () => {
  const scene = fakeScene();
  const debug = console.debug;
  console.debug = () => {};
  try {
    const spec = {
      ...fireBlast,
      id: 'broken',
      beats: [{ at: 0, until: 1900, layer: 'front', drawer: 'projectile', params: { r0: Number.NaN, bow: 'x' } }, ...fireBlast.beats],
    };
    playMoveInScene({ scene, spec, attackerId: 1, defenderId: 2 });
    assert.ok(frameAt(scene, 1000).recording.vertexCount > 0);
  } finally {
    console.debug = debug;
  }
});

test('branch lanes: travel beats fly to each extra card; a card not drawn is skipped', () => {
  const scene = fakeScene();
  const played = playMoveInScene({
    scene,
    spec: fireBlast,
    attackerId: 2,
    defenderId: 1,
    branches: [
      { id: 3, delayMs: 180 },
      { id: 99, delayMs: 400 },
    ],
  });
  assert.equal(played.branchEndMs, 1900 + 180);
});

test('every shipped spec plays a frame at each beat without throwing', () => {
  const debug = console.debug;
  const failures = [];
  console.debug = (...args) => failures.push(args.join(' '));
  try {
    for (const spec of Object.values(SPECS)) {
      const scene = fakeScene();
      playMoveInScene({ scene, spec, attackerId: 1, defenderId: 2, seed: 3 });
      for (const beat of spec.beats) frameAt(scene, (beat.at + beat.until) / 2);
    }
  } finally {
    console.debug = debug;
  }
  assert.deepEqual(failures.filter((line) => line.includes('move beat failed')), []);
});
