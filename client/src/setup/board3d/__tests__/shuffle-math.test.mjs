// Design 089 D8: the riffle shuffle's pose maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHUFFLE_BEATS,
  SHUFFLE_MAX_CARDS,
  riffleSlot,
  shuffleCardCount,
  shuffleCardPose,
  shuffleDrift,
  shuffleTapPose,
} from '../shuffle-math.mjs';

const close = (a, b, label, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);

test('shuffleCardCount: nothing under two cards, every card of a small pile, a capped share of a large one', () => {
  for (const count of [0, 1, -3, Number.NaN, undefined]) assert.equal(shuffleCardCount(count), 0, String(count));
  assert.equal(shuffleCardCount(2), 2);
  assert.equal(shuffleCardCount(5), 5);
  assert.equal(shuffleCardCount(12), 6);
  assert.equal(shuffleCardCount(30), 10);
  assert.equal(shuffleCardCount(60), SHUFFLE_MAX_CARDS);
});

test('riffleSlot: the lower half goes left, the upper right; the packets interleave onto every level once', () => {
  for (const count of [2, 3, 6, 7, 18]) {
    const slots = Array.from({ length: count }, (_, i) => riffleSlot(i, count));
    assert.deepEqual(
      slots.map((slot) => slot.level).sort((a, b) => a - b),
      Array.from({ length: count }, (_, i) => i),
      `levels of ${count}`
    );
    const left = slots.filter((slot) => slot.side < 0);
    const right = slots.filter((slot) => slot.side > 0);
    assert.equal(left.length, Math.ceil(count / 2));
    assert.ok(left.length - right.length <= 1);
    // The bottom cards of the two packets land first, left before right.
    assert.equal(slots[0].level, 0);
    assert.equal(right[0].level, 1);
  }
});

test('the shuffle starts and ends as the pile: every card centred, flat, on its own level', () => {
  const count = 9;
  for (let index = 0; index < count; index += 1) {
    const start = shuffleCardPose(index, count, 0);
    for (const key of ['x', 'y', 'lift', 'yawDeg', 'rollDeg']) close(start[key], 0, `start ${key} of ${index}`);
    assert.equal(start.level, index);
    const end = shuffleCardPose(index, count, 1);
    close(end.x, 0, `end x ${index}`);
    close(end.lift, 0, `end lift ${index}`);
    close(end.yawDeg, 0, `end yaw ${index}`);
    close(end.rollDeg, 0, `end roll ${index}`);
    assert.equal(end.level, riffleSlot(index, count).level);
  }
});

test('after the cut the two packets lie apart, turned out, their inner edges lifted', () => {
  const count = 8;
  const bottom = shuffleCardPose(0, count, SHUFFLE_BEATS.cutEnd);
  const top = shuffleCardPose(count - 1, count, SHUFFLE_BEATS.cutEnd);
  assert.ok(bottom.x < -0.5 && top.x > 0.5);
  assert.ok(bottom.yawDeg < 0 && top.yawDeg > 0);
  assert.ok(bottom.rollDeg > 10, 'the left packet lifts its right edge');
  assert.ok(top.rollDeg < -10, 'the right packet lifts its left edge');
  // The upper half was set down: its bottom card is on the cloth now.
  assert.equal(shuffleCardPose(4, count, SHUFFLE_BEATS.cutEnd).level, 0);
  // The cut carries the upper half over, not through, the lower one.
  assert.ok(shuffleCardPose(count - 1, count, SHUFFLE_BEATS.cutEnd / 2).lift > 0.2);
});

test('a card moves without jumps: no pose changes much between two close times', () => {
  const count = 10;
  for (let index = 0; index < count; index += 1) {
    let previous = shuffleCardPose(index, count, 0);
    for (let step = 1; step <= 600; step += 1) {
      const pose = shuffleCardPose(index, count, step / 600);
      assert.ok(Math.abs(pose.x - previous.x) < 0.03, `x of ${index} at ${step}`);
      assert.ok(Math.abs(pose.level - previous.level) < 0.6, `level of ${index} at ${step}`);
      assert.ok(Math.abs(pose.yawDeg - previous.yawDeg) < 1, `yaw of ${index} at ${step}`);
      assert.ok(Math.abs(pose.rollDeg - previous.rollDeg) < 3, `roll of ${index} at ${step}`);
      assert.ok(Math.abs(pose.lift - previous.lift) < 0.02, `lift of ${index} at ${step}`);
      previous = pose;
    }
  }
});

test('the riffle drops the packets’ cards in turn: lower cards land before higher ones, left before right', () => {
  const count = 8;
  const landedAt = (index) => {
    const target = riffleSlot(index, count).level;
    for (let step = 0; step <= 1000; step += 1) {
      const pose = shuffleCardPose(index, count, step / 1000);
      if (step / 1000 > SHUFFLE_BEATS.riffleStart && Math.abs(pose.x) < 0.1 && Math.abs(pose.level - target) < 1e-6) return step / 1000;
    }
    return Infinity;
  };
  // Left packet: 0..3, right packet: 4..7.
  assert.ok(landedAt(0) < landedAt(4));
  assert.ok(landedAt(4) < landedAt(1));
  assert.ok(landedAt(3) < landedAt(7));
  assert.ok(landedAt(7) <= SHUFFLE_BEATS.riffleEnd);
});

test('while it waits a card sinks with its packet and never goes under the cloth', () => {
  const count = 12;
  for (let step = 0; step <= 200; step += 1) {
    for (let index = 0; index < count; index += 1) {
      const pose = shuffleCardPose(index, count, step / 200);
      assert.ok(pose.level >= 0 && pose.lift >= 0, `card ${index} at ${step}`);
    }
  }
  const early = shuffleCardPose(5, count, SHUFFLE_BEATS.riffleStart);
  const later = shuffleCardPose(5, count, SHUFFLE_BEATS.riffleStart + 0.1);
  assert.ok(later.level < early.level);
});

test('the riffle drifts off the pile’s spot for the cut and is back when the pile is squared', () => {
  close(shuffleDrift(0), 0, 'start');
  close(shuffleDrift(SHUFFLE_BEATS.cutEnd), 1, 'after the cut');
  close(shuffleDrift((SHUFFLE_BEATS.riffleStart + SHUFFLE_BEATS.riffleEnd) / 2), 1, 'through the riffle');
  close(shuffleDrift(SHUFFLE_BEATS.squareEnd), 0, 'squared');
  close(shuffleDrift(1), 0, 'end');
});

test('reduced motion: the pile only taps, each card on its own level throughout', () => {
  const count = 6;
  for (let index = 0; index < count; index += 1) {
    for (const time of [0, 0.3, 0.7, 1]) {
      const pose = shuffleTapPose(index, count, time);
      assert.equal(pose.level, index);
      close(pose.x, 0, 'x');
      close(pose.rollDeg, 0, 'roll');
    }
    close(shuffleTapPose(index, count, 1).lift, 0, 'ends at rest');
  }
  assert.ok(shuffleTapPose(0, count, 0.12).lift > 0);
});
