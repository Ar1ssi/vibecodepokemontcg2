import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  BOX_SCREEN_ASPECT,
  LID_CUT_Z,
  MAX_FLYING_CARDS,
  MIN_REST_HEIGHT,
  STACK_DEPTH,
  boxTravel,
  cardPhase,
  cardsLaunched,
  cameraDistance,
  dealTimeline,
  flyingCardCount,
  hoverPlacement,
  lidProgress,
  meshToBox,
  offBoardPlacement,
  restPlacement,
  screenToWorld,
  splitBoxMesh,
  stackDepthAfter,
} from '../deck-box-math.mjs';

const boxMesh = JSON.parse(
  fs.readFileSync(new URL('../../../../assets/deckbox/deck-box.mesh.json', import.meta.url), 'utf8')
);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('meshToBox turns the imported mesh upright with its front toward +z', () => {
  // The box's top (mesh z −9.48) is box y 9.48; its front (mesh y −2.22) faces +z.
  assert.deepEqual(meshToBox([1, -2, -9]), [-1, 9, 2]);
});

test('splitBoxMesh hands every triangle to exactly one half and keeps both submeshes', () => {
  const { body, lid } = splitBoxMesh(boxMesh);
  assert.equal(body.index.length + lid.index.length, boxMesh.i.length);
  assert.equal(body.submeshes.length, 2);
  assert.equal(lid.submeshes.length, 2);
  for (const part of [body, lid]) {
    const counted = part.submeshes.reduce((sum, submesh) => sum + submesh.count, 0);
    assert.equal(counted, part.index.length);
    assert.equal(part.submeshes[0].start, 0);
    assert.equal(part.submeshes[1].start, part.submeshes[0].count);
    assert.ok(part.submeshes.every((submesh) => submesh.count > 0 && submesh.count % 3 === 0));
  }
});

test('splitBoxMesh puts the cap above the groove and the front flap in the lid, the floor in the body', () => {
  const { body, lid } = splitBoxMesh(boxMesh);
  const z = (v) => boxMesh.p[v * 3 + 2];
  const y = (v) => boxMesh.p[v * 3 + 1];
  const centroidZ = (index, t) => (z(index[t]) + z(index[t + 1]) + z(index[t + 2])) / 3;
  for (let t = 0; t < body.index.length; t += 3) assert.ok(centroidZ(body.index, t) >= LID_CUT_Z);
  // Every lid triangle below the groove is flap: in front of the body's front wall.
  for (let t = 0; t < lid.index.length; t += 3) {
    if (centroidZ(lid.index, t) >= LID_CUT_Z) {
      assert.ok([0, 1, 2].every((k) => y(lid.index[t + k]) < -2.03));
    }
  }
  // The flap reaches almost to the bottom of the box: the lowest lid vertex is below z −0.5.
  const lowest = Math.max(...lid.index.map(z));
  assert.ok(lowest > -0.5 && lowest < -0.3, `lowest lid vertex z ${lowest}`);
});

test('splitBoxMesh hinges the lid on the back edge of the cut, rims nested inside the walls', () => {
  const { hinge, rim, cutY } = splitBoxMesh(boxMesh);
  assert.ok(near(cutY, 6.25));
  assert.ok(near(hinge.y, 6.25));
  assert.ok(hinge.z < -2.0 && hinge.z > -2.2, `hinge z ${hinge.z}`);
  assert.ok(rim.inner.x0 > rim.outer.x0 && rim.inner.x1 < rim.outer.x1);
  assert.ok(rim.inner.z0 > rim.outer.z0 && rim.inner.z1 < rim.outer.z1);
  // The body's front wall, not the flap, bounds the outer rim at the front.
  assert.ok(rim.outer.z1 < 2.1, `outer rim front z ${rim.outer.z1}`);
});

