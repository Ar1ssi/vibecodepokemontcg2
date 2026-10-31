// Design 077 (prototype): the coast recipe's Brooklet Hill (customhb-212), after the place as
// Pokémon Sun and Moon's 3DS map draws it, cross-checked with the card's art (5ban Graphics, GRI 120):
// a teal lake every card lies on, stone towers holding round pools past its far-left corner with
// their falls and a cave, the left bank a sand-topped ledge on a stone wall straight out of the water
// with a walled pool spilling off it, short of the ledge the lake spilling into a walled basin a step
// down, boulders in the shallows, a beach under dark earth cliffs and grass with round bushes on the
// far and right banks, a plank pier, a fenced sand path along the near shore
// (stadium-env-brooklet-layout.mjs puts each piece).
// What makes it read:
// - The water (lake, pools, basin): the game's teal under a mottled ripple texture drifting in two
//   layers, one crisp white line at every waterline, foam rings round the boulders, churn where the
//   falls land; the art's white crescent strokes and sparkles, sparser.
// - The stone: the game's courses of rounded olive-tan stones with moss in their joints, lit nearly
//   evenly as the game lights them, a light coping along each rim.
// - The banks: orange-tan sand, dark red-brown earth cliffs, deep green grass swept in strokes.
// Bake, once per layout: FIELD writes R height px (lake level 0, the pools and the basin flat at their
// own levels), G signed px from the lake's shore (+ on land), B what the ground is built of (-1 the
// zones' own, 1 tower stone, 3 a tower's pool, 4 the basin, 5 the basin's kerb, 6 the notch the lake
// pours through into the basin; the fraction the tower's index / 4), A what stands there (boulder id
// 0..1, bush 2..3, pier 4, -1 nothing); the shared BAKE_LIGHT (stadium-environment-glsl.mjs) adds
// normals, occlusion and the sun shadow.
// Per frame: LAND draws the ground on the terrain grid; STONEWORK the towers, the basin's kerb and the
// ledge's walls, meshes of their own so their walls stand straight (the field holds them a little
// smaller, for their shadows); LAKE is one flat sheet at lake level, its waves all in the shading;
// FALLS the sheets of water; MIST the spray where they land; FENCE the path's posts and rails.
import {
  FILTERING,
  FOOTPRINTS,
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
} from './stadium-environment-glsl.mjs';
import {
  BASIN_LEVEL_PX,
  BAY_BLEND_PX,
  BAY_MAX,
  BEACH_PX,
  BEACH_RISE_PX,
  BEACH_WANDER_PX,
  CLIFF_RISE_PX,
  CLIFF_RUN_PX,
  DOCK_LANDING_PX,
  DROP_PX,
  DROP_RUN_PX,
  FALL_MAX,
  FENCE_SPACING_PX,
  FLATS_RISE_PX,
  FLATS_RUN_PX,
  KERB_PX,
  LEDGE_FRONT_WANDER_PX,
  LEDGE_TOP_PX,
  PATH_PX,
  PATH_RISE_PX,
  PATH_WANDER_PX,
  POOL_SINK_PX,
  ROCK_MAX,
  SHORE_IN_PX,
  SHORE_OUT_PX,
  STONEWORK_DROP_PX,
  STONEWORK_INSET_PX,
  SUNKEN_MAX,
  TERRACE_PX,
  TERRACE_RISE_PX,
  TOWER_MAX,
  TOWER_WALL_PX,
  TREE_MAX,
  ZONE_BLEND_PX,
  brookletSpots,
  stonework,
} from './stadium-env-brooklet-layout.mjs';

export const MIST_COUNT = 40;
/** Height of the pier's deck above the lake, px. */
export const DOCK_DECK_PX = 8;
/** Each fall's sheet of water: quads across it and down it. */
export const FALL_COLUMNS = 8;
export const FALL_ROWS = 12;
/** The fence: posts this wide and tall, rails this thick at these heights over the path. */
export const FENCE_POST = Object.freeze({ width: 6, height: 25 });
export const FENCE_RAIL = Object.freeze({ thickness: 3.2, heights: [9, 19] });

const f = (value) => Number(value).toFixed(3);

const PLACE = /* glsl */ `
// The lake's core (x0, y0, x1, y1) and its corners' radius; its bays (centre, radii; 0: none); the
// zones' edges (hill x, hill y, near y, the path's end x); the ledge's front edge (y; y 1 with a
// ledge), as stadium-env-brooklet-layout.mjs has them.
uniform vec4 uCore;
uniform float uCoreRadius;
uniform vec4 uBays[${BAY_MAX}];
uniform vec4 uZones;
uniform vec4 uLedge;
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float boxDistance(vec4 box, float r, vec2 p) {
  vec2 halfSize = (box.zw - box.xy) * 0.5;
  vec2 q = abs(p - box.xy - halfSize) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float ellipseDistance(vec4 e, vec2 p) {
  return (length((p - e.xy) / e.zw) - 1.0) * min(e.z, e.w);
}
float shoreWander(vec2 p) {
  return 0.5 * sin(0.0123 * p.x + 0.0091 * p.y + 1.7) + 0.3 * sin(0.031 * p.x - 0.024 * p.y + 4.1) + 0.2 * sin(0.067 * p.x + 0.052 * p.y + 0.3);
}
float beachWander(vec2 p) {
  return 0.6 * sin(0.0087 * p.x - 0.0113 * p.y + 2.9) + 0.4 * sin(0.023 * p.x + 0.019 * p.y + 0.6);
}
float pathWander(vec2 p) {
  return 0.6 * sin(0.0101 * p.x + 0.004 * p.y + 0.4) + 0.4 * sin(0.027 * p.x - 0.013 * p.y + 3.3);
}
// The ledge's front edge: its y at x (the layout's ledgeFront).
float ledgeFront(float x) {
  return uLedge.x + ${f(LEDGE_FRONT_WANDER_PX)} * (0.6 * sin(0.021 * x + 1.3) + 0.4 * sin(0.047 * x + 4.2));
}
// Signed px from the lake's shore, + on land (the layout's lakeDistance).
float landDistance(vec2 p) {
  float d = boxDistance(uCore, uCoreRadius, p);
  for (int i = 0; i < ${BAY_MAX}; i++) {
    if (uBays[i].z > 0.0) d = smin(d, ellipseDistance(uBays[i], p), ${f(BAY_BLEND_PX)});
  }
  return d + ${f((SHORE_IN_PX - SHORE_OUT_PX) / 2)} + ${f((SHORE_IN_PX + SHORE_OUT_PX) / 2)} * shoreWander(p);
}
// The zones' shares (the layout's hillShare, nearShare), the path's side of the near shore.
float hillShare(vec2 p) {
  float halfBlend = ${f(ZONE_BLEND_PX / 2)};
  return (1.0 - smoothstep(uZones.x - halfBlend, uZones.x + halfBlend, p.x)) * smoothstep(uZones.y - halfBlend, uZones.y + halfBlend, p.y);
}
float nearShare(vec2 p) {
  float halfBlend = ${f(ZONE_BLEND_PX * 0.4)};
  float below = 1.0 - smoothstep(uZones.z - halfBlend, uZones.z + halfBlend, p.y);
  float column = 1.0 - smoothstep(uZones.x - ${f(ZONE_BLEND_PX / 2)}, uZones.x + ${f(ZONE_BLEND_PX / 2)}, p.x);
  return (1.0 - hillShare(p)) * max(below, column);
}
float pathShare(vec2 p) {
  return 1.0 - smoothstep(uZones.w - 40.0, uZones.w + 40.0, p.x);
}
float beachWidth(vec2 p) {
  return ${f(BEACH_PX)} + ${f(BEACH_WANDER_PX)} * beachWander(p);
}
float pathWidth(vec2 p) {
  return ${f(PATH_PX)} + ${f(PATH_WANDER_PX)} * pathWander(p);
}
`;

const STRUCTURES = /* glsl */ `
// The towers (centre, radius, rim height; radius 0: none) and their notches (the way out, unit, and
// the turn the spout spans either side); the cave's mouth on the upper tower's face (its middle at
// the foot, half width, height; half width 0: none); the basin (centre, radius, kerb height; radius
// 0: none) and its notch (the way toward the lake, unit, and the turn it spans either side).
uniform vec4 uTowers[${TOWER_MAX}];
uniform vec4 uNotches[${TOWER_MAX}];
uniform vec4 uCave;
uniform vec4 uBasin;
uniform vec4 uBasinNotch;
const float WALL = ${f(TOWER_WALL_PX)};
const float POOL_SINK = ${f(POOL_SINK_PX)};
const float INSET = ${f(STONEWORK_INSET_PX)};
const float DROP = ${f(STONEWORK_DROP_PX)};
const float LEDGE_TOP = ${f(LEDGE_TOP_PX)};
const float BASIN_LEVEL = ${f(BASIN_LEVEL_PX)};
const float KERB = ${f(KERB_PX)};
const float KIND_TOWER = 1.0;
const float KIND_POOL = 3.0;
const float KIND_BASIN = 4.0;
const float KIND_KERB = 5.0;
const float KIND_CHANNEL = 6.0;
// 1 across tower i's spout (its wall cut down to the water at the notch), 0 elsewhere round it.
float towerSpout(vec2 p, int i) {
  vec4 t = uTowers[i];
  vec4 notch = uNotches[i];
  vec2 dir = normalize(p - t.xy + vec2(1e-4, 0.0));
  return smoothstep(cos(notch.z + 0.06), cos(notch.z), dot(dir, notch.xy));
}
// Tower i in the field at p: x its height (-1e4 off it), y what it's built of (KIND_TOWER or
// KIND_POOL, + i / 4). Its stone lies INSET inside the tower's mesh and DROP lower; its pool reaches
// a few px under the mesh's inner wall, and its spout's water runs on 2 px past the lip.
vec2 towerAt(vec2 p, int i) {
  vec4 t = uTowers[i];
  if (t.z <= 0.0) return vec2(-1e4, -1.0);
  float d = distance(p, t.xy);
  float spout = towerSpout(p, i);
  if (d > mix(t.z - INSET, t.z + 2.0, spout)) return vec2(-1e4, -1.0);
  float index = float(i) * 0.25;
  float pool = t.w - POOL_SINK - 0.5;
  if (d < t.z - WALL + 3.5) return vec2(pool, KIND_POOL + index);
  return vec2(mix(t.w - DROP, pool, spout), (spout > 0.5 ? KIND_POOL : KIND_TOWER) + index);
}
// 1 across the basin's notch, 0 elsewhere round it.
float basinNotch(vec2 p) {
  vec2 dir = normalize(p - uBasin.xy + vec2(1e-4, 0.0));
  return step(cos(uBasinNotch.z), dot(dir, uBasinNotch.xy));
}
// The basin in the field at p: x its height (-1e4 off it), y what it's built of. Its kerb lies INSET
// inside the kerb's mesh and DROP lower; its water reaches a few px under the kerb's inner wall; the
// notch's floor lies just under the lake's level.
vec2 basinAt(vec2 p) {
  if (uBasin.z <= 0.0) return vec2(-1e4, -1.0);
  float d = distance(p, uBasin.xy);
  if (d > uBasin.z - INSET) return vec2(-1e4, -1.0);
  if (d < uBasin.z - KERB + 3.5) return vec2(BASIN_LEVEL, KIND_BASIN);
  return basinNotch(p) > 0.5 ? vec2(-0.8, KIND_CHANNEL) : vec2(uBasin.w - DROP, KIND_KERB);
}
`;

