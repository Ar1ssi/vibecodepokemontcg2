// Design 074 §D6: the FX bridge's geometry. Mat effects draw in the top document from page-px
// rects; on the three.js board those rects come from the scene's projection instead of the
// playmat iframes' elements. Every reader is null-safe: no scene, no rect.
import { projectToScreen, tableToWorld } from './board-camera.mjs';
import { board3dActive, getBoardScene } from './board3d.js';
import { tableBounds } from './table-uv.mjs';

const SIDES = ['self', 'opp'];
const PILE_KEYS = ['deck', 'discard', 'lostZone'];
const SEAT_TURN = { self: 0, opp: 180 };
/** The mirror's shadow-root hosts (containers.js): a node in one of them is that seat's. */
const SEAT_HOSTS = { selfBoard: 'self', oppBoard: 'opp' };

const isRect = (rect) =>
  Boolean(rect) &&
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;

const plainRect = ({ left, top, width, height }) => ({ left, top, width, height });

const unionOf = (rects) => {
  const list = rects.filter(isRect);
  if (list.length === 0) return null;
  const left = Math.min(...list.map((r) => r.left));
  const top = Math.min(...list.map((r) => r.top));
  return {
    left,
    top,
    width: Math.max(...list.map((r) => r.left + r.width)) - left,
    height: Math.max(...list.map((r) => r.top + r.height)) - top,
  };
};

