// A zero card scale must not reach the boards' scatter loops (the cemetery's pine scan steps by
// 118 * u and would never finish), and the helpers the boards share have one owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { cemeterySpots } from '../stadium-env-cemetery.mjs';
import { boardContext, smoothstep, union } from '../stadium-env-spots.mjs';
import { union as layoutUnion } from '../stadium-environment-layout.mjs';

const layoutWithScale = (width) => {
  const layout = flatLayout(getMatLayout(NO_MAT_LAYOUT_ID), { w: 1449.6, h: 540 });
  layout.self.cardBox = { ...layout.self.cardBox, active: { ...layout.self.cardBox.active, w: width } };
  return layout;
};

test('a board with no card scale has no layout, instead of a scan that never ends', () => {
  for (const width of [0, -40]) {
    assert.equal(cemeterySpots(layoutWithScale(width)), null, `cemetery at ${width}`);
    assert.equal(boardContext(layoutWithScale(width), 'neutral'), null, `context at ${width}`);
  }
  assert.ok(cemeterySpots(layoutWithScale(100)));
});

test('smoothstep: either way round, the falloff is one minus the rise', () => {
  assert.equal(smoothstep(0, 10, -1), 0);
  assert.equal(smoothstep(0, 10, 11), 1);
  assert.equal(smoothstep(10, 0, 11), 0);
  assert.equal(smoothstep(10, 0, -1), 1);
  for (const x of [1, 3.5, 5, 8]) assert.ok(Math.abs(smoothstep(10, 0, x) - (1 - smoothstep(0, 10, x))) < 1e-12);
});

test('union is the layout module\'s, re-exported by the spots module', () => {
  assert.equal(union, layoutUnion);
  assert.deepEqual(union([{ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: -1, w: 1, h: 1 }]), { x: 0, y: -1, w: 6, h: 3 });
});