const FALL_UNIFORMS = /* glsl */ `
// The falls: lip and the way out over the drop (unit); half width, px out to where the water lands,
// the lip's height and the height it lands at (half width 0: none); kind (0 into the lake, 1 into a
// tower's pool, 2 into the basin; -1 none).
uniform vec4 uFalls[${FALL_MAX}];
uniform vec4 uFallShapes[${FALL_MAX}];
uniform float uFallKind[${FALL_MAX}];
// x px out along fall i from its lip, y px across it.
vec2 fallFrame(vec2 p, int i) {
  vec4 fall = uFalls[i];
  vec2 d = p - fall.xy;
  return vec2(dot(d, fall.zw), dot(d, vec2(-fall.w, fall.z)));
}
vec2 fallLanding(int i) {
  return uFalls[i].xy + uFalls[i].zw * uFallShapes[i].y;
}
`;

const ROCK_UNIFORMS = /* glsl */ `
uniform vec4 uRocks[${ROCK_MAX}];
`;

const SUNKEN = /* glsl */ `
uniform vec4 uSunken[${SUNKEN_MAX}];
// The rocks under the surface (centre, radius, seed), as the game's map and the art show them: a
// cluster of rounded lobes, its outline broken up. x 1 over a rock, y 1 over its top, nearest the
// surface.
vec2 sunkenRock(vec2 p) {
  vec2 cover = vec2(0.0);
  for (int i = 0; i < ${SUNKEN_MAX}; i++) {
    vec4 rock = uSunken[i];
    if (rock.z <= 0.0) continue;
    vec2 d = p - rock.xy;
    if (dot(d, d) > rock.z * rock.z * 2.6) continue;
    float body = -1e3;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float turn = rock.w * 6.2831853 + fk * 2.2;
      vec2 centre = k == 0 ? vec2(0.0) : vec2(cos(turn), sin(turn)) * rock.z * 0.55;
      float lobe = rock.z * (k == 0 ? 0.62 : 0.4 + 0.12 * hash12(vec2(rock.w, fk)));
      body = max(body, lobe - length(d - centre));
    }
    body += (gnoise(p / 7.0 + rock.w * 31.0) - 0.5) * 5.0;
    float over = smoothstep(-1.5, 1.5, body);
    cover = max(cover, vec2(over, over * smoothstep(3.0, rock.z * 0.45, body)));
  }
  return cover;
}
`;

const THINGS = /* glsl */ `
${ROCK_UNIFORMS}
uniform vec4 uTrees[${TREE_MAX}];
// The pier: where it leaves the shore and the way out over the water (unit); length, width.
uniform vec4 uDock;
uniform vec2 uDockSize;
const float DOCK_DECK = ${f(DOCK_DECK_PX)};
const float DOCK_LANDING = ${f(DOCK_LANDING_PX)};
// A thing's id reaches this far past its edge, so the land's grid colours its steep side all the way
// down (the land takes ids off the nearest texel).
const float STAND_MARGIN = 2.5;
// A boulder (centre, radius, seed) as the art and the game draw them: a smooth dome a little
// flattened and squashed, with broad soft facets. x its height px over its base, y its id (the
// seed), z 1 out to STAND_MARGIN past its edge. lift stands one out in the lake on its bed.
vec3 boulder(vec2 p, vec4 rock, float lift) {
  float angle = rock.w * 6.2831853;
  mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 q = turn * (p - rock.xy) / (rock.z * vec2(1.0, 0.8));
  float near = step(length(q), 1.0 + STAND_MARGIN / (rock.z * 0.8));
  float dome = 1.0 - dot(q, q);
  if (dome <= 0.0) return vec3(0.0, rock.w, near);
  float top = sqrt(dome);
  for (int i = 0; i < 5; i++) {
    float a = float(i) * 1.2566 + (hash12(vec2(rock.w, float(i))) - 0.5) * 0.8;
    top = smin(top, 1.0 - 0.7 * dot(q, vec2(cos(a), sin(a))), 0.25);
  }
  float h = max(top, 0.0) * rock.z * 0.75 + lift * smoothstep(0.0, 0.25, top);
  return vec3(h, rock.w, 1.0);
}
// A round bush from above: a crown of leafy lobes. x its height px over the ground, y its id (2..3),
// z 1 out to STAND_MARGIN past its edge.
vec3 treeCrown(vec2 p, vec4 tree) {
  vec2 d = p - tree.xy;
  float r = tree.z;
  float id = 2.0 + tree.w * 0.9;
  if (length(d) > r * 1.25 + STAND_MARGIN) return vec3(0.0, id, 0.0);
  float top = 0.0;
  float reach = -STAND_MARGIN - 1.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float turn = fi * 1.2566 + tree.w * 6.2831853;
    vec2 centre = i == 0 ? vec2(0.0) : vec2(cos(turn), sin(turn)) * r * (0.4 + 0.12 * hash12(vec2(tree.w, fi)));
    float lobe = r * (i == 0 ? 0.7 : 0.46 + 0.14 * hash12(vec2(fi, tree.w * 7.0)));
    reach = max(reach, lobe - length(d - centre));
    vec2 q = (d - centre) / lobe;
    float dome = sqrt(max(1.0 - dot(q, q), 0.0));
    top = max(top, (r * (i == 0 ? 0.8 : 0.6) + dome * lobe * 0.75) * smoothstep(0.0, 0.3, dome));
  }
  return vec3(top, id, step(-STAND_MARGIN, reach));
}
// The pier's frame: x px out from its shore point over the water, y px across it.
vec2 dockFrame(vec2 p) {
  vec2 d = p - uDock.xy;
  return vec2(dot(d, uDock.zw), dot(d, vec2(-uDock.w, uDock.z)));
}
// 1 on the pier, out to margin px past its sides and end.
float onDock(vec2 p, float margin) {
  if (uDockSize.x <= 0.0) return 0.0;
  vec2 q = dockFrame(p);
  return step(-DOCK_LANDING, q.x) * step(q.x, uDockSize.x + margin) * step(abs(q.y), uDockSize.y * 0.5 + margin);
}
// The pier's posts: down each side, at its shore point, either side of the gap between its two
// sections, and at its end.
float onPost(vec2 p) {
  if (uDockSize.x <= 0.0) return 0.0;
  vec2 q = dockFrame(p);
  float side = step(abs(abs(q.y) - (uDockSize.y * 0.5 - 2.5)), 2.5);
  float middle = uDockSize.x * 0.5;
  float atPost = min(min(abs(q.x - 2.5), abs(q.x - uDockSize.x + 2.5)), min(abs(q.x - middle + 5.0), abs(q.x - middle - 5.0)));
  return side * step(atPost, 2.5);
}
`;

const GROUND = /* glsl */ `
// A riser's profile, 0 at its foot to 1 at its lip: rounded at both, steep between.
float riser(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
// 1 on the ledge's top: past its front edge and off the shore, INSET inside its walls' meshes.
float onLedge(vec2 p, float land) {
  return step(0.5, uLedge.y) * step(INSET, land) * step(INSET, p.y - ledgeFront(p.x));
}
// The hill: the ledge's sand top, its walls' meshes standing at its edges; short of its front edge
// sand flats rising from the water.
float hillHeight(vec2 p, float land) {
  float flats = ${f(FLATS_RISE_PX)} * smoothstep(0.0, ${f(FLATS_RUN_PX)}, land);
  return mix(flats, LEDGE_TOP - DROP + 1.5 * (fbm3(p / 70.0) - 0.5), onLedge(p, land));
}
// The near shore: the path (or grass) just above the water, then a cliff dropping away to lower
// grass.
float nearHeight(vec2 p, float land) {
  float h = ${f(PATH_RISE_PX)} * smoothstep(0.0, 10.0, land);
  return h - ${f(DROP_PX)} * riser((land - pathWidth(p)) / ${f(DROP_RUN_PX)}) + 4.0 * (fbm3(p / 90.0) - 0.5) * smoothstep(${f(PATH_PX)}, ${f(PATH_PX + 40)}, land);
}
// The banks: a beach rising gently from the water to a dark earth cliff, grass above it, a second
// cliff further back.
float bankHeight(vec2 p, float land) {
  float beach = beachWidth(p);
  float h = ${f(BEACH_RISE_PX)} * smoothstep(0.0, beach, land);
  h += ${f(CLIFF_RISE_PX)} * riser((land - beach) / ${f(CLIFF_RUN_PX)});
  h += ${f(TERRACE_RISE_PX)} * riser((land - beach - ${f(CLIFF_RUN_PX + TERRACE_PX)}) / ${f(CLIFF_RUN_PX)});
  return h + 4.0 * (fbm3(p / 140.0) - 0.5) * smoothstep(beach + ${f(CLIFF_RUN_PX)}, beach + ${f(CLIFF_RUN_PX + 40)}, land);
}
// The lake bed, px below the surface: it falls away from the shore.
float lakeBed(float offshore) {
  return -(1.5 + 24.0 * (1.0 - exp(-offshore / 60.0)));
}
// The ground of the zones, with a low lip at the waterline lifting the land clear of the lake's level
// within a px or two of the shore, so the shore draws as one crisp line.
float groundHeight(vec2 p, float land) {
  if (land < 0.0) return lakeBed(-land);
  float hill = hillShare(p);
  float near = nearShare(p);
  float bank = max(1.0 - hill - near, 0.0);
  float h = hill * hillHeight(p, land) + near * nearHeight(p, land) + bank * bankHeight(p, land);
  return land < 18.0 ? max(h, smoothstep(0.0, 2.0, land)) : h;
}
`;

