import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterMotionFor, isDangerDamage } from '../damage-counter-style.mjs';

test('isDangerDamage: true within one counter of a knockout', () => {
  assert.equal(isDangerDamage(60, 70), true, 'exactly one counter left');
  assert.equal(isDangerDamage(70, 70), true, 'already at zero HP');
  assert.equal(isDangerDamage(90, 70), true, 'overkill still reads as danger');
});

test('isDangerDamage: false with room to spare', () => {
  assert.equal(isDangerDamage(50, 70), false);
  assert.equal(isDangerDamage(10, 330), false);
});

test('isDangerDamage: an undamaged Pokemon is never in danger', () => {
  assert.equal(isDangerDamage(0, 70), false);
  assert.equal(isDangerDamage(-10, 70), false);
});

test('isDangerDamage: unknown HP never raises a false alarm', () => {
  // Printed HP only arrives with cardStats, so it is routinely absent.
  assert.equal(isDangerDamage(60, undefined), false);
  assert.equal(isDangerDamage(60, null), false);
  assert.equal(isDangerDamage(60, ''), false);
  assert.equal(isDangerDamage(60, 'HP70'), false);
  assert.equal(isDangerDamage(60, 0), false);
  assert.equal(isDangerDamage(60, -70), false);
});

test('isDangerDamage: reads numeric strings, as the DOM supplies them', () => {
  assert.equal(isDangerDamage('60', '70'), true);
  assert.equal(isDangerDamage('30', '70'), false);
});

test('isDangerDamage: junk damage is not a danger', () => {
  assert.equal(isDangerDamage(undefined, 70), false);
  assert.equal(isDangerDamage('lots', 70), false);
});

// ── Design 024 slice 3: which one-shot a counter plays ─────────────────────

test('counterMotionFor: a brand-new counter lands', () => {
  assert.equal(counterMotionFor({ isNew: true }), 'land');
  assert.equal(counterMotionFor({ isNew: true, valueChanged: true }), 'land');
});

test('counterMotionFor: an existing counter bumps only when its value changed', () => {
  assert.equal(counterMotionFor({ valueChanged: true }), 'bump');
  assert.equal(counterMotionFor({ valueChanged: false }), null);
});

test('counterMotionFor: a restyle with no change is silent', () => {
  // addDamageCounter doubles as the window-resize handler and never alters an
  // existing counter's value; animating there would pop every counter on the
  // board each time the window moved.
  assert.equal(counterMotionFor(), null);
  assert.equal(counterMotionFor({}), null);
  assert.equal(counterMotionFor({ isNew: false }), null);
});
