import test from 'node:test';
import assert from 'node:assert/strict';

import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { benchSlotRect, flatLayout } from '../board-layout.mjs';
import { CARD_UNITS, cardScaleFor } from '../card-geometry.mjs';
import { handGroupsOf, handPoses, placementPose, posesFor } from '../card-poses.mjs';
import { pilePose, pileThicknessPx } from '../pile-poses.mjs';
import { handFanPoses, handLoweredOffset } from '../hand-fan.mjs';

// sim at 1920×1080 (board-layout.test.mjs): iframe 1449.6 × 540.
const layout = flatLayout(getMatLayout('sim'), { w: 1449.6, h: 540 });

const close = (actual, expected, message, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} vs ${expected}`
  );

const placement = (fields) => ({
  instanceId: 1,
  side: 'self',
  zone: 'active',
  index: 0,
  face: 'front',
  role: 'root',
  host: null,
  stackIndex: 0,
  stackOffset: [0, 0],
  energyToken: null,
  rotation: 0,
  hidden: false,
  ...fields,
});

test('bench slot 2: the slot rect centre at the bench card width', () => {
  const pose = placementPose(placement({ zone: 'bench', index: 2 }), layout);
  const rect = benchSlotRect(layout, 'self', 2);
  close(pose.x, rect.x + rect.w / 2, 'x');
  close(pose.y, rect.y + rect.h / 2, 'y');
  close(pose.widthPx, layout.self.cardBox.bench.w, 'width');
  assert.equal(pose.z, 0);
  assert.equal(pose.yawDeg, 0);
  assert.equal(pose.face, 'front');
});

test('active: zone centre; a Stage peeks up by stackOffset × card width', () => {
  const root = placementPose(placement({}), layout);
  const width = layout.self.cardBox.active.w;
  close(root.x, layout.self.active.x + layout.self.active.w / 2, 'root x');
  const under = placementPose(
    placement({
      role: 'stage',
      host: 9,
      stackIndex: 0,
      stackOffset: [0, 2 / 15],
    }),
    layout
  );
  close(under.y - root.y, (2 / 15) * width, 'stage peek');
  const tool = placementPose(
    placement({
      role: 'tool',
      host: 9,
      stackIndex: 3,
      stackOffset: [1 / 6, 0],
    }),
    layout
  );
  close(tool.x - root.x, width / 6, 'tool shift');
});

test('z rises one card thickness per stack index', () => {
  const pose = placementPose(placement({ stackIndex: 3 }), layout);
  const width = layout.self.cardBox.active.w;
  close(pose.z, 3 * CARD_UNITS.t * cardScaleFor(width), 'z');
});

test('opp: mirrored slot, yaw +180, offsets turned with the seat', () => {
  const self = placementPose(placement({ rotation: 90 }), layout);
  const opp = placementPose(
    placement({ side: 'opp', rotation: 90, stackOffset: [1 / 6, 0] }),
    layout
  );
  assert.equal(self.yawDeg, 90);
  assert.equal(opp.yawDeg, 270);
  const width = layout.opp.cardBox.active.w;
  close(opp.x, -self.x - width / 6, 'opp x (mirrored, shifted toward -x)');
  close(opp.y, 2 * layout.depth - self.y, 'opp y');
});

test('hidden and face are carried', () => {
  const pose = placementPose(placement({ hidden: true, face: 'back' }), layout);
  assert.equal(pose.hidden, true);
  assert.equal(pose.face, 'back');
});

test('energy drawn as a token, hand, deck and loose pile cards have no pose', () => {
  const token = {
    src: 'grass.webp',
    double: false,
    left: 0,
    size: 0.2,
    bottom: 0,
    zIndex: 1,
  };
  assert.equal(
    placementPose(placement({ role: 'energy', energyToken: token }), layout),
    null
  );
  // discard/lostZone without the model's piles: no way to tell the top card.
  for (const zone of ['hand', 'discard', 'lostZone', 'deck']) {
    assert.equal(placementPose(placement({ zone }), layout), null, zone);
  }
  assert.equal(placementPose(null, layout), null);
  assert.equal(placementPose(placement({}), null), null);
});

test('board row: centred along the content box bottom, view order left to right', () => {
  const board = layout.self.board;
  const one = placementPose(placement({ zone: 'board' }), layout, {
    boardCounts: { self: 1 },
  });
  close(one.x, board.x + board.w / 2, 'single card centred');
  const a = placementPose(placement({ zone: 'board', index: 0 }), layout, {
    boardCounts: { self: 2 },
  });
  const b = placementPose(placement({ zone: 'board', index: 1 }), layout, {
    boardCounts: { self: 2 },
  });
  // .25vw margins on both cards: pitch = width + .5vw.
  close(b.x - a.x, a.widthPx + 0.005 * 1449.6, 'pitch');
  close((a.x + b.x) / 2, board.x + board.w / 2, 'row centred');
  // height = content box - 1.5vh, bottom-aligned above a .25vw margin.
  const cardH = board.h - 10 - 0.015 * 540;
  close(a.y, board.y + 5 + 0.0025 * 1449.6 + cardH / 2, 'bottom aligned');
});

test('posesFor: one pose per placed card, keyed by instance id', () => {
  const model = {
    placements: [
      placement({ instanceId: 1 }),
      placement({ instanceId: 2, zone: 'bench', index: 0 }),
      placement({ instanceId: 3, zone: 'hand' }),
      placement({ instanceId: 4, side: 'opp', zone: 'board' }),
      placement({ instanceId: 5, side: 'opp', zone: 'board', index: 1 }),
    ],
  };
  const poses = posesFor(model, layout);
  assert.equal(poses.size, 5);
  assert.deepEqual([...poses.keys()].sort(), [1, 2, 3, 4, 5]);
  // Two far-seat board cards: mirrored, so view order runs toward -x.
  assert.ok(poses.get(5).x < poses.get(4).x);
  assert.equal(posesFor(null, layout).size, 0);
  assert.equal(posesFor(model, null).size, 0);
});

const pileOf = (count, top) => ({ count, top });
const pilesWith = (side, zone, pile) => ({
  self: { discard: pileOf(0, null), lostZone: pileOf(0, null) },
  opp: { discard: pileOf(0, null), lostZone: pileOf(0, null) },
  [side]: { discard: pileOf(0, null), lostZone: pileOf(0, null), [zone]: pile },
});

test('prize slot 3: the slot centre at the prize width, face back carried', () => {
  const pose = placementPose(placement({ zone: 'prizes', index: 3, face: 'back' }), layout);
  const rect = layout.self.prizes[3];
  close(pose.x, rect.x + rect.w / 2, 'x');
  close(pose.y, rect.y + rect.h / 2, 'y');
  close(pose.widthPx, layout.self.cardBox.prizes.w, 'width');
  // Paint order 0, 2, 4, 1, 3, 5: slot 3 is fifth from the bottom.
  close(pose.z, 4 * CARD_UNITS.t * cardScaleFor(pose.widthPx), 'z');
  assert.equal(pose.face, 'back');
  assert.equal(pose.yawDeg, 0);
});

test('discard: the top card rests on the stack height, a buried card has no pose', () => {
  const top = placement({ instanceId: 11, zone: 'discard', index: 6 });
  const buried = placement({ instanceId: 10, zone: 'discard', index: 5 });
  const piles = pilesWith('self', 'discard', pileOf(7, top));
  const pose = placementPose(top, layout, { piles });
  const pile = pilePose('self', 'discard', layout);
  close(pose.x, pile.x, 'x');
  close(pose.y, pile.y, 'y');
  close(pose.widthPx, pile.widthPx, 'width');
  // 7 cards draw min(7, 6) = 6: five plain layers under the face-up top.
  close(pose.z, pileThicknessPx(5, cardScaleFor(pile.widthPx)), 'z on the layers');
  assert.equal(pose.face, 'front');
  assert.equal(placementPose(buried, layout, { piles }), null);
});

test('Lost Zone with one card: the top card lies on the cloth; opp turned 180', () => {
  const only = placement({ instanceId: 12, side: 'opp', zone: 'lostZone', index: 0 });
  const piles = pilesWith('opp', 'lostZone', pileOf(1, only));
  const pose = placementPose(only, layout, { piles });
  assert.equal(pose.z, 0);
  assert.equal(pose.yawDeg, 180);
  close(pose.x, pilePose('opp', 'lostZone', layout).x, 'x');
});

test('posesFor: prizes, the discard top, the hand and the stadium; buried discard has none', () => {
  const top = placement({ instanceId: 22, zone: 'discard', index: 1 });
  const model = {
    nearSeat: 'you',
    placements: [
      placement({ instanceId: 20, zone: 'prizes', index: 0, face: 'back' }),
      placement({ instanceId: 21, zone: 'discard', index: 0 }),
      top,
      placement({ instanceId: 23, zone: 'hand' }),
    ],
    piles: {
      self: { deck: { count: 40, sleeve: 'b.png', layers: 8 }, discard: pileOf(2, top), lostZone: pileOf(0, null) },
      opp: { deck: { count: 0, sleeve: '', layers: 0 }, discard: pileOf(0, null), lostZone: pileOf(0, null) },
    },
    stadium: { instanceId: 30, src: 'stadium.png', name: 'Lab Stadium', facing: 'opp' },
  };
  const poses = posesFor(model, layout);
  assert.deepEqual([...poses.keys()].sort(), [20, 22, 23, 30]);
  const stadium = poses.get(30);
  close(stadium.x, layout.stadium.x + layout.stadium.w / 2, 'stadium x');
  close(stadium.widthPx, layout.stadium.w, 'stadium width');
  assert.equal(stadium.yawDeg, 180);
  assert.equal(stadium.face, 'front');
  assert.equal(stadium.hidden, false);
  assert.equal(posesFor({ ...model, stadium: null }, layout).has(30), false);
});

const handCard = (instanceId, index, fields = {}) =>
  placement({ instanceId, zone: 'hand', index, ...fields });
const handModel = (self, opp = [], stacks = {}) => ({
  nearSeat: 'you',
  placements: [...self, ...opp],
  handStacks: {
    self: stacks.self ?? self.map((p) => [p.instanceId]),
    opp: stacks.opp ?? opp.map((p) => [p.instanceId]),
  },
});
const strip = layout.self.hand;
const handBox = layout.self.cardBox.hand;
const fanOf = (count, extra = {}) =>
  handFanPoses(count, {
    width: strip.width,
    cardW: handBox.w,
    cardH: handBox.h,
    crop: (strip.edgeY - strip.baselineY) / handBox.h,
    ...extra,
  });

test('7-card own hand: the fan poses on the hand strip, upright card bottom on the baseline', () => {
  const cards = Array.from({ length: 7 }, (_, i) => handCard(100 + i, i));
  const poses = handPoses(handModel(cards), layout);
  const fan = fanOf(7);
  const t = CARD_UNITS.t * cardScaleFor(handBox.w);
  cards.forEach((card, i) => {
    const pose = poses.get(card.instanceId);
    close(pose.x, fan[i].x, `card ${i} x`);
    close(pose.y, strip.edgeY + fan[i].y, `card ${i} y`);
    close(pose.yawDeg, -fan[i].yawDeg, `card ${i} yaw (clockwise)`);
    close(pose.z, fan[i].z * t, `card ${i} draw order`);
    close(pose.widthPx, handBox.w, `card ${i} width`);
    assert.equal(pose.face, 'front');
  });
  // The middle card is upright: its bottom edge on the layout's baseline (the DOM's crop).
  close(poses.get(103).y - handBox.h / 2, strip.baselineY, 'middle card bottom', 1e-6);
  // placementPose reads the same map; without it a hand card has no pose.
  assert.deepEqual(placementPose(cards[2], layout, { handPoses: poses }), poses.get(102));
  assert.equal(placementPose(cards[2], layout), null);
});

test('opp hand: the near fan turned 180° about the seam centre, backs', () => {
  const opp = Array.from({ length: 5 }, (_, i) =>
    handCard(200 + i, i, { side: 'opp', face: 'back' })
  );
  const poses = handPoses(handModel([], opp), layout);
  const fan = fanOf(5);
  opp.forEach((card, i) => {
    const pose = poses.get(card.instanceId);
    close(pose.x, -fan[i].x, `opp ${i} x`);
    close(pose.y, 2 * layout.depth - (strip.edgeY + fan[i].y), `opp ${i} y`);
    close(pose.yawDeg, 180 - fan[i].yawDeg, `opp ${i} yaw`);
    assert.equal(pose.face, 'back');
  });
});

test('hand stack of 3: one fanned slot, the three share its pose, front card on top', () => {
  const cards = [
    handCard(1, 0),
    handCard(2, 1),
    handCard(3, 2),
    handCard(4, 3),
    handCard(5, 4),
  ];
  const model = handModel(cards, [], { self: [[1], [2, 3, 4], [5]] });
  assert.deepEqual(handGroupsOf(model, 'self'), [[1], [2, 3, 4], [5]]);
  const poses = handPoses(model, layout);
  const fan = fanOf(3);
  for (const id of [2, 3, 4]) {
    close(poses.get(id).x, fan[1].x, `${id} x`);
    close(poses.get(id).y, strip.edgeY + fan[1].y, `${id} y`);
    close(poses.get(id).yawDeg, -fan[1].yawDeg, `${id} yaw`);
  }
  assert.ok(poses.get(2).z > poses.get(3).z && poses.get(3).z > poses.get(4).z, 'front card on top');
  close(poses.get(5).x, fan[2].x, 'single after the stack takes slot 2');
});

test('hand cards missing from handStacks still get a slot in view order', () => {
  const cards = [handCard(1, 0), handCard(2, 1), handCard(3, 2)];
  const model = handModel(cards, [], { self: [[2]] });
  assert.deepEqual(handGroupsOf(model, 'self'), [[1], [2], [3]]);
  assert.equal(handPoses(model, layout).size, 3);
});

test('hover lifts only the hovered card; lowered drops only the own hand', () => {
  const cards = Array.from({ length: 7 }, (_, i) => handCard(100 + i, i));
  const opp = [handCard(300, 0, { side: 'opp', face: 'back' })];
  const model = handModel(cards, opp);
  const flat = handPoses(model, layout);
  const lifted = handPoses(model, layout, { hover: { instanceId: 103 } });
  const fan = fanOf(7, { hoverIndex: 3 });
  close(lifted.get(103).y - flat.get(103).y, fan[3].lift, 'hovered rises by the fan lift');
  assert.ok(fan[3].lift > 0);
  for (const card of cards) {
    if (card.instanceId === 103) continue;
    close(lifted.get(card.instanceId).y, flat.get(card.instanceId).y, `${card.instanceId} stays down`);
  }
  assert.ok(lifted.get(103).z > Math.max(...cards.filter((c) => c.instanceId !== 103).map((c) => lifted.get(c.instanceId).z)));
  const lowered = handPoses(model, layout, { lowered: true });
  close(flat.get(100).y - lowered.get(100).y, handLoweredOffset(handBox.h), 'own hand drops');
  close(lowered.get(300).y, flat.get(300).y, 'opp hand stays');
});
