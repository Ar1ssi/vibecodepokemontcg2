import { test } from 'node:test';
import assert from 'node:assert/strict';

import { msaaFor } from '../gl-renderer.js';

test('MSAA is asked for below pixel ratio 2 only, and never when the caller turns it off', () => {
  assert.equal(msaaFor(true, 1), true);
  assert.equal(msaaFor(true, 1.5), true);
  assert.equal(msaaFor(true, 2), false);
  assert.equal(msaaFor(true, 3), false);
  assert.equal(msaaFor(false, 1), false);
});

test('a missing or broken pixel ratio keeps MSAA on', () => {
  assert.equal(msaaFor(true, Number.NaN), true);
  assert.equal(msaaFor(true, undefined), true);
});