const board = { left: 0, top: 540, width: 1450, height: 540 };
const mat = { left: 285, top: 540, width: 880, height: 416 };
const rightDeck = { left: 1020, top: 589, width: 105, height: 125 };

test('restPlacement sits a right-side deck’s box in the right band, level with the deck', () => {
  const rest = restPlacement({ deckRect: rightDeck, matRect: mat, boardRect: board });
  assert.equal(rest.side, 'right');
  assert.ok(near(rest.cx, 1165 + 285 / 2));
  assert.ok(near(rest.cy, 589 + 125 / 2));
  assert.ok(near(rest.height, 125 * 1.15));
});

test('restPlacement mirrors to the left band for a deck left of the mat’s centre', () => {
  const leftDeck = { left: 330, top: 600, width: 105, height: 125 };
  const rest = restPlacement({ deckRect: leftDeck, matRect: mat, boardRect: board });
  assert.equal(rest.side, 'left');
  assert.ok(near(rest.cx, 285 / 2));
});

test('restPlacement shrinks the box to the band and refuses a band too narrow to hold one', () => {
  const narrow = { ...mat, width: 1450 - 285 - 100 }; // right band 100 px wide
  const fitted = restPlacement({ deckRect: rightDeck, matRect: narrow, boardRect: board });
  assert.ok(near(fitted.height, (100 - 24) / BOX_SCREEN_ASPECT));
  const none = { ...mat, width: 1450 - 285 - 40 };
  assert.equal(restPlacement({ deckRect: rightDeck, matRect: none, boardRect: board }), null);
  assert.ok((40 - 24) / BOX_SCREEN_ASPECT < MIN_REST_HEIGHT);
});

test('restPlacement returns null for a missing or empty rect', () => {
  assert.equal(restPlacement({ deckRect: null, matRect: mat, boardRect: board }), null);
  assert.equal(restPlacement({ deckRect: { ...rightDeck, width: 0 }, matRect: mat, boardRect: board }), null);
  assert.equal(restPlacement({ deckRect: rightDeck, matRect: mat, boardRect: { left: NaN, top: 0, width: 1, height: 1 } }), null);
});

test('restPlacement stays inside its board half and steps below chrome it would sit under', () => {
  const lowDeck = { ...rightDeck, top: 1040 };
  const clamped = restPlacement({ deckRect: lowDeck, matRect: mat, boardRect: board });
  assert.ok(near(clamped.cy, 1080 - 12 - clamped.height / 2));

  const buttons = { left: 1200, top: 560, width: 240, height: 80 };
  const dodged = restPlacement({ deckRect: rightDeck, matRect: mat, boardRect: board, avoidRects: [buttons] });
  assert.ok(near(dodged.cy - dodged.height / 2, 640 + 8));
});

test('hoverPlacement floats the box beside its deck toward the mat centre', () => {
  const hover = hoverPlacement({ deckRect: rightDeck, matRect: mat });
  assert.equal(hover.dir, 1);
  assert.ok(near(hover.cx, 1072.5 - 105 * 1.9));
  assert.ok(near(hover.cy, 651.5));
  assert.ok(near(hover.height, 125 * 1.35));
  const leftDeck = { left: 330, top: 200, width: 105, height: 125 };
  assert.equal(hoverPlacement({ deckRect: leftDeck, matRect: mat }).dir, -1);
  assert.equal(hoverPlacement({ deckRect: null, matRect: mat }), null);
});

test('offBoardPlacement starts a box with no band just past the board edge on its deck’s side', () => {
  const hover = hoverPlacement({ deckRect: rightDeck, matRect: mat });
  const start = offBoardPlacement({ hover, boardRect: board });
  assert.equal(start.side, 'right');
  assert.ok(start.cx > board.left + board.width);
  assert.equal(offBoardPlacement({ hover: null, boardRect: board }), null);
});

