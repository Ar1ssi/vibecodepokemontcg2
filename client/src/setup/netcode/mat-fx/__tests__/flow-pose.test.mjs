import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFETTI_COUNT,
  DIM_PEAK,
  abilityBannerText,
  bannerPose,
  confettiPiecePose,
  confettiPieces,
  dimPose,
  edgeGlowPose,
  seededRandom,
  turnBannerText,
} from '../flow-pose.mjs';

test('turnBannerText: side-aware title, turn number optional, unknown side -> null', () => {
  assert.deepEqual(turnBannerText('self', 3), { title: 'Your Turn', sub: 'Turn 3' });
  assert.deepEqual(turnBannerText('opp', undefined), { title: "Opponent's Turn", sub: '' });
  assert.equal(turnBannerText(null, 3), null);
});

test('abilityBannerText: trims the name, empty or non-string -> null', () => {
  assert.deepEqual(abilityBannerText('  Sparkle Swap '), { title: 'Sparkle Swap', sub: 'Ability' });
  assert.equal(abilityBannerText('   '), null);
  assert.equal(abilityBannerText(undefined), null);
  assert.equal(abilityBannerText(42), null);
});

test('bannerPose: enters from the left, holds at rest, exits right and fades', () => {
  assert.deepEqual(bannerPose(0), { x: -1, opacity: 0 });
  assert.deepEqual(bannerPose(0.5), { x: 0, opacity: 1 });
  const end = bannerPose(1);
  assert.ok(Math.abs(end.x - 1) < 1e-9);
  assert.ok(end.opacity < 1e-9);
  assert.deepEqual(bannerPose(-5), bannerPose(0));
});

test('edgeGlowPose: fast rise, slow fall to zero', () => {
  assert.equal(edgeGlowPose(0).opacity, 0);
  assert.equal(edgeGlowPose(0.25).opacity, 1);
  assert.ok(edgeGlowPose(1).opacity < 1e-9);
});

test('seededRandom: deterministic, in [0,1), differs by seed', () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const seq = Array.from({ length: 5 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 5 }, () => b()));
  assert.ok(seq.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(seq, Array.from({ length: 5 }, seededRandom(8)));
});

test('confettiPieces: requested count with sane, deterministic parameters', () => {
  const pieces = confettiPieces(undefined, 3);
  assert.equal(pieces.length, CONFETTI_COUNT);
  assert.deepEqual(pieces, confettiPieces(CONFETTI_COUNT, 3));
  for (const p of pieces) {
    assert.ok(p.x0 >= 0 && p.x0 < 1);
    assert.ok(p.delay >= 0 && p.delay < 0.35);
    assert.ok(p.size >= 6 && p.size < 14);
  }
});

test('confettiPiecePose: hidden before its delay, falls past the bottom, fades at the end', () => {
  const piece = { x0: 0.5, delay: 0.2, speed: 1, drift: 0.1, spin: 360, size: 8, hue: 10 };
  assert.equal(confettiPiecePose(piece, 0.1).opacity, 0);
  const mid = confettiPiecePose(piece, 0.6);
  assert.equal(mid.opacity, 1);
  assert.ok(mid.y > -0.05 && mid.y < 1.1);
  const end = confettiPiecePose(piece, 1);
  assert.ok(end.y > 1);
  assert.ok(end.opacity < 1e-9);
});

test('dimPose: rises to the peak, holds, returns to zero', () => {
  assert.equal(dimPose(0).opacity, 0);
  assert.equal(dimPose(0.5).opacity, DIM_PEAK);
  assert.ok(dimPose(1).opacity < 1e-9);
});
