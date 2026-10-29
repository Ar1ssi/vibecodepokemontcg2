import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardFrameDemand } from '../card-frame-demand.mjs';

test('cards at rest: a rects() call between frames does not keep the board drawing', () => {
  const demand = createCardFrameDemand();
  assert.equal(demand.drawn(false), false);
  // The mirror syncs after a frame and reads rects(): a frame is already asked for, nothing moves.
  for (let frame = 0; frame < 5; frame += 1) {
    demand.advancedBetweenFrames(false, true);
    assert.equal(demand.drawn(false), false, `frame ${frame} asks for no more`);
  }
});

test('a tween that a rects() call finishes still counts as moved on the next frame, once', () => {
  const demand = createCardFrameDemand();
  assert.equal(demand.drawn(true), true, 'running');
  demand.advancedBetweenFrames(false, true);
  assert.equal(demand.drawn(false), true, 'the frame after the finish reports the final pose');
  demand.advancedBetweenFrames(false, true);
  assert.equal(demand.drawn(false), false, 'and only that one');
});

test('a tween running while a frame is asked for counts as moved; no frame asked for, nothing is owed', () => {
  const demand = createCardFrameDemand();
  demand.advancedBetweenFrames(true, true);
  assert.equal(demand.drawn(false), true);
  demand.advancedBetweenFrames(true, false);
  assert.equal(demand.drawn(false), false);
});
