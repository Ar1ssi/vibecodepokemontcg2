// Where each placed card sits on the flat table (design 074 §D3 "Cards"). Pure: card-mesh.js
// tweens these poses and turns them into world transforms with board-camera.mjs tableToWorld.
// Active, bench and Trainer-board cards (C2), prizes, the top card of the discard and Lost Zone
// piles and the Stadium (C3); the hand comes in C4. Deck cards are a count only (no placement).
import { CARD_UNITS, cardScaleFor } from './card-geometry.mjs';
import { PLAY_CARD_ASPECT, benchSlotRect } from './board-layout.mjs';
import { pilePose, pileThicknessPx, prizeSlotPose, stadiumPose } from './pile-poses.mjs';
import { pileVisualCount } from './pile-stack.mjs';

/** `#board { padding: 5px }` (self-containers.css:815); `flatLayout`'s board rect includes it. */
const BOARD_PADDING_PX = 5;
/** `#board img { height: calc(100% - 1.5vh); margin: .25vw }` (self-containers.css:823-828). */
const BOARD_CARD_HEIGHT_INSET_VH = 1.5;
const BOARD_CARD_MARGIN_VW = 0.25;

/**
 * @typedef {{ x: number, y: number, z: number, yawDeg: number, face: 'front'|'back',
 *   hidden: boolean, widthPx: number }} CardPose
 *   Flat table px (x right, y up the table, z off the cloth, 0 = the card's resting height in
 *   its stack); `yawDeg` turns the card clockwise as seen from above, like CSS `rotate()`;
 *   `widthPx` is the card's drawn width.
 */

const centreOf = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/** 180° about the seam centre `(0, depth)`: the far seat's copy of a near-seat point. */
const mirrorPoint = (point, depth) => ({ x: -point.x, y: 2 * depth - point.y });

/**
 * The Trainer board row (`#board`: `display: flex; justify-content: center; align-items:
 * flex-end`): cards one zone-height tall less 1.5vh, `.25vw` margins, centred along the bottom
 * of the content box, in view order from the left. A row wider than the box overlaps its cards
 * to fit instead of wrapping (CSS wraps into a scrolled second line the 3D board cannot show).
 * Computed in the near seat's frame; the far seat mirrors it.
 */
function boardSlot(layout, index, count) {
  const rect = layout.self.board;
  const vh = layout.half.h / 100;
  const vw = layout.half.w / 100;
  const inner = {
    x: rect.x + BOARD_PADDING_PX,
    y: rect.y + BOARD_PADDING_PX,
    w: rect.w - 2 * BOARD_PADDING_PX,
    h: rect.h - 2 * BOARD_PADDING_PX,
  };
  const cardH = Math.max(1, inner.h - BOARD_CARD_HEIGHT_INSET_VH * vh);
  const cardW = cardH * PLAY_CARD_ASPECT;
  const margin = BOARD_CARD_MARGIN_VW * vw;
  const n = Math.max(1, count);
  const natural = cardW + 2 * margin;
  const pitch =
    n > 1 ? Math.min(natural, (inner.w - natural) / (n - 1)) : natural;
  const rowW = natural + (n - 1) * pitch;
  const left = inner.x + (inner.w - rowW) / 2;
  return {
    centre: {
      x: left + index * pitch + natural / 2,
      y: inner.y + margin + cardH / 2,
    },
    widthPx: cardW,
  };
}

const OPEN_PILES = new Set(['discard', 'lostZone']);

/**
 * The top card of a discard / Lost Zone pile rests on the plain layers pile-mesh.js draws under
 * it (`pileVisualCount(count) - 1` of them); every other card of the pile has no slot.
 */
function openPileSlot(placement, layout, piles) {
  const pile = piles?.[placement.side]?.[placement.zone];
  if (!pile?.top || pile.top.instanceId !== placement.instanceId) return null;
  const pose = pilePose(placement.side, placement.zone, layout);
  if (!pose) return null;
  const layers = Math.max(0, pileVisualCount(pile.count) - 1);
  return {
    centre: { x: pose.x, y: pose.y },
    widthPx: pose.widthPx,
    z: pileThicknessPx(layers, cardScaleFor(pose.widthPx)),
  };
}

