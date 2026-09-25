import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_IN_MS,
  DRAW_OUT_MS,
  DRAW_OUT_STAGGER_MS,
  DRAW_STAGGER_MS,
  MAX_SPREAD,
  SINGLE_HOLD_MS,
  SPREAD_HOLD_MS,
  drawCardTrack,
  drawSceneHold,
  drawSceneTimes,
  drawSpreadRects,
  spreadRows,
} from '../draw-scene.mjs';

const viewport = { width: 1600, height: 900 };
const center = { x: 800, y: 450 };
const deck = { left: 1300, top: 600, width: 70, height: 98 };
const hand = { left: 700, top: 820, width: 60, height: 84 };
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

test('drawSceneTimes: one card holds the preview, a hand holds the spread', () => {
  const one = drawSceneTimes(1);
  assert.equal(one.allIn, DRAW_IN_MS);
  assert.equal(one.holdEnd, DRAW_IN_MS + SINGLE_HOLD_MS);
  assert.equal(one.total, DRAW_IN_MS + SINGLE_HOLD_MS + DRAW_OUT_MS);

  const seven = drawSceneTimes(7);
  assert.equal(seven.inStart(3), 3 * DRAW_STAGGER_MS);
  assert.equal(seven.allIn, 6 * DRAW_STAGGER_MS + DRAW_IN_MS);
  assert.equal(seven.holdEnd, seven.allIn + SPREAD_HOLD_MS);
  assert.equal(seven.outStart(2), seven.holdEnd + 2 * DRAW_OUT_STAGGER_MS);
  assert.equal(seven.total, seven.outStart(6) + DRAW_OUT_MS);

  assert.equal(drawSceneTimes(0).total, 0);
  assert.equal(drawSceneTimes(-3).total, 0);
});

test('spreadRows: four to a row, top row fullest, capped at MAX_SPREAD', () => {
  assert.deepEqual(spreadRows(1), [1]);
  assert.deepEqual(spreadRows(4), [4]);
  assert.deepEqual(spreadRows(5), [3, 2]);
  assert.deepEqual(spreadRows(7), [4, 3]);
  assert.deepEqual(spreadRows(10), [4, 3, 3]);
  assert.deepEqual(spreadRows(14), [4, 3, 3]);
  assert.deepEqual(spreadRows(0), []);
});

test('drawSpreadRects: one card is the big preview, centred', () => {
  const [rect] = drawSpreadRects(1, center, viewport);
  assert.ok(near(rect.height, 378));
  assert.ok(near(centerOf(rect).x, 800) && near(centerOf(rect).y, 450));
});

test('drawSpreadRects: seven cards lay out 4 over 3, centred, inside the size caps', () => {
  const rects = drawSpreadRects(7, center, viewport);
  assert.equal(rects.length, 7);
  const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
  assert.equal(tops.length, 2);
  assert.equal(rects.filter((r) => Math.round(r.top) === tops[0]).length, 4);
  assert.ok(rects[0].height <= viewport.height * 0.3 + 0.01);
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  assert.ok(near((left + right) / 2, 800) && near((top + bottom) / 2, 450));
  assert.ok(right - left <= viewport.width * 0.72 + 0.01);
  // Row-major from the top left: the second card sits right of the first.
  assert.ok(rects[1].left > rects[0].left);
  assert.deepEqual(drawSpreadRects(0, center, viewport), []);
});

test('drawCardTrack: starts on the deck sleeve up, faces up at its slot, lands on the hand card', () => {
  const [slot] = drawSpreadRects(1, center, viewport);
  const track = drawCardTrack({ index: 0, count: 1, deck, slot, hand });
  assert.equal(track.delay, 0);
  assert.equal(track.duration, drawSceneTimes(1).total);

  const start = track.pose(0);
  assert.ok(near(start.x, centerOf(deck).x - 800) && near(start.y, centerOf(deck).y - 450));
  assert.equal(start.flip, 180);
  assert.equal(start.opacity, 0);
  assert.ok(near(start.scale, deck.width / slot.width, 0.01));

  const held = track.pose((DRAW_IN_MS + 200) / track.duration);
  assert.deepEqual({ x: held.x, y: held.y, flip: held.flip, scale: held.scale }, { x: 0, y: 0, flip: 0, scale: 1 });

  const end = track.pose(1);
  assert.ok(near(end.x, centerOf(hand).x - 800) && near(end.y, centerOf(hand).y - 450));
  assert.ok(near(end.scale, hand.width / slot.width, 0.01));
  assert.equal(end.opacity, 1);
});

