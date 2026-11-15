import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERA_COAT, TERA_COAT_FRAGMENT, TERA_COAT_VERTEX, teraCoatBreath, teraCoatForm, teraCoatSweep } from '../tera-coat.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('teraCoatForm: nothing before the coat goes on, the whole coat after formMs', () => {
  assert.equal(teraCoatForm(-50), 0);
  assert.equal(teraCoatForm(0), 0);
  assert.ok(near(teraCoatForm(TERA_COAT.formMs / 2), 0.5));
  assert.equal(teraCoatForm(TERA_COAT.formMs), 1);
  assert.equal(teraCoatForm(99999), 1);
});

test('teraCoatSweep: off the card while it forms, one crossing per period, then it rests', () => {
  const { formMs, sweepMs, sweepPeriodMs } = TERA_COAT;
  assert.equal(teraCoatSweep(0), -0.2);
  assert.equal(teraCoatSweep(formMs), -0.2);
  assert.ok(near(teraCoatSweep(formMs + sweepMs / 2), 0.5), 'half way across at half the crossing');
  assert.ok(near(teraCoatSweep(formMs + sweepMs), 1.2));
  assert.ok(near(teraCoatSweep(formMs + sweepPeriodMs - 1), 1.2), 'it rests past the far corner');
  assert.ok(near(teraCoatSweep(formMs + sweepPeriodMs + sweepMs / 2), 0.5), 'and crosses again each period');
  let last = -Infinity;
  for (let ms = formMs; ms <= formMs + sweepMs; ms += 50) {
    assert.ok(teraCoatSweep(ms) >= last, 'never runs backward within a crossing');
    last = teraCoatSweep(ms);
  }
});

test('teraCoatBreath: 0.7 → 1 → 0.7 over one breath, never outside', () => {
  assert.ok(near(teraCoatBreath(0), 0.7));
  assert.ok(near(teraCoatBreath(TERA_COAT.breathMs / 2), 1));
  assert.ok(near(teraCoatBreath(TERA_COAT.breathMs), 0.7));
  for (let ms = -100; ms < 8000; ms += 137) {
    const b = teraCoatBreath(ms);
    assert.ok(b >= 0.7 - 1e-9 && b <= 1 + 1e-9, String(ms));
  }
});

test('the coat shader: every uniform the overlay sets is declared, and no fill is white', () => {
  for (const name of ['uPlane', 'uHalf', 'uRadius', 'uDeep', 'uBody', 'uHot', 'uSeed', 'uTime', 'uForm', 'uSweep', 'uBreath', 'uFade']) {
    assert.match(TERA_COAT_FRAGMENT, new RegExp(`uniform \\w+ ${name};`), name);
  }
  assert.match(TERA_COAT_VERTEX, /vUv = uv;/);
  assert.match(TERA_COAT_FRAGMENT, /gl_FragColor = vec4\(colour, cover\);/, 'premultiplied: colour and how much it covers');
  // The lattice and its inverse are written as numbers: no `inverse()` call for a driver to lack.
  assert.doesNotMatch(TERA_COAT_FRAGMENT, /inverse\(|NaN|undefined/);
  // A shard covers at most about half the card under it; the art is never painted out.
  const cover = /float cover = frame \* \(([\d.]+) \+ ([\d.]+) \* \(1\.0 - tone\)\);/.exec(TERA_COAT_FRAGMENT);
  assert.ok(cover && Number(cover[1]) + Number(cover[2]) <= 0.6, 'cover stays translucent');
});
