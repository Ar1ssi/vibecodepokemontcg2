import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAD_H,
  SKY_HEIGHT,
  SKY_LEAN,
  lanePoint,
  laneGeometry,
  localLane,
  phaseProgress,
  skyLane,
  toLocal,
  unionPadded,
} from '../move-geometry.mjs';

const rect = (left, top, width = 100, height = 140) => ({ left, top, width, height });

test('laneGeometry: attacker below, defender above (screen up) points up and mirrors cleanly', () => {
  const lane = laneGeometry(rect(100, 400), rect(100, 100));
  assert.equal(lane.ux, 0);
  assert.equal(lane.uy, -1);
  assert.equal(lane.angleDeg, -90);
  assert.equal(lane.length, 300);
  assert.equal(lane.h, 140);
  // The left normal of "up" is "left" on screen.
  assert.equal(lane.nx, 1);
  assert.equal(lane.ny, 0);
});

test('laneGeometry: the opposite orientation is the exact reverse direction', () => {
  const down = laneGeometry(rect(100, 100), rect(100, 400));
  const up = laneGeometry(rect(100, 400), rect(100, 100));
  assert.equal(down.uy, 1);
  assert.equal(down.ux + up.ux, 0);
  assert.equal(down.uy + up.uy, 0);
  assert.equal(down.angleDeg, 90);
});

test('laneGeometry: h is the larger card height; coincident or missing rects give null', () => {
  assert.equal(laneGeometry(rect(0, 0, 100, 100), rect(300, 0, 100, 180)).h, 180);
  assert.equal(laneGeometry(rect(0, 0), rect(0, 0)), null);
  assert.equal(laneGeometry(null, rect(0, 0)), null);
  assert.equal(laneGeometry(rect(0, 0), undefined), null);
  assert.equal(laneGeometry(rect(0, 0), rect(0.4, 0.4)), null);
});

test('lanePoint spans the attacker leading edge to the defender centre, offset along the normal', () => {
  const lane = laneGeometry(rect(0, 0), rect(300, 0));
  const start = lanePoint(lane, 0, 0);
  assert.equal(start.x, lane.ax + lane.h * LEAD_H);
  assert.equal(start.y, lane.ay);
  const end = lanePoint(lane, 1, 0);
  assert.ok(Math.abs(end.x - lane.bx) < 1e-9);
  const side = lanePoint(lane, 0.5, 10);
  assert.equal(side.y, lane.ay + lane.ny * 10);
});

test('lanePoint on a lane shorter than one card height does not divide by zero', () => {
  const lane = laneGeometry(rect(0, 0), rect(0, 40));
  for (const f of [0, 0.5, 1]) {
    const p = lanePoint(lane, f, 3);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('unionPadded grows the union of two rects by pad on every side', () => {
  const u = unionPadded(rect(0, 0, 100, 100), rect(300, 200, 100, 100), 10);
  assert.deepEqual(u, { left: -10, top: -10, width: 420, height: 320 });
});

test('toLocal and localLane translate into host-local px', () => {
  const host = { left: 50, top: 70, width: 500, height: 500 };
  assert.deepEqual(toLocal(rect(60, 80, 10, 20), host), { left: 10, top: 10, width: 10, height: 20 });
  const lane = laneGeometry(rect(100, 100), rect(400, 100));
  const l = localLane(lane, host);
  assert.equal(l.ax, lane.ax - 50);
  assert.equal(l.by, lane.by - 70);
  assert.equal(l.length, lane.length);
});

test('skyLane drops from above-left of the defender on screen, whichever seat attacks', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (const lane of [laneGeometry(rect(100, 400), rect(100, 100)), laneGeometry(rect(100, 100), rect(100, 400))]) {
    const sky = skyLane(lane);
    const top = lanePoint(sky, 0);
    assert.ok(near(top.x, lane.bx - SKY_LEAN * lane.h) && near(top.y, lane.by - SKY_HEIGHT * lane.h), 'starts in the sky');
    const end = lanePoint(sky, 1);
    assert.ok(near(end.x, lane.bx) && near(end.y, lane.by), 'lands on the defender centre');
    assert.ok(near(Math.hypot(sky.ux, sky.uy), 1));
    assert.ok(sky.uy > 0 && sky.ux > 0, 'falls down and to the right on screen');
    assert.ok(near(sky.nx, -sky.uy) && near(sky.ny, sky.ux), 'left normal');
    assert.ok(near(sky.angleDeg, (Math.atan2(sky.uy, sky.ux) * 180) / Math.PI));
    assert.equal(sky.h, lane.h);
    assert.equal(sky.bx, lane.bx);
  }
  const steep = skyLane(laneGeometry(rect(0, 0), rect(300, 0)), { height: 2, lean: 0 });
  assert.ok(near(steep.ux, 0) && near(steep.uy, 1), 'no lean drops straight down');
});

test('phaseProgress is null outside [start, end) and linear inside', () => {
  assert.equal(phaseProgress(99, [100, 200]), null);
  assert.equal(phaseProgress(200, [100, 200]), null);
  assert.equal(phaseProgress(100, [100, 200]), 0);
  assert.equal(phaseProgress(150, [100, 200]), 0.5);
  assert.equal(phaseProgress(Number.NaN, [100, 200]), null);
});