const PALETTE = /* glsl */ `
// Linear colours before tone mapping, the game's map's crossed with the card's art (Neutral
// compresses above ~0.76 and takes ~0.04 off dark ones).
const vec3 SKY_LIGHT = vec3(0.36, 0.42, 0.48);
const vec3 SUN_LIGHT = vec3(0.9, 0.84, 0.72);
// Teal light the water throws back up onto the faces.
const vec3 BOUNCE_LIGHT = vec3(0.1, 0.15, 0.14);
// The stone, the game's olive tan.
const vec3 STONE_DARK = vec3(0.07, 0.065, 0.035);
const vec3 STONE_MID = vec3(0.33, 0.31, 0.15);
const vec3 STONE_LIGHT = vec3(0.5, 0.48, 0.28);
const vec3 STONE_RIM = vec3(0.66, 0.64, 0.44);
const vec3 MOSS = vec3(0.12, 0.2, 0.05);
// The game lights its walls nearly evenly, whichever way they face: fill on the stone's faces.
const vec3 STONE_FILL = vec3(0.3, 0.29, 0.25);
// Sand, the game's orange tan.
const vec3 SAND_DRY = vec3(0.6, 0.36, 0.1);
const vec3 SAND_LIGHT = vec3(0.72, 0.47, 0.16);
const vec3 SAND_WET = vec3(0.3, 0.19, 0.07);
// The earth cliffs under the grass, the game's dark red-brown.
const vec3 EARTH_DARK = vec3(0.03, 0.017, 0.016);
const vec3 EARTH = vec3(0.085, 0.05, 0.045);
const vec3 EARTH_LIGHT = vec3(0.16, 0.1, 0.08);
// Grass, the game's deep green swept in darker strokes; its tall grass lighter.
const vec3 GRASS_DARK = vec3(0.007, 0.085, 0.022);
const vec3 GRASS = vec3(0.03, 0.235, 0.05);
const vec3 GRASS_LIGHT = vec3(0.075, 0.33, 0.075);
const vec3 TALL_GRASS = vec3(0.1, 0.33, 0.1);
const vec3 TREE_DARK = vec3(0.004, 0.06, 0.025);
const vec3 TREE_MID = vec3(0.02, 0.21, 0.07);
const vec3 TREE_LIGHT = vec3(0.15, 0.48, 0.18);
// Boulders, warm grey-brown.
const vec3 BOULDER_DARK = vec3(0.09, 0.068, 0.055);
const vec3 BOULDER_MID = vec3(0.19, 0.135, 0.105);
const vec3 BOULDER_LIGHT = vec3(0.38, 0.3, 0.24);
// The pier's and the fence's weathered wood.
const vec3 WOOD_DARK = vec3(0.07, 0.06, 0.045);
const vec3 WOOD_LIGHT = vec3(0.45, 0.41, 0.32);
// The water, the game's teal: deep, base, light; the art's white strokes.
const vec3 WATER_DEEP = vec3(0.006, 0.115, 0.11);
const vec3 WATER = vec3(0.025, 0.27, 0.25);
const vec3 WATER_LIGHT = vec3(0.13, 0.5, 0.45);
const vec3 WATER_STREAK = vec3(0.8, 0.95, 0.95);
const vec3 FALL_TEAL = vec3(0.05, 0.32, 0.32);
const vec3 FALL_LIGHT = vec3(0.4, 0.66, 0.64);
const vec3 FOAM_LIT = vec3(0.95, 0.97, 0.98);
const vec3 FOAM_SHADE = vec3(0.6, 0.72, 0.78);
const vec3 BED_SAND = vec3(0.5, 0.38, 0.2);
vec3 skyColor(vec3 dir) {
  return mix(vec3(0.62, 0.8, 0.9), vec3(0.15, 0.42, 0.78), pow(clamp(dir.z, 0.0, 1.0), 0.6));
}
`;

// The ground's materials, the game's: grass, earth cliffs, sand, laid stone. After NOISE, VORONOI and PALETTE.
const MATERIALS = /* glsl */ `
// Grass as the game paints it: green brushed with short dark strokes at a slant, crisp-edged,
// lighter in broad patches; tall grass in patches, lighter, in upright tufts.
vec3 grassColour(vec2 p) {
  vec2 q = vec2(0.8 * p.x + 0.6 * p.y, 0.8 * p.y - 0.6 * p.x);
  // Design 080: the strokes are 2-3 px across; where the screen can't draw that they fade to their
  // mean tone instead of breaking into speckle.
  float fine = patternFade(filterPixel, 4.5);
  float strokes = gnoise(q / vec2(12.0, 2.4)) * 0.65 + gnoise(q / vec2(5.0, 1.6) + 4.0) * 0.35;
  vec3 c = mix(GRASS, GRASS_DARK, mix(0.3, smoothstep(0.54, 0.64, strokes), fine));
  c = mix(c, GRASS_LIGHT, smoothstep(0.58, 0.8, fbm3(p / 120.0 + 1.7)) * 0.55);
  float tall = smoothstep(0.64, 0.68, fbm3(p / 70.0 + 12.0));
  if (tall > 0.0) {
    vec2 cell = floor(p / vec2(5.0, 7.0));
    float tuft = mix(0.52, gnoise(p / vec2(2.0, 6.0) + hash12(cell) * 3.0), fine);
    vec3 tallColour = mix(GRASS, TALL_GRASS, smoothstep(0.3, 0.75, tuft)) * (0.975 + (0.25 * hash12(cell + 3.0) - 0.125) * fine);
    c = mix(c, tallColour, tall);
  }
  return c;
}
// The earth cliffs: dark red-brown, mottled, lighter strata running along their faces (by height,
// wavering), seen from above as bands along each cliff.
vec3 earthColour(vec2 p, float height) {
  vec3 c = mix(EARTH_DARK, EARTH, smoothstep(0.25, 0.75, gnoise(p / 6.0)));
  float strata = sin(height / 4.5 + gnoise(p / 30.0) * 5.0);
  return mix(c, EARTH_LIGHT, smoothstep(0.7, 0.95, strata) * 0.55);
}
// Sand: the game's orange tan, grained, lighter in drifts, damp and dark at the water.
vec3 sandColour(vec2 p, float land) {
  vec3 c = mix(SAND_DRY, SAND_LIGHT, smoothstep(0.4, 0.8, fbm3(p / 60.0 + 5.0)) * 0.7);
  c *= 0.93 + 0.1 * grain(p, 2.5);
  return mix(SAND_WET, c, smoothstep(0.5, 7.0, land));
}
// A wall's courses as the game lays them: rows of big rough stones 17 px high and 24..44 px long,
// well rounded, each row's joints set off from the last, each stone's outline a little lumpy. x 0 in
// the mortar to 1 inside a stone, y the stone's own shade.
vec2 stoneCourses(vec2 uv, float block) {
  float row = floor(uv.y / 17.0);
  float run = 24.0 + 20.0 * hash12(vec2(row, block * 3.1));
  float u = uv.x / run + hash12(vec2(row * 1.7, 4.0 + block));
  vec2 local = (vec2(fract(u), fract(uv.y / 17.0)) - 0.5) * vec2(run, 17.0);
  vec2 q = abs(local) - vec2(run, 17.0) * 0.5 + 7.0;
  float inside = 5.5 - length(max(q, 0.0)) - min(max(q.x, q.y), 0.0) + (gnoise(uv / 4.0 + block) - 0.5) * 2.5;
  return vec2(smoothstep(0.0, 2.5, inside), hash12(vec2(floor(u), row) + block * 13.0));
}
// The stone: the game's courses on its faces, flagstones on its tops, the mortar dark between, each
// stone its own shade, moss in the joints and in patches. uv is px along the face (or across the
// ground) and up it; level 1 on a top.
vec3 stoneColour(vec2 uv, float block, float level) {
  vec4 flag = voronoiCell(vec2(uv.x / 26.0, uv.y / 16.0) + block * 7.0);
  vec2 course = stoneCourses(uv, block);
  float joint = mix(1.0 - course.x, 1.0 - smoothstep(0.02, 0.07, flag.x), level);
  float tone = mix(course.y, flag.y, level);
  vec3 c = mix(STONE_MID, STONE_LIGHT, 0.25 + 0.65 * tone);
  // Rounded stones catch the light along their tops and darken toward their feet.
  float swell = fract(uv.y / 17.0);
  c *= mix(1.0, 0.82 + 0.3 * smoothstep(0.15, 0.85, swell), 1.0 - level);
  c *= 0.88 + 0.22 * gnoise(uv / 5.0 + tone * 9.0);
  c = mix(c, STONE_DARK, joint * 0.55);
  float moss = smoothstep(0.55, 0.72, gnoise(uv / 22.0 + block * 3.0)) * (0.35 + joint * 0.4 + level * 0.25);
  return mix(c, MOSS, moss * 0.35);
}
`;

