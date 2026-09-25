import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_SPINS,
  MAX_CEREMONY_FLIPS,
  coinCeremonyTimeline,
  coinFaceLabel,
  coinFlipAngle,
  coinFlipFaces,
  coinTallyText,
} from '../coin-pose.mjs';

test('coinFaceLabel: only the two real faces produce a label', () => {
  assert.equal(coinFaceLabel('heads'), 'HEADS');
  assert.equal(coinFaceLabel('tails'), 'TAILS');
  assert.equal(coinFaceLabel('HEADS'), null, 'the engine emits lowercase');
  assert.equal(coinFaceLabel(undefined), null);
});

test('coinFlipFaces: reads every engine shape that flips a coin', () => {
  assert.deepEqual(coinFlipFaces({ type: 'coinFlipped', face: 'heads' }), ['heads']);
  // Speed Stadium / flip-until-tails: `heads` counted, the run ends on tails.
  assert.deepEqual(coinFlipFaces({ type: 'coinFlipped', face: 'tails', heads: 2 }), ['heads', 'heads', 'tails']);
  assert.deepEqual(coinFlipFaces({ type: 'coinFlipped', face: 'tails', heads: 0 }), ['tails']);
  assert.deepEqual(
    coinFlipFaces({ type: 'attackCoinFlipped', coin: null, headsCount: 1, flips: ['tails', 'heads', 'bogus'] }),
    ['tails', 'heads']
  );
  assert.deepEqual(coinFlipFaces({ type: 'attackCoinFlipped', coin: 'heads' }), ['heads']);
  assert.deepEqual(coinFlipFaces({ type: 'attackMarkerCoinFlipped', kind: 'attackFlipOrFail', coin: 'tails' }), ['tails']);
  assert.deepEqual(coinFlipFaces({ type: 'attackFlipGateCoinFlipped', coin: 'heads' }), ['heads']);
});

test('coinFlipFaces: nothing for non-coin or malformed events, capped for long streaks', () => {
  assert.deepEqual(coinFlipFaces(null), []);
  assert.deepEqual(coinFlipFaces({ type: 'coinFlipped' }), []);
  assert.deepEqual(coinFlipFaces({ type: 'coinFlipped', face: 'edge' }), []);
  assert.deepEqual(coinFlipFaces({ type: 'damageUpdated', face: 'heads' }), []);
  assert.equal(coinFlipFaces({ type: 'coinFlipped', face: 'tails', heads: 99 }).length, MAX_CEREMONY_FLIPS);
});

test('coinCeremonyTimeline: one flip keeps the opening ceremony pacing', () => {
  const one = coinCeremonyTimeline(1);
  assert.deepEqual(one.landsAt, [one.tossMs]);
  assert.equal(one.totalMs, one.tossMs + one.holdMs + one.fadeMs);
  assert.ok(one.tossMs >= 2000, 'a toss long enough to follow the coin');
});

test('coinCeremonyTimeline: several flips land in order, faster as the count grows', () => {
  const three = coinCeremonyTimeline(3);
  assert.equal(three.landsAt.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(three.landsAt[i] > three.landsAt[i - 1]);
  assert.equal(three.totalMs, three.landsAt[2] + three.holdMs + three.fadeMs);
  assert.ok(coinCeremonyTimeline(8).tossMs < three.tossMs);
  assert.ok(three.tossMs < coinCeremonyTimeline(1).tossMs);
});

test('coinCeremonyTimeline: reduced motion drops the tumble; bad counts play one flip', () => {
  const reduced = coinCeremonyTimeline(2, { reducedMotion: true });
  assert.equal(reduced.tossMs, 0);
  assert.equal(reduced.landsAt[0], 0);
  assert.equal(coinCeremonyTimeline(0).landsAt.length, 1);
  assert.equal(coinCeremonyTimeline(Number.NaN).landsAt.length, 1);
  assert.equal(coinCeremonyTimeline(500).landsAt.length, MAX_CEREMONY_FLIPS);
});

test('coinFlipAngle: every toss spins forward and shows the right face', () => {
  let previous = 0;
  for (const [i, face] of ['tails', 'heads', 'heads', 'tails'].entries()) {
    const angle = coinFlipAngle(i, face);
    assert.ok(angle - previous >= COIN_SPINS * 360 - 180, 'at least the full spins, never backwards');
    assert.equal(angle % 360, face === 'tails' ? 180 : 0);
    previous = angle;
  }
});

test('coinTallyText: counts the landed flips; silent for a single flip', () => {
  const faces = ['heads', 'tails', 'heads'];
  assert.equal(coinTallyText(faces, 0), 'Flipping 3 coins');
  assert.equal(coinTallyText(faces, 1), '1 of 3 · 1 head');
  assert.equal(coinTallyText(faces, 3), '3 of 3 · 2 heads');
  assert.equal(coinTallyText(['heads'], 1), '');
  assert.equal(coinTallyText(null, 1), '');
});
