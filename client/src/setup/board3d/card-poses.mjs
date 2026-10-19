// Where each placed card sits on the flat table (design 074 §D3 "Cards"). Pure: card-mesh.js
// tweens these poses and turns them into world transforms with board-camera.mjs tableToWorld.
// Active, bench and Trainer-board cards (C2), prizes, the top card of the discard and Lost Zone
// piles and the Stadium (C3), and both hands fanned (C4). Deck cards are a count only.
import { CARD_UNITS, cardScaleFor } from './card-geometry.mjs';
import { PLAY_CARD_ASPECT, benchSlotRect } from './board-layout.mjs';
import { handFanPoses, handLoweredOffset } from './hand-fan.mjs';
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
      centre: centreOf(benchSlotRect(layout, side, placement.slot ?? index)),
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
 * The fanned slots of `side`'s hand, left to right: one per hand-stack group (design 014), each
 * the group's instance ids front card first, as board-model.mjs `handStacks` lists them. Hand
 * cards missing from `handStacks` get a slot of their own; slots follow the hand's view order.
 * @param {import('./board-model.mjs').BoardModel|null} model
 * @param {'self'|'opp'} side
 * @returns {number[][]}
 */
export function handGroupsOf(model, side) {
  const hand = (model?.placements ?? [])
    .filter((p) => p.side === side && p.zone === 'hand')
    .sort((a, b) => a.index - b.index);
  const order = new Map(hand.map((p, i) => [p.instanceId, i]));
  const seen = new Set();
  const groups = [];
  for (const group of model?.handStacks?.[side] ?? []) {
    const ids = (Array.isArray(group) ? group : []).filter((id) => order.has(id) && !seen.has(id));
    if (ids.length === 0) continue;
    for (const id of ids) seen.add(id);
    groups.push(ids);
  }
  for (const p of hand) if (!seen.has(p.instanceId)) groups.push([p.instanceId]);
  return groups.sort((a, b) => order.get(a[0]) - order.get(b[0]));
}

/**
 * Both hands fanned (design 074 §D3 "Hand", hand-fan.mjs): one fan slot per hand-stack group,
 * the fan's screen edge (y = 0) on the hand strip's `edgeY` with the share of a card below it
 * that the layout's `baselineY` gives (the DOM's two-strip card one strip under the edge), so
 * an upright card's bottom sits on the baseline. The far hand is the near fan turned 180° about
 * the seam centre. A group's cards share its slot, the front card on top; the hovered card's
 * slot lifts (`hover.instanceId`, any card of a stack); `lowered` drops the near hand by
 * `handLoweredOffset` (card focus).
 * @param {import('./board-model.mjs').BoardModel|null} model
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ hover?: { instanceId: number }|null, lowered?: boolean }} [options]
 * @returns {Map<number, CardPose>}
 */
export function handPoses(model, layout, { hover = null, lowered = false } = {}) {
  const poses = new Map();
  const strip = layout?.self?.hand;
  if (!model || !strip || !Array.isArray(model.placements)) return poses;
  const { w: cardW, h: cardH } = layout.self.cardBox.hand;
  const crop = (strip.edgeY - strip.baselineY) / cardH;
  const thickness = CARD_UNITS.t * cardScaleFor(cardW);
  const byId = new Map(model.placements.map((p) => [p.instanceId, p]));
  const hoverId = hover?.instanceId ?? null;
  for (const side of ['self', 'opp']) {
    const groups = handGroupsOf(model, side);
    if (groups.length === 0) continue;
    const fan = handFanPoses(groups.length, {
      width: strip.width,
      cardW,
      cardH,
      crop,
      hoverIndex: groups.findIndex((ids) => ids.includes(hoverId)),
    });
    const depth = Math.max(...groups.map((ids) => ids.length));
    const drop = side === 'self' && lowered ? handLoweredOffset(cardH) : 0;
    groups.forEach((ids, slot) => {
      const card = fan[slot];
      const near = { x: card.x, y: strip.edgeY + card.y - drop };
      const centre = side === 'opp' ? mirrorPoint(near, layout.depth) : near;
      ids.forEach((id, layer) => {
        const placement = byId.get(id);
        poses.set(id, {
          x: centre.x,
          y: centre.y,
          // Slots in the fan's draw order, a group's cards under its front card.
          z: (card.z * depth + (depth - 1 - layer)) * thickness,
          // The fan turns counter-clockwise; a CardPose turns clockwise.
          yawDeg: 0 - card.yawDeg + (side === 'opp' ? 180 : 0),
          face: placement.face === 'back' ? 'back' : 'front',
          hidden: Boolean(placement.hidden),
          widthPx: cardW,
        });
      });
    });
  }
  return poses;
}