test('drawCardTrack: overshoots on arrival, then settles for the hold', () => {
  const [slot] = drawSpreadRects(1, center, viewport);
  const track = drawCardTrack({ index: 0, count: 1, deck, slot, hand });
  assert.ok(track.pose(DRAW_IN_MS / track.duration - 1e-6).scale > 1.02);
  assert.equal(track.pose((DRAW_IN_MS + 100) / track.duration).scale, 1);
});

test('drawCardTrack: later cards wait their turn and drop in order', () => {
  const slots = drawSpreadRects(7, center, viewport);
  const times = drawSceneTimes(7);
  const third = drawCardTrack({ index: 2, count: 7, deck, slot: slots[2], hand });
  assert.equal(third.delay, times.inStart(2));
  assert.equal(third.delay + third.duration, times.outStart(2) + DRAW_OUT_MS);
});

test('drawCardTrack: turns from the deck board and to the hand board (opponent side)', () => {
  const [slot] = drawSpreadRects(1, center, viewport);
  const track = drawCardTrack({ index: 0, count: 1, deck, slot, hand, deckTurn: 180, handTurn: -180 });
  assert.equal(track.pose(0).rotate, 180);
  assert.equal(track.pose(0.5).rotate, 0);
  assert.equal(track.pose(1).rotate, 180);
});

test('drawCardTrack: no hand rect fades the card out at its slot', () => {
  const [slot] = drawSpreadRects(1, center, viewport);
  const end = drawCardTrack({ index: 0, count: 1, deck, slot, hand: null }).pose(1);
  assert.equal(end.opacity, 0);
  assert.ok(near(end.x, 0) && near(end.y, 0));
});

test('drawCardTrack: past MAX_SPREAD the card flies from the deck straight to the hand', () => {
  const count = MAX_SPREAD + 2;
  const track = drawCardTrack({ index: MAX_SPREAD, count, deck, slot: null, hand });
  const times = drawSceneTimes(count);
  assert.equal(track.delay + track.duration, times.outStart(MAX_SPREAD) + DRAW_OUT_MS);
  const start = track.pose(0);
  assert.ok(near(start.x, centerOf(deck).x - centerOf(hand).x));
  const end = track.pose(1);
  assert.ok(near(end.x, 0) && near(end.y, 0) && near(end.scale, 1));
  assert.equal(drawCardTrack({ index: MAX_SPREAD, count, deck, slot: null, hand: null }), null);
});

test('drawCardTrack: no slot and no deck', () => {
  assert.equal(drawCardTrack({ index: 0, count: 1, deck, slot: null, hand }), null);
  const [slot] = drawSpreadRects(1, center, viewport);
  const start = drawCardTrack({ index: 0, count: 1, deck: null, slot, hand }).pose(0);
  assert.ok(start.y < 0 && start.flip === 180);
});

test('drawSceneHold: the scene minus the last drop', () => {
  assert.equal(drawSceneHold(0), 0);
  assert.equal(drawSceneHold(1), DRAW_IN_MS + SINGLE_HOLD_MS);
  assert.equal(drawSceneHold(7), drawSceneTimes(7).total - DRAW_OUT_MS);
});

test('drawCardTrack: a card taking over a standing sleeve (a prize) starts fully shown', () => {
  const [slot] = drawSpreadRects(1, center, viewport);
  const prize = { left: 400, top: 300, width: 120, height: 168 };
  const track = drawCardTrack({ index: 0, count: 1, deck: prize, slot, hand, fadeIn: false });
  const start = track.pose(0);
  assert.equal(start.opacity, 1);
  assert.equal(start.flip, 180);
  assert.ok(near(start.x, 460 - 800) && near(start.y, 384 - 450));
});