const boundsOf = (points) => {
  if (points.length === 0 || points.some((point) => !point)) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

const boxOf = (element) => {
  const box = element?.getBoundingClientRect?.();
  return isRect(box) ? plainRect(box) : null;
};

/**
 * @param {{ getScene: () => object|null }} deps `getScene` returns the live board scene
 *   (`board-scene.js`: `rects()`, `zoneRects()`, `inspect()`), or null when none runs.
 */
export function createBoardRects({ getScene }) {
  const scene = () => {
    try {
      return getScene?.() ?? null;
    } catch {
      return null;
    }
  };

  const sceneRects = () => {
    const live = scene();
    const rects = live?.rects?.();
    return rects && typeof rects === 'object' ? rects : {};
  };

  const sceneZoneRects = () => {
    const rects = scene()?.zoneRects?.();
    return rects && typeof rects === 'object' ? rects : {};
  };

  /** Page-px corners (TL, TR, BR, BL on the cloth) of a flat table rect `{ x, y, w, h }`, or null. */
  const projectFlat = (flat) => {
    const { cameraDesc, canvas } = scene()?.inspect?.() ?? {};
    const box = boxOf(canvas);
    if (!cameraDesc || !box || !(flat?.w > 0 && flat?.h > 0)) return null;
    const corners = [
      [flat.x, flat.y + flat.h],
      [flat.x + flat.w, flat.y + flat.h],
      [flat.x + flat.w, flat.y],
      [flat.x, flat.y],
    ].map(([x, y]) => projectToScreen(cameraDesc, tableToWorld({ x, y, z: 0 }, cameraDesc)));
    if (corners.some((point) => !point)) return null;
    return corners.map((point) => ({ x: box.left + point.x, y: box.top + point.y }));
  };

  const layoutOf = () => scene()?.inspect?.()?.layout ?? null;

  /** The scene host's box, split at its middle: the far seat above, the near seat below. */
  const hostHalf = (side) => {
    const box = boxOf(scene()?.inspect?.()?.host);
    if (!box) return null;
    const height = box.height / 2;
    return { ...box, top: side === 'opp' ? box.top : box.top + height, height };
  };

  /** A card's projected page rect (its front face's bounding box), or null when not drawn. */
  const rectForInstance = (instanceId) => {
    if (instanceId === null || instanceId === undefined) return null;
    const rect = sceneRects()[instanceId];
    return isRect(rect) ? plainRect(rect) : null;
  };

  /** A pile's projected footprint: deck / discard / Lost Zone at its top, or the prize grid. */
  const pileRect = (side, zone) => {
    if (!SIDES.includes(side)) return null;
    if (PILE_KEYS.includes(zone)) {
      const rect = sceneRects()[`pile:${side}:${zone}`];
      return isRect(rect) ? plainRect(rect) : null;
    }
    if (zone !== 'prizes') return null;
    const rect = sceneZoneRects()[`${side}:prizes`];
    return isRect(rect) ? plainRect(rect) : null;
  };

  /** The four page-px corners of the cloth (both playfields), or null. */
  const matCorners = () => {
    const layout = layoutOf();
    return layout ? projectFlat(tableBounds(layout)) : null;
  };

  /** The side's half of the table (its playfield, projected), else the union of its zones. */
  const boardRect = (side) => {
    if (!SIDES.includes(side)) return null;
    const layout = layoutOf();
    const table = layout ? tableBounds(layout) : null;
    if (table && table.h > 0) {
      const depth = table.h / 2;
      const half = { x: table.x, y: side === 'opp' ? depth : 0, w: table.w, h: depth };
      const projected = boundsOf(projectFlat(half) ?? []);
      if (isRect(projected)) return projected;
    }
    const zones = Object.entries(sceneZoneRects())
      .filter(([key]) => key.startsWith(`${side}:`))
      .map(([, rect]) => rect);
    const piles = PILE_KEYS.map((zone) => sceneRects()[`pile:${side}:${zone}`]);
    return unionOf([...zones, ...piles]) ?? hostHalf(side);
  };

  /** The whole table's projected bounding box, else the union of both halves. */
  const matRect = () => {
    const projected = boundsOf(matCorners() ?? []);
    if (isRect(projected)) return projected;
    return unionOf(SIDES.map(boardRect));
  };

  return { rectForInstance, pileRect, boardRect, matRect, matCorners };
}

const live = createBoardRects({ getScene: () => (board3dActive() ? getBoardScene() : null) });

export const { rectForInstance, pileRect, boardRect, matRect, matCorners } = live;

/** True while the three.js board is the board on screen (re-exported for the FX modules). */
export { board3dActive };

/**
 * apply-view.js runs the advisory loop (which starts the FX queue) before it fires
 * `board-view-applied`, where board3d.js hands the scene the new model; the scene then tweens
 * each moved card to its new spot over board-scene.js CARD_POSE_MS (180 ms, scene clock = wall
 * time). Effects read the card's rect when they start, so on the 3D board a batch that moves
 * cards waits this long first: the iframe board's DOM is already in place by then.
 */
export const BOARD3D_SETTLE_MS = 200;

/** Events whose cards change zone (or enter the board): their effects aim where the card lands. */
const CARD_MOVE_EVENTS = new Set([
  'cardMoved',
  'zoneMoved',
  'cardsDrawn',
  'openingHandDealt',
  'mulliganTaken',
  'bonusDrawAwarded',
  'cardsRevealed',
  'pokemonEvolved',
  'pokemonDevolved',
  'cardRetreated',
  'pokemonSwapped',
  'pokemonPromoted',
  'trainerPlayed',
  'prizeTaken',
  'prizesTaken',
]);

/** How long the FX queue waits before a view batch's effects (0 off the 3D board or for a batch moving no card). */
export function fxSettleHoldMs(events, active = board3dActive()) {
  if (!active || !Array.isArray(events)) return 0;
  return events.some((event) => CARD_MOVE_EVENTS.has(event?.type)) ? BOARD3D_SETTLE_MS : 0;
}

/**
 * Degrees a mirror node's seat is turned on screen: 0 near, 180 far (card-poses.mjs turns the far
 * seat's cards 180°). Null for a node outside the mirror (the iframe board's frame turn applies).
 */
export function seatTurnOf(element) {
  const host = element?.getRootNode?.()?.host;
  const side = host ? SEAT_HOSTS[host.id] : null;
  return side ? SEAT_TURN[side] : null;
}
