import test from 'node:test';
import assert from 'node:assert/strict';

import { FIRE_PALETTE } from '../element-params.mjs';
import { FIREBALL_FLOATS, normalizeFireball, packFireball } from '../fireball.mjs';
import { FLAME_JET_FLOATS, normalizeFlameJet, packFlameJet } from '../flame-jet.mjs';

const round = (values) => [...values].map((v) => Math.round(v * 1000) / 1000);

test('fireball: defaults, palette fallback, and what cannot draw', () => {
  const ball = normalizeFireball({ at: { x: 1, y: 2 }, radius: 10 });
  assert.deepEqual(ball.at, { x: 1, y: 2, z: 0 });
  assert.equal(ball.alpha, 1);
  assert.equal(ball.heat, 1);
  assert.equal(ball.boil, 0.6);
  assert.deepEqual(ball.heading, { x: 0, y: 0 });
  assert.equal(ball.stretch, 0, 'no heading: no comet even when asked');
  assert.deepEqual(ball.palette.body, FIRE_PALETTE.body);
  for (const bad of [null, { radius: 5 }, { at: { x: 0, y: 0 }, radius: 0 }, { at: { x: 0, y: 0 }, radius: 5, alpha: 0 }, { at: { x: 'a', y: 0 }, radius: 5 }]) {
    assert.equal(normalizeFireball(bad), null, JSON.stringify(bad));
  }
});

test('fireball: a heading gives a comet; the row packs the six vec4s in order', () => {
  const ball = normalizeFireball({
    at: { x: 1, y: 2, z: 3 },
    radius: 4,
    alpha: 0.5,
    heat: 0.25,
    seed: 7,
    dissolve: 2,
    boil: 0.3,
    headingDeg: 90,
    stretch: 0.8,
    palette: { deep: [0.1, 0.2, 0.3], body: [0.4, 0.5, 0.6], hot: [0.7, 0.8, 0.9], core: [1, 1, 1] },
  });
  const out = new Float32Array(FIREBALL_FLOATS);
  packFireball(ball, out, 0);
  assert.deepEqual(round(out), [1, 2, 3, 4, 0.1, 0.2, 0.3, 0.25, 0.4, 0.5, 0.6, 7, 0.7, 0.8, 0.9, 1, 1, 1, 1, 0.3, 0, 1, 0.8, 0.5]);
});

test('flame jet: needs two points, a width and some length', () => {
  const jet = normalizeFlameJet({ from: { x: 0, y: 0 }, to: { x: 0, y: -50, z: 10 }, width: 12 });
  assert.equal(jet.flow, 1);
  assert.equal(jet.heat, 1);
  assert.deepEqual(jet.to, { x: 0, y: -50, z: 10 });
  for (const bad of [
    null,
    { to: { x: 0, y: 1 }, width: 2 },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 0.1 }, width: 2 },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 10 }, width: -2 },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 10 }, width: 2, alpha: 0 },
  ]) {
    assert.equal(normalizeFlameJet(bad), null, JSON.stringify(bad));
  }
  const out = new Float32Array(FLAME_JET_FLOATS * 2);
  packFlameJet(normalizeFlameJet({ from: { x: 1, y: 2, z: 3 }, to: { x: 4, y: 5, z: 6 }, width: 7, alpha: 0.5, seed: 9, flow: 2 }), out, 1);
  const row = round(out.subarray(FLAME_JET_FLOATS));
  assert.deepEqual(row.slice(0, 8), [1, 2, 3, 7, 4, 5, 6, 0.5]);
  assert.equal(row[15], 9, 'seed rides with the body colour');
  assert.equal(row[23], 2, 'flow rides with the core colour');
});
