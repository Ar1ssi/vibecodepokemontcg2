// Design 083: the shared helpers boards scatter with: patches instead of polka-dots, shuffled caps,
// hand clumps round a hero piece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clumpAround, patch, patchy, shuffled } from '../stadium-env-spots.mjs';

test('patch: a smooth 0..1 field, the same for the same inputs, its lattice points the hash', () => {
  for (let k = 0; k < 400; k += 1) {
    const x = (k * 37.3) % 2000 - 1000;
    const y = (k * 91.7) % 1400 - 200;
    const v = patch(x, y, 200, 3);
    assert.ok(v >= 0 && v <= 1, `in range (${v})`);
    assert.equal(v, patch(x, y, 200, 3));
    assert.ok(Math.abs(patch(x + 1, y, 200, 3) - v) < 0.03, 'one px over, nearly the same');
  }
  assert.notEqual(patch(123, 456, 200, 1), patch(123, 456, 200, 2), 'the salt changes the field');
  assert.equal(patch(10, 10, 0), patch(10, 10, 260), 'a bad scale falls back to 260');
});

test('patchy: 0..1.8 round a mean near 1; contrast 0 is even; patches gather', () => {
  let sum = 0;
  let low = 0;
  let high = 0;
  let count = 0;
  for (let x = -1200; x <= 1200; x += 23) {
    for (let y = -300; y <= 1400; y += 23) {
      const w = patchy(x, y, { scale: 240, salt: 5 });
      assert.ok(w >= 0 && w <= 1.8);
      assert.equal(patchy(x, y, { scale: 240, contrast: 0, salt: 5 }), 1);
      sum += w;
      count += 1;
      if (w < 0.5) low += 1;
      if (w > 1.5) high += 1;
    }
  }
  const mean = sum / count;
  assert.ok(mean > 0.85 && mean < 1.15, `mean ${mean}`);
  assert.ok(low / count > 0.08 && high / count > 0.08, `clearings ${low / count} and thickets ${high / count}`);
});

test('shuffled: a deterministic permutation that leaves its input alone', () => {
  const list = Array.from({ length: 50 }, (_, i) => i);
  const a = shuffled(list, 7);
  assert.deepEqual([...a].sort((p, q) => p - q), list, 'a permutation');
  assert.deepEqual(shuffled(list, 7), a, 'deterministic');
  assert.notDeepEqual(a, list, 'shuffled');
  assert.notDeepEqual(shuffled(list, 8), a, 'the salt changes the order');
  assert.deepEqual(list, Array.from({ length: 50 }, (_, i) => i), 'input untouched');
  assert.deepEqual(shuffled([], 1), []);
  assert.deepEqual(shuffled(null, 1), []);
  // A capped near-to-far scan takes from every part of it once shuffled.
  const firstTen = shuffled(list, 3).slice(0, 10);
  assert.ok(Math.max(...firstTen) - Math.min(...firstTen) > 25, 'a cap of 10 spans the list');
});

test('clumpAround: satellites spread round the hero within reach, each a share of its size', () => {
  const hero = { x: 300, y: 500 };
  const satellites = clumpAround(hero, { count: 4, reach: [40, 70], salt: 2 });
  assert.equal(satellites.length, 4);
  const angles = [];
  for (const s of satellites) {
    const d = Math.hypot(s.x - hero.x, s.y - hero.y);
    assert.ok(d >= 40 - 1e-9 && d <= 70 + 1e-9, `within reach (${d})`);
    assert.ok(s.share >= 0.45 && s.share <= 0.8);
    assert.ok(s.seed >= 0 && s.seed < 1);
    angles.push(Math.atan2(s.y - hero.y, s.x - hero.x));
  }
  angles.sort((a, b) => a - b);
  const gaps = angles.map((a, i) => (i === 0 ? a + 2 * Math.PI - angles[angles.length - 1] : a - angles[i - 1]));
  assert.ok(Math.min(...gaps) > 0.4, `never two together (${Math.min(...gaps)})`);
  assert.deepEqual(clumpAround(hero, { count: 4, reach: [40, 70], salt: 2 }), satellites, 'deterministic');
  assert.deepEqual(clumpAround(hero, { count: 0 }), []);
  assert.deepEqual(clumpAround(hero, { count: NaN }), []);
});