const SHADING = /* glsl */ `
// Sun and sky on a matte surface; shade 0..1 is the sun's share (cast shadows).
vec3 lit(vec3 albedo, vec3 n, float shade, float occlusion) {
  return albedo * (SKY_LIGHT * mix(0.55, 1.0, occlusion) + SUN_LIGHT * max(dot(n, normalize(uSun)), 0.0) * shade);
}
vec3 bakedNormal(vec4 light, float growth) {
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  return normalize(vec3(nxy / nz * growth, 1.0));
}
// The reveal's edge: a line of bright water washing the place in (and out).
float revealRim(vec2 p) {
  float front = revealFront();
  float rim = smoothstep(front - 0.035, front - 0.004, revealReach(p)) * step(uReveal, 0.999);
  float gone = uExit * 1.1;
  return max(rim, (1.0 - smoothstep(gone, gone + 0.04, fbm3(p / 110.0 + 5.0))) * step(0.001, uExit));
}
// Darker toward the scene's edges, past which the table's own floor shows.
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.72, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

const CELLS = /* glsl */ `
// Distance (cell units) from x to the border between its two nearest cell points (F2 - F1); the
// points wander on circles as time runs.
float cellBorder(vec2 x, float time) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(n + g);
      vec2 r = g + 0.5 + 0.38 * sin(time + 6.2831853 * h) - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return sqrt(f2) - sqrt(f1);
}
// Foam as bubble rafts seen from above: white with round holes of many sizes. The holes grow as
// the foam thins, until only threads remain between them; then the threads break up in patches.
float foamLace(vec2 q, float amount) {
  if (amount < 0.02) return 0.0;
  vec2 warp = (vec2(gnoise(q / 23.0), gnoise(q / 23.0 + 5.3)) - 0.5) * 9.0;
  vec2 x = (q + warp) / 8.0;
  vec2 cell = floor(x);
  vec2 f = fract(x);
  float open = 1.25 - amount;
  float hole = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float radius = (0.3 + 0.42 * hash12(cell + g + 17.0)) * open;
      float d = length(g + 0.15 + 0.7 * hash22(cell + g) - f);
      hole = max(hole, 1.0 - smoothstep(radius - 0.1, radius, d));
    }
  }
  float patches = smoothstep(0.08, 0.16, amount + 0.4 * (gnoise(q / 34.0 + 3.0) - 0.5));
  return (1.0 - hole) * patches;
}
// Caustics on the bed: two drifting nets of light.
float caustics(vec2 q, float time) {
  float a = 1.0 - smoothstep(0.0, 0.16, cellBorder(q / 24.0 + vec2(0.11, 0.07) * time, time * 0.9));
  float b = 1.0 - smoothstep(0.0, 0.2, cellBorder(q / 17.0 - vec2(0.08, -0.1) * time + 3.7, time * 1.2));
  return a * a * 0.65 + b * b * 0.45;
}
`;

const WATER_LOOK = /* glsl */ `
// The game's water texture: a mottle of small ripples drifting in two layers, dark and thin along
// their threads, a light glint in each cell's hollow. 0..1, about 0.55 the plain teal.
float ripplePattern(vec2 p, float time) {
  float a = cellBorder(p / 13.0 + vec2(0.05, 0.03) * time, time * 0.7);
  float b = cellBorder(p / 9.0 + vec2(-0.035, 0.045) * time + 7.3, time * 0.55 + 2.0);
  float threads = (1.0 - smoothstep(0.0, 0.08, a)) * 0.55 + (1.0 - smoothstep(0.0, 0.07, b)) * 0.4;
  float glints = smoothstep(0.35, 0.6, a) * 0.35 + smoothstep(0.3, 0.55, b) * 0.25;
  return clamp(0.55 - 0.5 * threads + 0.5 * glints, 0.0, 1.0);
}
// The game's teal under its ripple texture, lighter and darker in broad slow patches.
vec3 gameWater(vec2 p, float time) {
  float ripple = ripplePattern(p, time);
  vec3 c = mix(WATER_DEEP, WATER, smoothstep(0.05, 0.55, ripple));
  c = mix(c, WATER_LIGHT, smoothstep(0.6, 1.0, ripple) * 0.7);
  return c * (0.9 + 0.2 * fbm3(p / 220.0 + time * 0.01));
}
`;

/**
 * Bake 1: the ground. The zones' ground (the hill's ledge and flats, the near shore's path and drop,
 * the banks' beach and cliffs) round the lake bed; the basin a step down inside its kerb, the notch
 * the lake pours through; the towers with their pools and spouts; boulders, bushes and the pier
 * standing on top.
 */
export const FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vUv;
${NOISE}
${PLACE}
${STRUCTURES}
${FALL_UNIFORMS}
${THINGS}
${GROUND}
void main() {
  vec2 p = uMin + vUv * uSize;
  float land = landDistance(p);
  float ground = groundHeight(p, land);
  float kind = -1.0;
  // The basin a step down inside its kerb; the towers (the higher wall wins where two meet).
  vec2 built = basinAt(p);
  for (int i = 0; i < ${TOWER_MAX}; i++) {
    vec2 here = towerAt(p, i);
    if (here.x > built.x) built = here;
  }
  if (built.x > -1e3) {
    ground = built.x;
    kind = built.y;
  }
  // What stands on the ground: the highest thing here, else any whose edge is within STAND_MARGIN.
  vec2 thing = vec2(0.0, -1.0);
  float near = -1.0;
  for (int i = 0; i < ${ROCK_MAX}; i++) {
    vec4 stoneAt = uRocks[i];
    if (stoneAt.z <= 0.0) continue;
    // A boulder stands on the ground at its middle, so where the ledge rises behind it the ledge
    // wins; one out on the lake stands on its bed and breaks the surface.
    float base = groundHeight(stoneAt.xy, landDistance(stoneAt.xy));
    vec3 stone = boulder(p, stoneAt, max(-base, 0.0));
    float over = base + stone.x - ground;
    if (stone.x > 0.0 && over > thing.x) thing = vec2(over, stone.y);
    if (stone.z > 0.5) near = stone.y;
  }
  for (int i = 0; i < ${TREE_MAX}; i++) {
    if (uTrees[i].z <= 0.0) continue;
    vec3 crown = treeCrown(p, uTrees[i]);
    if (crown.x > thing.x) thing = crown.xy;
    if (crown.z > 0.5) near = crown.y;
  }
  if (onDock(p, 0.0) > 0.5) thing = vec2(max(DOCK_DECK + 3.0 * onPost(p) - ground, 0.7), 4.0);
  if (onDock(p, STAND_MARGIN) > 0.5) near = 4.0;
  gl_FragColor = vec4(ground + thing.x, land, kind, thing.x > 0.6 ? thing.y : near);
}
`;

