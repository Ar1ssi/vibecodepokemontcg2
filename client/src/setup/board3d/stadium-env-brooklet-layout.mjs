// Design 077 (prototype): where Brooklet Hill's pieces lie (customhb-212), after the place as Pokémon
// Sun and Moon's 3DS map draws it, cross-checked with the card's art (GRI 120), from the board layout
// (board-layout.mjs flatLayout). Every card lies on the lake; the map's land fills the scene round it
// (stadium-environment-layout.mjs sceneBounds), each piece on the side of the lake where the map has
// it, at the map's scale (its lake about as wide as the block of card footprints):
// - past the lake's far-left corner two stone towers holding round pools: the main one standing in
//   the water, its fall pouring into the lake over a row of boulders; the upper one behind it to the
//   left, spilling into it, a cave in its wall;
// - the left bank a ledge: a stone wall straight up out of the water to a sand top, a walled pool on
//   it spilling into the lake; short of the ledge's front wall, low sand where the lake spills
//   through a notch into a stone-walled basin a step down, big boulders either side of the spill and
//   small ones in the water before it;
// - along the near shore a sand path with a fence at its cliff's edge, grass past it, a boulder in
//   the shallows where the path ends;
// - on the far and right banks a beach under a dark earth cliff, grass terraces with round bushes, a
//   plank pier off the right beach in a bay of its own, two big boulders on the right shore;
// - rocks under the surface out in open water.
// The board's cameras see little of the scene past the table's sides: where a side of the lake has no
// room inside the view (the sim mat's cards run to the table's side edges), its pieces move round to
// the near shore. stadium-env-brooklet.mjs draws all of it. Pure: no three.js, no DOM.
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

export const BROOKLET_KEY = 'brooklet-hill';

/** The lake's core reaches this far round the block of card footprints, its corners rounded this much. */
export const LAKE_MARGIN_PX = 40;
export const LAKE_CORNER_PX = 70;
/** The shore wanders out (more water) up to SHORE_OUT_PX and in up to SHORE_IN_PX off the core and its bays. */
export const SHORE_OUT_PX = 18;
export const SHORE_IN_PX = 6;
/** Bays (ellipses) the lake opens into the land, merging into its core over BAY_BLEND_PX. */
export const BAY_MAX = 4;
export const BAY_BLEND_PX = 50;

/**
 * The part of the scene every camera sees (both presets, 1366 to 2560 px windows): the table's width,
 * VIEW_NEAR_SHARE of its depth past its near edge, VIEW_FAR_SHARE past its far edge. The map's pieces
 * go inside it; the land runs on past it to the scene's edges.
 */
export const VIEW_NEAR_SHARE = 0.1;
export const VIEW_FAR_SHARE = 0.2;

/**
 * Which ground lies where round the lake, as the map lays it out: the hill (the ledge and the flats
 * short of it) left of HILL_X_SHARE of the core's width and up past HILL_Y_SHARE of its depth (past
 * the basin when the spill is on the left shore); the near shore's path (sand left of PATH_END_SHARE
 * of the core's width, grass past it) and its drop below the core's near edge and in the hill's
 * column short of the hill; the banks' beach, cliffs and grass everywhere else. Each meets the next
 * over ZONE_BLEND_PX.
 */
export const HILL_X_SHARE = 0.2;
export const HILL_Y_SHARE = 0.08;
export const PATH_END_SHARE = 0.3;
export const ZONE_BLEND_PX = 90;

/**
 * The hill: past the ledge's front edge (ledgeFront) a sand top LEDGE_TOP_PX high, its stone walls
 * (stonework) straight up from the water and along the front edge, a light coping LEDGE_COPING_PX
 * wide along their tops; short of the front edge sand flats rising FLATS_RISE_PX over FLATS_RUN_PX
 * from the water. The front edge wanders by LEDGE_FRONT_WANDER_PX.
 */
export const LEDGE_TOP_PX = 56;
export const LEDGE_COPING_PX = 12;
export const LEDGE_FRONT_WANDER_PX = 14;
export const FLATS_RISE_PX = 8;
export const FLATS_RUN_PX = 50;
/** The ledge's wall follows the shore in steps this long, at most LEDGE_WALK_MAX of them. */
const LEDGE_STEP_PX = 6;
const LEDGE_WALK_MAX = 500;
/**
 * The banks: a beach BEACH_PX wide (wandering BEACH_WANDER_PX) rising BEACH_RISE_PX, a dark earth
 * cliff rising CLIFF_RISE_PX over CLIFF_RUN_PX to grass, and TERRACE_PX further on a second cliff up
 * TERRACE_RISE_PX.
 */
export const BEACH_PX = 74;
export const BEACH_WANDER_PX = 22;
export const BEACH_RISE_PX = 6;
export const CLIFF_RISE_PX = 40;
export const CLIFF_RUN_PX = 14;
export const TERRACE_PX = 150;
export const TERRACE_RISE_PX = 32;
/** The near shore: a path PATH_PX wide (wandering PATH_WANDER_PX) PATH_RISE_PX up, then a cliff dropping DROP_PX over DROP_RUN_PX. */
export const PATH_PX = 56;
export const PATH_WANDER_PX = 10;
export const PATH_RISE_PX = 5;
export const DROP_PX = 50;
export const DROP_RUN_PX = 14;

/** Stone towers holding round pools (the main, the upper, the side and the middle pool): walls TOWER_WALL_PX thick, the water POOL_SINK_PX under the rim. */
export const TOWER_MAX = 4;
export const TOWER_WALL_PX = 30;
export const POOL_SINK_PX = 7;
/**
 * The far-left group, as the map has it: the main tower MAIN_TOWER.share of the way along the lake's
 * far edge from its left end, its front wall `front` px past that edge in the water; the upper tower
 * and the cave in its wall (over the ledge's top) at offsets (px) from the main one's centre.
 */
const MAIN_TOWER = Object.freeze({ share: 0.12, front: 14, r: 140, rim: 92 });
const UPPER_TOWER = Object.freeze({ x: -290, y: -86, r: 160, rim: 128 });
const CAVE = Object.freeze({ x: -340, halfWidth: 22, height: 36 });
/** The side pool: a tower SIDE_POOL.share of the way down the left shore from its far end, `gap` px off it, standing a little over the ledge, its fall into the lake. */
const SIDE_POOL = Object.freeze({ share: 0.38, gap: 6, r: 92, rim: 74 });
/**
 * The middle pool: a tower on the ledge between the side pool and the upper tower, `gap` px off each,
 * up to `r` across, its rim `rise` px over the side pool's, spilling into it: the map's pools stepping
 * down the hill.
 */
const MIDDLE_POOL = Object.freeze({ r: 74, gap: 12, rise: 26 });
/** The left bank's pieces need this much room between the lake and the view's left edge. */
const SIDE_ROOM_PX = 170;
/**
 * The spill: the lake pours through a notch in the basin's kerb into the basin a step down, `share`
 * of the way down the left shore from its far end (on the near shore `nearShare` of the way along from
 * its left end when the left has no room). In the spill's frame, u px out of the lake and v px along
 * the shore (toward the far end on the left shore): the bay the lake opens there and the basin past
 * it (a circle); the ledge's front edge stands `ledge` px past the bay's far end.
 */
