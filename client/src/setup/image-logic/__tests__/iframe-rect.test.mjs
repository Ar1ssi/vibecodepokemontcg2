import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLIP_180_MATRIX,
  IDENTITY_MATRIX,
  mapIframeLocalToViewport,
  parseCssMatrix,
  parseTransformOrigin,
} from '../iframe-rect.mjs';

const selfFrame = { left: 0, top: 400, width: 800, height: 400 };
const oppFrame = { left: 0, top: 0, width: 800, height: 400 };

// Deck CSS is right/bottom-anchored next to Active. In iframe-local
// space that is upper-right; after the opp 180° flip it is lower-left
// (near the center seam, opponent's right = viewer's left).
const deckLocal = { left: 720, top: 32, width: 72, height: 112 };

test('parseCssMatrix reads identity, flip, and matrix3d', () => {
  assert.deepEqual(parseCssMatrix('none'), IDENTITY_MATRIX);
  assert.deepEqual(parseCssMatrix('matrix(1, 0, 0, 1, 0, 0)'), IDENTITY_MATRIX);
  assert.deepEqual(parseCssMatrix('matrix(-1, 0, 0, -1, 0, 0)'), FLIP_180_MATRIX);
  assert.deepEqual(
    parseCssMatrix('matrix3d(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'),
    FLIP_180_MATRIX
  );
});

test('parseTransformOrigin falls back when CSSOM is missing', () => {
  assert.deepEqual(parseTransformOrigin('400px 200px', { x: 0, y: 0 }), { x: 400, y: 200 });
  assert.deepEqual(parseTransformOrigin('', { x: 12, y: 8 }), { x: 12, y: 8 });
});

test('identity mapping adds the iframe offset (player 1)', () => {
  const visual = mapIframeLocalToViewport(deckLocal, selfFrame, IDENTITY_MATRIX);
  assert.equal(visual.left, 720);
  assert.equal(visual.top, 432);
  assert.equal(visual.width, 72);
  assert.equal(visual.height, 112);
});

test('180° flip maps the iframe-local deck onto the visual lower-left (player 2)', () => {
  const visual = mapIframeLocalToViewport(deckLocal, oppFrame, FLIP_180_MATRIX);
  assert.equal(visual.left, 800 - 720 - 72);
  assert.equal(visual.top, 400 - 32 - 112);
  assert.equal(visual.width, 72);
  assert.equal(visual.height, 112);
  assert.ok(visual.left < oppFrame.width / 2, 'P2 deck is on the visual left');
  assert.ok(visual.top > 200, 'P2 deck sits near the center seam, not the top edge');
});

test('naive left+offset mapping is the previous P2 coordinate bug', () => {
  const naive = {
    left: oppFrame.left + deckLocal.left,
    top: oppFrame.top + deckLocal.top,
  };
  const visual = mapIframeLocalToViewport(deckLocal, oppFrame, FLIP_180_MATRIX);
  assert.ok(naive.left > oppFrame.width / 2, 'old path sat on the wrong side');
  assert.ok(visual.left < oppFrame.width / 2);
  assert.ok(Math.abs(naive.left - visual.left) > 400);
});

test('P1 and P2 decks stay on opposite sides of the center seam', () => {
  const p1 = mapIframeLocalToViewport(deckLocal, selfFrame, IDENTITY_MATRIX);
  const p2 = mapIframeLocalToViewport(deckLocal, oppFrame, FLIP_180_MATRIX);
  assert.ok(p1.left > 600, 'P1 deck stays on the right');
  assert.ok(p1.top > 400, 'P1 deck stays on the self half');
  assert.ok(p2.left < 200, 'P2 deck stays on the left');
  assert.ok(p2.top < 400, 'P2 deck stays on the opp half');
  assert.ok(p2.top > 200, 'P2 deck is near the seam, not the far edge');
});
