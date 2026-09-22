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
  abilityTagPose,
  abilityTagRect,
  abilityTagText,
  sweepPose,
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

test('abilityTagText: names the sole ability, else falls back to the event name', () => {
  assert.deepEqual(abilityTagText({ abilities: [{ name: ' Psychic Embrace ' }] }, 'Gardevoir ex'), {
    title: 'Psychic Embrace',
    sub: 'Ability',
  });
  assert.deepEqual(abilityTagText({ abilities: [{ name: 'A' }, { name: 'B' }] }, 'Mew'), { title: 'Mew', sub: 'Ability' });
  assert.deepEqual(abilityTagText(null, 'Mew'), { title: 'Mew', sub: 'Ability' });
  assert.equal(abilityTagText({ abilities: [{}] }, ''), null);
});

test('abilityTagRect: centered on the card, clamped inside the viewport', () => {
  const vp = { width: 800, height: 600 };
  const mid = abilityTagRect({ left: 380, top: 300, width: 40, height: 56 }, vp);
  assert.equal(mid.width, 170);
  assert.ok(Math.abs(mid.left + mid.width / 2 - 400) < 1e-9);
  const edge = abilityTagRect({ left: 0, top: 0, width: 40, height: 56 }, vp);
  assert.equal(edge.left, 0);
  assert.equal(edge.top, 0);
  const right = abilityTagRect({ left: 780, top: 590, width: 40, height: 56 }, vp);
  assert.equal(right.left + right.width, 800);
  assert.ok(right.top + right.height <= 600);
});

test('abilityTagPose: pops past full size, holds, fades out rising', () => {
  assert.equal(abilityTagPose(0).opacity, 0);
  assert.ok(abilityTagPose(0.12).scale > 1);
  assert.deepEqual(abilityTagPose(0.5), { y: 0, scale: 1, opacity: 1 });
  assert.ok(abilityTagPose(1).y < 0);
  assert.equal(abilityTagPose(1).opacity, 0);
});

test('sweepPose: hidden outside its window, crosses -1 to 1', () => {
  assert.equal(sweepPose(0).opacity, 0);
  assert.equal(sweepPose(0.35, { start: 0.2, end: 0.5 }).opacity, 1);
  assert.equal(sweepPose(1).x, 1);
  assert.equal(sweepPose(0).x, -1);
});

test('confettiPieces: a third fall from the top, the rest fire from both corners and arc up', () => {
  const pieces = confettiPieces(CONFETTI_COUNT, 5);
  const kinds = new Set(pieces.map((p) => p.cannon));
  assert.deepEqual([...kinds].sort(), ['left', 'right', 'top']);
  const left = pieces.find((p) => p.cannon === 'left');
  const start = confettiPiecePose(left, left.delay + 0.001);
  const apex = confettiPiecePose(left, 0.5);
  assert.ok(apex.y < start.y - 0.4, 'rises well up the screen');
  assert.ok(apex.x > start.x, 'left cannon fires rightward');
  assert.ok(confettiPiecePose(left, 1).y > apex.y, 'falls back down');
});