export const LAND_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float growth = terrainGrowth(p);
  float height = groundAt(uv) * growth * edgeSkirt(uv);
  vPos = p;
  vUv = uv;
  vHeight = height;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, height, 1.0);
}
`;

/** The land: the banks' sand, earth cliffs and grass, the ledge's sand, the towers' and the kerb's stone, the pools, the basin and its notch, boulders, bushes, the pier. */
export const LAND_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FILTERING}
${VORONOI}
${REVEAL}
${PLACE}
${STRUCTURES}
${FALL_UNIFORMS}
${THINGS}
${PALETTE}
${SHADING}
${MATERIALS}
${CELLS}
${WATER_LOOK}
varying vec2 vPos;
varying vec2 vUv;
varying float vHeight;
varying float vGrowth;
// Churn where a fall lands in a pool or the basin (kind 1, 2): 0..1.
float landingChurn(vec2 p) {
  float churn = 0.0;
  for (int i = 0; i < ${FALL_MAX}; i++) {
    if (uFallKind[i] < 0.5 || uFallShapes[i].x <= 0.0) continue;
    vec2 d = p - fallLanding(i);
    float reach = uFallShapes[i].x * 1.1;
    if (dot(d, d) > reach * reach * 4.0) continue;
    churn = max(churn, foamLace(vec2(d.y, d.x + uTime * 12.0) * 0.7 + 37.0 + float(i) * 11.0, 1.0 - smoothstep(reach * 0.3, reach, length(d))));
  }
  return churn;
}
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float land = field.g;
  // The lake: its sheet draws wherever the ground lies at its level or under it on the water's side
  // of the shore (its own test, the same texel), so the two never fight over a px at the shore.
  if (field.r * vGrowth <= 0.3 && land < 4.0) discard;
  vec4 light = texture2D(uLight, vUv);
  // The ids off the nearest texel: blending two ids would make a third.
  vec4 ids = texture2D(uField, (floor(vUv / uTexel) + 0.5) * uTexel);
  float kind = floor(ids.b + 0.01);
  float which = ids.b - kind;
  float id = ids.a;
  vec3 sun = normalize(uSun);
  vec3 n = bakedNormal(light, vGrowth);
  float shade = light.a;
  float occlusion = light.b;
  float steep = 1.0 - n.z;
  float standing = 1.0 - step(-0.5, id);

  // Down the slope: the way the ground falls over a few px (on level ground any way serves); on a
  // face, px along it and up it.
  vec2 reach = 6.0 / uSize;
  vec2 descent = -vec2(
    texture2D(uField, vUv + vec2(reach.x, 0.0)).r - texture2D(uField, vUv - vec2(reach.x, 0.0)).r,
    texture2D(uField, vUv + vec2(0.0, reach.y)).r - texture2D(uField, vUv - vec2(0.0, reach.y)).r
  );
  vec2 downhill = length(descent) > 0.5 ? normalize(descent) : vec2(1.0, 0.0);
  float face = smoothstep(0.22, 0.45, steep);
  vec2 faceUv = vec2(dot(p, vec2(-downhill.y, downhill.x)), vHeight);

  // The zones' ground: sand on the hill, on the banks' beach and the near path; grass up the banks and
  // past the path; stone on the hill's walls, dark earth on the other cliffs.
  float hill = hillShare(p);
  float near = nearShare(p);
  float bank = max(1.0 - hill - near, 0.0);
  float beachTop = 1.0 - smoothstep(beachWidth(p) - 3.0, beachWidth(p) + 1.0, land);
  float pathTop = (1.0 - smoothstep(pathWidth(p) - 2.0, pathWidth(p) + 1.0, land)) * pathShare(p);
  float sandy = clamp(hill + bank * beachTop + near * pathTop, 0.0, 1.0);
  vec3 albedo = sandy > 0.99 ? sandColour(p, land) : grassColour(p);
  if (sandy > 0.01 && sandy <= 0.99) albedo = mix(albedo, sandColour(p, land), sandy);
  float stoneShare = hill * face;
  if (face > 0.01) {
    vec3 faceColour = hill > 0.99 ? stoneColour(faceUv, 0.0, 0.0) : earthColour(p, vHeight);
    if (hill > 0.01 && hill <= 0.99) faceColour = mix(faceColour, stoneColour(faceUv, 0.0, 0.0), hill);
    albedo = mix(albedo, faceColour, face);
  }
  // The built ground: the towers' and the kerb's stone; the pools, the basin and the notch are water.
  bool water = (kind > 2.5 && kind < 4.5) || kind > 5.5;
  if ((kind > 0.5 && kind < 1.5) || (kind > 4.5 && kind < 5.5)) {
    albedo = stoneColour(mix(p, faceUv, face), which * 7.0 + kind, 1.0 - face);
    stoneShare = 1.0;
  }
  // The faces take the water's bounce; the stone's take the game's even fill too.
  vec3 col = lit(albedo, n, shade, occlusion) + albedo * face * occlusion * (BOUNCE_LIGHT + STONE_FILL * stoneShare);

  // Along each lip the stone, sand or grass catches the light in a painted rim; at each foot the
  // ground below lies in a dark crease.
  float edgeDrop = field.r - texture2D(uField, vUv + downhill * 3.0 / uSize).r;
  float rim = smoothstep(5.0, 12.0, edgeDrop) * standing * (1.0 - face);
  vec3 rimColour = stoneShare > 0.5 || hill > 0.5 ? STONE_RIM : (sandy > 0.5 ? SAND_LIGHT : GRASS_LIGHT * 1.4);
  col = mix(col, lit(rimColour, vec3(0.0, 0.0, 1.0), shade, 1.0), rim * 0.55);
  float footRise = texture2D(uField, vUv - downhill * 6.0 / uSize).r - field.r;
  col *= 1.0 - 0.3 * smoothstep(4.0, 14.0, footRise) * standing;

  // The pools and the basin: the game's water, darker under the walls, a crisp white line at the
  // walls, streaming out through each tower's spout (and in through the basin's notch), churned white
  // where a fall lands.
  if (water) {
    float inside;
    float spout = 0.0;
    vec2 flow = vec2(0.0);
    if (kind < 3.5) {
      int i = int(which * 4.0 + 0.5);
      vec4 t = uTowers[i];
      inside = t.z - WALL - distance(p, t.xy);
      spout = towerSpout(p, i) * smoothstep(-6.0, 4.0, -inside);
      flow = uNotches[i].xy;
    } else if (kind < 4.5) {
      inside = uBasin.z - KERB - distance(p, uBasin.xy);
    } else {
      inside = 20.0;
      spout = 1.0;
      flow = -uBasinNotch.xy;
    }
    vec3 pool = gameWater(p, uTime) * mix(0.7, 1.0, shade) * mix(0.75, 1.0, smoothstep(2.0, 16.0, inside));
    float rush = gnoise(vec2(dot(p, vec2(-flow.y, flow.x)) / 3.0, (dot(p, flow) - uTime * 40.0) / 9.0));
    pool = mix(pool, FALL_LIGHT, spout * smoothstep(0.45, 0.8, rush) * 0.7);
    float line = 1.0 - smoothstep(1.6, 3.2, inside + 0.5 * sin(uTime * 1.4 + (p.x + p.y) * 0.05));
    pool = mix(pool, FOAM_LIT, line * 0.9 * (1.0 - spout));
    pool = mix(pool, mix(FOAM_SHADE, FOAM_LIT, shade), landingChurn(p));
    col = pool;
  }

  // What stands on the ground: boulders, round bushes, the pier.
  if (id > -0.5 && id < 1.5) {
    float facing = dot(n, sun) * mix(0.65, 1.0, shade);
    vec3 boulderColour = mix(BOULDER_DARK, BOULDER_MID, smoothstep(0.1, 0.45, facing));
    boulderColour = mix(boulderColour, BOULDER_LIGHT, smoothstep(0.6, 0.85, facing));
    boulderColour *= (0.9 + 0.2 * fract(id * 13.7)) * (0.82 + 0.34 * fbm3(p / 7.0 + id * 9.0));
    // Wet and darker just above the water.
    boulderColour = mix(boulderColour * vec3(0.6, 0.66, 0.66), boulderColour, smoothstep(0.5, 5.0, vHeight));
    col = mix(boulderColour * 0.75, boulderColour, smoothstep(0.25, 0.8, occlusion));
  } else if (id > 1.5 && id < 3.5) {
    // Leaf clumps on the crown's own shape, lit in soft steps like the game's bushes.
    float seed = fract(id);
    vec2 leaf = vec2(gnoise(p / 5.0 + seed * 40.0), gnoise(p / 5.0 + 3.1 + seed * 40.0)) - 0.5;
    vec3 leafNormal = normalize(n + vec3(leaf * 1.1, 0.0));
    float key = max(dot(leafNormal, sun), 0.0) * mix(0.35, 1.0, shade);
    vec3 leaves = mix(TREE_DARK, TREE_MID, smoothstep(0.12, 0.42, key));
    leaves = mix(leaves, TREE_LIGHT, smoothstep(0.62, 0.84, key));
    col = leaves * mix(0.7, 1.0, occlusion) * (0.94 + 0.12 * seed) * 1.15;
  } else if (id > 3.5) {
    // The game's pier: two sections of boards running out along it, a cross board at each end of
    // each, a gap between them; posts at their corners.
    vec2 q = dockFrame(p);
    float sectionLength = uDockSize.x * 0.5;
    float section = step(sectionLength, q.x);
    float toEnd = min(min(abs(q.x), abs(q.x - uDockSize.x)), abs(abs(q.x - sectionLength) - 1.5));
    float onCross = 1.0 - step(7.0, toEnd);
    float lanes = (q.y + uDockSize.y * 0.5) / 8.0;
    float lane = floor(lanes);
    float laneSeam = 1.0 - smoothstep(0.05, 0.14, min(fract(lanes), 1.0 - fract(lanes)));
    float crossSeam = 1.0 - smoothstep(0.4, 1.2, abs(toEnd - 7.0));
    float plank = mix(lane, 40.0 + floor(q.x / 7.0), onCross);
    vec3 wood = mix(WOOD_DARK, WOOD_LIGHT, 0.6 + 0.3 * hash12(vec2(plank, section + 4.0)));
    float grain = mix(gnoise(vec2(q.x / 14.0, q.y / 2.0 + lane * 3.0)), gnoise(vec2(q.y / 14.0, q.x / 2.0)), onCross);
    wood *= 0.88 + 0.2 * grain;
    float gap = 1.0 - smoothstep(1.0, 2.0, abs(q.x - sectionLength));
    wood = mix(wood, WOOD_DARK * 0.6, max(max(laneSeam * (1.0 - onCross), crossSeam) * 0.7, gap));
    wood = mix(wood, wood * 0.55, onPost(p));
    col = lit(wood, n, shade, occlusion);
  }

  col = edgeHaze(col, vUv);
  col = mix(col, FOAM_LIT, revealRim(p) * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const STONEWORK_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
// The part (stadium-env-brooklet-layout.mjs STONEWORK_PARTS), px along it, which ring; the wall's top
// and the water its foot stands in (STONEWORK_ON_GROUND: the ground).
attribute vec3 aPart;
attribute vec2 aLevels;
varying vec3 vPart;
varying vec2 vLevels;
varying vec3 vNormal;
varying vec3 vPos;
varying float vGround;
varying float vGrowth;
void main() {
  float growth = terrainGrowth(position.xy);
  vec3 p = vec3(position.xy, position.z * growth);
  vPart = aPart;
  vLevels = aLevels;
  vNormal = normal;
  vPos = p;
  vGround = groundAt((position.xy - uMin) / uSize) * growth;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

/**
 * The towers, the basin's kerb and the ledge's walls: the game's courses of olive-tan stone on every
 * wall, lit nearly evenly, dark where a wall meets the ground or its water, a light coping stone along
 * each top; flagstones on the copings; the cave's dark arch in the upper tower's wall over the ledge.
 */
export const STONEWORK_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FILTERING}
${VORONOI}
${REVEAL}
${STRUCTURES}
${PALETTE}
${SHADING}
${MATERIALS}
varying vec3 vPart;
varying vec2 vLevels;
varying vec3 vNormal;
varying vec3 vPos;
varying float vGround;
varying float vGrowth;
void main() {
  vec2 p = vPos.xy;
  filterPixel = pixelSize(p);
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  float part = floor(vPart.x + 0.5);
  float along = vPart.y;
  float which = floor(vPart.z + 0.5);
  vec3 n = normalize(vNormal);
  vec2 uv = (p - uMin) / uSize;
  vec4 light = texture2D(uLight, uv);
  float height = vPos.z;
  bool top = (part > 0.5 && part < 1.5) || (part > 3.5 && part < 4.5);
  float block = which * 7.0 + 1.0;
  vec3 albedo = top ? stoneColour(p, block, 1.0) : stoneColour(vec2(along, height), block, 0.0);
  vec3 col = lit(albedo, n, top ? light.a : 1.0, 1.0);
  if (!top) {
    // The game lights its walls nearly evenly: fill on every face, the lake's bounce low on them.
    col += albedo * (STONE_FILL + BOUNCE_LIGHT * (1.0 - smoothstep(0.0, 60.0, height)));
    // Dark where a wall meets the ground or its water.
    float foot = height - (vLevels.y > -1e3 ? vLevels.y * vGrowth : vGround);
    col *= mix(0.5, 1.0, smoothstep(0.0, 16.0, foot));
    // A light coping stone along each wall's top.
    float topZ = vLevels.x * vGrowth;
    col = mix(col, lit(STONE_RIM, vec3(0.0, 0.0, 1.0), light.a, 1.0) + STONE_RIM * STONE_FILL * 0.5, (1.0 - smoothstep(2.0, 5.0, topZ - height)) * 0.55);
  }
  // The cave, in the upper tower's wall over the ledge's top: a dark arch under a frame of lighter
  // stones.
  if (uCave.z > 0.0 && part < 0.5 && which > 0.5 && which < 1.5) {
    vec4 t = uTowers[1];
    float turn = atan(p.y - t.y, p.x - t.x) - atan(uCave.y - t.y, uCave.x - t.x);
    float u = t.z * (mod(turn + 3.1415927, 6.2831853) - 3.1415927) / uCave.z;
    float floorZ = LEDGE_TOP * vGrowth;
    float archZ = floorZ + uCave.w * vGrowth * sqrt(max(1.0 - u * u, 0.0));
    float mouth = step(abs(u), 1.0) * step(floorZ - 1.0, height) * step(height, archZ);
    float frame = step(abs(u), 1.3) * step(floorZ - 1.0, height) * step(height, archZ + 6.0 * vGrowth) * (1.0 - mouth);
    col = mix(col, col * 1.3 + 0.03, frame * 0.6);
    col = mix(col, vec3(0.012, 0.01, 0.008) + vec3(0.035, 0.03, 0.022) * smoothstep(0.55, 1.0, abs(u)), mouth);
  }
  col = edgeHaze(col, uv);
  col = mix(col, FOAM_LIT, revealRim(p) * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

export const LAKE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vPos = position.xy;
  vUv = (position.xy - uMin) / uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
}
`;

