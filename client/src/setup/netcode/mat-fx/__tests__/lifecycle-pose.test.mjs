import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  devolveBurstPose,
  discardPuffPose,
  energySnapPose,
  evolveBurstPose,
  evolvePillarPose,
  evolveSilhouettePose,
  moveIdsForEvent,
  presentDimPose,
  presentPoseFor,
  presentSrcFor,
  presentTargetRect,
  promotePose,
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

test('evolveSilhouettePose: white peaks at 0.4, drains to reveal the card', () => {
  assert.equal(evolveSilhouettePose(0).opacity, 0);
  assert.equal(evolveSilhouettePose(0.4).opacity, 1);
  assert.ok(evolveSilhouettePose(0.4).scale > 1);
  assert.equal(evolveSilhouettePose(1).opacity, 0);
  assert.equal(evolveSilhouettePose(1).scale, 1);
});

test('evolvePillarPose: shoots up, then fades out', () => {
  assert.equal(evolvePillarPose(0).scaleY, 0);
  assert.equal(evolvePillarPose(0.35).scaleY, 1);
  assert.equal(evolvePillarPose(1).opacity, 0);
});

test('presentDimPose: eases to the peak, holds, clears', () => {
  assert.equal(presentDimPose(0).opacity, 0);
  assert.equal(presentDimPose(0.5, 0.4).opacity, 0.4);
  assert.equal(presentDimPose(1).opacity, 0);
});

// ── Design 024 slice 4: promote, discard, devolve ──────────────────────────

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

test('devolveBurstPose: the ring collapses inward, the mirror of evolving', () => {
  const evolveRing = [evolveBurstPose(0).ringScale, evolveBurstPose(1).ringScale];
  const devolveRing = [devolveBurstPose(0).ringScale, devolveBurstPose(1).ringScale];
  assert.ok(evolveRing[1] > evolveRing[0], 'evolve expands');
  assert.ok(devolveRing[1] < devolveRing[0], 'devolve contracts');
});

test('devolveBurstPose: shrinks the card where evolving swells it', () => {
  assert.ok(devolveBurstPose(0.5).scale < 1);
  assert.ok(evolveBurstPose(0.5).scale > 1);
});

test('slice-4 poses stay finite and bounded outside [0,1]', () => {
  for (const pose of [promotePose, discardPuffPose, devolveBurstPose]) {
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