const SPILL = Object.freeze({
  share: 0.7,
  nearShare: 0.12,
  bay: { u: 26, v: 0, ru: 74, rv: 84 },
  basin: { u: 178, v: -12, r: 84 },
  halfWidth: 22,
  ledge: 40,
});
export const BASIN_LEVEL_PX = -24;
/** The basin's kerb: KERB_PX thick, its top KERB_TOP_PX over the lake. */
export const KERB_PX = 14;
export const KERB_TOP_PX = 12;
/** The near shore needs this much room inside the view for the spill to move there. */
const SPILL_NEAR_ROOM_PX = 140;
/** Stone, sand and pools keep at least this far from every card footprint. */
export const STRUCTURE_CARD_GAP_PX = 24;
/**
 * The towers, the basin's kerb and the ledge's walls are meshes of their own (stonework), so their
 * walls stand straight and clean; the ground's field holds them too, STONEWORK_INSET_PX inside the
 * meshes and STONEWORK_DROP_PX lower, so the meshes hide the field's grid-stepped edges while the
 * field still casts their shadows. Walls run down to STONEWORK_FOOT_PX, under the ground and the lake
 * bed, in segments about STONEWORK_SEGMENT_PX long.
 */
export const STONEWORK_INSET_PX = 4;
export const STONEWORK_DROP_PX = 3;
export const STONEWORK_FOOT_PX = -32;
const STONEWORK_SEGMENT_PX = 7;
/** What each stonework vertex belongs to. */
export const STONEWORK_PARTS = Object.freeze({ wall: 0, coping: 1, innerWall: 2, cheek: 3, ledgeTop: 4, ledgeWall: 5 });
/** A stonework vertex's levels when nothing below it is water: its wall's foot meets the ground. */
export const STONEWORK_ON_GROUND = -1e4;

/**
 * Falls: at most FALL_MAX, each a sheet from a lip out over its drop. kind: 0 into the lake, 1 into a
 * tower's pool, 2 into the basin.
 */
export const FALL_MAX = 5;
export const FALL_KINDS = Object.freeze({ lake: 0, pool: 1, basin: 2 });

/** Boulders: the main fall's row, the spill's, one in the shallows at the path's end, a pair on the right shore. */
export const ROCK_MAX = 16;
/** Boulder middle to card footprint, at least its radius plus this. */
export const ROCK_CARD_GAP_PX = 10;
/** The map's row at the main fall's foot: px across its line and out along it from where it lands. */
const FALL_ROW = Object.freeze([
  { across: -72, out: 34, r: 13 },
  { across: -4, out: 18, r: 26 },
  { across: 58, out: 26, r: 13 },
  { across: 118, out: 6, r: 12 },
]);
/** The map's rocks round the spill in its frame: the big two flanking the notch at the bay's back, small ones in the bay before it. */
const SPILL_ROCKS = Object.freeze([
  { u: 82, v: 74, r: 50 },
  { u: 76, v: -84, r: 54 },
  { u: 34, v: -2, r: 24 },
  { u: 12, v: 48, r: 13 },
  { u: 14, v: -46, r: 15 },
  { u: -8, v: 14, r: 11 },
]);
/** The boulder in the shallows where the path ends, NEAR_ROCK.share of the way along the near shore. */
const NEAR_ROCK = Object.freeze({ share: 0.27, r: 26 });
/** The right shore's pair, shares of the way up it from its near end (on the near shore's right end when the right has no room). */
const RIGHT_PAIR = Object.freeze([
  { share: 0.2, nearShare: 0.86, r: 54 },
  { share: 0.32, nearShare: 0.95, r: 46 },
]);
/** A shore boulder sits half in the water: the shore crosses it this share of its radius past its middle. */
const SHORE_ROCK_SINK = 0.38;
/** Rocks lying under the surface out in open water, biggest first. */
export const SUNKEN_MAX = 3;
const SUNKEN_SIZES = Object.freeze([36, 30, 26]);
export const SUNKEN_OFFSHORE_PX = 40;
export const SUNKEN_CARD_GAP_PX = 12;
export const SUNKEN_SPACING_PX = 240;
const SUNKEN_STEP_PX = 12;

/** Round bushes on the banks' grass. */
export const TREE_MAX = 10;
/** A bush stands on grass at least this far past its cliff's top, and this far from every card. */
export const TREE_GRASS_PX = 8;
export const TREE_CARD_GAP_PX = 30;
/**
 * The map's bushes, at offsets (px) from the lake's far-right corner: a cluster of small ones past
 * the corner, big ones down the right bank, a few on the far bank. Each takes the nearest spot on
 * grass in view within TREE_SEARCH_PX of its own.
 */
const BUSHES = Object.freeze([
  { x: 70, y: 125, r: 20 },
  { x: 102, y: 146, r: 18 },
  { x: 126, y: 112, r: 20 },
  { x: 150, y: 20, r: 34 },
  { x: 168, y: -52, r: 34 },
  { x: 205, y: -172, r: 37 },
  { x: 185, y: -330, r: 30 },
  { x: -120, y: 150, r: 26 },
  { x: -260, y: 132, r: 22 },
  { x: 230, y: 60, r: 28 },
]);
const TREE_SEARCH_PX = 220;
const TREE_STEP_PX = 8;

/** The pier: two plank sections DOCK_HALF_WIDTH_PX each side of its line, up to DOCK_LENGTH_PX out from its landing. */
export const DOCK_HALF_WIDTH_PX = 36;
const DOCK_MIN_HALF_WIDTH_PX = 26;
export const DOCK_LENGTH_PX = 260;
export const DOCK_MIN_LENGTH_PX = 110;
/** How far the pier runs onto the beach behind its shore point. */
export const DOCK_LANDING_PX = 30;
export const DOCK_CARD_GAP_PX = 12;
const DOCK_STEP_PX = 6;
/** The pier's bay: its outer shore `reach` px past the core's edge, radii out of the lake and along the shore. */
const DOCK_BAY = Object.freeze({ reach: 190, rOut: 150, rAlong: 105, minReach: 90 });
/** The pier's side of the lake by preference, with where along it the map puts the pier. */
const DOCK_SIDES = Object.freeze([
  { side: 1, prefer: 0.55 },
  { side: 0, prefer: 0.78 },
  { side: 2, prefer: 0.2 },
]);

/** The fence along the near path's cliff edge: posts this far apart, this far in from the edge. */
export const FENCE_MAX_POSTS = 16;
export const FENCE_SPACING_PX = 38;
export const FENCE_INSET_PX = 8;
/** The fence's walk along the path's edge: steps this long, at most FENCE_WALK_MAX of them. */
const FENCE_STEP_PX = 4;
const FENCE_WALK_MAX = 600;

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;

const distanceToRect = (x, y, rect) => {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
};

/** px from (x, y) to the nearest card footprint (Infinity without any). */
export const cardGap = (rects, x, y) => rects.reduce((nearest, rect) => Math.min(nearest, distanceToRect(x, y, rect)), Infinity);

const smoothstep = (from, to, x) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** The shaders' smin: the smaller of a and b, blended over k. */
export const smin = (a, b, k) => {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};

/** A repeatable 0..1 for a point, so picks never change between loads. */
const spotHash = (x, y, salt = 0) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

