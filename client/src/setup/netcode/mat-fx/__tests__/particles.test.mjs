import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PARTICLES, burstParticles } from '../particles.mjs';
import { FX_NEUTRAL_RGB, brighten, fxRgbForCard, rgbCss } from '../fx-colors.mjs';
import { TYPE_GLOW } from '../../../rules/card-glow-colors.mjs';

test('burstParticles: count clamps to [0, MAX_PARTICLES] (edge 10)', () => {
  assert.equal(burstParticles({ count: 500, distance: 40 }).length, MAX_PARTICLES);
  assert.equal(burstParticles({ count: -3, distance: 40 }).length, 0);
  assert.equal(burstParticles({ count: 'x', distance: 40 }).length, 0);
});

test('burstParticles: deterministic per seed, travel within range', () => {
  const a = burstParticles({ count: 10, distance: 50, seed: 7 });
  const b = burstParticles({ count: 10, distance: 50, seed: 7 });
  assert.deepEqual(a, b);
  for (const p of a) {
    const travel = Math.hypot(p.dx, p.dy);
    assert.ok(travel >= 50 * 0.55 - 1e-9 && travel <= 50 * 1.15 + 1e-9);
    assert.ok(p.delay >= 0 && p.delay <= 0.1);
    assert.ok(p.life >= 0.7 && p.life <= 1);
  }
});

test('burstParticles: a cone stays inside its spread', () => {
  const ps = burstParticles({ count: 20, distance: 30, direction: 90, spread: 60, seed: 3 });
  for (const p of ps) assert.ok(p.angle >= 60 && p.angle <= 120, `angle ${p.angle}`);
});

test('fxRgbForCard: Pokémon by first type, Energy by energy type, junk neutral (edge 6)', () => {
  assert.deepEqual(fxRgbForCard({ name: 'Charmander', types: ['Fire'] }), TYPE_GLOW.fire);
  assert.deepEqual(fxRgbForCard({ name: 'Basic Water Energy', type: 'Energy', types: ['Water'] }), TYPE_GLOW.water);
  assert.deepEqual(fxRgbForCard({ name: 'Mystery', types: ['Sound'] }), FX_NEUTRAL_RGB);
  assert.deepEqual(fxRgbForCard({ name: 'Nobody' }), FX_NEUTRAL_RGB);
  assert.deepEqual(fxRgbForCard(null), FX_NEUTRAL_RGB);
});

test('brighten + rgbCss', () => {
  assert.deepEqual(brighten([0, 100, 255], 0.5), [128, 178, 255]);
  assert.equal(rgbCss([1, 2, 3], 0.5), 'rgba(1, 2, 3, 0.5)');
});
