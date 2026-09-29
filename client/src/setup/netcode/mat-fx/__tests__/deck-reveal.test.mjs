import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_REVEAL_SPREAD,
  REVEAL_IN_STAGGER_MS,
  REVEAL_OUT_STAGGER_MS,
  SELF_REVEAL_HOLD_MS,
  deckRevealHold,
  deckRevealTimes,
  revealHoldFor,
  revealShineFrames,
} from '../deck-reveal.mjs';
import { OPP_PLAY_HOLD_MS, OPP_PLAY_MS, PREVIEW_GROW_MS, PREVIEW_PLACE_MS, previewPlayMs } from '../opp-play.mjs';

test('revealHoldFor: the opponent holds like their Trainer preview, you like your draw preview', () => {
  assert.equal(revealHoldFor('opp'), OPP_PLAY_HOLD_MS);
  assert.equal(revealHoldFor('self'), SELF_REVEAL_HOLD_MS);
  assert.equal(SELF_REVEAL_HOLD_MS, 600);
  assert.equal(revealHoldFor(null), SELF_REVEAL_HOLD_MS);
});

test('deckRevealTimes: one card of the opponent plays exactly the Trainer preview', () => {
  const t = deckRevealTimes(1, OPP_PLAY_HOLD_MS);
  assert.equal(t.count, 1);
  assert.equal(t.start(0), 0);
  assert.equal(t.holdOf(0), OPP_PLAY_HOLD_MS);
  assert.equal(t.duration(0), OPP_PLAY_MS);
  assert.equal(t.total, OPP_PLAY_MS);
});

test('deckRevealTimes: your one card holds 600 ms', () => {
  const t = deckRevealTimes(1, SELF_REVEAL_HOLD_MS);
  assert.equal(t.holdOf(0), 600);
  assert.equal(t.total, 520 + 600 + 300);
  assert.equal(deckRevealHold(1, SELF_REVEAL_HOLD_MS), 1120);
});

test('deckRevealTimes: two cards arrive staggered, hold together, go in staggered', () => {
  const t = deckRevealTimes(2, 1200);
  assert.equal(t.start(1), REVEAL_IN_STAGGER_MS);
  const arrive = (i) => t.start(i) + PREVIEW_GROW_MS;
  const leave = (i) => arrive(i) + t.holdOf(i);
  assert.equal(leave(0), arrive(1) + 1200, 'the first leaves the full hold after the last arrives');
  assert.equal(leave(1) - leave(0), REVEAL_OUT_STAGGER_MS);
  for (const i of [0, 1]) assert.equal(t.start(i) + t.duration(i), leave(i) + PREVIEW_PLACE_MS);
  assert.equal(t.total, 2215);
  assert.equal(deckRevealHold(2, 1200), 2215 - PREVIEW_PLACE_MS);
});

test('deckRevealTimes: no cards play nothing; past the spread the count stops at its slots', () => {
  assert.equal(deckRevealTimes(0, 600).total, 0);
  assert.equal(deckRevealHold(0, 600), 0);
  assert.equal(deckRevealHold(undefined, 600), 0);
  assert.equal(deckRevealTimes(12, 600).count, MAX_REVEAL_SPREAD);
  assert.equal(deckRevealTimes(-3, 600).count, 0);
  assert.equal(deckRevealTimes(1, Number.NaN).holdOf(0), 0);
});

test('revealShineFrames: one sweep as the card settles, offsets in order within [0, 1]', () => {
  for (const duration of [OPP_PLAY_MS, previewPlayMs(600), previewPlayMs(0), 0]) {
    const frames = revealShineFrames(duration);
    const offsets = frames.map((f) => f.offset);
    assert.equal(offsets[0], 0);
    assert.equal(offsets[offsets.length - 1], 1);
    for (let i = 1; i < offsets.length; i++) assert.ok(offsets[i] >= offsets[i - 1], `${duration}: ${offsets}`);
    assert.ok(offsets.every((o) => o >= 0 && o <= 1));
    assert.equal(Math.max(...frames.map((f) => f.opacity)), 0.9);
  }
  const trainer = revealShineFrames(OPP_PLAY_MS).map((f) => f.offset);
  assert.ok(Math.abs(trainer[1] - 0.26) < 0.01 && Math.abs(trainer[3] - 0.46) < 0.01, 'the Trainer preview\'s sweep');
});
