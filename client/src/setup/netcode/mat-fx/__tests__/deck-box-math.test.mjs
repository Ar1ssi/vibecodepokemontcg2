import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  BAND_MARGIN_PX,
  CARD_SIZE,
  BOX_DEPTH,
  HOVER_PITCH_DEG,
  LID_CUT_Z,
  MAX_FLYING_CARDS,
  REST_YAW_DEG,
  STACK_DEPTH,
  boxScaleFor,
  boxTravel,
  cardPhase,
  cardsLaunched,
  dealTimeline,
  flyingCardCount,
  hoverPose,
  landPose,
  lidProgress,
  meshToBox,
  offTablePose,
  restFootprintPx,
  restPose,
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

// A 1450 px-wide table (x −725 … 725) whose mat art spans x −480 … 480: 245 px bands either side.
const table = { x0: -725, x1: 725 };
const art = { x0: -480, x1: 480 };
const selfDeck = { x: 430, y: 180, widthPx: 88 };
const oppDeck = { x: -430, y: 900, widthPx: 88 };

test('restPose lays a right-side deck’s box on its back in the right band, level with the deck', () => {
  const rest = restPose({ deck: selfDeck, art, table });
  assert.equal(rest.dir, 1);
  assert.ok(near(rest.x, 480 + 245 / 2));
  assert.equal(rest.y, 180);
  assert.ok(near(rest.z, (BOX_DEPTH / 2) * rest.scale));
  assert.equal(rest.pitchDeg, 0);
  assert.equal(rest.yawDeg, -REST_YAW_DEG);
  assert.ok(near(rest.scale, 88 / CARD_SIZE.width));
});

test('restPose mirrors to the left band for the far seat’s deck left of centre', () => {
  const rest = restPose({ deck: oppDeck, art, table });
  assert.equal(rest.dir, -1);
  assert.ok(near(rest.x, -480 - 245 / 2));
  assert.equal(rest.yawDeg, REST_YAW_DEG);
});

test('restPose refuses a band too narrow to hold the box', () => {
  const footprint = restFootprintPx(boxScaleFor(88));
  const fits = { x0: -480.5 - footprint - 2 * BAND_MARGIN_PX, x1: 480.5 + footprint + 2 * BAND_MARGIN_PX };
  assert.ok(restPose({ deck: selfDeck, art, table: fits }));
  const tight = { x0: fits.x0 + 1, x1: fits.x1 - 1 };
  assert.equal(restPose({ deck: selfDeck, art, table: tight }), null);
});

test('restPose with no mat art measures the band from the deck’s outer edge', () => {
  const rest = restPose({ deck: selfDeck, art: null, table });
  assert.ok(near(rest.x, (430 + 44 + 725) / 2));
});

test('restPose returns null for a missing pile or table', () => {
  assert.equal(restPose({ deck: null, art, table }), null);
  assert.equal(restPose({ deck: { ...selfDeck, widthPx: 0 }, art, table }), null);
  assert.equal(restPose({ deck: selfDeck, art, table: { x0: 5, x1: 5 } }), null);
});

test('hoverPose stands the box up over its half beside the deck, toward the centre, turned at the deck', () => {
  const hover = hoverPose({ deck: selfDeck, table });
  assert.equal(hover.dir, 1);
  assert.ok(hover.x < selfDeck.x && hover.x > 0);
  assert.equal(hover.y, selfDeck.y);
  assert.ok(hover.z > 0);
  assert.equal(hover.pitchDeg, HOVER_PITCH_DEG);
  assert.ok(hover.yawDeg < 0);
  const far = hoverPose({ deck: oppDeck, table });
  assert.equal(far.dir, -1);
  assert.ok(far.x > oppDeck.x && far.x < 0);
  assert.equal(far.pitchDeg, HOVER_PITCH_DEG);
  assert.ok(far.yawDeg > 0);
  assert.equal(hoverPose({ deck: null, table }), null);
});

test('offTablePose starts a box with no band just past the table edge on its deck’s side', () => {
  assert.ok(offTablePose({ deck: selfDeck, table }).x > table.x1);
  assert.ok(offTablePose({ deck: oppDeck, table }).x < table.x0);
  assert.equal(offTablePose({ deck: selfDeck, table: null }), null);
});

test('landPose stacks the flying cards from the cloth up to the real deck’s top', () => {
  assert.ok(near(landPose({ deck: selfDeck, k: 0, cards: 24, topZ: 48 }).z, 2));
  assert.ok(near(landPose({ deck: selfDeck, k: 23, cards: 24, topZ: 48 }).z, 48));
  assert.equal(landPose({ deck: selfDeck, k: 99, cards: 24, topZ: 48 }).z, 48);
  assert.equal(landPose({ deck: selfDeck, k: 0, cards: 0, topZ: 48 }).z, 0);
  assert.equal(landPose({ deck: oppDeck, k: 0, cards: 4, topZ: 8, yawDeg: 180 }).yawDeg, 180);
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
