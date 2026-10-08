import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_WIDTH_UNITS, TINT_GAIN_BRIGHT, unitsToCard, unityPosToCard, unityRgb } from '../status-units.mjs';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('one card width is the card in the dump quads (Card_Silhouette, Singed edge)', () => {
  // Status_Damage Body_Dissolve: a 10.68-unit quad, card at 62.2% of its width.
  assert.ok(near(unitsToCard(10.68 * 0.622), 1, 0.01));
  // Burned Dark_Singed_Edges_Intro: 10.41 units x container 0.78 x own 1.28, card at 63.4%.
  assert.ok(near(unitsToCard(10.41 * 1.28 * 0.634, 0.78), 1, 0.01));
  assert.equal(unitsToCard(CARD_WIDTH_UNITS), 1);
});

test('unityPosToCard: container scale applies and +y up becomes down', () => {
  const p = unityPosToCard([3.93, -5.17], 0.78);
  assert.ok(near(p.x, 0.463));
  assert.ok(near(p.y, 0.609), 'a fire below centre in Unity sits below centre on screen');
  assert.deepEqual(unityPosToCard([0, 0]), { x: 0, y: -0 });
});

test('unityRgb: 0..1 channels to a clamped CSS triple', () => {
  assert.equal(unityRgb([1, 0.278, 0.692]), '255, 71, 176');
  assert.equal(unityRgb([1.2, -0.1, 0.5]), '255, 0, 128');
});

test('unityRgb: a bright-tint material doubles the colour, clamped (the dim FireFraming flame)', () => {
  assert.equal(unityRgb([0.623, 0.454, 0.138], TINT_GAIN_BRIGHT), '255, 232, 70');
});
