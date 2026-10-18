// Design 074 §D6 (slice E1): the FX bridge's rect providers over an injected scene stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD3D_SETTLE_MS, createBoardRects, fxSettleHoldMs, rectForInstance, seatTurnOf } from '../board-rects.js';
import { cameraFromCssTilt } from '../board-camera.mjs';
import { flatLayout, halfFromViewport } from '../board-layout.mjs';

const VIEW = { w: 1600, h: 900 };
const rect = (left, top, width, height) => ({ left, top, width, height });
const boxed = (box) => ({ getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) });

const sceneStub = ({ rects = {}, zoneRects = {}, layout = null, camera = null, canvasBox = null, hostBox = null } = {}) => ({
  rects: () => rects,
  zoneRects: () => zoneRects,
  inspect: () => ({
    layout,
    cameraDesc: camera,
    canvas: canvasBox ? boxed(canvasBox) : null,
    host: hostBox ? boxed(hostBox) : null,
  }),
});

const projectedScene = (extra = {}) => {
  const half = halfFromViewport(VIEW);
  return sceneStub({
    layout: flatLayout(undefined, half, { viewport: VIEW }),
    camera: cameraFromCssTilt({ viewportW: VIEW.w, viewportH: VIEW.h, nearHalf: half }),
    canvasBox: rect(0, 0, VIEW.w, VIEW.h),
    ...extra,
  });
};

test('rectForInstance: the scene rect when drawn, null when absent or no scene', () => {
  const rects = createBoardRects({ getScene: () => sceneStub({ rects: { 7: rect(10, 20, 60, 84) } }) });
  assert.deepEqual(rects.rectForInstance(7), rect(10, 20, 60, 84));
  assert.equal(rects.rectForInstance(8), null);
  assert.equal(rects.rectForInstance(null), null);
  const none = createBoardRects({ getScene: () => null });
  assert.equal(none.rectForInstance(7), null);
  assert.equal(none.pileRect('self', 'deck'), null);
  assert.equal(none.boardRect('self'), null);
  assert.equal(none.matRect(), null);
  assert.equal(none.matCorners(), null);
});

test('rectForInstance: a degenerate rect or a throwing scene getter reads as absent', () => {
  const flat = createBoardRects({ getScene: () => sceneStub({ rects: { 1: rect(0, 0, 0, 10) } }) });
  assert.equal(flat.rectForInstance(1), null);
  const broken = createBoardRects({
    getScene: () => {
      throw new Error('gone');
    },
  });
  assert.equal(broken.rectForInstance(1), null);
});

test('the module-level providers are null while the 3D board is not running', () => {
  assert.equal(rectForInstance(1), null);
});

test('pileRect: deck / discard / Lost Zone from pile:<side>:<zone>, prizes from the zone plane', () => {
  const rects = createBoardRects({
    getScene: () =>
      sceneStub({
        rects: {
          'pile:self:deck': rect(1, 2, 30, 40),
          'pile:opp:discard': rect(5, 6, 30, 40),
          'pile:self:lostZone': rect(9, 9, 30, 40),
        },
        zoneRects: { 'self:prizes': rect(100, 200, 80, 120), 'opp:bench': rect(0, 0, 10, 10) },
      }),
  });
  assert.deepEqual(rects.pileRect('self', 'deck'), rect(1, 2, 30, 40));
  assert.deepEqual(rects.pileRect('opp', 'discard'), rect(5, 6, 30, 40));
  assert.deepEqual(rects.pileRect('self', 'lostZone'), rect(9, 9, 30, 40));
  assert.deepEqual(rects.pileRect('self', 'prizes'), rect(100, 200, 80, 120));
  assert.equal(rects.pileRect('opp', 'deck'), null);
  assert.equal(rects.pileRect('opp', 'prizes'), null);
  assert.equal(rects.pileRect('self', 'bench'), null);
  assert.equal(rects.pileRect(null, 'deck'), null);
});

