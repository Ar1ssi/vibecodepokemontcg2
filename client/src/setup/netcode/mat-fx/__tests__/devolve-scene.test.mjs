import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVOLVE_POP_S, DEVOLVE_SCENE_MS, DEVOLVE_TIMELINE, buildDevolveScene, devolveOps } from '../devolve-scene.mjs';
import { HOLD_MS } from '../fx-holds.mjs';

const scene = buildDevolveScene(4);
const SCENE_S = DEVOLVE_SCENE_MS / 1000;
const opsAt = (t) => devolveOps(scene, t);

test('timeline: aura and rings open it, the pop at 0.35 s, motes/shards/outro after, all inside the scene', () => {
  for (const key of ['auraIntro', 'aura', 'glowCard', 'ovals', 'smokes', 'glowCore']) assert.equal(DEVOLVE_TIMELINE[key].delay, 0, key);
  assert.equal(DEVOLVE_TIMELINE.pop.delay, DEVOLVE_POP_S);
  for (const key of ['motes', 'shards', 'outro']) assert.ok(DEVOLVE_TIMELINE[key].delay > DEVOLVE_POP_S, key);
  for (const [key, beat] of Object.entries(DEVOLVE_TIMELINE)) assert.ok(beat.delay + beat.life <= SCENE_S + 1e-9, key);
});

test('buildDevolveScene is deterministic per seed; counts follow the extract', () => {
  assert.deepEqual(buildDevolveScene(9), buildDevolveScene(9));
  assert.equal(scene.smokes.length, 3);
  assert.equal(scene.ovals.length, 4);
  assert.equal(scene.sparks.length, 30);
  assert.equal(scene.motes.length, 32);
  assert.equal(scene.shards.length, 13);
  assert.ok(scene.clusters.length >= 15 + 30 + 50, 'bursts 15 and 30 plus 99/s for 0.58 s');
});

test('devolveOps: finite numbers and alphas in [0, 1], inside, outside and NaN time', () => {
  for (const t of [-1, 0, 0.1, 0.35, 0.4, 0.6, 1.0, 1.39, 2, Number.NaN]) {
    for (const op of opsAt(t)) {
      for (const value of Object.values(op).flat(3)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${op.kind} at ${t}`);
      }
      if ('alpha' in op) assert.ok(op.alpha >= 0 && op.alpha <= 1, `${op.kind} alpha ${op.alpha} at ${t}`);
    }
  }
  assert.deepEqual(opsAt(SCENE_S + 0.01), [{ kind: 'cutout' }]);
  assert.deepEqual(devolveOps(null, 0.5), []);
});

test('the aura flares on the card edges first, the outro ripple dissolves the card glow away', () => {
  assert.ok(opsAt(0.1).some((op) => op.kind === 'frame'), 'aura at the start');
  assert.ok(!opsAt(0.7).some((op) => op.kind === 'frame'), 'aura gone by 0.6 s');
  const outro = (t) => opsAt(t).find((op) => op.noise === 'ripple');
  assert.ok(outro(0.5).amount < outro(1.0).amount);
  assert.equal(outro(0.3), undefined, 'not before 0.4 s');
});

test('the devolve hold lands the next effect after the pop, before the scene ends', () => {
  assert.ok(HOLD_MS.devolve >= DEVOLVE_POP_S * 1000);
  assert.ok(HOLD_MS.devolve < DEVOLVE_SCENE_MS);
});
