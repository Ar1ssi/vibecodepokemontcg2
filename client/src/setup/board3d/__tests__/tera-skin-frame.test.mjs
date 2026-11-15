import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERA_SKIN_TIMING, teraGlintFrame, teraSkinFade } from '../tera-skin-frame.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('teraSkinFade: 0 → 1 over 0.45 s, ease-out (ahead of linear)', () => {
  assert.equal(teraSkinFade(0), 0);
  assert.equal(teraSkinFade(-10), 0);
  assert.ok(teraSkinFade(225) > 0.5);
  assert.equal(teraSkinFade(TERA_SKIN_TIMING.fadeMs), 1);
  assert.equal(teraSkinFade(9999), 1);
});

test('teraGlintFrame: hidden until its delay and until 62 %, flares at 72 %, shrinks at 84 %', () => {
  assert.deepEqual(teraGlintFrame(500, 1), { scale: 0, rotateDeg: 0, opacity: 0 });
  const at = (p, delay = 0) => teraGlintFrame(delay * 1000 + p * 3300, delay);
  assert.deepEqual(at(0.3), { scale: 0, rotateDeg: 0, opacity: 0 });
  const peak = at(0.72, 1.1);
  assert.ok(near(peak.scale, 1) && near(peak.rotateDeg, 25) && near(peak.opacity, 1));
  const late = at(0.84);
  assert.ok(near(late.scale, 0.25) && near(late.rotateDeg, 45) && near(late.opacity, 0.6));
  assert.ok(near(at(0.999).opacity, 0, 1e-3));
});
