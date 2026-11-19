import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainedCeremonySlot, coinCeremonyTimeline } from '../coin-pose.mjs';

const timeline = coinCeremonyTimeline(1);

test('chainedCeremonySlot: an idle chain holds for the ceremony alone', () => {
  const slot = chainedCeremonySlot(timeline, 1000, 0);
  assert.equal(slot.holdMs, timeline.totalMs - timeline.fadeMs);
  assert.equal(slot.endsAt, 1000 + timeline.totalMs);
});

test('chainedCeremonySlot: a ceremony behind another also holds for the wait', () => {
  const slot = chainedCeremonySlot(timeline, 1000, 1300);
  assert.equal(slot.holdMs, 300 + timeline.totalMs - timeline.fadeMs);
  assert.equal(slot.endsAt, 1300 + timeline.totalMs);
});

test('chainedCeremonySlot: a bad chain time is treated as idle', () => {
  assert.equal(chainedCeremonySlot(timeline, 1000, NaN).endsAt, 1000 + timeline.totalMs);
});