/** Signed px from a rounded box `{ x0, y0, x1, y1, r }`, negative inside. */
export function boxDistance(box, x, y) {
  const halfW = (box.x1 - box.x0) / 2;
  const halfH = (box.y1 - box.y0) / 2;
  const qx = Math.abs(x - (box.x0 + halfW)) - halfW + box.r;
  const qy = Math.abs(y - (box.y0 + halfH)) - halfH + box.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - box.r;
}

/** Signed px, near enough, from an ellipse `{ x, y, rx, ry }`, negative inside (the shaders' ellipseDistance). */
export const ellipseDistance = (e, x, y) => (Math.hypot((x - e.x) / e.rx, (y - e.y) / e.ry) - 1) * Math.min(e.rx, e.ry);

/** Wanders, -1..1, as sums of sines so the shaders (shoreWander, beachWander, pathWander) trace the very same lines. */
export const shoreWander = (x, y) =>
  0.5 * Math.sin(0.0123 * x + 0.0091 * y + 1.7) + 0.3 * Math.sin(0.031 * x - 0.024 * y + 4.1) + 0.2 * Math.sin(0.067 * x + 0.052 * y + 0.3);
export const beachWander = (x, y) => 0.6 * Math.sin(0.0087 * x - 0.0113 * y + 2.9) + 0.4 * Math.sin(0.023 * x + 0.019 * y + 0.6);
export const pathWander = (x, y) => 0.6 * Math.sin(0.0101 * x + 0.004 * y + 0.4) + 0.4 * Math.sin(0.027 * x - 0.013 * y + 3.3);
export const frontWander = (x) => 0.6 * Math.sin(0.021 * x + 1.3) + 0.4 * Math.sin(0.047 * x + 4.2);
/** The ledge's front edge, its y at x, for the edge set at `ledgeY` (the shaders' ledgeFront). */
export const ledgeFront = (ledgeY, x) => ledgeY + LEDGE_FRONT_WANDER_PX * frontWander(x);

/**
 * Signed px from the lake's shore at (x, y), positive on land: the core and its bays merged softly,
 * the shore wandering out up to SHORE_OUT_PX and in up to SHORE_IN_PX (the shaders' landDistance).
 * @param {{ core: { x0: number, y0: number, x1: number, y1: number, r: number },
 *   bays: { x: number, y: number, rx: number, ry: number }[] }} spots
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function lakeDistance({ core, bays }, x, y) {
  let d = boxDistance(core, x, y);
  for (const bay of bays) d = smin(d, ellipseDistance(bay, x, y), BAY_BLEND_PX);
  return d + (SHORE_IN_PX - SHORE_OUT_PX) / 2 + ((SHORE_IN_PX + SHORE_OUT_PX) / 2) * shoreWander(x, y);
}

/** Share of the hill's ground (the ledge and the flats short of it) at (x, y): the shaders' hillShare. */
export function hillShare(zones, x, y) {
  const half = ZONE_BLEND_PX / 2;
  return smoothstep(zones.hillX + half, zones.hillX - half, x) * smoothstep(zones.hillY - half, zones.hillY + half, y);
}

/** Share of the near shore's path and drop at (x, y), where the hill doesn't have it: the shaders' nearShare. */
export const nearShare = (zones, x, y) =>
  (1 - hillShare(zones, x, y)) *
  Math.max(
    smoothstep(zones.nearY + ZONE_BLEND_PX * 0.4, zones.nearY - ZONE_BLEND_PX * 0.4, y),
    smoothstep(zones.hillX + ZONE_BLEND_PX / 2, zones.hillX - ZONE_BLEND_PX / 2, x)
  );

/** The beach's width on a bank at (x, y): the shaders' beachWidth. */
export const beachWidth = (x, y) => BEACH_PX + BEACH_WANDER_PX * beachWander(x, y);
/** The near path's width at (x, y): the shaders' pathWidth. */
export const pathWidth = (x, y) => PATH_PX + PATH_WANDER_PX * pathWander(x, y);

/** The view box (VIEW_NEAR_SHARE, VIEW_FAR_SHARE) as x0, y0, x1, y1. */
const viewBox = (table) => ({
  x0: table.x,
  x1: table.x + table.w,
  y0: table.y - VIEW_NEAR_SHARE * table.h,
  y1: table.y + table.h * (1 + VIEW_FAR_SHARE),
});

const insideBox = (box, x, y, margin = 0) => x - margin >= box.x0 && x + margin <= box.x1 && y - margin >= box.y0 && y + margin <= box.y1;

/** The lake's core: the block of card footprints grown by LAKE_MARGIN_PX; without cards, the table's middle. */
const lakeCore = (rects, table) => {
  if (!rects.length) {
    return { x0: table.x + table.w * 0.25, y0: table.y + table.h * 0.2, x1: table.x + table.w * 0.75, y1: table.y + table.h * 0.8, r: LAKE_CORNER_PX };
  }
  return {
    x0: Math.min(...rects.map((rect) => rect.x)) - LAKE_MARGIN_PX,
    y0: Math.min(...rects.map((rect) => rect.y)) - LAKE_MARGIN_PX,
    x1: Math.max(...rects.map((rect) => rect.x + rect.w)) + LAKE_MARGIN_PX,
    y1: Math.max(...rects.map((rect) => rect.y + rect.h)) + LAKE_MARGIN_PX,
    r: LAKE_CORNER_PX,
  };
};

/**
 * The point `t` (0..1) of the way along one side of the core's box and the way out of the lake there.
 * Sides: 0 near (left to right), 1 right (near to far), 2 far (right to left), 3 left (far to near).
 */
const sidePoint = (core, side, t) => {
  const w = core.x1 - core.x0;
  const h = core.y1 - core.y0;
  if (side === 0) return { x: core.x0 + t * w, y: core.y0, out: { x: 0, y: -1 } };
  if (side === 1) return { x: core.x1, y: core.y0 + t * h, out: { x: 1, y: 0 } };
  if (side === 2) return { x: core.x1 - t * w, y: core.y1, out: { x: 0, y: 1 } };
  return { x: core.x0, y: core.y1 - t * h, out: { x: -1, y: 0 } };
};

/** px of room in view past each side of the core (sides as sidePoint's). */
const roomPast = (core, view) => [core.y0 - view.y0, view.x1 - core.x1, view.y1 - core.y1, core.x0 - view.x0];

/** A frame on the shore: the point at `origin`, u out of the lake along `out`, v along the shore (toward the far end on the left shore). */
const frameAt = (origin, out) => ({ origin, out, along: { x: out.y, y: -out.x } });
const framePoint = (frame, u, v) => ({
  x: frame.origin.x + frame.out.x * u + frame.along.x * v,
  y: frame.origin.y + frame.out.y * u + frame.along.y * v,
});
/** An ellipse in a frame: centre (u, v), radius ru out of the lake and rv along the shore. */
const frameEllipse = (frame, { u, v, ru, rv }) => {
  const centre = framePoint(frame, u, v);
  const acrossX = Math.abs(frame.out.x) > 0.5;
  return { x: centre.x, y: centre.y, rx: acrossX ? ru : rv, ry: acrossX ? rv : ru };
};

const circleGap = (rects, c) => cardGap(rects, c.x, c.y) - c.r;