const WAVES = /* glsl */ `
// The swell's main train: its way, px between crests, px/s.
const vec2 SWELL_DIR = vec2(0.22, 0.975);
const float SWELL_SPAN = 40.0;
const float SWELL_SPEED = 9.0;
// One wave train: x height (-1..1), yz its gradient per px.
vec3 rippleTrain(vec2 p, float time, vec2 dir, float span, float speed) {
  float k = 6.2831853 / span;
  float phase = (dot(p, dir) - time * speed) * k;
  return vec3(sin(phase), dir * k * cos(phase));
}
// The swell: long low waves rolling toward the viewer, their crests across the table as the art's run
// across the picture, two weaker trains across them; warped so the crests wander.
vec3 waves(vec2 p, float time) {
  vec2 q = p + (vec2(gnoise(p / 70.0 + time * 0.05), gnoise(p / 70.0 + 4.1 - time * 0.04)) - 0.5) * 34.0;
  return rippleTrain(q, time, SWELL_DIR, SWELL_SPAN, SWELL_SPEED) * 0.75
    + rippleTrain(q, time, vec2(0.75, -0.66), 24.0, 6.5) * 0.22
    + rippleTrain(q, time, vec2(-0.5, 0.866), 58.0, 11.0) * 0.22;
}
// Rings spreading from a point: speed px/s, span px apart, fading over reach px past start.
vec3 ringsFrom(vec2 p, vec2 centre, float time, float speed, float span, float reach, float start) {
  vec2 d = p - centre;
  float r = max(length(d), 1e-3);
  float k = 6.2831853 / span;
  float phase = (r - time * speed) * k;
  float amp = exp(-max(r - start, 0.0) / reach) * smoothstep(start - 2.0, start + 8.0, r);
  return vec3(sin(phase), d / r * k * cos(phase)) * amp;
}
// Rings off every fall landing in the lake, and round each boulder.
vec3 plungeRings(vec2 p, float time) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${FALL_MAX}; i++) {
    if (uFallKind[i] < -0.5 || uFallKind[i] > 0.5 || uFallShapes[i].x <= 0.0) continue;
    sum += ringsFrom(p, fallLanding(i), time, 26.0, 16.0, 110.0, uFallShapes[i].x * 0.6) * 0.9;
  }
  return sum;
}
vec3 rockRings(vec2 p, float time) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${ROCK_MAX}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    sum += ringsFrom(p, rock.xy, time, 7.0, 11.0, 26.0, rock.z * 1.15) * 0.5;
  }
  return sum;
}
// Now and then a fish rises: a ring spreads from a random spot out on the water and fades.
vec3 fishRings(vec2 p, float time) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float period = 4.6 + fi * 1.9;
    float cycle = time / period + fi * 0.37;
    float age = fract(cycle) * period;
    vec2 spot = uCore.xy + (0.15 + 0.7 * hash22(vec2(floor(cycle), fi * 9.1))) * (uCore.zw - uCore.xy);
    vec2 d = p - spot;
    float r = max(length(d), 1e-3);
    float x = (r - 3.0 - age * 18.0) / 4.5;
    float h = exp(-x * x) * exp(-age / 1.2) * 0.8;
    sum += vec3(h, d / r * h * (-2.0 * x / 4.5));
  }
  return sum;
}
// The plunge: water churned white where each fall lands in the lake, thinning outward; the current
// carries lacy patches of old foam off over the lake.
float plungeFoam(vec2 p, float time) {
  float foam = 0.0;
  for (int i = 0; i < ${FALL_MAX}; i++) {
    if (uFallKind[i] < -0.5 || uFallKind[i] > 0.5 || uFallShapes[i].x <= 0.0) continue;
    vec2 d = p - fallLanding(i);
    float r = length(d);
    float size = uFallShapes[i].x / 30.0;
    if (r > 260.0 * size) continue;
    vec2 flow = uFalls[i].zw * time * 8.0;
    float churn = foamLace((p - flow) * 0.65 + 40.0 + float(i) * 17.0, exp(-r / (16.0 * size)) * 1.2);
    float ahead = smoothstep(-0.4, 0.3, dot(d / max(r, 1e-3), uFalls[i].zw));
    float patches = smoothstep(0.4, 0.7, fbm3((p - flow * 1.4) / 70.0));
    float drift = foamLace((p - flow * 1.4) * 0.65 + 90.0, 0.32 * exp(-r / (80.0 * size)) * patches * ahead);
    foam = max(foam, max(churn, drift));
  }
  return foam;
}
// White water swirling round each boulder where it breaks the surface, in a ring hugging it as the
// game draws them.
float rockFoam(vec2 p, float time) {
  float foam = 0.0;
  for (int i = 0; i < ${ROCK_MAX}; i++) {
    vec4 rock = uRocks[i];
    if (rock.z <= 0.0) continue;
    float apart = length(p - rock.xy) / rock.z;
    if (apart > 1.4) continue;
    vec2 swirl = (p - rock.xy) * 0.75 + vec2(time * 2.5, 0.0) + rock.w * 60.0;
    foam = max(foam, foamLace(swirl, (1.0 - smoothstep(0.85, 1.3, apart)) * 0.6));
  }
  return foam;
}
// The water drawn toward the spill's lip: streaks running out to it, faster near it. 0..1.
float spillRush(vec2 p, float time) {
  float rush = 0.0;
  for (int i = 0; i < ${FALL_MAX}; i++) {
    if (uFallKind[i] < 1.5 || uFallShapes[i].x <= 0.0) continue;
    vec2 q = fallFrame(p, i);
    float near = (1.0 - smoothstep(0.0, 70.0, -q.x)) * step(q.x, 2.0) * (1.0 - smoothstep(uFallShapes[i].x * 0.7, uFallShapes[i].x * 1.3, abs(q.y)));
    if (near <= 0.0) continue;
    float streak = gnoise(vec2(q.y / 3.0, (q.x - time * 34.0) / 10.0));
    rush = max(rush, near * smoothstep(0.5, 0.8, streak));
  }
  return rush;
}
// The art's painted crests: short white crescent strokes lying along the swell's crests, each a few
// px thick in the middle, tapering to points, bowed, gathered in patches; they ride the swell, showing
// where a crest passes under them.
float crestStrokes(vec2 p, float swell, float time) {
  float gate = smoothstep(0.2, 0.6, swell);
  if (gate <= 0.0) return 0.0;
  vec2 along = vec2(SWELL_DIR.y, -SWELL_DIR.x);
  vec2 q = p - SWELL_DIR * time * SWELL_SPEED * 0.8;
  vec2 f = vec2(dot(q, along), dot(q, SWELL_DIR));
  vec2 cellSize = vec2(34.0, 15.0);
  vec2 base = floor(f / cellSize);
  float patches = smoothstep(0.3, 0.7, fbm3(p / 150.0 + 6.0));
  float stroke = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      vec4 h = vec4(hash22(cell + 3.1), hash22(cell + 9.7));
      if (h.w > 0.2 + 0.45 * patches) continue;
      vec2 d = f - (cell + 0.5 + (h.xy - 0.5) * vec2(0.7, 0.3)) * cellSize;
      float halfLength = 6.0 + (10.0 + 12.0 * patches) * h.z;
      float t = d.x / halfLength;
      if (abs(t) >= 1.0) continue;
      float bow = (fract(h.w * 13.1) - 0.5) * 0.5 * halfLength * t * t;
      float halfWidth = (1.0 + 1.2 * fract(h.z * 7.3)) * (1.0 - t * t);
      stroke = max(stroke, 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, abs(d.y - bow)));
    }
  }
  return stroke * gate;
}
// The sun glinting off the crests: big four-pointed stars twinkling a few at a time, more along the
// sun's path, as the art scatters them.
float sparkles(vec2 p, float time, float swell, float path) {
  vec2 cell = floor(p / 22.0);
  vec2 local = (fract(p / 22.0) - 0.5 - (hash22(cell) - 0.5) * 0.5) * 22.0;
  float seed = hash12(cell + 17.0);
  float twinkle = pow(max(sin(time * (1.2 + 2.0 * hash12(cell + 5.0)) + seed * 40.0), 0.0), 6.0);
  vec2 a = abs(local);
  float star = max(exp(-a.x * 0.8 - a.y * 0.13), exp(-a.y * 0.8 - a.x * 0.13)) + exp(-dot(a, a) * 0.2);
  return star * twinkle * step(seed, 0.06 + 0.2 * path) * smoothstep(0.0, 0.5, swell);
}
`;

