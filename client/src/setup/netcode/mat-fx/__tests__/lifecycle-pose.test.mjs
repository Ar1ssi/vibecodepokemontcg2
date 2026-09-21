import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  energySnapPose,
  evolveBurstPose,
  moveIdsForEvent,
  presentPoseFor,
  presentTargetRect,
  slidePoseFor,
} from '../lifecycle-pose.mjs';
import { captureOrigins, discardOrigins, takeOrigin } from '../origins.mjs';

test('moveIdsForEvent: retreat and swap name both cards, others none', () => {
  assert.deepEqual(moveIdsForEvent({ type: 'cardRetreated', activeId: 1, promotedId: 2 }), [1, 2]);
  assert.deepEqual(
    moveIdsForEvent({ type: 'pokemonSwapped', instanceId: 5, replacedInstanceId: 6 }),
    [5, 6]
  );
  assert.deepEqual(moveIdsForEvent({ type: 'cardRetreated', activeId: 1 }), [1]);
  assert.deepEqual(moveIdsForEvent({ type: 'damageUpdated', instanceId: 1 }), []);
  assert.deepEqual(moveIdsForEvent(null), []);
});

test('evolveBurstPose: invisible at both ends, peaks mid-way', () => {
  assert.ok(Math.abs(evolveBurstPose(0).opacity) < 1e-9);
  assert.ok(Math.abs(evolveBurstPose(1).opacity) < 1e-9);
  assert.ok(evolveBurstPose(0.5).opacity > 0.99);
  assert.ok(evolveBurstPose(0.5).scale > 1);
});

test('energySnapPose: starts large, lands at scale 1 at the snap, then fades', () => {
  assert.ok(energySnapPose(0).scale > 2);
  assert.ok(Math.abs(energySnapPose(0.55).scale - 1) < 1e-9);
  assert.ok(energySnapPose(1).opacity < 1e-9);
  assert.ok(energySnapPose(0.7).glow > 0);
});

test('slidePoseFor: starts at the origin offset, lands at 0, fades at the end', () => {
  const from = { left: 0, top: 300, width: 50, height: 70 };
  const to = { left: 100, top: 0, width: 50, height: 70 };
  const pose = slidePoseFor(from, to);
  assert.deepEqual([pose(0).x, pose(0).y], [-100, 300]);
  assert.equal(pose(0).opacity, 1);
  assert.ok(Math.abs(pose(1).x) < 1e-9 && Math.abs(pose(1).y) < 1e-9);
  assert.equal(pose(1).opacity, 0);
});

test('presentPoseFor: flies in, holds fully visible, fades out', () => {
  const target = presentTargetRect(1000, 800);
  const pose = presentPoseFor({ left: 0, top: 700, width: 40, height: 56 }, target);
  assert.equal(pose(0).opacity, 0);
  assert.deepEqual(pose(0.5), { x: 0, y: 0, scale: 1, opacity: 1 });
  assert.equal(pose(1).opacity, 0);
  const grow = presentPoseFor(null, target);
  assert.ok(grow(0).scale < 1);
});

test('presentTargetRect: centered, card aspect, capped height', () => {
  const r = presentTargetRect(1000, 2000);
  assert.equal(r.height, 420);
  assert.ok(Math.abs(r.left * 2 + r.width - 1000) < 1e-9);
  assert.ok(Math.abs(r.width / r.height - 0.716) < 1e-9);
});

test('origins: captures the pre-diff snapshot, take consumes it, discard drops it', () => {
  const registry = new Map([
    [1, { element: { id: 'a' } }],
    [2, { element: { id: 'b' } }],
    [9, {}],
  ]);
  const captured = [];
  const capture = (user, el) => {
    captured.push([user, el.id]);
    return { rect: { left: 0 }, src: el.id, user };
  };
  captureOrigins(
    [
      { type: 'cardRetreated', activeId: 1, promotedId: 2, playerId: 'p1' },
      { type: 'trainerPlayed', instanceId: 9, playerId: 'p1' },
      { type: 'damageUpdated', instanceId: 1 },
    ],
    registry,
    capture,
    () => 'self'
  );
  assert.deepEqual(captured, [['self', 'a'], ['self', 'b']]);
  assert.equal(takeOrigin(1).src, 'a');
  assert.equal(takeOrigin(1), undefined);
  discardOrigins({ type: 'cardRetreated', activeId: 1, promotedId: 2 });
  assert.equal(takeOrigin(2), undefined);
});
