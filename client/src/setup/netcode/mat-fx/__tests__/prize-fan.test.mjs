import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fanFlightPose } from '../prize-fan.mjs';

const slot = { left: 500, top: 200, width: 140, height: 196 };
const prize = { left: 100, top: 600, width: 70, height: 98 };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test('fanFlightPose: flies up from the prize card, turned like its board, onto the slot upright', () => {
  const pose = fanFlightPose({ from: prize, to: slot, fromTurn: 180 });
  const start = pose(0);
  assert.ok(near(start.x, 135 - 570) && near(start.y, 649 - 298));
  assert.ok(near(start.scale, 0.5));
  assert.ok(near(start.rotate, 180));
  const end = pose(1);
  assert.ok(near(end.x, 0) && near(end.y, 0) && near(end.scale, 1));
  assert.ok(near(((end.rotate % 360) + 360) % 360, 0));
});

test('fanFlightPose: reverse drops the sleeve back onto its prize card', () => {
  const pose = fanFlightPose({ from: prize, to: slot, reverse: true });
  assert.ok(near(pose(0).x, 0) && near(pose(0).scale, 1));
  const end = pose(1);
  assert.ok(near(end.x, 135 - 570) && near(end.y, 649 - 298) && near(end.scale, 0.5));
});

test('fanFlightPose: the sleeve never fades, even as it lands', () => {
  const pose = fanFlightPose({ from: prize, to: slot });
  for (const u of [0, 0.5, 0.95, 1]) assert.equal(pose(u).opacity, 1);
});

test('fanFlightPose: arcs up the screen on the way', () => {
  const pose = fanFlightPose({ from: prize, to: slot, seed: 7 });
  const straightMidY = (649 - 298) / 2;
  assert.ok(pose(0.5).y < straightMidY);
});

test('fanFlightPose: no prize rect starts small below the slot', () => {
  const start = fanFlightPose({ from: null, to: slot })(0);
  assert.ok(start.y > 0 && near(start.scale, 0.5) && start.rotate === 0);
});
