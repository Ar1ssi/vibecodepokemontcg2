import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CEREMONY_FLIPS, coinCeremonyTimeline, coinFlipAngle } from '../coin-pose.mjs';
import { TCGL_TOSS_MS, coinPoseAt, tcglCeremonyTimeline, tcglTossMs } from '../coin-flip-anim.mjs';

// CoinFlipOverlay.cs GetEstimatedRuntimeForFlip sums flipCountDurations per flip, the last entry repeating.
const GAME_RUNTIME_MS = { 1: 2000, 2: 3000, 3: 4000, 4: 4500, 5: 5000, 6: 5500 };

test('tosses use the game durations, the last one repeating', () => {
  assert.deepEqual(TCGL_TOSS_MS, [2000, 1000, 1000, 500, 500]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(tcglTossMs), [2000, 1000, 1000, 500, 500, 500, 500]);
});

test('the ceremony length matches the game estimate for each flip count', () => {
  for (const [count, runtimeMs] of Object.entries(GAME_RUNTIME_MS)) {
    const { landsAt } = tcglCeremonyTimeline(Number(count));
    assert.equal(landsAt.at(-1), runtimeMs, `${count} flips`);
  }
});

test('tosses run back to back and each landing is the end of its toss', () => {
  const { tossesMs, landsAt, holdMs, fadeMs, totalMs } = tcglCeremonyTimeline(3);
  assert.deepEqual(tossesMs, [2000, 1000, 1000]);
  assert.deepEqual(landsAt, [2000, 3000, 4000]);
  assert.equal(totalMs, 4000 + holdMs + fadeMs);
});

test('hold and fade match the existing ceremony', () => {
  const { holdMs, fadeMs } = coinCeremonyTimeline(1);
  const { holdMs: tcglHold, fadeMs: tcglFade } = tcglCeremonyTimeline(1);
  assert.equal(tcglHold, holdMs);
  assert.equal(tcglFade, fadeMs);
});

test('an invalid flip count plays one toss; a huge one is capped', () => {
  for (const count of [0, -4, Number.NaN, 2.5, undefined]) {
    assert.equal(tcglCeremonyTimeline(count).tossesMs.length, 1, `count ${count}`);
  }
  assert.equal(tcglCeremonyTimeline(10_000).tossesMs.length, MAX_CEREMONY_FLIPS);
});

test('each landing shows its own face: heads at a multiple of 360, tails at 180 past one', () => {
  const faces = ['heads', 'tails', 'heads', 'tails', 'tails'];
  const { landsAt } = tcglCeremonyTimeline(faces.length);
  landsAt.forEach((landAt, index) => {
    const pose = coinPoseAt(faces, landAt);
    assert.equal(pose.index, Math.min(index + 1, faces.length - 1));
    assert.equal(pose.angle, coinFlipAngle(index, faces[index]), `toss ${index}`);
    assert.equal(((pose.angle % 360) + 360) % 360, faces[index] === 'tails' ? 180 : 0, `toss ${index} face`);
    assert.equal(pose.lift, 0);
  });
});

test('the last toss holds on its landing after the ceremony ends', () => {
  const faces = ['tails', 'heads'];
  const { totalMs } = tcglCeremonyTimeline(faces.length);
  const pose = coinPoseAt(faces, totalMs);
  assert.equal(pose.index, 1);
  assert.equal(pose.angle, coinFlipAngle(1, 'heads'));
  assert.equal(pose.lift, 0);
});

test('a toss arcs up and comes down, reaching the top at mid-toss', () => {
  const faces = ['heads'];
  assert.equal(coinPoseAt(faces, 0).lift, 0);
  assert.equal(coinPoseAt(faces, 1000).lift, 1);
  assert.ok(coinPoseAt(faces, 1999).lift < 0.01);
});

test('just before a landing the coin is almost at the landing angle', () => {
  const faces = ['tails', 'heads'];
  const { landsAt } = tcglCeremonyTimeline(faces.length);
  const pose = coinPoseAt(faces, landsAt[0] - 1);
  assert.equal(pose.index, 0);
  assert.ok(Math.abs(pose.angle - coinFlipAngle(0, 'tails')) < 0.01);
});

test('the coin never turns backwards across the whole ceremony', () => {
  const faces = ['heads', 'tails', 'tails', 'heads', 'tails', 'heads'];
  const { totalMs } = tcglCeremonyTimeline(faces.length);
  let previous = -Infinity;
  for (let elapsedMs = 0; elapsedMs <= totalMs; elapsedMs += 25) {
    const { angle } = coinPoseAt(faces, elapsedMs);
    assert.ok(angle >= previous, `angle fell at ${elapsedMs} ms`);
    previous = angle;
  }
});

test('times before the first toss use the table pose; faces past the cap are ignored', () => {
  assert.deepEqual(coinPoseAt(['heads'], -50), { index: 0, angle: 0, lift: 0 });
  const many = Array.from({ length: MAX_CEREMONY_FLIPS + 5 }, () => 'heads');
  assert.equal(coinPoseAt(many, 1e9).index, MAX_CEREMONY_FLIPS - 1);
});

test('no faces or a non-finite time has no pose', () => {
  assert.equal(coinPoseAt([], 100), null);
  assert.equal(coinPoseAt(undefined, 100), null);
  assert.equal(coinPoseAt(['heads'], Number.NaN), null);
});
