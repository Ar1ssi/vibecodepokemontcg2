import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLIP_180_MATRIX, IDENTITY_MATRIX, mapIframeLocalToViewport } from '../iframe-rect.mjs';
import {
  rectCenter,
  shuffleCardPose,
  shuffleFlightPlan,
  shuffleSpread,
  towardBoardOffset,
  visualCardCount,
} from '../shuffle-pose.mjs';

const selfFrame = { left: 0, top: 400, width: 800, height: 400 };
const oppFrame = { left: 0, top: 0, width: 800, height: 400 };
const deckLocal = { left: 720, top: 32, width: 72, height: 112 };
const boardRect = { left: 0, top: 0, width: 800, height: 800 };

const p1Deck = mapIframeLocalToViewport(deckLocal, selfFrame, IDENTITY_MATRIX);
const p2Deck = mapIframeLocalToViewport(deckLocal, oppFrame, FLIP_180_MATRIX);

test('shuffleSpread is stacked at the ends and open in the middle', () => {
  assert.equal(shuffleSpread(0), 0);
  assert.equal(shuffleSpread(1), 0);
  assert.equal(shuffleSpread(0.5), 1);
  assert.ok(shuffleSpread(0.11) > 0 && shuffleSpread(0.11) < 1);
  assert.ok(shuffleSpread(0.89) > 0 && shuffleSpread(0.89) < 1);
});

test('cards start and finish on the pile', () => {
  const start = shuffleCardPose(3, 10, 0, { radiusX: 80, radiusY: 50 });
  const end = shuffleCardPose(3, 10, 1, { radiusX: 80, radiusY: 50 });
  assert.equal(start.x, 0);
  assert.equal(start.y, 0);
  assert.equal(start.scale, 1);
  assert.equal(end.x, 0);
  assert.equal(Math.abs(end.y), 0);
});

test('mid-shuffle cards sit on a ring, not a single stack', () => {
  const poses = [0, 1, 2, 3].map((i) =>
    shuffleCardPose(i, 8, 0.5, { radiusX: 80, radiusY: 50 })
  );
  const xs = new Set(poses.map((p) => Math.round(p.x)));
  assert.ok(xs.size > 1);
  poses.forEach((p) => {
    assert.ok(Math.hypot(p.x, p.y + 8) > 20);
    assert.equal(p.spread, 1);
  });
});

test('orbit origin pulls toward the playmat center on both sides', () => {
  const p1 = towardBoardOffset(rectCenter(p1Deck), rectCenter(boardRect));
  const p2 = towardBoardOffset(rectCenter(p2Deck), rectCenter(boardRect));
  assert.ok(p1.x < 0, 'P1 deck is right; pull left toward center');
  assert.ok(p1.y < 0, 'P1 deck is low; pull up toward center');
  assert.ok(p2.x > 0, 'P2 deck is left; pull right toward center');
  assert.ok(p2.y > 0, 'P2 deck is high; pull down toward center');
});

test('flight plan keeps every card near its own deck, not the opposite corner', () => {
  const midP1 = shuffleFlightPlan({ deckRect: p1Deck, boardRect, cardCount: 8, t: 0.5 });
  const midP2 = shuffleFlightPlan({ deckRect: p2Deck, boardRect, cardCount: 8, t: 0.5 });

  const mean = (plan) => ({
    x: plan.reduce((s, p) => s + p.x, 0) / plan.length,
    y: plan.reduce((s, p) => s + p.y, 0) / plan.length,
  });
  const p1Mean = mean(midP1);
  const p2Mean = mean(midP2);

  // Translates are relative to that side's deck, so the mean stays near the
  // toward-center offset (~tens of px), never a jump to the other half.
  assert.ok(Math.abs(p1Mean.x) < 80);
  assert.ok(Math.abs(p1Mean.y) < 80);
  assert.ok(Math.abs(p2Mean.x) < 80);
  assert.ok(Math.abs(p2Mean.y) < 80);

  const p1Visual = midP1.map((p) => ({
    x: p1Deck.left + p1Deck.width / 2 + p.x,
    y: p1Deck.top + p1Deck.height / 2 + p.y,
  }));
  const p2Visual = midP2.map((p) => ({
    x: p2Deck.left + p2Deck.width / 2 + p.x,
    y: p2Deck.top + p2Deck.height / 2 + p.y,
  }));

  p1Visual.forEach((p) => {
    assert.ok(p.x > 500, `P1 card x=${p.x} stayed on the self half`);
    assert.ok(p.y > 380, `P1 card y=${p.y} stayed on the self half`);
  });
  p2Visual.forEach((p) => {
    assert.ok(p.x < 300, `P2 card x=${p.x} stayed on the opp half`);
    assert.ok(p.y < 420, `P2 card y=${p.y} stayed on the opp half`);
    assert.ok(p.y > 180, `P2 card y=${p.y} stayed near the seam`);
  });
});

test('visualCardCount skips empty or single-card zones', () => {
  assert.equal(visualCardCount(0), 0);
  assert.equal(visualCardCount(1), 0);
  assert.equal(visualCardCount(2), 6);
  assert.equal(visualCardCount(60), 10);
});
