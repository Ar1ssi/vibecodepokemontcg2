import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVOLVE_POP_S,
  EVOLVE_SCENE_MS,
  EVOLVE_STAGE,
  EVOLVE_TIMELINE,
  buildEvolveScene,
  evolveOps,
  turnOfMatrix,
} from '../evolve-scene.mjs';
import { CARD_UNITS } from '../tcgl-fx.mjs';
import { HOLD_MS } from '../fx-holds.mjs';
import { HELIX_RIBBONS, LIGHT_SHAFTS, SPIRAL_TRAILS } from '../evolve-geometry.mjs';

const scene = buildEvolveScene(11);
const SCENE_S = EVOLVE_SCENE_MS / 1000;
const opsAt = (t) => evolveOps(scene, t);
const numbersOf = (op) =>
  Object.entries(op).flatMap(([key, value]) => {
    if (typeof value === 'number') return [[key, value]];
    if (Array.isArray(value)) return value.flat(2).filter((v) => typeof v === 'number').map((v) => [key, v]);
    return [];
  });

test('timeline: the charge starts before the pop, the pop beats sit at ~1 s, all done by the scene end', () => {
  const charge = ['introFlash', 'introDissolve', 'glowCore', 'smokes', 'wisps', 'helix', 'spirals', 'raysRad', 'prismaticSet', 'debris'];
  for (const key of charge) assert.ok(EVOLVE_TIMELINE[key].delay < EVOLVE_POP_S, key);
  for (const key of ['pop', 'refraction', 'shockwave', 'disc', 'shafts', 'flash', 'sparkles', 'motes', 'outro']) {
    assert.ok(Math.abs(EVOLVE_TIMELINE[key].delay - EVOLVE_POP_S) <= 0.051, key);
  }
  for (const [key, beat] of Object.entries(EVOLVE_TIMELINE)) assert.ok(beat.delay + beat.life <= SCENE_S + 1e-9, key);
});

test('buildEvolveScene is deterministic per seed and differs across seeds', () => {
  assert.deepEqual(buildEvolveScene(5), buildEvolveScene(5));
  assert.notDeepEqual(buildEvolveScene(5).softy, buildEvolveScene(6).softy);
  assert.ok(buildEvolveScene(5).debris.length >= 100, 'round debris: burst 14 + its rate curve');
});

test('evolveOps: every number is finite and every alpha in [0, 1] — inside, outside and NaN time', () => {
  for (const t of [-1, 0, 0.05, 0.3, 0.6, 0.95, 0.99, 1.0, 1.05, 1.3, 2, 2.9, 3.5, Number.NaN]) {
    for (const op of opsAt(t)) {
      for (const [key, value] of numbersOf(op)) assert.ok(Number.isFinite(value), `${op.kind}.${key} at ${t}`);
      if ('alpha' in op) assert.ok(op.alpha >= 0 && op.alpha <= 1, `${op.kind} alpha ${op.alpha} at ${t}`);
    }
  }
});

test('evolveOps: nothing but the cutout before the start and after the end', () => {
  assert.deepEqual(opsAt(-0.5), [{ kind: 'cutout' }]);
  assert.deepEqual(opsAt(SCENE_S + 0.01), [{ kind: 'cutout' }]);
  assert.deepEqual(evolveOps(null, 1), []);
});

test('evolveOps: exactly one cutout, after the back glows and before the card layers', () => {
  for (const t of [0.2, 0.8, 1.1]) {
    const ops = opsAt(t);
    const cut = ops.findIndex((op) => op.kind === 'cutout');
    assert.equal(ops.filter((op) => op.kind === 'cutout').length, 1);
    const firstCard = ops.findIndex((op) => op.mask === 'squareRounded' || op.tex === 'squareRounded');
    assert.ok(firstCard > cut, `card layer after the cutout at ${t}`);
  }
});

const cardLayers = (t) => opsAt(t).filter((op) => op.mask === 'squareRounded' || op.tex === 'squareRounded');

test('the card silhouette dissolves in through the charge and covers the card across the pop', () => {
  const intro = (t) => cardLayers(t).find((op) => op.noise === 'diamondSwirl');
  assert.ok(intro(0.05).amount > 0.8, 'starts eaten away');
  assert.ok(intro(0.5).amount < intro(0.2).amount, 'fills in');
  assert.ok(intro(0.9).amount < 0, 'whole by the pop');
  for (let t = 0.85; t <= 1.4; t += 0.01) {
    const covered = cardLayers(t).some((op) => op.alpha >= 0.45 && (op.kind === 'sprite' || op.amount <= 0));
    assert.ok(covered, `card covered at ${t.toFixed(2)}`);
  }
});