const atTurn = (c, r, turn) => ({ x: c.x + Math.cos(turn) * r, y: c.y + Math.sin(turn) * r });

/** Moves a shape along `away` (unit) in 6 px steps until `gapOf` clears STRUCTURE_CARD_GAP_PX; null if it never does. */
const pushClear = (shape, away, gapOf) => {
  let moved = shape;
  for (let step = 0; step < 60 && gapOf(moved) < STRUCTURE_CARD_GAP_PX; step += 1) {
    moved = { ...moved, x: moved.x + away.x * 6, y: moved.y + away.y * 6 };
  }
  return gapOf(moved) >= STRUCTURE_CARD_GAP_PX ? moved : null;
};

/**
 * The far-left group: the main tower (its notch toward the lake), the upper tower behind it sharing a
 * wall (its notch toward the main one's pool) and the cave in the upper one's wall, opening onto the
 * ledge's top. Each tower: centre, radius `r`, `rim` height, `notch` angle (rad) and the turn its
 * spout spans either side (`notchHalf`). The main tower moves back from any card it would come near.
 */
const placeFarLeft = (core, scene, rects, ledgeY) => {
  const width = core.x1 - core.x0;
  const main = pushClear(
    {
      x: core.x0 + MAIN_TOWER.share * width,
      y: core.y1 + MAIN_TOWER.front + MAIN_TOWER.r,
      r: MAIN_TOWER.r,
      rim: MAIN_TOWER.rim,
      notch: -Math.PI / 2,
      notchHalf: 30 / MAIN_TOWER.r,
    },
    { x: 0, y: 1 },
    (c) => circleGap(rects, c)
  );
  if (!main || main.y - main.r > scene.y + scene.h) return { main: null, upper: null, cave: null };
  const upperCentre = { x: main.x + UPPER_TOWER.x, y: main.y + UPPER_TOWER.y };
  const toMain = Math.atan2(main.y - upperCentre.y, main.x - upperCentre.x);
  const upper = { ...upperCentre, r: UPPER_TOWER.r, rim: UPPER_TOWER.rim, notch: toMain, notchHalf: 24 / UPPER_TOWER.r };
  const upperShown = circleGap(rects, upper) >= STRUCTURE_CARD_GAP_PX && upper.x + upper.r > scene.x;
  const caveX = main.x + CAVE.x;
  const onFace = upperShown && Math.abs(caveX - upper.x) < upper.r * 0.8;
  const caveY = onFace ? upper.y - Math.sqrt(upper.r ** 2 - (caveX - upper.x) ** 2) : 0;
  // Its mouth opens onto the ledge's top, on land and in the scene.
  const cave =
    onFace && caveX - CAVE.halfWidth > scene.x && caveY > ledgeFront(ledgeY, caveX) + 30 && boxDistance(core, caveX, caveY - 10) > 30
      ? { x: caveX, y: caveY, halfWidth: CAVE.halfWidth, height: CAVE.height, floor: LEDGE_TOP_PX }
      : null;
  return { main, upper: upperShown ? upper : null, cave };
};

/**
 * The spill: on the left shore when the left has room in view, else on the near shore; its frame,
 * the bay the lake opens there, the basin (null when it would come near a card or leave the scene):
 * a ring like a tower's with its notch toward the bay, and on the left shore the ledge's front edge
 * (ledgeY, else null).
 */
const placeSpill = (core, room, scene, rects) => {
  let point = null;
  if (room[3] >= SIDE_ROOM_PX) point = sidePoint(core, 3, SPILL.share);
  else if (room[0] >= SPILL_NEAR_ROOM_PX) point = sidePoint(core, 0, SPILL.nearShare);
  if (!point) return null;
  const frame = frameAt({ x: point.x, y: point.y }, point.out);
  const bay = frameEllipse(frame, SPILL.bay);
  const { u, v, r } = SPILL.basin;
  const centre = framePoint(frame, u, v);
  const lip = framePoint(frame, u - r, 0);
  const notch = Math.atan2(lip.y - centre.y, lip.x - centre.x);
  const basin = { ...centre, r, rx: r, ry: r, rim: KERB_TOP_PX, notch, notchHalf: (SPILL.halfWidth + 4) / r };
  const inScene = basin.x - r > scene.x && basin.x + r < scene.x + scene.w && basin.y - r > scene.y && basin.y + r < scene.y + scene.h;
  const clear = inScene && circleGap(rects, basin) >= STRUCTURE_CARD_GAP_PX;
  const ledgeY = Math.abs(point.out.x) > 0.5 ? point.y + SPILL.bay.rv + SPILL.ledge : null;
  return { frame, bay, basin: clear ? basin : null, ledgeY };
};

/** The side pool on the left shore, off the lake by SIDE_POOL.gap, on the ledge, clear of the spill and every card; null otherwise. */
const placeSidePool = (core, rects, ledgeY, spill) => {
  const point = sidePoint(core, 3, SIDE_POOL.share);
  const pool = {
    x: point.x - SIDE_POOL.gap - SIDE_POOL.r,
    y: point.y,
    r: SIDE_POOL.r,
    rim: SIDE_POOL.rim,
    notch: 0,
    notchHalf: 20 / SIDE_POOL.r,
  };
  if (circleGap(rects, pool) < STRUCTURE_CARD_GAP_PX) return null;
  if (pool.y - pool.r < ledgeFront(ledgeY, pool.x) + 10) return null;
  for (const shape of [spill?.bay, spill?.basin].filter(Boolean)) {
    if (ellipseDistance(shape, pool.x, pool.y) < pool.r + 10) return null;
  }
  return pool;
};

/**
 * The middle pool on the line from the side pool's centre to the upper tower's, MIDDLE_POOL.gap off
 * the side pool, as big as the gap to the upper tower allows, its notch toward the side pool; null
 * without both, or where it would come near a card, the lake or the cave's mouth.
 */
const placeMiddlePool = (spots, rects, side, upper, cave) => {
  if (!side || !upper) return null;
  const apart = Math.hypot(upper.x - side.x, upper.y - side.y);
  const r = Math.min(MIDDLE_POOL.r, (apart - side.r - upper.r) / 2 - MIDDLE_POOL.gap);
  if (r < MIDDLE_POOL.r * 0.6) return null;
  const t = (side.r + MIDDLE_POOL.gap + r) / apart;
  const x = side.x + (upper.x - side.x) * t;
  const y = side.y + (upper.y - side.y) * t;
  const pool = { x, y, r, rim: side.rim + MIDDLE_POOL.rise, notch: Math.atan2(side.y - y, side.x - x), notchHalf: 18 / r };
  if (circleGap(rects, pool) < STRUCTURE_CARD_GAP_PX) return null;
  if (lakeDistance(spots, x, y) - r < MIDDLE_POOL.gap) return null;
  if (cave && Math.hypot(cave.x - x, cave.y - y) < r + cave.halfWidth + 20) return null;
  return pool;
};

/** The gradient of `level` (a function of x, y) at (x, y), over a px. */
const gradientOf = (level, x, y) => ({ x: level(x + 0.5, y) - level(x - 0.5, y), y: level(x, y + 0.5) - level(x, y - 0.5) });

