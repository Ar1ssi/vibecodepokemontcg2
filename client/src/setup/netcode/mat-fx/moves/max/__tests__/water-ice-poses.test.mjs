import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auroraVeilPose, surgeStonesPose } from '../water-ice-poses.mjs';
import { checkParams, tonguesAt } from '../../move-spec.mjs';

const H = 100;
const finite = (rows) => rows.every((row) => Object.values(row).every((v) => typeof v !== 'number' || Number.isFinite(v)));

test('surgeStones / auroraVeil: their defaults are valid params and they add no tongues to the budget', () => {
  assert.deepEqual(checkParams('surgeStones', {}), []);
  assert.deepEqual(checkParams('auroraVeil', {}), []);
  assert.equal(tonguesAt('surgeStones', {}), 0);
  assert.equal(tonguesAt('auroraVeil', {}), 0);
  assert.ok(checkParams('surgeStones', { from: 'ground' }).length > 0);
  assert.ok(checkParams('auroraVeil', { half: 'middle' }).length > 0);
});

test('surgeStonesPose (erupt): flung out of the card, landing round it and standing, then sinking away', () => {
  const p = { from: 'erupt', count: 7, distance: 0.95, height: 0.75, size: [0.06, 0.11] };
  assert.equal(surgeStonesPose(0, H, 3, p).length, 0, 'nothing before the beat');
  const flying = surgeStonesPose(0.12, H, 3, p);
  assert.ok(flying.length > 0 && flying.every((st) => !st.landed));
  // Mid-flight a stone is above its ground point (lifted by the hop and its own height).
  assert.ok(flying.some((st) => st.y < st.gy - st.size));
  const standing = surgeStonesPose(0.6, H, 3, p);
  assert.equal(standing.length, 7);
  for (const st of standing) {
    assert.ok(st.landed);
    assert.equal(st.alpha, 1);
    assert.ok(st.stretch > 1.5, 'a standing stone is a tall sharp stone');
    const reach = Math.hypot(st.gx, st.gy / 0.55);
    assert.ok(reach > 0.6 * H && reach < 1.3 * H, `stands round the card (${reach})`);
  }
  const late = surgeStonesPose(0.99, H, 3, p);
  assert.ok(late.every((st) => st.alpha < 0.1), 'gone by the end');
  assert.ok(finite([...flying, ...standing, ...late]));
});

test('surgeStonesPose (sky): boulders fall onto their ground points in turn and crumble as they land', () => {
  const p = { from: 'sky', count: 4, distance: 0.75, height: 1.5, size: [0.16, 0.24] };
  const early = surgeStonesPose(0.05, H, 9, p);
  assert.ok(early.length >= 1 && early.length < 4, 'they start one after another');
  for (const st of early) assert.ok(st.y < st.gy - 1.0 * H, 'still high in the air');
  // The last lands near 0.64 of the beat (start ≤ 0.39, fall 0.3) and is gone by 0.82.
  const landing = surgeStonesPose(0.66, H, 9, p);
  assert.ok(landing.some((st) => st.landed));
  assert.equal(surgeStonesPose(0.9, H, 9, p).length, 0);
  // A landed boulder rests on its ground point (no longer up in the air) as it breaks.
  for (const st of landing.filter((one) => one.landed)) {
    assert.ok(st.y <= st.gy, 'above or on its point');
    assert.ok(st.gy - st.y <= 1.35 * st.size + 1e-9, 'down on the ground');
  }
  assert.ok(finite([...early, ...landing]));
});

test('surgeStonesPose: deterministic for a seed', () => {
  const p = { from: 'erupt' };
  assert.deepEqual(surgeStonesPose(0.5, H, 4, p), surgeStonesPose(0.5, H, 4, p));
  assert.notDeepEqual(surgeStonesPose(0.5, H, 4, p), surgeStonesPose(0.5, H, 5, p));
});

test('auroraVeilPose: curtains on a ring round the card rise, shimmer and fade', () => {
  const p = { count: 8, r: 1.1, height: 1.6, w: 0.3, half: 'both' };
  assert.ok(auroraVeilPose(0, H, 2, p).every((c) => c.height === 0 && c.alpha === 0));
  const mid = auroraVeilPose(0.5, H, 2, p);
  assert.equal(mid.length, 8);
  for (const c of mid) {
    assert.ok(c.height > 0.8 * H, 'risen');
    assert.ok(c.alpha > 0);
    assert.ok(Math.abs(Math.hypot(c.x, c.y / 0.55) - 1.1 * H) < 1e-6, 'on the ring');
  }
  assert.ok(auroraVeilPose(1, H, 2, p).every((c) => c.alpha === 0), 'faded by the end');
  assert.ok(finite(mid));
});

test('auroraVeilPose: back and front halves split the ring by depth and together make the whole', () => {
  const both = auroraVeilPose(0.5, H, 2, { count: 8, half: 'both' });
  const back = auroraVeilPose(0.5, H, 2, { count: 8, half: 'back' });
  const front = auroraVeilPose(0.5, H, 2, { count: 8, half: 'front' });
  assert.ok(back.every((c) => c.depth < 0));
  assert.ok(front.every((c) => c.depth >= 0));
  assert.equal(back.length + front.length, both.length);
});