/** Slot centre (flat px), card width and resting height for a placement's zone, or null. */
function slotFor(placement, layout, { boardCounts, piles }) {
  const { side, zone, index } = placement;
  const seat = layout[side];
  if (!seat) return null;
  if (zone === 'active')
    return { centre: centreOf(seat.active), widthPx: seat.cardBox.active.w };
  if (zone === 'bench') {
    return {
      centre: centreOf(benchSlotRect(layout, side, index)),
      widthPx: seat.cardBox.bench.w,
    };
  }
  if (zone === 'board') {
    const slot = boardSlot(layout, index, boardCounts?.[side] ?? index + 1);
    return {
      centre:
        side === 'opp' ? mirrorPoint(slot.centre, layout.depth) : slot.centre,
      widthPx: slot.widthPx,
    };
  }
  if (zone === 'prizes') {
    const pose = prizeSlotPose(side, index, layout);
    return pose && { centre: { x: pose.x, y: pose.y }, widthPx: pose.widthPx, z: pose.z };
  }
  if (OPEN_PILES.has(zone)) return openPileSlot(placement, layout, piles);
  return null;
}

/**
 * @param {import('./board-model.mjs').Placement} placement
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>} layout
 * @param {{ handPoses?: unknown, boardCounts?: { self?: number, opp?: number },
 *   piles?: import('./board-model.mjs').BoardModel['piles'] }} [options]
 *   `boardCounts` = Trainer-board cards per side (the row centres on its length; default: the
 *   card is the row's last). `piles` = the model's piles: a discard / Lost Zone card is placed
 *   only when it is its pile's `top`. `handPoses` is accepted for the hand fan of slice C4 and
 *   not read: hand cards return null here.
 * @returns {CardPose|null} null for hand and deck placements, a discard / Lost Zone card that is
 *   not its pile's top (or without `piles`), and Energy drawn as a token.
 */
export function placementPose(placement, layout, { boardCounts, piles } = {}) {
  if (!placement || !layout) return null;
  if (placement.role === 'energy' && placement.energyToken) return null;
  const slot = slotFor(placement, layout, { boardCounts, piles });
  if (!slot) return null;
  const turn = placement.side === 'opp' ? -1 : 1;
  const [right, up] = placement.stackOffset ?? [0, 0];
  const scale = cardScaleFor(slot.widthPx);
  return {
    x: slot.centre.x + turn * right * slot.widthPx,
    y: slot.centre.y + turn * up * slot.widthPx,
    z: (slot.z || 0) + (placement.stackIndex || 0) * CARD_UNITS.t * scale,
    yawDeg: (placement.rotation || 0) + (placement.side === 'opp' ? 180 : 0),
    face: placement.face === 'back' ? 'back' : 'front',
    hidden: Boolean(placement.hidden),
    widthPx: slot.widthPx,
  };
}

/**
 * The Stadium card's pose (pile-poses.mjs `stadiumPose`), face up.
 * @param {import('./board-model.mjs').BoardModel|null} model
 * @returns {CardPose|null}
 */
export function stadiumCardPose(model, layout) {
  const pose = stadiumPose(model?.stadium ?? null, layout, model?.nearSeat);
  return pose && { ...pose, face: 'front', hidden: false };
}

/**
 * Poses of every placed card, by instance id; the Stadium under its own instance id.
 * @param {import('./board-model.mjs').BoardModel|null} model
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {Map<number, CardPose>}
 */
export function posesFor(model, layout) {
  const poses = new Map();
  if (!model || !layout || !Array.isArray(model.placements)) return poses;
  const boardCounts = { self: 0, opp: 0 };
  for (const p of model.placements) {
    if (p.zone === 'board' && p.side in boardCounts) boardCounts[p.side] += 1;
  }
  for (const placement of model.placements) {
    const pose = placementPose(placement, layout, { boardCounts, piles: model.piles });
    if (pose) poses.set(placement.instanceId, pose);
  }
  const stadium = stadiumCardPose(model, layout);
  if (stadium) poses.set(model.stadium.instanceId, stadium);
  return poses;
}