/** The point nearest (x, y) where `level` is 0, by Newton steps along its gradient. */
const ontoLevel = (level, x, y) => {
  let point = { x, y };
  for (let i = 0; i < 8; i += 1) {
    const d = level(point.x, point.y);
    if (Math.abs(d) < 0.02) break;
    const g = gradientOf(level, point.x, point.y);
    const g2 = g.x * g.x + g.y * g.y;
    if (g2 < 1e-6) break;
    point = { x: point.x - (d * g.x) / g2, y: point.y - (d * g.y) / g2 };
  }
  return point;
};

/** Where the line y = yAt(x) meets the left shore, x bisected, the line followed as x settles; null if it misses. */
const leftShoreAt = (spots, yAt) => {
  let x = spots.core.x0;
  for (let pass = 0; pass < 4; pass += 1) {
    const y = yAt(x);
    let wet = spots.core.x0 + 30;
    let dry = spots.core.x0 - 260;
    if (!(lakeDistance(spots, wet, y) < 0 && lakeDistance(spots, dry, y) > 0)) return null;
    for (let i = 0; i < 30; i += 1) {
      const middle = (wet + dry) / 2;
      if (lakeDistance(spots, middle, y) < 0) wet = middle;
      else dry = middle;
    }
    x = (wet + dry) / 2;
  }
  return { x, y: yAt(x) };
};

/**
 * The ledge's walls as runs of points, each with the way its face looks (nx, ny): along the front
 * edge from the shore out past the scene's left side, and from the same corner up the shore, round
 * the lake's far-left corner, until the wall meets the main tower, leaves the hill or the scene.
 * Points inside a tower are left out (its own wall stands there), splitting the run. Null without a
 * front edge or where it misses the shore.
 */
const placeLedge = (spots, ledgeY, scene, main, towers) => {
  const corner = leftShoreAt(spots, (x) => ledgeFront(ledgeY, x));
  if (!corner) return null;
  const front = [];
  for (let x = corner.x; x > scene.x - 2 * LEDGE_STEP_PX; x -= LEDGE_STEP_PX) {
    const slope = ledgeFront(ledgeY, x + 0.5) - ledgeFront(ledgeY, x - 0.5);
    const length = Math.hypot(slope, 1);
    front.push({ x, y: ledgeFront(ledgeY, x), nx: slope / length, ny: -1 / length });
  }
  const runs = [front];
  const shore = (x, y) => lakeDistance(spots, x, y);
  let run = [];
  let point = corner;
  for (let step = 0; step < LEDGE_WALK_MAX; step += 1) {
    if (point.x > spots.zones.hillX || point.y > scene.y + scene.h) break;
    const g = gradientOf(shore, point.x, point.y);
    const length = Math.hypot(g.x, g.y) || 1;
    const tower = towers.find((t) => Math.hypot(point.x - t.x, point.y - t.y) < t.r - 2);
    if (tower && run.length >= 2) runs.push(run);
    if (tower) run = [];
    else run.push({ x: point.x, y: point.y, nx: -g.x / length, ny: -g.y / length });
    if (tower && tower === main) break;
    // On along the shore with the lake on the right hand: up the left shore, then along the far one.
    point = ontoLevel(shore, point.x + (g.y / length) * LEDGE_STEP_PX, point.y - (g.x / length) * LEDGE_STEP_PX);
  }
  if (run.length >= 2) runs.push(run);
  return { y: ledgeY, runs };
};

/** Whether the pier from `start` along `dir` for `length` px, `halfWidth` each side, keeps DOCK_CARD_GAP_PX off every card. */
const dockClear = (rects, start, dir, length, halfWidth) => {
  const end = { x: start.x + dir.x * length, y: start.y + dir.y * length };
  const box = {
    x: Math.min(start.x, end.x) - Math.abs(dir.y) * halfWidth,
    y: Math.min(start.y, end.y) - Math.abs(dir.x) * halfWidth,
  };
  box.w = Math.abs(end.x - start.x) + 2 * Math.abs(dir.y) * halfWidth;
  box.h = Math.abs(end.y - start.y) + 2 * Math.abs(dir.x) * halfWidth;
  return rects.every((rect) => {
    const dx = Math.max(rect.x - (box.x + box.w), 0, box.x - (rect.x + rect.w));
    const dy = Math.max(rect.y - (box.y + box.h), 0, box.y - (rect.y + rect.h));
    return Math.hypot(dx, dy) >= DOCK_CARD_GAP_PX;
  });
};

/**
 * The pier: off the right shore, as the map's, else the near or far one, in a bay of its own whose
 * outer shore lies DOCK_BAY.reach past the core (less where the view has less room), straight out over
 * the water as long as DOCK_LENGTH_PX while clear of every card, nearest where the map puts it. `dock`
 * is the point it leaves the shore, the unit way out over the water, its length and half width;
 * `bay` the water round it. Null when no side has room.
 */
const pickDock = (core, room, rects) => {
  for (const { side, prefer } of DOCK_SIDES) {
    const reach = Math.min(DOCK_BAY.reach, room[side] - DOCK_LANDING_PX - 10);
    if (reach < DOCK_BAY.minReach) continue;
    const rOut = Math.min(DOCK_BAY.rOut, reach * 0.8);
    const length = side % 2 === 0 ? core.x1 - core.x0 : core.y1 - core.y0;
    for (const halfWidth of [DOCK_HALF_WIDTH_PX, DOCK_MIN_HALF_WIDTH_PX]) {
      let best = null;
      for (let along = 0.15 * length; along <= 0.85 * length; along += DOCK_STEP_PX) {
        const point = sidePoint(core, side, along / length);
        const dir = { x: -point.out.x, y: -point.out.y };
        const start = { x: point.x + point.out.x * reach, y: point.y + point.out.y * reach };
        let run = 0;
        for (let step = DOCK_STEP_PX; step <= DOCK_LENGTH_PX; step += DOCK_STEP_PX) {
          if (!dockClear(rects, start, dir, step, halfWidth)) break;
          run = step;
        }
        if (run < DOCK_MIN_LENGTH_PX) continue;
        const score = run - 0.3 * Math.abs(along / length - prefer) * length + 3 * spotHash(start.x, start.y, 5);
        if (!best || score > best.score) best = { start, dir, run, score, point };
      }
      if (best) {
        const { point, start, dir, run } = best;
        const bayCentre = { x: point.x + point.out.x * (reach - rOut), y: point.y + point.out.y * (reach - rOut) };
        const bay = Math.abs(point.out.x) > 0.5
          ? { ...bayCentre, rx: rOut, ry: DOCK_BAY.rAlong }
          : { ...bayCentre, rx: DOCK_BAY.rAlong, ry: rOut };
        return { dock: { x: start.x, y: start.y, dx: dir.x, dy: dir.y, length: run, halfWidth }, bay };
      }
    }
  }
  return null;
};

/** A boulder `{ x, y, r, seed }` if it keeps clear of the cards and the `avoid` circles, else null. */
const clearRock = (rects, avoid, rock) => {
  if (cardGap(rects, rock.x, rock.y) < rock.r + ROCK_CARD_GAP_PX) return null;
  if (avoid.some((spot) => Math.hypot(spot.x - rock.x, spot.y - rock.y) < spot.r + rock.r)) return null;
  return rock;
};

