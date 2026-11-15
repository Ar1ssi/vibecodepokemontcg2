import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOSS_GRAVITY, tossHeight, tossReach } from '../entry-toss.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('tossHeight: rises, falls to the cloth at `flight`, takes one lower bounce, then rests', () => {
  const z0 = 0.2;
  const up = 1.5;
  const start = tossHeight(0, z0, up);
  assert.ok(near(start.z, z0));
  assert.ok(start.airborne);
  const { flight, hop } = start;
  assert.ok(near(z0 + up * flight - 0.5 * TOSS_GRAVITY * flight ** 2, 0, 1e-9), 'flight is when it meets the cloth');
  const apex = up / TOSS_GRAVITY;
  assert.ok(near(tossHeight(apex, z0, up).z, z0 + up ** 2 / (2 * TOSS_GRAVITY)), 'the apex of the throw');
  assert.ok(near(tossHeight(flight, z0, up).z, 0, 1e-9));
  const bounceTop = tossHeight(flight + hop / 2, z0, up).z;
  assert.ok(bounceTop > 0 && bounceTop < z0 + up ** 2 / (2 * TOSS_GRAVITY) / 4, 'the bounce is much lower than the throw');
  const rest = tossHeight(flight + hop + 0.5, z0, up);
  assert.equal(rest.z, 0);
  assert.equal(rest.airborne, false);
  for (let t = 0; t < 3; t += 0.05) assert.ok(tossHeight(t, z0, up).z >= 0, 'never under the cloth');
});

test('tossReach: drag slows it, and it stops where it comes to rest', () => {
  assert.equal(tossReach(0, 2, 1), 0);
  assert.equal(tossReach(-1, 2, 1), 0);
  let last = 0;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const reach = tossReach(t, 2, 1);
    assert.ok(reach > last, 'it keeps moving until it rests');
    assert.ok(reach - last < 2 * 0.05 + 1e-9, 'never faster than it was thrown');
    last = reach;
  }
  assert.equal(tossReach(5, 2, 1), tossReach(1, 2, 1), 'still after `until`');
  assert.ok(near(tossReach(0.5, 4, 1), 2 * tossReach(0.5, 2, 1)), 'twice the throw, twice the reach');
});