/**
 * @param {import('./board-model.mjs').Placement} placement
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>} layout
 * @param {{ handPoses?: Map<number, CardPose>, boardCounts?: { self?: number, opp?: number },
 *   piles?: import('./board-model.mjs').BoardModel['piles'] }} [options]
 *   `boardCounts` = Trainer-board cards per side (the row centres on its length; default: the
 *   card is the row's last). `piles` = the model's piles: a discard / Lost Zone card is placed
 *   only when it is its pile's `top`. `handPoses` = `handPoses(model, layout)`: a hand card's
 *   pose is its entry there.
 * @returns {CardPose|null} null for deck placements, a hand card without `handPoses`, a discard /
 *   Lost Zone card that is not its pile's top (or without `piles`), and Energy drawn as a token.
 */
export function placementPose(placement, layout, { boardCounts, piles, handPoses: fanned } = {}) {
  if (!placement || !layout) return null;
  if (placement.zone === 'hand') return fanned?.get(placement.instanceId) ?? null;
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

/** mat-ambient.css "Board card hover lift": `scale: 1.045` about the card's bottom edge. */
export const BOARD_HOVER_SCALE = 1.045;
/** Its `drop-shadow(0 6px 8px …)`: the scene's shadow grows with height, so the card rises. */
export const BOARD_HOVER_LIFT_PX = 6;

/**
 * A hovered Trainer-board card's pose: grown by BOARD_HOVER_SCALE with its bottom edge kept
 * (`transform-origin: 50% 100%`) and lifted. The iframe rule named Active and Bench too, but
 * their cards sat in a `.play-container`, out of its `#active > img` reach: only the Trainer
 * board ever lifted.
 * @param {CardPose} pose
 * @returns {CardPose}
 */
export function boardHoverPose(pose) {
  const grow = ((BOARD_HOVER_SCALE - 1) * pose.widthPx * (CARD_UNITS.h / CARD_UNITS.w)) / 2;
  const yaw = (pose.yawDeg * Math.PI) / 180;
  // The card's top edge points along +y turned clockwise by its yaw.
  return {
    ...pose,
    x: pose.x + Math.sin(yaw) * grow,
    y: pose.y + Math.cos(yaw) * grow,
    z: pose.z + BOARD_HOVER_LIFT_PX,
    widthPx: pose.widthPx * BOARD_HOVER_SCALE,
  };
}

/**
 * Poses of every placed card, by instance id; the Stadium under its own instance id.
 * @param {import('./board-model.mjs').BoardModel|null} model
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ hover?: { instanceId: number }|null, lowered?: boolean }} [options] see `handPoses`;
 *   a hovered Trainer-board card lifts too (`boardHoverPose`)
 * @returns {Map<number, CardPose>}
 */
export function posesFor(model, layout, { hover = null, lowered = false } = {}) {
  const poses = new Map();
  if (!model || !layout || !Array.isArray(model.placements)) return poses;
  const boardCounts = { self: 0, opp: 0 };
  for (const p of model.placements) {
    if (p.zone === 'board' && p.side in boardCounts) boardCounts[p.side] += 1;
  }
  const fanned = handPoses(model, layout, { hover, lowered });
  const hoverId = hover?.instanceId ?? null;
  for (const placement of model.placements) {
    const pose = placementPose(placement, layout, { boardCounts, piles: model.piles, handPoses: fanned });
    if (!pose) continue;
    const lifted = placement.instanceId === hoverId && placement.zone === 'board';
    poses.set(placement.instanceId, lifted ? boardHoverPose(pose) : pose);
  }
  const stadium = stadiumCardPose(model, layout);
  if (stadium) poses.set(model.stadium.instanceId, stadium);
  return poses;
}
