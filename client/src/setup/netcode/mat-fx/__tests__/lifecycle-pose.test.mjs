import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discardPuffPose,
  energySnapPose,
  moveIdsForEvent,
  presentDimPose,
  presentPoseFor,
  presentSrcFor,
  presentTargetRect,
  promotePose,
  shiftedFromRect,
  slideIdsForEvent,
  slideMeshPose,
  slidePoseFor,
} from '../lifecycle-pose.mjs';
import { captureOrigins, discardOrigins, peekCombatOrigin, takeOrigin } from '../origins.mjs';

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
  assert.deepEqual(pose(0.5), { x: 0, y: 0, scale: 1, rotateY: 0, opacity: 1 });
  assert.ok(pose(0.05).rotateY > 0, 'swings in from a 3D turn');
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
  assert.deepEqual(captured, [['self', 'a'], ['self', 'b'], ['self', 'a']]);
  assert.equal(takeOrigin(1).src, 'a');
  assert.equal(takeOrigin(1), undefined);
  discardOrigins({ type: 'cardRetreated', activeId: 1, promotedId: 2 });
  assert.equal(takeOrigin(2), undefined);
});

test('origins: combat snapshots for attack + damage ids, peeked, rebuilt per batch (edge 5)', () => {
  const registry = new Map([
    [1, { element: { id: 'atk' } }],
    [2, { element: { id: 'def' } }],
  ]);
  const capture = (user, el) => ({ rect: { left: 0 }, src: el.id, user });
  captureOrigins(
    [
      { type: 'damageUpdated', instanceId: 2, damage: 60 },
      { type: 'attackExecuted', attackerId: 1, defenderId: 2, playerId: 'p1' },
    ],
    registry,
    capture,
    () => 'self'
  );
  assert.equal(peekCombatOrigin(1).src, 'atk');
  assert.equal(peekCombatOrigin(2).src, 'def');
  assert.equal(peekCombatOrigin(2).src, 'def');
  captureOrigins([], registry, capture, () => 'self');
  assert.equal(peekCombatOrigin(1), undefined);
});

test('presentSrcFor: prefers the freshly-set element src over a stale currentSrc (opponent hand sleeve fix)', () => {
  const origin = { src: 'card-back.png' };
  // Browser timing (verified in Chromium): setting `src` updates it synchronously,
  // while `currentSrc` still names the loaded card back until the next image task.
  assert.equal(
    presentSrcFor(origin, { src: 'trainer-face.png', currentSrc: 'card-back.png' }),
    'trainer-face.png'
  );
  // No fresh attribute: fall back to the loaded image, then the pre-diff snapshot.
  assert.equal(presentSrcFor(origin, { currentSrc: 'trainer-face.png' }), 'trainer-face.png');
  assert.equal(presentSrcFor(origin, { src: '', currentSrc: '' }), 'card-back.png');
  assert.equal(presentSrcFor(origin, null), 'card-back.png');
  assert.equal(presentSrcFor(null, null), undefined);
});

test('presentDimPose: eases to the peak, holds, clears', () => {
  assert.equal(presentDimPose(0).opacity, 0);
  assert.equal(presentDimPose(0.5, 0.4).opacity, 0.4);
  assert.equal(presentDimPose(1).opacity, 0);
});

// ── Design 024 slice 4: promote, discard ──────────────────────────────────

test('promotePose: rises into the slot and settles at full size', () => {
  const start = promotePose(0);
  const end = promotePose(1);
  assert.ok(start.y > 0, 'starts below the slot');
  assert.ok(Math.abs(end.y) < 1e-9, 'lands in it');
  assert.ok(end.scale > start.scale);
  assert.ok(Math.abs(end.scale - 1) < 1e-9, 'settles at natural size');
});

test('promotePose: the glow blooms then clears', () => {
  assert.equal(promotePose(0).glowOpacity, 0);
  assert.ok(promotePose(0.3).glowOpacity > 0.9);
  assert.ok(promotePose(1).glowOpacity < 0.01);
});

test('discardPuffPose: drifts up, swells and fades to nothing', () => {
  assert.equal(discardPuffPose(0).opacity, 0);
  assert.equal(discardPuffPose(1).opacity, 0);
  assert.ok(discardPuffPose(0.3).opacity > 0.5);
  assert.ok(discardPuffPose(1).y < 0, 'drifts upward');
  assert.ok(discardPuffPose(1).scale > discardPuffPose(0).scale);
});

test('slice-4 poses stay finite and bounded outside [0,1]', () => {
  for (const pose of [promotePose, discardPuffPose]) {
    for (const t of [-1, -0.01, 1.01, 4]) {
      const out = pose(t);
      for (const [key, value] of Object.entries(out)) {
        assert.ok(Number.isFinite(value), `${pose.name} ${key} not finite at ${t}`);
        if (key.toLowerCase().includes('opacity')) {
          assert.ok(value >= 0 && value <= 1, `${pose.name} ${key} out of range at ${t}`);
        }
      }
    }
  }
});

test('slideMeshPose: the slide motion turned by the seat, no opacity', () => {
  const from = { left: 100, top: 400, width: 60, height: 84 };
  const to = { left: 300, top: 200, width: 60, height: 84 };
  const slide = slidePoseFor(from, to);
  const mesh = slideMeshPose(from, to, 180);
  for (const t of [0, 0.3, 0.5, 1]) {
    const { x, y, scale } = slide(t);
    assert.deepEqual(mesh(t), { x, y, scale, rotate: 180 });
  }
  assert.equal(slideMeshPose(from, to)(0.5).rotate, 0, 'no turn given: upright');
  assert.equal(slideMeshPose(from, to, NaN)(0.5).rotate, 0, 'a bad turn is upright too');
});

test('slideMeshPose: fromScale starts the mesh at its old size and lands at the new one', () => {
  const from = { left: 100, top: 400, width: 60, height: 84 };
  const to = { left: 300, top: 200, width: 60, height: 84 };
  const mesh = slideMeshPose(from, to, 0, 1.25);
  assert.equal(mesh(0).scale, 1.25);
  assert.equal(mesh(1).scale, 1);
  assert.equal(slideMeshPose(from, to, 0, 0)(0).scale, 1, 'a bad fromScale is ignored');
});

test('shiftedFromRect: a member moves by the root\'s own offset and keeps its size', () => {
  const rootFrom = { left: 100, top: 400, width: 60, height: 84 };
  const rootTo = { left: 300, top: 200, width: 60, height: 84 };
  const member = { left: 310, top: 190, width: 50, height: 70 };
  assert.deepEqual(shiftedFromRect(member, rootFrom, rootTo), { left: 110, top: 390, width: 50, height: 70 });
  assert.deepEqual(shiftedFromRect(member, rootTo, rootTo), member, 'a root that did not move shifts nothing');
});

test('slideIdsForEvent names the cards a retreat, switch or promote slides', () => {
  assert.deepEqual(slideIdsForEvent({ type: 'cardRetreated', activeId: 4, promotedId: 9 }), [4, 9]);
  assert.deepEqual(slideIdsForEvent({ type: 'pokemonSwapped', instanceId: 3, replacedInstanceId: 5 }), [3, 5]);
  assert.deepEqual(slideIdsForEvent({ type: 'pokemonPromoted', instanceId: 11, playerId: 'p1' }), [11]);
  assert.deepEqual(slideIdsForEvent({ type: 'cardMoved', instanceId: 11 }), []);
  assert.deepEqual(slideIdsForEvent(null), []);
});