/** The lake: the game's teal and ripples, rocks under it, waves, rings, foam, sky, the art's strokes and sparkles. */
export const LAKE_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FOOTPRINTS}
${REVEAL}
${TERRAIN_GROUND}
${PLACE}
${FALL_UNIFORMS}
${ROCK_UNIFORMS}
${SUNKEN}
${PALETTE}
${SHADING}
${CELLS}
${WATER_LOOK}
${WAVES}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  float growth = terrainGrowth(p);
  float offshore = -field.g;
  if (field.r * growth > 0.3 || offshore <= -4.0) discard;
  vec4 light = texture2D(uLight, vUv);
  vec3 sun = normalize(uSun);
  vec3 eye = normalize(uEye - vec3(p, 0.0));

  // The surface: the swell, rings off the plunges, round the boulders and where a fish rose; still at
  // the very edge.
  // Design 080: every card lies on this lake, so round the cards the water lies quiet: a gentle swell,
  // faint ripples, no fish rising, no crest strokes or sun sparkles; the lively water is out by the
  // falls, the boulders and the shores.
  float calm = fieldCalm(p, 90.0);
  vec3 wave = waves(p, uTime);
  vec3 rings = plungeRings(p, uTime) + rockRings(p, uTime) + fishRings(p, uTime) * (1.0 - calm);
  float still = growth * smoothstep(0.0, 6.0, offshore);
  vec2 gradient = (wave.yz * 1.1 * (1.0 - 0.6 * calm) + rings.yz * 1.2) * still;
  vec3 n = normalize(vec3(-gradient, 1.0));

  // The water: the game's teal and ripples; the sand shows through only in the first px of the
  // shallows. Darker in the walls' shade and close under them.
  vec3 col = gameWater(p + gradient * 6.0, uTime);
  col = mix(col, mix(WATER_DEEP, WATER, 0.62) * (0.92 + 0.16 * fbm3(p / 220.0 + uTime * 0.01)), calm * 0.65);
  vec3 bed = BED_SAND * (0.9 + 0.15 * gnoise(p / 30.0)) + caustics(p * 0.7, uTime) * 0.25;
  col = mix(col, bed * vec3(0.72, 0.93, 1.0), exp(-max(offshore, 0.0) / 4.0) * growth * 0.8);
  col *= mix(0.6, 1.0, light.a) * mix(0.72, 1.0, light.b);
  // Rocks under the surface: dark, lighter on their tops, wavering with the water.
  vec2 sunken = sunkenRock(p + gradient * 8.0) * still * (1.0 - calm);
  col = mix(col, col * vec3(0.34, 0.44, 0.48), sunken.x * 0.85);
  col = mix(col, WATER_LIGHT * 0.8, sunken.y * 0.45);
  // The art's swell: troughs a little deeper, its white crescent strokes on the crests.
  float swell = (wave.x + rings.x) / 1.2;
  col *= 1.0 - 0.18 * smoothstep(0.1, 0.9, -swell) * still;
  col = mix(col, WATER_STREAK, crestStrokes(p, swell, uTime) * 0.7 * still * (1.0 - calm));
  col = mix(col, FALL_LIGHT, spillRush(p, uTime) * 0.6);
  // The sky off the surface, by Fresnel; the sun's sparkles.
  vec3 mirror = reflect(-eye, n);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, eye), 0.0), 5.0);
  col = mix(col, skyColor(mirror), clamp(fresnel * 2.0, 0.0, 0.5));
  float path = smoothstep(0.86, 0.98, dot(reflect(-eye, vec3(0.0, 0.0, 1.0)), sun));
  float glint = sparkles(p, uTime, swell, path) * light.a * still * (1.0 - calm);

  // Foam: the plunges' churn and the lace they send off, white water round the boulders, and the
  // game's crisp white line at every waterline, the water a little darker just inside it.
  float foam = max(plungeFoam(p, uTime), rockFoam(p, uTime));
  float lapping = 0.5 * sin(uTime * 1.3 + (p.x + p.y) * 0.045);
  float line = 1.0 - smoothstep(0.8, 2.2, offshore + lapping * 0.4);
  col *= 1.0 - 0.24 * (1.0 - smoothstep(3.0, 36.0, offshore)) * growth;
  foam = max(foam, line * 0.95);
  col = mix(col, mix(FOAM_SHADE, FOAM_LIT, light.a), foam);
  col += vec3(1.0, 0.97, 0.9) * glint * (1.0 - foam);

  col = edgeHaze(col, vUv);
  col = mix(col, FOAM_LIT, revealRim(p) * 0.85);
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * The falls: a sheet of water leaves each lip level and bows out, falling ever steeper to where it
 * lands. position carries (across -1..1, down 0 at the lip..1 where it lands, fall).
 */
export const FALLS_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${FALL_UNIFORMS}
varying vec2 vPos;
varying vec3 vSheet;
void main() {
  float across = position.x;
  float down = position.y;
  int i = int(position.z + 0.5);
  vec4 fall = uFalls[i];
  vec4 shape = uFallShapes[i];
  float growth = terrainGrowth(fall.xy);
  float top = shape.z * growth;
  float bottom = shape.w * growth;
  // Thrown off the lip: out as the square root of the fall, so it leaves level and lands steep. It
  // starts a few px back, where the spout's water runs out.
  float along = -3.0 + (shape.y + 3.0) * sqrt(down);
  vec2 side = vec2(-fall.w, fall.z);
  vec2 p = fall.xy + fall.zw * along + side * across * shape.x * (0.9 + 0.22 * down);
  vPos = p;
  vSheet = vec3(across, down, top - bottom);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, mix(top, bottom, down), 1.0);
  // No sheet where there is no fall or no drop: past the clip volume, so it never draws.
  if (uFallKind[i] < -0.5 || shape.x <= 0.0 || top - bottom < 4.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`;

export const FALLS_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${PALETTE}
varying vec2 vPos;
varying vec3 vSheet;
void main() {
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  float across = vSheet.x;
  float down = vSheet.y;
  float fallen = down * vSheet.z;
  // A teal sheet, lighter where it leaves the lip, white strands pouring down it (the fine ones
  // faster), white spray where it lands; the sides ragged and thin.
  float strands = gnoise(vec2(across * 7.0, (fallen - uTime * 80.0) / 18.0));
  float fine = gnoise(vec2(across * 19.0 + 3.0, (fallen - uTime * 105.0) / 8.0));
  float streak = 0.55 * strands + 0.45 * fine;
  vec3 water = mix(FALL_LIGHT, FALL_TEAL, smoothstep(0.0, 0.3, down));
  water = mix(water, FOAM_LIT, smoothstep(0.5, 0.78, streak) * 0.85);
  water = mix(water, FOAM_LIT, smoothstep(0.75, 1.0, down) * 0.85);
  float edge = abs(across) + (fine - 0.5) * 0.3;
  float alpha = (1.0 - smoothstep(0.75, 1.0, edge)) * 0.95;
  gl_FragColor = vec4(water * (SKY_LIGHT * 1.35 + SUN_LIGHT * 0.5), alpha);
${OUTPUT}
}
`;

/** Spray rising where the falls land: soft white puffs drifting out as they thin, most off the biggest drops. */
export const MIST_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
uniform float uFocal;
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${FALL_UNIFORMS}
attribute vec4 aSeed;
varying float vLife;
varying float vSeed;
void main() {
  int i = int(min(aSeed.w * ${f(FALL_MAX)}, ${f(FALL_MAX - 1)}));
  vec4 fall = uFalls[i];
  vec4 shape = uFallShapes[i];
  float drop = shape.z - shape.w;
  float size = clamp(drop / 110.0, 0.35, 1.0) * clamp(shape.x / 30.0, 0.5, 1.0);
  float period = 2.8 + aSeed.y * 1.6;
  float life = mod(uTime + aSeed.z * period, period) / period;
  vec2 side = vec2(-fall.w, fall.z);
  vec2 at = fallLanding(i) - fall.zw * aSeed.y * 12.0 * size + side * (aSeed.x - 0.5) * 2.0 * shape.x;
  vec2 drift = fall.zw * life * 30.0 * size + side * sin(life * 3.0 + aSeed.x * 9.0) * 6.0;
  float growth = terrainGrowth(at);
  vec3 pos = vec3(at + drift, shape.w * growth + 4.0 + life * 40.0 * size);
  float shown = step(-0.5, uFallKind[i]) * step(20.0, drop) * step(0.001, shape.x) * revealBurned(at) * growth * (1.0 - uExit);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mix(14.0, 44.0, sqrt(life)) * size * (0.8 + 0.4 * aSeed.z) * uFocal / -mv.z * shown;
  vLife = life;
  vSeed = aSeed.x * 31.0;
}
`;

export const MIST_FRAGMENT = /* glsl */ `
${NOISE}
varying float vLife;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float edge = length(c) * 2.0 + (gnoise(c * 3.0 + vSeed) - 0.5) * 0.3;
  float puff = 1.0 - smoothstep(0.35, 0.95, edge);
  float fade = smoothstep(0.0, 0.2, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
  gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), puff * fade * 0.32);
