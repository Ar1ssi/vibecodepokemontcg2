import test from 'node:test';
import assert from 'node:assert/strict';

import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { benchSlotRect, flatLayout } from '../board-layout.mjs';
import { CARD_UNITS, cardScaleFor } from '../card-geometry.mjs';
import { placementPose, posesFor } from '../card-poses.mjs';

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

test('energy drawn as a token and zones of later slices have no pose', () => {
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
  for (const zone of ['hand', 'prizes', 'discard', 'lostZone', 'deck']) {
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
  assert.equal(poses.size, 4);
  assert.deepEqual([...poses.keys()], [1, 2, 4, 5]);
  // Two far-seat board cards: mirrored, so view order runs toward -x.
  assert.ok(poses.get(5).x < poses.get(4).x);
  assert.equal(posesFor(null, layout).size, 0);
  assert.equal(posesFor(model, null).size, 0);
});