test('flyingCardCount clamps the deck to at most the flying cap', () => {
  assert.equal(flyingCardCount(60), MAX_FLYING_CARDS);
  assert.equal(flyingCardCount(1), 1);
  assert.equal(flyingCardCount(0), 0);
  assert.equal(flyingCardCount(-5), 0);
  assert.equal(flyingCardCount('x'), 0);
});

test('stackDepthAfter empties the box as the cards leave', () => {
  assert.equal(stackDepthAfter(0, 24), STACK_DEPTH);
  assert.ok(near(stackDepthAfter(12, 24), STACK_DEPTH / 2));
  assert.equal(stackDepthAfter(24, 24), 0);
  assert.equal(stackDepthAfter(3, 0), 0);
});

test('dealTimeline: lift, open, the card stream, the reveal, then the trip home', () => {
  const full = dealTimeline(60);
  assert.equal(full.cards, 24);
  assert.equal(full.lastLandMs, 950 + 23 * 45 + 560);
  assert.equal(full.returnStartMs, full.lastLandMs + 200 - 150);
  assert.equal(full.totalMs, full.returnStartMs + 650);
  assert.ok(full.openStartMs >= full.liftMs);
  assert.ok(full.firstCardMs > full.openStartMs && full.firstCardMs < full.openStartMs + full.openMs);

  const one = dealTimeline(1);
  assert.equal(one.cards, 1);
  assert.equal(one.lastLandMs, 950 + 560);

  const none = dealTimeline(0);
  assert.equal(none.cards, 0);
  assert.equal(none.lastLandMs, 650 + 350);
  assert.ok(none.totalMs > none.lastLandMs);
});

test('cardPhase walks a card from the box to the deck spot', () => {
  const timeline = dealTimeline(24);
  assert.deepEqual(cardPhase(timeline, 2, 950), { phase: 'waiting', u: 0 });
  assert.equal(cardPhase(timeline, 2, 1040).phase, 'rising');
  assert.ok(near(cardPhase(timeline, 2, 1040 + 90).u, 0.5));
  assert.equal(cardPhase(timeline, 2, 1040 + 180).phase, 'travelling');
  assert.ok(near(cardPhase(timeline, 2, 1040 + 180 + 190).u, 0.5));
  assert.deepEqual(cardPhase(timeline, 2, 1040 + 560), { phase: 'landed', u: 1 });
});

test('cardsLaunched counts the cards that have left the box', () => {
  const timeline = dealTimeline(24);
  assert.equal(cardsLaunched(timeline, 0), 0);
  assert.equal(cardsLaunched(timeline, 950), 1);
  assert.equal(cardsLaunched(timeline, 950 + 45), 2);
  assert.equal(cardsLaunched(timeline, 99999), 24);
});

test('lidProgress and boxTravel follow the schedule', () => {
  const timeline = dealTimeline(24);
  assert.equal(lidProgress(timeline, 0), 0);
  assert.ok(near(lidProgress(timeline, 650 + 175), 0.5));
  assert.equal(lidProgress(timeline, 5000), 1);
  assert.deepEqual(boxTravel(timeline, 325), { leg: 'out', u: 0.5 });
  assert.deepEqual(boxTravel(timeline, 2000), { leg: 'hover', u: 1 });
  assert.deepEqual(boxTravel(timeline, timeline.returnStartMs + 325), { leg: 'home', u: 0.5 });
  assert.deepEqual(boxTravel(timeline, timeline.totalMs + 50), { leg: 'home', u: 1 });
});

test('the camera maps one world unit to one CSS pixel at z = 0', () => {
  assert.ok(near(cameraDistance(1080, 20), 540 / Math.tan(Math.PI / 18)));
  assert.deepEqual(screenToWorld({ x: 960, y: 540 }, { width: 1920, height: 1080 }), { x: 0, y: 0 });
  assert.deepEqual(screenToWorld({ x: 0, y: 0 }, { width: 1920, height: 1080 }), { x: -960, y: 540 });
});