/**
 * Where along the line from `from` (on the water) in `dir` (unit, out onto the land) the shore sits
 * `sink` px past a point: that point, bisected; null when the line never crosses the shore within
 * `reach` px.
 */
const shoreCrossing = (spots, from, dir, sink, reach = 240) => {
  const offset = (s) => lakeDistance(spots, from.x + dir.x * s, from.y + dir.y * s) + sink;
  let wet = 0;
  let dry = reach;
  if (!(offset(wet) < 0 && offset(dry) > 0)) return null;
  for (let i = 0; i < 30; i += 1) {
    const middle = (wet + dry) / 2;
    if (offset(middle) < 0) wet = middle;
    else dry = middle;
  }
  const s = (wet + dry) / 2;
  return { x: from.x + dir.x * s, y: from.y + dir.y * s };
};

/** A boulder half in the water where the line from `from` along `dir` meets the shore. */
const shoreRock = (spots, from, dir, r, seed) => {
  const at = shoreCrossing(spots, { x: from.x - dir.x * 60, y: from.y - dir.y * 60 }, dir, -r * SHORE_ROCK_SINK);
  return at ? { ...at, r, seed } : null;
};

/** Rocks under the surface, biggest first, out in open water clear of the cards, the `avoid` circles and each other. */
const pickSunken = (spots, rects, avoid) => {
  const { core } = spots;
  const sunken = [];
  SUNKEN_SIZES.forEach((r, index) => {
    let best = null;
    for (let x = core.x0 + r; x <= core.x1 - r; x += SUNKEN_STEP_PX) {
      for (let y = core.y0 + r; y <= core.y1 - r; y += SUNKEN_STEP_PX) {
        if (lakeDistance(spots, x, y) > -(SUNKEN_OFFSHORE_PX + r)) continue;
        const clearance = cardGap(rects, x, y) - r;
        if (clearance < SUNKEN_CARD_GAP_PX) continue;
        if (avoid.some((spot) => Math.hypot(spot.x - x, spot.y - y) < spot.r + r)) continue;
        if (sunken.some((rock) => Math.hypot(rock.x - x, rock.y - y) < SUNKEN_SPACING_PX)) continue;
        const score = Math.min(clearance, 60) + 20 * spotHash(x, y, index + 3);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (best) sunken.push({ x: best.x, y: best.y, r, seed: 0.13 + 0.29 * index });
  });
  return sunken;
};

/** True when a crown of radius r at (x, y) stands on a bank's grass, clear of its cliffs, in view and clear of every card. */
const onBankGrass = (spots, rects, view, x, y, r) => {
  const { zones } = spots;
  if (hillShare(zones, x, y) > 0.05 || nearShare(zones, x, y) > 0.05) return false;
  if (!insideBox(view, x, y, r + 4)) return false;
  if (cardGap(rects, x, y) < r + TREE_CARD_GAP_PX) return false;
  const land = lakeDistance(spots, x, y);
  const grass = beachWidth(x, y) + CLIFF_RUN_PX + TREE_GRASS_PX;
  if (land - r < grass) return false;
  // Off the second cliff.
  const step = beachWidth(x, y) + CLIFF_RUN_PX + TERRACE_PX;
  return land + r < step - 8 || land - r > step + CLIFF_RUN_PX + 8;
};

/** The bushes where the map has them, each moved onto grass in view nearby if its own spot misses it, clear of each other and `avoid`. */
const placeBushes = (spots, rects, view, avoid) => {
  const corner = { x: spots.core.x1, y: spots.core.y1 };
  const trees = [];
  for (const [index, bush] of BUSHES.entries()) {
    if (trees.length >= TREE_MAX) break;
    const home = { x: corner.x + bush.x, y: corner.y + bush.y };
    let best = null;
    for (let dy = -TREE_SEARCH_PX; dy <= TREE_SEARCH_PX; dy += TREE_STEP_PX) {
      for (let dx = -TREE_SEARCH_PX; dx <= TREE_SEARCH_PX; dx += TREE_STEP_PX) {
        const distance = Math.hypot(dx, dy);
        if (distance > TREE_SEARCH_PX || (best && distance >= best.distance)) continue;
        const x = home.x + dx;
        const y = home.y + dy;
        if (!onBankGrass(spots, rects, view, x, y, bush.r)) continue;
        if (trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < tree.r + bush.r + 4)) continue;
        if (avoid.some((spot) => Math.hypot(spot.x - x, spot.y - y) < spot.r + bush.r)) continue;
        best = { x, y, distance };
      }
    }
    if (best) trees.push({ x: best.x, y: best.y, r: bush.r, seed: spotHash(best.x, best.y, index + 11) });
  }
  return trees;
};

/**
 * The fence along the near path's cliff edge, FENCE_INSET_PX in from it: walked from `start` along
 * the edge with the lake on the left hand (down the left shore, then along the near one) to the
 * path's end, a post every FENCE_SPACING_PX where the near shore's ground is all there is, clear of
 * the `avoid` shapes. Empty with fewer than three.
 */
const placeFence = (spots, start, avoid) => {
  const { zones } = spots;
  const level = (x, y) => lakeDistance(spots, x, y) - (pathWidth(x, y) - FENCE_INSET_PX);
  const posts = [];
  let point = ontoLevel(level, start.x, start.y);
  let travelled = FENCE_SPACING_PX;
  for (let step = 0; step < FENCE_WALK_MAX && posts.length < FENCE_MAX_POSTS && point.x <= zones.pathEndX - 30; step += 1) {
    const clear = nearShare(zones, point.x, point.y) >= 0.95 && !avoid.some((shape) => ellipseDistance(shape, point.x, point.y) < 20);
    if (travelled >= FENCE_SPACING_PX && clear) {
      posts.push(point);
      travelled = 0;
    }
    const g = gradientOf(level, point.x, point.y);
    const length = Math.hypot(g.x, g.y) || 1;
    const next = ontoLevel(level, point.x - (g.y / length) * FENCE_STEP_PX, point.y + (g.x / length) * FENCE_STEP_PX);
    travelled += Math.hypot(next.x - point.x, next.y - point.y);
    point = next;
  }
  return posts.length >= 3 ? posts : [];
};

/** A fall from the edge of `tower` at its notch, out along it. */
const towerFall = (tower, { kind, bottom, landing, halfWidth }) => {
  const lip = atTurn(tower, tower.r, tower.notch);
  return {
    x: lip.x,
    y: lip.y,
    dx: Math.cos(tower.notch),
    dy: Math.sin(tower.notch),
    halfWidth,
    landing,
    top: tower.rim - POOL_SINK_PX,
    bottom,
    kind,
  };
};

/**
 * The stone as plain arrays for one indexed mesh: `positions` (x, y, z table px), `normals`, `parts`
 * (STONEWORK_PARTS, px along the wall or round the coping, which ring), `levels` (the wall's top; the
 * water its inner wall stands in, else STONEWORK_ON_GROUND) and `index`.
 * A ring (each tower, then the basin's kerb): its outer wall from STONEWORK_FOOT_PX up to the rim,
 * under its notch only up to the lip; the coping round its top; the inner wall from the rim down into
 * its water, under the notch from the lip where the lip stands over the water; the notch's two
 * cheeks. The ledge: each run's wall from STONEWORK_FOOT_PX up to LEDGE_TOP_PX and its coping.
 * @param {{ towers?: object[], basin?: object|null, ledge?: { runs: object[][] }|null }} spots
 * @returns {{ positions: number[], normals: number[], parts: number[], levels: number[], index: number[] }}
 */
export function stonework({ towers = [], basin = null, ledge = null } = {}) {
  const positions = [];
  const normals = [];
  const parts = [];
  const levels = [];
  const index = [];
  const vertex = (x, y, z, normal, part, along, which, level) => {
    positions.push(x, y, z);
    normals.push(...normal);
    parts.push(part, along, which);
    levels.push(...level);
    return positions.length / 3 - 1;
  };
  /** Joins two rows of vertices (each a list), quad by quad. */
  const strip = (lower, upper) => {
    for (let k = 0; k + 1 < lower.length; k += 1) index.push(lower[k], lower[k + 1], upper[k + 1], lower[k], upper[k + 1], upper[k]);
  };
  /** Rows round an arc of a ring from `start` over `span` rad: one row per [radius, z, normal(c, s), part, levels]. */
  const arcRows = (ring, which, start, span, rows) => {
    const segments = Math.max(2, Math.ceil((span * ring.r) / STONEWORK_SEGMENT_PX));
    return rows.map(([radius, z, normalOf, part, level]) => {
      const row = [];
      for (let k = 0; k <= segments; k += 1) {
        const turn = start + (span * k) / segments;
        const [c, s] = [Math.cos(turn), Math.sin(turn)];
        row.push(vertex(ring.x + c * radius, ring.y + s * radius, z, normalOf(c, s), part, radius * (turn - start), which, level));
      }
      return row;
    });
  };
  const outward = (c, s) => [c, s, 0];
  const inward = (c, s) => [-c, -s, 0];
  const up = () => [0, 0, 1];
  const rings = towers.map((tower) => ({ ...tower, wall: TOWER_WALL_PX, pool: tower.rim - POOL_SINK_PX, lip: tower.rim - POOL_SINK_PX }));
  if (basin) rings.push({ ...basin, wall: KERB_PX, pool: BASIN_LEVEL_PX, lip: 0 });
  rings.forEach((ring, which) => {
    const inner = ring.r - ring.wall;
    const start = ring.notch + ring.notchHalf;
    const solid = 2 * Math.PI - 2 * ring.notchHalf;
    const onGround = [ring.rim, STONEWORK_ON_GROUND];
    const inWater = [ring.rim, ring.pool];
    const [wallFoot, wallTop, copingOut, copingIn, innerTop, innerFoot] = arcRows(ring, which, start, solid, [
      [ring.r, STONEWORK_FOOT_PX, outward, STONEWORK_PARTS.wall, onGround],
      [ring.r, ring.rim, outward, STONEWORK_PARTS.wall, onGround],
      [ring.r, ring.rim, up, STONEWORK_PARTS.coping, onGround],
      [inner, ring.rim, up, STONEWORK_PARTS.coping, onGround],
      [inner, ring.rim, inward, STONEWORK_PARTS.innerWall, inWater],
      [inner, ring.pool - 1, inward, STONEWORK_PARTS.innerWall, inWater],
    ]);
    strip(wallFoot, wallTop);
    strip(copingIn, copingOut);
    strip(innerFoot, innerTop);
    const notchRows = [
      [ring.r, STONEWORK_FOOT_PX, outward, STONEWORK_PARTS.wall, onGround],
      [ring.r, ring.lip, outward, STONEWORK_PARTS.wall, onGround],
    ];
    if (ring.lip > ring.pool + 1) {
      notchRows.push([inner, ring.lip, inward, STONEWORK_PARTS.innerWall, inWater], [inner, ring.pool - 1, inward, STONEWORK_PARTS.innerWall, inWater]);
    }
    const [lipFoot, lipTop, lipInnerTop, lipInnerFoot] = arcRows(ring, which, ring.notch - ring.notchHalf, 2 * ring.notchHalf, notchRows);
    strip(lipFoot, lipTop);
    if (lipInnerTop) strip(lipInnerFoot, lipInnerTop);
    // The notch's cheeks, each facing into it.
    for (const [turn, facing] of [
      [start, -1],
      [start + solid, 1],
    ]) {
      const [c, s] = [Math.cos(turn), Math.sin(turn)];
      const normal = [-s * facing, c * facing, 0];
      const corner = (radius, z) =>
        vertex(ring.x + c * radius, ring.y + s * radius, z, normal, STONEWORK_PARTS.cheek, radius, which, onGround);
      strip([corner(inner, ring.lip), corner(ring.r, ring.lip)], [corner(inner, ring.rim), corner(ring.r, ring.rim)]);
    }
  });
  const ledgeLevels = [LEDGE_TOP_PX, STONEWORK_ON_GROUND];
  for (const run of ledge?.runs ?? []) {
    const foot = [];
    const top = [];
    const copingOut = [];
    const copingIn = [];
    let along = 0;
    run.forEach((point, k) => {
      if (k > 0) along += Math.hypot(point.x - run[k - 1].x, point.y - run[k - 1].y);
      const normal = [point.nx, point.ny, 0];
      const inland = { x: point.x - point.nx * LEDGE_COPING_PX, y: point.y - point.ny * LEDGE_COPING_PX };
      foot.push(vertex(point.x, point.y, STONEWORK_FOOT_PX, normal, STONEWORK_PARTS.ledgeWall, along, rings.length, ledgeLevels));
      top.push(vertex(point.x, point.y, LEDGE_TOP_PX, normal, STONEWORK_PARTS.ledgeWall, along, rings.length, ledgeLevels));
      copingOut.push(vertex(point.x, point.y, LEDGE_TOP_PX, [0, 0, 1], STONEWORK_PARTS.ledgeTop, along, rings.length, ledgeLevels));
      copingIn.push(vertex(inland.x, inland.y, LEDGE_TOP_PX, [0, 0, 1], STONEWORK_PARTS.ledgeTop, along, rings.length, ledgeLevels));
    });
    strip(foot, top);
    strip(copingIn, copingOut);
  }
  return { positions, normals, parts, levels, index };
}

/**
 * Where Brooklet Hill's pieces go for a layout: the lake (`core`, the block of card footprints grown
 * by LAKE_MARGIN_PX, and its `bays`), the ground's `zones` (with the ledge's front edge, ledgeY), the
 * `towers` (main, upper, side pool) and the `falls`, the `ledge`'s walls, the `cave`, the `basin`, the
 * boulders (`rocks`), the rocks under the surface (`sunken`), the bushes (`trees`), the pier (`dock`),
 * the `fence` posts and the `table`; all clear of the card footprints. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function brookletSpots(layout) {
  const table = tableBounds(layout);
  if (!(table.w > 0 && table.h > 0)) return null;
  const scene = sceneBounds(layout, BROOKLET_KEY);
  const view = viewBox(table);
  const { slabs, flats } = environmentFootprints(layout);
  const rects = [...slabs, ...flats].filter(isRect);
  const core = lakeCore(rects, table);
  const width = core.x1 - core.x0;
  const depth = core.y1 - core.y0;
  const zones = {
    hillX: core.x0 + HILL_X_SHARE * width,
    hillY: core.y0 + HILL_Y_SHARE * depth,
    nearY: core.y0,
    pathEndX: core.x0 + PATH_END_SHARE * width,
  };
  const room = roomPast(core, view);

  const spill = placeSpill(core, room, scene, rects);
  const spillLeft = spill?.ledgeY != null;
  // With the spill on the left shore the hill starts past the basin, the near shore's ground short of
  // it; without, the ledge takes the whole hill.
  if (spillLeft && spill.basin) zones.hillY = spill.basin.y - spill.basin.r - ZONE_BLEND_PX / 2 - 5;
  zones.ledgeY = spill?.ledgeY ?? zones.hillY;
  const { main, upper, cave } = placeFarLeft(core, scene, rects, zones.ledgeY);
  const side = room[3] >= SIDE_ROOM_PX ? placeSidePool(core, rects, zones.ledgeY, spill) : null;
  const docked = pickDock(core, room, rects);

  const bays = [];
  // Water up to the main tower's front wall and the side pool's, so their falls land in the lake.
  if (main) bays.push({ x: main.x, y: core.y1 + 4, rx: main.r * 0.8, ry: MAIN_TOWER.front + 22 });
  if (spill) bays.push(spill.bay);
  if (side) bays.push({ x: side.x + side.r + SIDE_POOL.gap / 2, y: side.y, rx: SIDE_POOL.gap + 16, ry: side.r * 0.55 });
  if (docked) bays.push(docked.bay);
  const spots = { core, bays: bays.slice(0, BAY_MAX), zones };

  const middle = placeMiddlePool(spots, rects, side, upper, cave);
  const towers = [main, upper, side, middle].filter(Boolean);
  const basin = spill?.basin ?? null;
  const ledge = placeLedge(spots, zones.ledgeY, scene, main, towers);
  const falls = [];
  if (main) falls.push(towerFall(main, { kind: FALL_KINDS.lake, bottom: 0, landing: 30, halfWidth: 30 }));
  if (main && upper) {
    // Over the gap and the main tower's wall into its pool.
    const lip = atTurn(upper, upper.r, upper.notch);
    const landing = Math.hypot(main.x - lip.x, main.y - lip.y) - (main.r - TOWER_WALL_PX) + 14;
    falls.push(towerFall(upper, { kind: FALL_KINDS.pool, bottom: main.rim - POOL_SINK_PX, landing, halfWidth: 22 }));
  }
  // Out over the ledge's wall into the lake.
  if (side) falls.push(towerFall(side, { kind: FALL_KINDS.lake, bottom: 0, landing: 26, halfWidth: 17 }));
  if (middle) {
    // Over the gap and the side pool's wall into its pool.
    const lip = atTurn(middle, middle.r, middle.notch);
    const landing = Math.hypot(side.x - lip.x, side.y - lip.y) - (side.r - TOWER_WALL_PX) + 14;
    falls.push(towerFall(middle, { kind: FALL_KINDS.pool, bottom: side.rim - POOL_SINK_PX, landing, halfWidth: 16 }));
  }
  if (basin) {
    // From the notch's inner edge, the lake's level, down into the basin.
    const lip = atTurn(basin, basin.r - KERB_PX, basin.notch);
    const dx = -Math.cos(basin.notch);
    const dy = -Math.sin(basin.notch);
    falls.push({ x: lip.x, y: lip.y, dx, dy, halfWidth: SPILL.halfWidth, landing: 26, top: 0, bottom: BASIN_LEVEL_PX, kind: FALL_KINDS.basin });
  }

  // Boulders: clear of the cards, the pier, the falls' sheets and each other (one may stand where a fall lands).
  const avoid = [];
  if (docked) {
    const { dock } = docked;
    for (let along = -DOCK_LANDING_PX; along <= dock.length; along += 12) {
      avoid.push({ x: dock.x + dock.dx * along, y: dock.y + dock.dy * along, r: dock.halfWidth + 6 });
    }
  }
  const underSheet = (rock) =>
    falls.some((fall) => {
      const along = (rock.x - fall.x) * fall.dx + (rock.y - fall.y) * fall.dy;
      const across = (rock.x - fall.x) * -fall.dy + (rock.y - fall.y) * fall.dx;
      return along > -rock.r && along < fall.landing && Math.abs(across) < fall.halfWidth + rock.r * 0.5;
    });
  const rocks = [];
  const add = (rock) => {
    const placed = rock && !underSheet(rock) && clearRock(rects, [...avoid, ...rocks.map((other) => ({ ...other, r: other.r + 3 }))], rock);
    if (placed && rocks.length < ROCK_MAX) rocks.push(placed);
  };
  if (main) {
    const fall = falls[0];
    const land = { x: fall.x + fall.dx * fall.landing, y: fall.y + fall.dy * fall.landing };
    FALL_ROW.forEach(({ across, out, r }, index) =>
      add({ x: land.x + fall.dx * out - fall.dy * across, y: land.y + fall.dy * out + fall.dx * across, r, seed: 0.37 + 0.13 * index })
    );
  }
  if (spill) {
    const { frame } = spill;
    SPILL_ROCKS.forEach(({ u, v, r }, index) => add({ ...framePoint(frame, u, v), r, seed: 0.21 + 0.11 * index }));
  }
  const nearRock = sidePoint(core, 0, NEAR_ROCK.share);
  add(shoreRock(spots, nearRock, nearRock.out, NEAR_ROCK.r, 0.83));
  RIGHT_PAIR.forEach(({ share, nearShare: alongNear, r }, index) => {
    const point = room[1] >= 60 ? sidePoint(core, 1, share) : sidePoint(core, 0, alongNear);
    add(shoreRock(spots, point, point.out, r, 0.27 + 0.34 * index));
  });

  // From past the spill's near boulder on the left shore; past its bay on the near shore; else from
  // the lake's near-left corner.
  let fenceStart = { x: core.x0 + LAKE_CORNER_PX * 0.5, y: core.y0 - PATH_PX };
  if (spillLeft) fenceStart = framePoint(spill.frame, SPILL.bay.u + 20, -(SPILL.bay.rv + 50));
  else if (spill) fenceStart = { x: spill.bay.x + spill.bay.rx + 60, y: core.y0 - PATH_PX };
  const fence = placeFence(spots, fenceStart, [spill?.bay, basin].filter(Boolean));

  const fallSpots = falls.map((fall) => ({ x: fall.x + fall.dx * fall.landing, y: fall.y + fall.dy * fall.landing, r: fall.halfWidth + 20 }));
  const sunken = pickSunken(spots, rects, [...avoid, ...fallSpots, ...rocks.map((rock) => ({ ...rock, r: rock.r * 1.6 }))]);
  const structures = [...towers, basin].filter(Boolean).map((ring) => ({ x: ring.x, y: ring.y, r: ring.r + 6 }));
  const trees = placeBushes(spots, rects, view, [...avoid, ...structures, ...rocks]);

  return {
    table,
    core,
    bays: spots.bays,
    zones,
    towers,
    ledge,
    cave,
    basin,
    falls: falls.slice(0, FALL_MAX),
    rocks,
    sunken,
    trees,
    dock: docked?.dock ?? null,
    fence,
  };
}