test('boardRect: without a projection, the union of the side zones and piles, else the host half', () => {
  const rects = createBoardRects({
    getScene: () =>
      sceneStub({
        rects: { 'pile:self:deck': rect(500, 600, 40, 50) },
        zoneRects: { 'self:active': rect(300, 500, 60, 80), 'self:bench': rect(200, 650, 200, 70), 'opp:active': rect(0, 0, 9, 9) },
        hostBox: rect(0, 0, 1000, 800),
      }),
  });
  assert.deepEqual(rects.boardRect('self'), rect(200, 500, 340, 220));
  assert.deepEqual(rects.boardRect('opp'), rect(0, 0, 9, 9));
  const bare = createBoardRects({ getScene: () => sceneStub({ hostBox: rect(0, 100, 1000, 800) }) });
  assert.deepEqual(bare.boardRect('opp'), rect(0, 100, 1000, 400));
  assert.deepEqual(bare.boardRect('self'), rect(0, 500, 1000, 400));
  assert.deepEqual(bare.matRect(), rect(0, 100, 1000, 800));
  assert.equal(bare.boardRect('shared'), null);
});

test('boardRect / matRect: the projected table halves stack far over near and make up the mat', () => {
  const rects = createBoardRects({ getScene: () => projectedScene() });
  const far = rects.boardRect('opp');
  const near = rects.boardRect('self');
  const mat = rects.matRect();
  for (const r of [far, near, mat]) assert.ok(r.width > 100 && r.height > 50, JSON.stringify(r));
  assert.ok(far.top < near.top, 'far half above the near half');
  assert.ok(Math.abs(far.top + far.height - near.top) < 1, 'the halves meet at the seam');
  assert.ok(far.width < near.width, 'perspective: the far half is narrower');
  assert.ok(Math.abs(mat.top - far.top) < 1e-6 && Math.abs(mat.top + mat.height - (near.top + near.height)) < 1e-6);
  const corners = rects.matCorners();
  assert.equal(corners.length, 4);
  assert.ok(corners[0].y < corners[3].y, 'far edge first');
  assert.ok(corners[1].x - corners[0].x < corners[2].x - corners[3].x, 'trapezoid: far edge shorter');
});

test('boardRect / matRect follow the canvas page offset', () => {
  const at0 = createBoardRects({ getScene: () => projectedScene() }).matRect();
  const shifted = createBoardRects({
    getScene: () => projectedScene({ canvasBox: rect(40, 30, VIEW.w, VIEW.h) }),
  }).matRect();
  assert.ok(Math.abs(shifted.left - at0.left - 40) < 1e-6);
  assert.ok(Math.abs(shifted.top - at0.top - 30) < 1e-6);
});

test('seatTurnOf: 180 for the far mirror root, 0 for the near one, null outside the mirror', () => {
  const inRoot = (id) => ({ getRootNode: () => ({ host: { id } }) });
  assert.equal(seatTurnOf(inRoot('oppBoard')), 180);
  assert.equal(seatTurnOf(inRoot('selfBoard')), 0);
  assert.equal(seatTurnOf({ getRootNode: () => ({}) }), null);
  assert.equal(seatTurnOf(null), null);
});

test('fxSettleHoldMs: a card-moving batch waits for the 3D pose tween; nothing else does', () => {
  assert.ok(BOARD3D_SETTLE_MS > 180, 'past board-scene.js CARD_POSE_MS');
  const moved = [{ type: 'damageUpdated' }, { type: 'cardMoved', instanceId: 4, from: 'hand', to: 'bench' }];
  assert.equal(fxSettleHoldMs(moved, true), BOARD3D_SETTLE_MS);
  assert.equal(fxSettleHoldMs([{ type: 'cardsDrawn', cards: [] }], true), BOARD3D_SETTLE_MS);
  assert.equal(fxSettleHoldMs([{ type: 'pokemonEvolved' }], true), BOARD3D_SETTLE_MS);
  assert.equal(fxSettleHoldMs([{ type: 'damageUpdated' }, { type: 'statusApplied' }], true), 0);
  assert.equal(fxSettleHoldMs(moved, false), 0, 'the iframe board never waits');
  assert.equal(fxSettleHoldMs(null, true), 0);
  assert.equal(fxSettleHoldMs([null], true), 0);
  assert.equal(fxSettleHoldMs(moved), 0, 'defaults to the live flag (off under node)');
});