${OUTPUT}
}
`;

/**
 * The fence along the near path: one box per post or rail, instanced. position is the unit box
 * (-0.5..0.5), normal its face's; per instance aSpan (from x, y, to x, y; a post's two ends meet)
 * and aShape (px over the ground, width, height). The box follows the baked ground.
 */
export const FENCE_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
attribute vec4 aSpan;
attribute vec3 aShape;
varying vec3 vNormal;
varying vec2 vPos;
varying float vAlong;
void main() {
  vec2 from = aSpan.xy;
  vec2 to = aSpan.zw;
  float run = length(to - from);
  vec2 dir = run > 0.01 ? (to - from) / run : vec2(1.0, 0.0);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 p = (from + to) * 0.5 + dir * position.x * max(run, aShape.y) + side * position.y * aShape.y;
  vec2 uv = (p - uMin) / uSize;
  float growth = terrainGrowth(p);
  float ground = groundAt(uv) * growth;
  float z = ground + (aShape.x + (position.z + 0.5) * aShape.z) * growth;
  vNormal = vec3(dir * normal.x + side * normal.y, normal.z);
  vPos = p;
  vAlong = dot(p, dir) + position.z * 3.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, z, 1.0);
  if (growth < 0.05) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`;

export const FENCE_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${PALETTE}
varying vec3 vNormal;
varying vec2 vPos;
varying float vAlong;
void main() {
  if (revealBurned(vPos) * exitKeep(vPos) < 0.5) discard;
  vec3 n = normalize(vNormal);
  // The game's fence: a warm mid brown, lit nearly evenly.
  vec3 wood = mix(vec3(0.05, 0.026, 0.012), vec3(0.2, 0.11, 0.05), 0.55 + 0.35 * gnoise(vec2(vAlong / 6.0, 0.5)));
  vec3 col = wood * (SKY_LIGHT * 1.2 + SUN_LIGHT * (0.35 + 0.5 * max(dot(n, normalize(uSun)), 0.0)));
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/** One sheet per fall, FALL_COLUMNS x FALL_ROWS quads; position carries (across -1..1, down 0..1, fall). */
const fallsGeometry = (three) => {
  const columns = FALL_COLUMNS;
  const rows = FALL_ROWS;
  const positions = [];
  const index = [];
  for (let fall = 0; fall < FALL_MAX; fall += 1) {
    const first = positions.length / 3;
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) positions.push((column / columns) * 2 - 1, row / rows, fall);
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const corner = first + row * (columns + 1) + column;
        const below = corner + columns + 1;
        index.push(corner, below, corner + 1, corner + 1, below, below + 1);
      }
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
};

/**
 * The fence's posts and the two rails between each pair of neighbours, one instanced unit box each:
 * aSpan (from x, y, to x, y; a post's ends meet), aShape (px over the ground, width, height).
 */
const fenceGeometry = (three, posts) => {
  const spans = [];
  const shapes = [];
  for (const post of posts) {
    spans.push(post.x, post.y, post.x, post.y);
    shapes.push(0, FENCE_POST.width, FENCE_POST.height);
  }
  for (let i = 1; i < posts.length; i += 1) {
    const [a, b] = [posts[i - 1], posts[i]];
    if (Math.hypot(b.x - a.x, b.y - a.y) > FENCE_SPACING_PX * 1.6) continue;
    for (const height of FENCE_RAIL.heights) {
      spans.push(a.x, a.y, b.x, b.y);
      shapes.push(height, FENCE_RAIL.thickness, FENCE_RAIL.thickness);
    }
  }
  const box = new three.BoxGeometry(1, 1, 1);
  const geometry = new three.InstancedBufferGeometry();
  geometry.setIndex(box.getIndex());
  geometry.setAttribute('position', box.getAttribute('position'));
  geometry.setAttribute('normal', box.getAttribute('normal'));
  geometry.setAttribute('aSpan', new three.InstancedBufferAttribute(Float32Array.from(spans), 4));
  geometry.setAttribute('aShape', new three.InstancedBufferAttribute(Float32Array.from(shapes), 3));
  geometry.instanceCount = spans.length / 4;
  return geometry;
};

/** The towers', the basin's kerb's and the ledge's stone (stadium-env-brooklet-layout.mjs stonework) as one mesh. */
const stoneworkGeometry = (three, spots) => {
  const { positions, normals, parts, levels, index } = stonework(spots);
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aPart', new three.Float32BufferAttribute(parts, 3));
  geometry.setAttribute('aLevels', new three.Float32BufferAttribute(levels, 2));
  geometry.setIndex(index);
  return geometry;
};

/** Sets each vector from the item at its index (`toValues` gives its components), zero past the list. */
const setEach = (vectors, items, toValues) =>
  vectors.forEach((vector, i) => (items[i] ? vector.set(...toValues(items[i])) : vector.set(0, 0, 0, 0)));

/**
 * Brooklet Hill: the land (banks, ledge, pools, basin, boulders, bushes, pier), the stonework of the
 * towers, the basin's kerb and the ledge's walls, the lake's sheet, the falls' sheets, the mist where
 * they land and the path's fence.
 */
export function brookletHillBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const vectors = (count) => Array.from({ length: count }, () => new three.Vector4());
  const own = {
    uCore: { value: new three.Vector4() },
    uCoreRadius: { value: 0 },
    uBays: { value: vectors(BAY_MAX) },
    uZones: { value: new three.Vector4() },
    uLedge: { value: new three.Vector4() },
    uTowers: { value: vectors(TOWER_MAX) },
    uNotches: { value: vectors(TOWER_MAX) },
    uCave: { value: new three.Vector4() },
    uBasin: { value: new three.Vector4() },
    uBasinNotch: { value: new three.Vector4() },
    uFalls: { value: vectors(FALL_MAX) },
    uFallShapes: { value: vectors(FALL_MAX) },
    uFallKind: { value: new Array(FALL_MAX).fill(-1) },
    uRocks: { value: vectors(ROCK_MAX) },
    uSunken: { value: vectors(SUNKEN_MAX) },
    uTrees: { value: vectors(TREE_MAX) },
    uDock: { value: new three.Vector4() },
    uDockSize: { value: new three.Vector2() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    land: make(LAND_VERTEX, LAND_FRAGMENT),
    // Pushed back a hair so ground lying right at the lake's level wins the depth test, not flickers.
    lake: make(LAKE_VERTEX, LAKE_FRAGMENT, {
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    }),
    falls: make(FALLS_VERTEX, FALLS_FRAGMENT, {
      transparent: true,
      depthWrite: false,
      side: three.DoubleSide,
    }),
    mist: make(MIST_VERTEX, MIST_FRAGMENT, { transparent: true, depthWrite: false }),
    fence: make(FENCE_VERTEX, FENCE_FRAGMENT),
    // Both sides: the spout's cheeks and the walls' ends face every way.
    stonework: make(STONEWORK_VERTEX, STONEWORK_FRAGMENT, { side: three.DoubleSide }),
    bakeField: make(FULLSCREEN_VERTEX, FIELD_FRAGMENT, bakeOptions),
  };
  const land = new three.Mesh(new three.BufferGeometry(), materials.land);
  const lake = new three.Mesh(new three.BufferGeometry(), materials.lake);
  const falls = new three.Mesh(fallsGeometry(three), materials.falls);
  const mist = new three.Points(seeded(MIST_COUNT), materials.mist);
  const fence = new three.Mesh(new three.BufferGeometry(), materials.fence);
  const stone = new three.Mesh(new three.BufferGeometry(), materials.stonework);
  lake.renderOrder = 1;
  falls.renderOrder = 2;
  mist.renderOrder = 3;
  return {
    objects: [land, stone, lake, falls, mist, fence],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    spots: (layout) => brookletSpots(layout),
    apply(spots, bounds) {
      if (!spots) return;
      const { core, bays, zones, towers, ledge, cave, basin, rocks, sunken, trees, dock, fence: posts } = spots;
      own.uCore.value.set(core.x0, core.y0, core.x1, core.y1);
      own.uCoreRadius.value = core.r;
      setEach(own.uBays.value, bays, (bay) => [bay.x, bay.y, bay.rx, bay.ry]);
      own.uZones.value.set(zones.hillX, zones.hillY, zones.nearY, zones.pathEndX);
      own.uLedge.value.set(zones.ledgeY, ledge ? 1 : 0, 0, 0);
      setEach(own.uTowers.value, towers, (tower) => [tower.x, tower.y, tower.r, tower.rim]);
      setEach(own.uNotches.value, towers, (tower) => [Math.cos(tower.notch), Math.sin(tower.notch), tower.notchHalf, 0]);
      own.uCave.value.set(cave?.x ?? 0, cave?.y ?? 0, cave?.halfWidth ?? 0, cave?.height ?? 0);
      own.uBasin.value.set(basin?.x ?? 0, basin?.y ?? 0, basin?.r ?? 0, basin?.rim ?? 0);
      own.uBasinNotch.value.set(Math.cos(basin?.notch ?? 0), Math.sin(basin?.notch ?? 0), basin?.notchHalf ?? 0, 0);
      setEach(own.uFalls.value, spots.falls, (fall) => [fall.x, fall.y, fall.dx, fall.dy]);
      setEach(own.uFallShapes.value, spots.falls, (fall) => [fall.halfWidth, fall.landing, fall.top, fall.bottom]);
      own.uFallKind.value = Array.from({ length: FALL_MAX }, (_, i) => spots.falls[i]?.kind ?? -1);
      for (const [uniform, list] of [
        [own.uRocks, rocks],
        [own.uSunken, sunken],
        [own.uTrees, trees],
      ]) {
        setEach(uniform.value, list, (item) => [item.x, item.y, item.r, item.seed]);
      }
      own.uDock.value.set(dock?.x ?? 0, dock?.y ?? 0, dock?.dx ?? 1, dock?.dy ?? 0);
      own.uDockSize.value.set(dock?.length ?? 0, (dock?.halfWidth ?? 0) * 2);
      replaceGeometry(land, terrainGrid(bounds));
      replaceGeometry(
        lake,
        new three.PlaneGeometry(bounds.w, bounds.h).translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, 0)
      );
      replaceGeometry(fence, fenceGeometry(three, posts));
      fence.visible = posts.length > 0;
      replaceGeometry(stone, stoneworkGeometry(three, spots));
    },
  };
}