test('the outro dissolves the card glow away over 2 s and is gone at the end', () => {
  const outro = (t) => cardLayers(t).find((op) => op.noise === 'tileCell' && op.w < 10);
  assert.ok(outro(1.2).amount < outro(2.5).amount, 'more eaten as it goes');
  assert.ok(outro(2.5).amount > 0.5);
  assert.equal(outro(SCENE_S + 0.01), undefined);
});

test('the pop is one card-sized flash, never wider than the card quad', () => {
  const pop = opsAt(0.98).find((op) => op.kind === 'sprite' && op.tex === 'squareRounded');
  assert.ok(pop);
  assert.ok(pop.w <= 10 && pop.h <= 13, 'Square_Pop is 10 × 13 prefab units');
  assert.equal(opsAt(1.1).find((op) => op.kind === 'sprite' && op.tex === 'squareRounded'), undefined, 'gone in 80 ms');
});

const extent = (points) => Math.max(...points.map(([x, y]) => Math.hypot(x, y)));

test('helix whorls spin and close in on the card as they fade', () => {
  const helix = (t) => opsAt(t).filter((op) => op.kind === 'ribbon' && op.lut === 'lightShaft');
  const early = helix(0.2);
  const late = helix(1.0);
  assert.equal(early.length, Object.keys(HELIX_RIBBONS).length);
  assert.ok(extent(late[0].a) < extent(early[0].a), 'shrinks');
  assert.notDeepEqual(helix(0.3)[0].a[5], helix(0.5)[0].a[5], 'spins');
});

test('the prismatic beams, rainbow radial rays and light shafts are all there (the TCG Live copy)', () => {
  const charge = opsAt(0.4);
  assert.ok(charge.some((op) => op.tex === 'raysPrismatic'), 'prismatic beams');
  assert.ok(charge.some((op) => op.kind === 'polar' && op.noise === 'streaks'), 'radial rays');
  const pop = opsAt(1.1);
  assert.equal(pop.filter((op) => op.kind === 'ribbon' && op.lut === 'lightRay').length, LIGHT_SHAFTS.length + 4, 'shafts + flash fan');
  assert.ok(pop.some((op) => op.tex === 'spectrumRing'), 'refraction ring');
  assert.equal(Object.keys(SPIRAL_TRAILS).length, 3);
});

test('every layer stays local: the whole effect fits the stage (its rim fades the last of the rays)', () => {
  const stageUnits = EVOLVE_STAGE * CARD_UNITS;
  for (let t = 0; t <= SCENE_S; t += 0.05) {
    for (const op of opsAt(t)) {
      const size = op.kind === 'polar' ? op.size : op.kind === 'sprite' || op.kind === 'dissolve' ? Math.max(op.w, op.h) : 0;
      assert.ok(size <= stageUnits * 1.2, `${op.kind} ${op.tex || op.noise} is ${size} units at ${t.toFixed(2)}`);
    }
  }
});

test('turnOfMatrix: the opponent frame turns 180°, identity and mirrors do not turn', () => {
  assert.equal(turnOfMatrix({ a: 1, b: 0, c: 0, d: 1 }), 0);
  assert.equal(turnOfMatrix({ a: -1, b: 0, c: 0, d: -1 }), 180);
  assert.equal(turnOfMatrix({ a: 0, b: 1, c: -1, d: 0 }), 90);
  assert.equal(turnOfMatrix({ a: -1, b: 0, c: 0, d: 1 }), 0, 'a mirror is not a turn');
  assert.equal(turnOfMatrix(null), 0);
  assert.equal(turnOfMatrix({ a: Number.NaN }), 0);
});

test('the evolve-scene hold lands the next effect after the pop, inside the queue budget', () => {
  const hold = HOLD_MS['evolve-scene'];
  assert.ok(hold >= EVOLVE_POP_S * 1000 + 200, 'after the pop and its shafts');
  assert.ok(hold < EVOLVE_SCENE_MS, 'the outro tail overlaps the next effect');
  assert.ok(hold <= 2500);
});
