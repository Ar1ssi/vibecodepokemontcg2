// Design 077 (prototype): Forest of Vitality (customhb-030) after its card art (MEG 117, Ayumi
// Odashima): a sunlit forest whose great broadleaf stands over a carpet of rounded bushes, a yellow-
// green glow of vitality welling up between them and round its foot. The user asked for one huge tree
// at the top right of the mat, casting its shadow from there. The cards lie on a soft meadow; the
// carpet of bushes runs round it; the tree's trunk stands in the band right of the cards near the far
// end, its crown of teal pads (lit jade on top, yellow-green at their scalloped rims, as the art's)
// spreading over the top-right corner and never over a card. The board's sun stands beyond the tree,
// high at the far right, so the crown's dappled shadow falls from the top right across the mat.
// World scale: a card's footprint is about a picnic blanket; the trunk is over a card wide.
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the meadow's edge (negative
// on it), B the crown's shade 0..1 (light leaks through it per frame), A the trunk's and boughs'
// shade 0..1; the shared light bake (with this board's sun) adds normals, occlusion and the ground's
// own shadow. Per frame: TERRAIN paints the meadow, the undergrowth, the glow and the dappled shade;
// PUFFS draw every pad of the crown and every bush, one instanced sphere each; TRUNK the trunk, a
// lathe whose buttress fins run on into the roots' ridges in the ground; BOUGHS its boughs
// (stadium-env-props); MOTES the motes of light rising off the glow.
import {
  FULLSCREEN_VERTEX,
  NOISE,
  OUTPUT,
  REVEAL,
  TABLE_UNIFORMS,
  TERRAIN_GROUND,
  TERRAIN_UNIFORMS,
  VORONOI,
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { PROP_VERTEX, createPropBuilder, propFragment } from './stadium-env-props.mjs';
import { tableBounds } from './table-uv.mjs';

export const VITALITY_KEY = 'forest-of-vitality';
/**
 * This board's sun (toward it, table frame): beyond the tree, low from the right and the far end
 * (~27° up), so the crown's long shadow falls toward the near left, well across the mat.
 */
export const VITALITY_SUN = Object.freeze([0.7128, 0.5346, 0.454]);
/** Meadow kept round the cards' box before the bushes begin, and how far its edge wanders out. */
export const CLEARING_PX = 30;
export const CLEARING_WOBBLE_PX = 26;
/** Least gap between any part of the tree, seen from above, and a card or the opponent's hand. */
export const TREE_CARD_GAP_PX = 16;
/** Least gap between a bush's foot and the cards' box (its puffs may lean in over the meadow's edge). */
export const BUSH_CARD_GAP_PX = 10;
export const MAX_PADS = 72;
export const MAX_LIMBS = 10;
export const MAX_POOLS = 20;
/** Buttress fins round the trunk's foot, each running on into a root. */
export const TRUNK_FINS = 5;
/** Rings and segments of the instanced sphere every pad and bush is drawn with. */
export const PUFF_SEGMENTS = { rings: 16, around: 28 };
const MOTE_COUNT = 140;
/** How far a pad reaches past its radius once its lumps are on (the vertex shader's 0.1). */
const PUFF_REACH = 1.12;

/** A small deterministic 0..1 from three numbers. */
const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

/** The meadow edge's wander, 0..1, as the shader's `wobble`. */
export const clearingWobble = (x, y) =>
  0.5 + 0.3 * Math.sin(x * 0.021 + 1.3) * Math.sin(y * 0.017 + 0.4) + 0.2 * Math.sin((x + y) * 0.013 + 2.2);

/** Signed px from the meadow's edge at (x, y) (negative on the meadow), as the shader's `clearingDistance`. */
export const clearingDistance = (core, x, y) =>
  distanceToRect(x, y, core) - CLEARING_PX - CLEARING_WOBBLE_PX * clearingWobble(x, y);

const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

/**
 * The opponent's hand where the board fans it, past the far edge: the cards' width either side of
 * the middle (a full hand), its card height deep.
 */
const oppHandRect = (layout, core) => {
  const hand = layout.opp?.hand;
  const cardH = layout.opp?.cardBox?.hand?.h ?? 0;
  if (!hand || !(cardH > 0) || !Number.isFinite(hand.baselineY)) return null;
  const halfW = Math.max(Math.abs(core.x), Math.abs(core.x + core.w));
  return { x: -halfW, y: hand.baselineY - cardH, w: 2 * halfW, h: cardH };
};

/**
 * The great tree: its trunk's root in the band right of the cards, toward the far end; its crown of
 * pads domed over the top-right corner, every pad clear of the cards and the opponent's hand by
 * TREE_CARD_GAP_PX seen from above (the cameras stand over the table's middle, so on screen a pad
 * only moves further out); boughs from the trunk's fork up into the inner pads; roots spreading over
 * the ground and diving into it.
 */
function growTree(table, scene, core, obstacles, u) {
  const radius = 58 * u;
  const flare = radius * 1.7;
  const x = Math.min(core.x + core.w + TREE_CARD_GAP_PX + flare + 30 * u, scene.x + scene.w - flare * 1.2);
  const y = table.y + table.h * 0.8;
  const fork = [x + 34 * u, y + 52 * u, 215 * u];
  // The crown: a dome of overlapping pads over an ellipse out past the trunk (longer up the table
  // than across it), highest in its middle; pads on a jittered grid, so no two rings line up.
  const centre = { x: x + 90 * u, y: y + 160 * u };
  const reach = { x: 340 * u, y: 450 * u };
  const step = 62 * u;
  const clear = (px, py, r) => obstacles.every((rect) => distanceToRect(px, py, rect) >= r * PUFF_REACH + TREE_CARD_GAP_PX);
  const pads = [];
  for (let gy = -reach.y; gy <= reach.y; gy += step * 0.87) {
    const row = Math.round(gy / (step * 0.87));
    for (let gx = -reach.x + (row % 2 ? step / 2 : 0); gx <= reach.x; gx += step) {
      const roll = (salt) => hash(gx + 0.5, gy + 0.5, salt + x);
      const px = centre.x + gx + (roll(1) - 0.5) * step * 0.5;
      const py = centre.y + gy + (roll(2) - 0.5) * step * 0.5;
      const out = Math.hypot((px - centre.x) / reach.x, (py - centre.y) / reach.y);
      if (out > 1 - 0.12 * roll(3)) continue;
      const r = (50 + 30 * roll(4)) * u * (1.15 - 0.3 * out);
      const inScene = px > scene.x - r && px < scene.x + scene.w + r * 2 && py > scene.y - r && py < scene.y + scene.h + r * 2;
      if (!inScene || !clear(px, py, r)) continue;
      pads.push({ x: px, y: py, z: (345 - 170 * out * out + 22 * (roll(5) - 0.5)) * u, r, tier: out, seed: roll(6) });
    }
  }
  // A skirt of lower pads round the fork, so the trunk's top ends under foliage, not in a cut face.
  for (let k = 0; k < 11; k += 1) {
    const roll = (salt) => hash(k + 0.5, x, salt + 60);
    const angle = (k / 11) * 2 * Math.PI + roll(1) * 0.5;
    const out = (62 + 70 * roll(2)) * u;
    const px = fork[0] + 24 * u + Math.cos(angle) * out;
    const py = fork[1] + 34 * u + Math.sin(angle) * out;
    const r = (52 + 22 * roll(3)) * u;
    if (!clear(px, py, r)) continue;
    pads.push({ x: px, y: py, z: (214 + 34 * roll(4)) * u, r, tier: 0.45 + 0.1 * roll(5), seed: roll(6) });
  }
  pads.sort((a, b) => a.tier - b.tier);
  const shown = pads.slice(0, MAX_PADS);
  const trunk = {
    from: [x, y, -10],
    via: [x + 8 * u, y + 14 * u, 110 * u],
    to: fork,
    r0: radius,
    r1: radius * 0.7,
  };
  // Boughs from the fork up into pads part way out, spread round it.
  const boughs = shown
    .filter((pad) => pad.tier > 0.2 && pad.tier < 0.6)
    .sort((a, b) => Math.atan2(a.y - fork[1], a.x - fork[0]) - Math.atan2(b.y - fork[1], b.x - fork[0]))
    .filter((_, i, all) => i % Math.max(1, Math.floor(all.length / (MAX_LIMBS - 1))) === 0)
    .slice(0, MAX_LIMBS - 1)
    .map((pad) => ({
      from: fork,
      via: [(fork[0] + pad.x) / 2, (fork[1] + pad.y) / 2, fork[2] + (pad.z - pad.r * 0.5 - fork[2]) * 0.3],
      to: [pad.x, pad.y, pad.z - pad.r * 0.45],
      r0: radius * 0.42,
      r1: radius * 0.14,
    }));
  // Roots: one out of each of the trunk's five buttress fins (TRUNK_FINS, turned by `finTurn`), of
  // uneven length, longest where the ground is free; each stops short of the cards' box by
  // TREE_CARD_GAP_PX, sinking into the ground as it goes.
  const finTurn = hash(x, y, 43) * 2 * Math.PI;
  const roots = [];
  for (let i = 0; i < TRUNK_FINS; i += 1) {
    const angle = (2 * Math.PI * i - finTurn) / TRUNK_FINS;
    const dir = [Math.cos(angle), Math.sin(angle)];
    const away = Math.max(0, Math.cos(angle));
    let length = radius + (45 + 55 * hash(i, x, 41) + 50 * away) * u;
    while (length > radius * 1.3 && distanceToRect(x + dir[0] * length, y + dir[1] * length, core) < TREE_CARD_GAP_PX + 6 * u) {
      length -= 6 * u;
    }
    roots.push({ angle, length, end: [x + dir[0] * length, y + dir[1] * length] });
  }
  return { x, y, radius, flare, fork, finTurn, pads: shown, trunk, boughs, roots, reach: radius + 150 * u };
}

/**
 * The ground the tree's shadow can fall on, as a box: every pad and the trunk and boughs cast along
 * VITALITY_SUN onto the cloth, each grown by its radius over the sun's height.
 */
export function shadowBox(tree) {
  const [sx, sy, sz] = VITALITY_SUN;
  const casts = [
    ...tree.pads.map((pad) => [pad.x, pad.y, pad.z, pad.r]),
    ...[tree.trunk, ...tree.boughs].filter(Boolean).flatMap((limb) => [
      [...limb.from, limb.r0 * 1.8],
      [...limb.via, limb.r0],
      [...limb.to, limb.r1],
    ]),
  ];
  if (!casts.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const grow = (r) => (r * 1.2) / sz;
  const xs = casts.flatMap(([x, , z, r]) => [x - (sx / sz) * Math.max(z, 0) - grow(r), x + grow(r)]);
  const ys = casts.flatMap(([, y, z, r]) => [y - (sy / sz) * Math.max(z, 0) - grow(r), y + grow(r)]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Forest of Vitality's layout: the meadow (the cards' box, CLEARING_PX and its wander round it), the
 * tree, the pools of glow and the bushes. Null without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 */
export function vitalitySpots(layout) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const core = union(cards);
  const scene = sceneBounds(layout, VITALITY_KEY);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const hand = oppHandRect(layout, core);
  const obstacles = [core, ...(hand ? [hand] : [])];
  const tree = growTree(table, scene, core, obstacles, u);
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;

  // Pools of glow: one at the trunk's foot, the rest on a coarse jittered grid out in the bushes.
  const pools = [{ x: tree.x, y: tree.y, r: tree.radius * 2.4, strength: 1 }];
  const poolStep = 200 * u;
  for (let gy = scene.y + poolStep / 2; gy < scene.y + scene.h; gy += poolStep) {
    for (let gx = scene.x + poolStep / 2; gx < scene.x + scene.w; gx += poolStep) {
      if (pools.length >= MAX_POOLS) break;
      const roll = (salt) => hash(gx, gy, salt);
      const x = gx + (roll(1) - 0.5) * poolStep * 0.6;
      const y = gy + (roll(2) - 0.5) * poolStep * 0.6;
      const r = (60 + 40 * roll(3)) * u;
      if (roll(4) > 0.7 || !inScene(x, y, r) || clearingDistance(core, x, y) < 40 * u) continue;
      if (Math.hypot(x - tree.x, y - tree.y) < tree.reach + r) continue;
      pools.push({ x, y, r, strength: 0.75 + 0.35 * roll(5) });
    }
  }
  const glowAt = (x, y) =>
    Math.min(1, pools.reduce((sum, pool) => sum + pool.strength * Math.exp(-(((x - pool.x) / (pool.r * 1.7)) ** 2) - ((y - pool.y) / (pool.r * 1.7)) ** 2), 0));

  // The carpet of bushes: a jittered grid over the scene, every bush outside the meadow, clear of
  // the tree's roots and of the pools' bright cores.
  const bushes = [];
  const step = 70 * u;
  for (let gy = scene.y + step / 2; gy < scene.y + scene.h; gy += step) {
    for (let gx = scene.x + step / 2; gx < scene.x + scene.w; gx += step) {
      const roll = (salt) => hash(gx, gy, salt + 100);
      const x = gx + (roll(1) - 0.5) * step * 0.7;
      const y = gy + (roll(2) - 0.5) * step * 0.7;
      const r = (22 + 36 * roll(3) ** 1.5) * u;
      if (!inScene(x, y, r * 0.5)) continue;
      if (clearingDistance(core, x, y) < -r * 0.3 || distanceToRect(x, y, core) < r + BUSH_CARD_GAP_PX) continue;
      if (Math.hypot(x - tree.x, y - tree.y) < tree.reach + r * 0.4) continue;
      if (pools.some((pool) => Math.hypot(x - pool.x, y - pool.y) < pool.r * 0.55 + r * 0.5)) continue;
      const puffs = [{ x, y, z: r * 0.42, r }];
      const satellites = 2 + Math.floor(roll(4) * 3);
      for (let k = 0; k < satellites; k += 1) {
        const angle = roll(10 + k) * 2 * Math.PI;
        const sr = r * (0.5 + 0.25 * roll(20 + k));
        const out = r * (0.6 + 0.3 * roll(30 + k));
        const sx = x + Math.cos(angle) * out;
        const sy = y + Math.sin(angle) * out;
        if (distanceToRect(sx, sy, core) < sr + BUSH_CARD_GAP_PX) continue;
        puffs.push({ x: sx, y: sy, z: sr * 0.4, r: sr });
      }
      bushes.push({ x, y, r, seed: roll(6), glow: glowAt(x, y), puffs });
    }
  }
  return { table, scene, core, u, hand, tree, pools, bushes };
}

const VITALITY = /* glsl */ `
// The cards' box (x0, y0, x1, y1), the trunk's root (x, y, radius, reach of its roots), every root's
// end (x, y; 0 radius: none) and the pools of glow (x, y, radius, strength; 0 radius: none).
uniform vec4 uCore;
uniform vec4 uRoot;
uniform vec4 uRootEnds[${TRUNK_FINS}];
uniform vec4 uPools[${MAX_POOLS}];
float wobble(vec2 p) {
  return 0.5 + 0.3 * sin(p.x * 0.021 + 1.3) * sin(p.y * 0.017 + 0.4) + 0.2 * sin((p.x + p.y) * 0.013 + 2.2);
}
// Signed px from the meadow's edge, as vitalitySpots' clearingDistance; negative on the meadow.
float clearingDistance(vec2 p) {
  float box = length(max(max(uCore.xy - p, p - uCore.zw), 0.0));
  return box - ${CLEARING_PX.toFixed(1)} - ${CLEARING_WOBBLE_PX.toFixed(1)} * wobble(p);
}
// The glow welling up at p, 0..1, each pool breathing slowly on its own beat.
float poolGlow(vec2 p, float t) {
  float glow = 0.0;
  for (int i = 0; i < ${MAX_POOLS}; i++) {
    vec4 pool = uPools[i];
    if (pool.z <= 0.0) continue;
    float breath = 0.85 + 0.15 * sin(t * 0.9 + pool.x * 0.031 + pool.y * 0.017);
    vec2 q = (p - pool.xy) / pool.z;
    glow += pool.w * breath * exp(-dot(q, q) * 1.6);
  }
  return min(glow, 1.2);
}
// The roots: a rounded ridge out of each buttress fin, from the trunk's side to its end, lower and
// narrower as it goes, sunk into the ground at its tip. x: height px, y: 0..1 along it (1 past it).
vec2 rootRidge(vec2 p) {
  vec2 best = vec2(0.0, 1.0);
  for (int i = 0; i < ${TRUNK_FINS}; i++) {
    vec4 end = uRootEnds[i];
    if (end.z <= 0.0) continue;
    vec2 span = end.xy - uRoot.xy;
    float run = length(span);
    vec2 way = span / max(run, 1.0);
    float along = dot(p - uRoot.xy, way);
    float s = clamp((along - uRoot.z * 0.8) / max(run - uRoot.z * 0.8, 1.0), 0.0, 1.0);
    float across = abs(dot(p - uRoot.xy, vec2(-way.y, way.x)));
    float width = mix(uRoot.z * 0.36, 3.0, pow(s, 0.8)) * (1.0 + 0.15 * sin(along * 0.11 + float(i)));
    float height = pow(1.0 - s, 1.3) * uRoot.z * 0.4 * sqrt(max(1.0 - (across * across) / (width * width), 0.0));
    if (along > 0.0 && height > best.x) best = vec2(height, s);
  }
  return best;
}
// The crown's sway (px at 300 px up): slow, so the pads and their shadow drift together.
vec2 crownSway(float t) {
  return vec2(sin(t * 0.7), sin(t * 0.53 + 1.0)) * 2.4;
}
`;

const CANOPY = /* glsl */ `
uniform vec4 uPads[${MAX_PADS}];
uniform vec4 uLimbFrom[${MAX_LIMBS}];
uniform vec4 uLimbTo[${MAX_LIMBS}];
// The ground the tree's shadow can reach (x0, y0, x1, y1): the bake skips the rest.
uniform vec4 uShadowBox;
// How much of the sun the crown's pads hide from the point p at height h, 0..1: the ray toward the
// sun passing through a pad's lumpy outline.
float padShade(vec2 p, float h) {
  vec3 s = normalize(uSun);
  vec3 o = vec3(p, h);
  float shade = 0.0;
  for (int i = 0; i < ${MAX_PADS}; i++) {
    vec4 pad = uPads[i];
    if (pad.w <= 0.0) continue;
    vec3 c = pad.xyz - o;
    float t = dot(c, s);
    if (t <= 0.0) continue;
    vec3 off = c - s * t;
    float miss = length(off);
    if (miss > pad.w * 1.12) continue;
    if (miss < pad.w * 0.7) return 1.0;
    float edge = pad.w * (0.96 + 0.16 * (gnoise(off.xy / (pad.w * 0.38) + pad.xy * 0.013) - 0.5));
    shade = max(shade, 1.0 - smoothstep(edge * 0.8, edge * 1.02, miss));
  }
  return shade;
}
// The same for the trunk and its boughs, each a tapering tube.
float limbShade(vec2 p, float h) {
  vec3 s = normalize(uSun);
  vec3 o = vec3(p, h);
  float shade = 0.0;
  for (int i = 0; i < ${MAX_LIMBS}; i++) {
    vec4 a = uLimbFrom[i];
    vec4 b = uLimbTo[i];
    if (a.w <= 0.0) continue;
    for (int k = 0; k <= 8; k++) {
      float f = float(k) / 8.0;
      vec3 c = mix(a.xyz, b.xyz, f) - o;
      float t = dot(c, s);
      if (t <= 0.0) continue;
      float r = mix(a.w, b.w, f);
      shade = max(shade, 1.0 - smoothstep(r * 0.82, r * 1.04, length(c - s * t)));
    }
    if (shade >= 1.0) return 1.0;
  }
  return shade;
}
`;

/**
 * Bake: the meadow lies flat; past its edge the ground under the bushes rolls in low swells; round
 * the trunk it rises a little over each root; then the crown's and the limbs' shade from the sun.
 */
export const BAKE_FIELD_FRAGMENT = /* glsl */ `
${TABLE_UNIFORMS}
uniform vec3 uSun;
varying vec2 vUv;
${NOISE}
${VITALITY}
${CANOPY}
void main() {
  vec2 p = uMin + vUv * uSize;
  float d = clearingDistance(p);
  float fromTrunk = distance(p, uRoot.xy);
  float outside = smoothstep(0.0, 90.0, d) * smoothstep(uRoot.w * 0.8, uRoot.w + 60.0, fromTrunk);
  float h = 0.8 * (fbm3(p / 90.0) - 0.5) + outside * (4.0 + 12.0 * fbm3(p / 200.0 + 7.0));
  h = max(h, rootRidge(p).x);
  bool reached = p.x > uShadowBox.x && p.y > uShadowBox.y && p.x < uShadowBox.z && p.y < uShadowBox.w;
  gl_FragColor = reached ? vec4(h, d, padShade(p, h), limbShade(p, h)) : vec4(h, d, 0.0, 0.0);
}
`;

export const TERRAIN_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = position.xy;
  vec2 uv = (p - uMin) / uSize;
  float growth = terrainGrowth(p);
  vPos = p;
  vUv = uv;
  vGrowth = growth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, groundAt(uv) * growth * edgeSkirt(uv), 1.0);
}
`;

// The card art's colours (pixel samples, inverted through Neutral tone mapping).
const PALETTE = /* glsl */ `
const vec3 GRASS = vec3(0.137, 0.255, 0.069);
const vec3 GRASS_DARK = vec3(0.071, 0.154, 0.058);
const vec3 GRASS_LIT = vec3(0.25, 0.37, 0.07);
const vec3 BUSH_DARK = vec3(0.033, 0.162, 0.063);
const vec3 BUSH_MID = vec3(0.154, 0.294, 0.071);
const vec3 BUSH_LIT = vec3(0.31, 0.416, 0.07);
const vec3 BUSH_YELLOW = vec3(0.66, 0.614, 0.039);
const vec3 CROWN_DARK = vec3(0.02, 0.159, 0.108);
const vec3 CROWN_BODY = vec3(0.0, 0.27, 0.205);
const vec3 CROWN_TOP = vec3(0.04, 0.46, 0.33);
const vec3 FRINGE = vec3(0.345, 0.469, 0.131);
const vec3 GLOW = vec3(0.836, 0.828, 0.131);
const vec3 GLOW_CORE = vec3(0.95, 0.94, 0.45);
// Shade under the crown is lit by the blue sky: cooler, not just darker.
const vec3 SHADE_TINT = vec3(0.36, 0.44, 0.52);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.5, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${VORONOI}
${REVEAL}
${PALETTE}
${VITALITY}
// A fan of three blades from a tuft's foot, as (stroke, 0..1 up its length). v: px from the foot,
// h: the tuft's hash. Each bends over a little as it rises, as long grass does.
vec2 grassBlades(vec2 v, float h) {
  float stroke = 0.0;
  float tip = 0.0;
  for (int k = 0; k < 3; k++) {
    float a = 1.571 + (float(k) - 1.0) * 0.55 + (fract(h * (7.0 + float(k) * 3.1)) - 0.5) * 0.8;
    vec2 d = vec2(cos(a), sin(a));
    float len = 4.0 + 3.5 * fract(h * (11.0 + float(k)));
    float s = clamp(dot(v, d), 0.0, len);
    vec2 bent = d * s + vec2(-d.y, d.x) * (s * s / len) * 0.14;
    float m = 1.0 - smoothstep(0.35, 0.95, length(v - bent) / mix(1.0, 0.45, s / len));
    stroke = max(stroke, m);
    tip = max(tip, m * s / len);
  }
  return vec2(stroke, tip);
}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  if (revealBurned(p) * exitKeep(p) < 0.5) discard;
  vec4 field = texture2D(uField, vUv);
  vec4 light = texture2D(uLight, vUv);
  float d = field.g;
  vec2 nxy = light.rg * 2.0 - 1.0;
  float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.02));
  vec3 n = normalize(vec3(nxy / nz * vGrowth, 1.0));
  vec3 sun = normalize(uSun);
  // 1 on flat ground in full sun.
  float sunlit = clamp(dot(n, sun) / sun.z, 0.0, 1.3) * mix(0.55, 1.0, light.a);

  // The meadow: soft grass in broad patches and smaller mottles, small tufts catching the light.
  float patchTone = smoothstep(0.25, 0.75, fbm3(p / 170.0 + 2.0));
  vec3 col = mix(GRASS_DARK, GRASS, 0.45 + 0.55 * patchTone);
  col *= 0.94 + 0.12 * fbm3(p / 38.0 + 5.0);
  vec4 tuft = voronoiCell(p / 13.0 + 1.7);
  float tuftShape = 1.0 - smoothstep(0.18, 0.42, length(tuft.zw * vec2(1.0, 0.6)));
  float hasTuft = step(fract(tuft.y * 41.7), 0.22) * smoothstep(0.3, 0.7, fbm3(p / 120.0 + 1.0));
  col = mix(col, GRASS_LIT, tuftShape * hasTuft * 0.3);
  // Blades: a small fan out of most cells' points, dark at the foot and lit at the tip, thick
  // where the grass is long. Broad soft patches of sun break the lawn's green between them.
  vec2 blades = grassBlades(-tuft.zw * 13.0, tuft.y);
  float lawn = step(fract(tuft.y * 23.1), 0.55 + 0.35 * smoothstep(0.35, 0.65, fbm3(p / 95.0 + 8.0)));
  col = mix(col, mix(GRASS_DARK * 0.8, GRASS_LIT * 1.25, blades.y), blades.x * lawn * 0.85);
  col *= 1.0 + 0.16 * smoothstep(0.5, 0.78, fbm3(p / 52.0 + 3.0));

  // Past the meadow's edge, the undergrowth under the bushes: deep green, lighter on the swells.
  vec3 under = mix(BUSH_DARK * 0.55, BUSH_DARK, smoothstep(4.0, 14.0, field.r));
  vec2 ridge = rootRidge(p);
  float wild = smoothstep(16.0, 44.0, d) * smoothstep(uRoot.w * 0.75, uRoot.w + 40.0, distance(p, uRoot.xy));
  col = mix(col, under, wild);
  // The roots: olive-brown bark ridged along them, moss on their backs, sinking into the grass.
  float rootMask = smoothstep(0.8, 3.0, ridge.x);
  vec3 rootBark = vec3(0.2, 0.14, 0.065) * (0.8 + 0.4 * gnoise(vec2(ridge.y * 30.0, dot(p, vec2(0.31, -0.27)) / 4.0)));
  rootBark = mix(rootBark, GRASS_DARK, smoothstep(0.88, 0.98, n.z) * smoothstep(0.45, 0.6, gnoise(p / 9.0)) * 0.7);
  col = mix(col, rootBark, rootMask);

  col *= (0.6 + 0.4 * min(sunlit, 1.15)) * mix(0.45, 1.0, smoothstep(0.3, 0.9, light.b));

  // The crown's shade, its leaves letting light through in flecks: ellipses stretched along the
  // sun's way across the ground, as sun flecks are, stirring as the crown sways.
  float t = uTime;
  vec2 sway = crownSway(t);
  float crownShade = texture2D(uField, vUv + sway / uSize).b;
  vec2 sunWay = normalize(sun.xy);
  vec2 fleckFrame = vec2(dot(p - sway * 0.6, sunWay) * sun.z, dot(p - sway * 0.6, vec2(-sunWay.y, sunWay.x)));
  // Where the crown is thin, flecks gather and a few broader gaps open; elsewhere the shade is
  // deep. Soft-edged, of every size, as the sun's disc blurs them.
  float thin = smoothstep(0.42, 0.72, fbm3(fleckFrame / 75.0 + 4.0));
  vec4 fleckCell = voronoiCell(fleckFrame / 17.0 + 3.1);
  float fleckRadius = 0.1 + 0.3 * pow(fract(fleckCell.y * 7.3), 2.0);
  float fleck = (1.0 - smoothstep(fleckRadius * 0.55, fleckRadius + 0.07, length(fleckCell.zw)))
    * step(fract(fleckCell.y * 13.7), 0.1 + 0.55 * thin);
  float gap = smoothstep(0.64, 0.74, fbm3(fleckFrame / 48.0 + 9.0)) * thin;
  // The shadow comes and goes with the tree, as the reveal grows it from its root and the exit sinks it.
  float treeUp = uReveal >= 1.0 ? 1.0 : 1.0 - smoothstep(revealFront() - 0.12, revealFront(), revealReach(uRoot.xy));
  treeUp = treeUp * treeUp * (3.0 - 2.0 * treeUp) * exitKeep(uRoot.xy);
  float shade = max(crownShade * (1.0 - 0.9 * max(fleck, gap * 0.85)), field.a) * vGrowth * treeUp;
  col = mix(col, col * SHADE_TINT, shade);

  // The glow welling up between the bushes and round the trunk's foot: it lights the ground yellow,
  // brightest at each pool's heart.
  // A faint glow wells up through all the undergrowth too, as the art's light between every bush.
  float glow = (poolGlow(p, t) + 0.1 * wild * smoothstep(0.35, 0.7, fbm3(p / 90.0 + 13.0))) * vGrowth;
  col += GLOW * glow * 0.8 * (1.0 - 0.6 * rootMask);
  col = mix(col, GLOW_CORE, smoothstep(0.7, 1.15, glow) * 0.55);

  col = edgeHaze(col, vUv);
  vec3 dawn = vec3(0.85, 0.95, 0.35);
  col += dawn * revealGlow(p, 0.035) * 0.7;
  col += dawn * exitGlow(p) * 0.7;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * One pad of the crown or one bush: an instanced sphere, flattened and lumpy, grown from its root as
 * the reveal passes; the crown's pads sway.
 */
export const PUFF_VERTEX = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${REVEAL}
${TERRAIN_GROUND}
${VITALITY}
// Centre x, y, z (px off the ground), radius.
attribute vec4 aPuff;
// The point it grows from (the trunk's root for a pad, its own foot for a bush) x, y; kind (0 pad,
// 1 bush); seed.
attribute vec4 aBase;
// The glow under it 0..1; how deep in the crown a pad lies 0..1 (1 low and inner).
attribute vec2 aTone;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec4 vInfo;
varying vec2 vShadeUv;
varying float vTreeUp;
void main() {
  vec3 dir = position;
  vTreeUp = terrainGrowth(uRoot.xy);
  float seed = aBase.w;
  float lumps = sin(dir.x * 4.1 + seed * 20.0) * sin(dir.y * 3.7 + seed * 11.0) * sin(dir.z * 3.3 + 1.0);
  vec3 offset = dir * aPuff.w * (1.0 + 0.1 * lumps);
  offset.z *= aBase.z < 0.5 ? 0.78 : 0.7;
  vec3 local = aPuff.xyz + offset;
  float pad = 1.0 - aBase.z;
  local.xy += crownSway(uTime) * (local.z / 300.0) * pad;
  local.xy += vec2(sin(uTime * 1.1 + seed * 20.0), cos(uTime * 0.9 + seed * 13.0)) * 0.6 * aBase.z * (local.z / 40.0);
  vec2 root = aBase.xy;
  vec2 uv = clamp((root - uMin) / uSize, 0.0, 1.0);
  float growth = terrainGrowth(root);
  vec3 grown = vec3(root, 0.0) + (local - vec3(root, 0.0)) * growth;
  grown.z += groundAt(uv) * growth * edgeSkirt(uv);
  vNormal = normalize(dir * vec3(1.0, 1.0, aBase.z < 0.5 ? 1.0 / 0.78 : 1.0 / 0.7));
  vPos = grown;
  vSphere = dir;
  vInfo = vec4(aTone, aBase.z, seed);
  vShadeUv = clamp((aPuff.xy - uMin) / uSize, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(grown, 1.0);
}
`;

/**
 * Foliage blocked in as the art paints it: round leaf clusters packed over each pad, each bulging so
 * it takes the light on its own sunward side, dark hollows between; the crown's pads teal, lit jade
 * on top, their rims scalloped yellow-green where the glow from below catches them; the bushes the
 * art's grass greens, lit yellow over the glow; anything in the crown's shade cooler and darker.
 */
export const PUFF_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uEye;
uniform sampler2D uField;
uniform vec2 uMin;
uniform vec2 uSize;
uniform float uTime;
${NOISE}
${VORONOI}
${PALETTE}
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vSphere;
varying vec4 vInfo;
varying vec2 vShadeUv;
varying float vTreeUp;
void main() {
  vec3 toEye = normalize(uEye - vPos);
  vec3 n = normalize(vNormal);
  vec3 sun = normalize(uSun);
  float bush = vInfo.z;
  float seed = vInfo.w;
  // Two scales of leaf clumps, as the art paints foliage: broad lobes, each carrying smaller leaf
  // clusters. Each bulges the normal, so it takes the light on its own sunward side.
  vec2 q = vSphere.xy / (1.3 + vSphere.z) * mix(3.2, 2.2, bush) + seed * 17.0;
  // Warped, so the lobes' borders wander like brush strokes rather than run straight.
  q += 0.32 * (vec2(gnoise(q * 1.6), gnoise(q * 1.6 + 9.1)) - 0.5);
  vec4 cluster = voronoiCell(q);
  float size = 0.5 + 0.2 * fract(cluster.y * 13.0);
  float inCluster = 1.0 - smoothstep(size - 0.14, size, length(cluster.zw));
  vec2 ql = q * 3.4 + 5.3;
  ql += 0.3 * (vec2(gnoise(ql * 1.3), gnoise(ql * 1.3 + 4.7)) - 0.5);
  vec4 leaf = voronoiCell(ql);
  float leafSize = 0.46 + 0.18 * fract(leaf.y * 9.0);
  float inLeaf = 1.0 - smoothstep(leafSize - 0.16, leafSize, length(leaf.zw));
  vec3 bulged = normalize(n - vec3(cluster.zw / size, 0.0) * 0.55 * inCluster - vec3(leaf.zw / leafSize, 0.0) * 0.3 * inLeaf);
  float light = dot(bulged, sun);
  // Painted tone bands with soft, short edges: shadow, body, lit, and a sun-struck crest.
  float body = smoothstep(-0.02, 0.22, light);
  float top = smoothstep(0.55, 0.7, light);
  float crest = smoothstep(0.8, 0.92, light) * inLeaf;
  // The rim: the band round each pad's middle and under it, scalloped by its clusters.
  float rim = smoothstep(0.2, -0.15, vSphere.z + 0.2 * (fract(cluster.y * 5.1) - 0.5)) * inCluster;
  float glow = vInfo.x;
  vec3 col;
  if (bush < 0.5) {
    col = mix(CROWN_DARK, CROWN_BODY, body);
    col = mix(col, CROWN_TOP, top);
    col = mix(col, CROWN_TOP * vec3(1.5, 1.45, 1.1) + 0.05, crest * 0.55);
    col = mix(col, FRINGE, rim * (0.7 + 0.3 * vInfo.y));
    col *= mix(1.0, 0.7, vInfo.y);
  } else {
    // Each bush its own green, from the art's grass greens toward its blue-green trees.
    vec3 mid = mix(BUSH_MID, CROWN_BODY * 1.15, fract(seed * 7.13) * 0.22);
    col = mix(BUSH_DARK, mid, body);
    col = mix(col, mix(BUSH_LIT, mid * 1.5, 0.25), top);
    col = mix(col, BUSH_LIT * vec3(1.35, 1.3, 0.9), crest * 0.5);
    col = mix(col, BUSH_YELLOW, rim * smoothstep(0.05, 0.6, glow) * 0.85);
  }
  // Shade tucked between lobes, soft and wide so it reads as a hollow, not a drawn line.
  col *= mix(0.68, 1.0, smoothstep(0.0, 0.22, cluster.x)) * mix(0.9, 1.0, smoothstep(0.0, 0.12, leaf.x));
  col *= mix(0.86, 1.0, inCluster);
  // A bush in the crown's shade (a pad's own depth in the crown darkens it above).
  vec4 ground = texture2D(uField, vShadeUv);
  float shade = max(ground.b, ground.a) * bush * vTreeUp;
  col = mix(col, col * SHADE_TINT, shade * 0.8);
  // The glow from below lights a bush's underside.
  col += GLOW * glow * 0.22 * max(-n.z + 0.3, 0.0) * bush;
  float edgeOn = 1.0 - abs(dot(n, toEye));
  col = mix(col, col * 0.55, smoothstep(0.72, 0.92, edgeOn));
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

/**
 * Bark lit by this board's sun and the sky: olive-brown, ridged up the trunk, darker up into the
 * crown's shade, the glow at its foot washing its lower trunk yellow, as the art's.
 */
const BARK_LIGHT = /* glsl */ `
uniform vec4 uRoot;
vec3 lightProp(vec3 albedo, vec3 n, vec3 world, float metal) {
  vec3 sun = normalize(uSun);
  float around = atan(world.y - uRoot.y, world.x - uRoot.x);
  // Long furrows in two scales, a little slanted, with moss on the up-facing swells and the roots.
  float ridge = gnoise(vec2(around * 7.0, world.z / 55.0 + around * 0.35));
  float fine = gnoise(vec2(around * 23.0, world.z / 12.0 + around));
  vec3 bark = albedo * (0.5 + 0.7 * smoothstep(0.3, 0.7, ridge)) * (0.8 + 0.4 * fine);
  float moss = smoothstep(0.5, 0.85, n.z) * smoothstep(0.38, 0.62, gnoise(world.xy / 9.0 + 3.0));
  bark = mix(bark, vec3(0.07, 0.17, 0.045) * (0.7 + 0.6 * fine), moss * 0.75);
  float underCrown = smoothstep(130.0, 220.0, world.z);
  vec3 sky = vec3(0.5, 0.56, 0.6) * (0.75 + 0.25 * n.z);
  vec3 sunLight = vec3(1.25, 1.15, 0.9) * max(dot(n, sun), 0.0) * (1.0 - 0.8 * underCrown);
  vec3 col = bark * (sky + sunLight);
  // The glow at its foot washes the lowest trunk and the roots' flanks yellow.
  col += vec3(0.836, 0.828, 0.131) * 0.16 * exp(-max(world.z, 0.0) / 45.0) * (1.0 - abs(n.z));
  return col;
}
`;

export const PROP_FRAGMENT = propFragment({ light: BARK_LIGHT, reveal: 'vec3(0.85, 0.95, 0.35)' });

const BARK = [0.22, 0.155, 0.07, 0];

/** A point on the quadratic curve from `from` via `via` to `to` at t. */
const onCurve = ({ from, via, to }, t) => [0, 1, 2].map((k) => (1 - t) ** 2 * from[k] + 2 * (1 - t) * t * via[k] + t ** 2 * to[k]);

/**
 * The trunk: a smooth lathe up its curved spine, tapering to the fork, its foot swelling into
 * TRUNK_FINS buttress fins (each running on into a root ridge in the ground); position, normal and
 * aColor as stadium-env-props' geometry, so the props' material draws it.
 */
export function trunkGeometry(three, tree) {
  const rings = 30;
  const around = 40;
  const { r0, r1 } = tree.trunk;
  const grid = [];
  for (let i = 0; i <= rings; i += 1) {
    // Rings bunched toward the foot, where the fins swell.
    const t = (i / rings) ** 1.5;
    const centre = onCurve(tree.trunk, t);
    const ahead = onCurve(tree.trunk, Math.min(1, t + 0.01));
    const behind = onCurve(tree.trunk, Math.max(0, t - 0.01));
    const tangent = ahead.map((v, k) => v - behind[k]);
    const tLength = Math.hypot(...tangent) || 1;
    const unitTangent = tangent.map((v) => v / tLength);
    const flare = 0.75 * Math.exp(-t * 10);
    const row = [];
    for (let k = 0; k < around; k += 1) {
      const angle = (k / around) * 2 * Math.PI;
      const fin = 0.5 + 0.5 * Math.cos(TRUNK_FINS * angle + tree.finTurn);
      const r = (r0 + (r1 - r0) * t) * (1 + flare * (0.25 + 0.75 * fin ** 1.6));
      // Round the spine, square to it, the angle kept in the table's own frame (the fins line up
      // with the roots).
      const radial = [Math.cos(angle), Math.sin(angle), 0];
      const along = radial[0] * unitTangent[0] + radial[1] * unitTangent[1];
      const square = radial.map((v, axis) => v - unitTangent[axis] * along);
      const sLength = Math.hypot(...square) || 1;
      row.push(square.map((v, axis) => centre[axis] + (v / sLength) * r));
    }
    grid.push(row);
  }
  const positions = [];
  const normals = [];
  const colors = [];
  const index = [];
  const at = (i, k) => grid[Math.max(0, Math.min(rings, i))][(k + around) % around];
  for (let i = 0; i <= rings; i += 1) {
    for (let k = 0; k < around; k += 1) {
      const p = at(i, k);
      const dk = at(i, k + 1).map((v, axis) => v - at(i, k - 1)[axis]);
      const di = at(i + 1, k).map((v, axis) => v - at(i - 1, k)[axis]);
      const n = [dk[1] * di[2] - dk[2] * di[1], dk[2] * di[0] - dk[0] * di[2], dk[0] * di[1] - dk[1] * di[0]];
      const nLength = Math.hypot(...n) || 1;
      positions.push(...p);
      normals.push(...n.map((v) => v / nLength));
      colors.push(...BARK);
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let k = 0; k < around; k += 1) {
      const a0 = i * around + k;
      const a1 = i * around + ((k + 1) % around);
      index.push(a0, a1, a0 + around, a1, a1 + around, a0 + around);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aColor', new three.Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);
  return geometry;
}

/** The boughs: tubes of bark from the trunk's fork up into the crown (stadium-env-props). */
export function boughProps(tree) {
  const props = createPropBuilder();
  for (const bough of tree.boughs) {
    const points = Array.from({ length: 11 }, (_, i) => onCurve(bough, i / 10));
    const radii = points.map((_, i) => bough.r0 + ((bough.r1 - bough.r0) * i) / 10);
    props.tube(points, radii, BARK, { sides: 12 });
  }
  return props;
}

/** Every pad and bush as one instanced sphere each: per vertex the unit sphere, per instance its puff. */
export function puffGeometry(three, { tree, bushes }) {
  const { rings, around } = PUFF_SEGMENTS;
  const positions = [];
  const index = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = -Math.PI / 2 + (Math.PI * ring) / rings;
    for (let k = 0; k < around; k += 1) {
      const longitude = (k / around) * 2 * Math.PI;
      positions.push(Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude));
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let k = 0; k < around; k += 1) {
      const a0 = ring * around + k;
      const a1 = ring * around + ((k + 1) % around);
      index.push(a0, a1, a0 + around, a1, a1 + around, a0 + around);
    }
  }
  const puffs = [];
  const zTop = Math.max(...tree.pads.map((pad) => pad.z), 1);
  for (const pad of tree.pads) {
    const depth = Math.min(1, Math.max(0, 1 - (pad.z - pad.r * 0.3) / zTop + pad.tier * 0.06));
    puffs.push({ puff: [pad.x, pad.y, pad.z, pad.r], base: [tree.x, tree.y, 0, pad.seed], tone: [0.3, depth] });
  }
  for (const bush of bushes) {
    bush.puffs.forEach((puff, k) =>
      puffs.push({ puff: [puff.x, puff.y, puff.z, puff.r], base: [bush.x, bush.y, 1, (bush.seed + k * 0.137) % 1], tone: [bush.glow, 0] })
    );
  }
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.setAttribute('aPuff', new three.InstancedBufferAttribute(Float32Array.from(puffs.flatMap((p) => p.puff)), 4));
  geometry.setAttribute('aBase', new three.InstancedBufferAttribute(Float32Array.from(puffs.flatMap((p) => p.base)), 4));
  geometry.setAttribute('aTone', new three.InstancedBufferAttribute(Float32Array.from(puffs.flatMap((p) => p.tone)), 2));
  geometry.instanceCount = puffs.length;
  return geometry;
}

/** Motes of light rising off the pools of glow, drifting as they climb. */
export const MOTE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${REVEAL}
uniform vec4 uPools[${MAX_POOLS}];
attribute vec4 aSeed;
varying float vLife;
void main() {
  float period = 5.0 + aSeed.w * 4.0;
  float clock = uTime + aSeed.z * period;
  float life = fract(clock / period);
  float cycle = floor(clock / period);
  vec2 jitter = hash22(aSeed.xy * 91.0 + cycle);
  float pools = 0.0;
  for (int i = 0; i < ${MAX_POOLS}; i++) pools += step(0.001, uPools[i].z);
  float pick = floor(fract(jitter.x * 17.0 + aSeed.x) * max(pools, 1.0));
  vec4 pool = uPools[0];
  float seen = 0.0;
  for (int i = 0; i < ${MAX_POOLS}; i++) {
    if (uPools[i].z <= 0.0) continue;
    if (seen == pick) pool = uPools[i];
    seen += 1.0;
  }
  float angle = jitter.y * 6.2831853;
  vec2 start = pool.xy + vec2(cos(angle), sin(angle)) * sqrt(fract(jitter.x * 5.3)) * pool.z * 0.9;
  vec3 pos = vec3(start, 2.0);
  pos.xy += vec2(sin(life * 4.0 + aSeed.x * 30.0), cos(life * 3.0 + aSeed.y * 30.0)) * 10.0 * life;
  pos.z += life * (50.0 + 70.0 * aSeed.y);
  float shown = revealBurned(start) * exitKeep(start) * step(0.001, pool.z);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizePx = (1.3 + aSeed.z * 1.8) * (1.0 - life * 0.4);
  gl_PointSize = max(sizePx * uFocal / -mv.z, 2.0) * 2.2 * shown;
  vLife = life;
}
`;

export const MOTE_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.3, 0.5, d);
  float halo = exp(-d * d * 3.0) * 0.5;
  float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
  gl_FragColor = vec4(vec3(1.05, 1.05, 0.45) * (core + halo) * fade, 1.0);
${OUTPUT}
}
`;

const NO_TREE = { x: 0, y: 0, radius: 0, reach: 0, finTurn: 0, pads: [], boughs: [], roots: [], trunk: null };

/** Forest of Vitality's board (stadium-environment-mesh.js BOARDS). */
export function forestOfVitalityBoard({ three, material, seeded, terrainGrid, replaceGeometry, bakeOptions }) {
  const own = {
    uSun: { value: new three.Vector3(...VITALITY_SUN).normalize() },
    uCore: { value: new three.Vector4() },
    uRoot: { value: new three.Vector4() },
    uRootEnds: { value: Array.from({ length: TRUNK_FINS }, () => new three.Vector4()) },
    uPools: { value: Array.from({ length: MAX_POOLS }, () => new three.Vector4()) },
    uPads: { value: Array.from({ length: MAX_PADS }, () => new three.Vector4()) },
    uLimbFrom: { value: Array.from({ length: MAX_LIMBS }, () => new three.Vector4()) },
    uLimbTo: { value: Array.from({ length: MAX_LIMBS }, () => new three.Vector4()) },
    uShadowBox: { value: new three.Vector4() },
  };
  const make = (vertex, fragment, extra) => material(vertex, fragment, extra, own);
  const materials = {
    terrain: make(TERRAIN_VERTEX, TERRAIN_FRAGMENT),
    puffs: make(PUFF_VERTEX, PUFF_FRAGMENT),
    props: make(PROP_VERTEX, PROP_FRAGMENT, { side: three.DoubleSide }),
    motes: make(MOTE_VERTEX, MOTE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const puffs = new three.Mesh(new three.BufferGeometry(), materials.puffs);
  const trunk = new three.Mesh(new three.BufferGeometry(), materials.props);
  const boughs = new three.Mesh(new three.BufferGeometry(), materials.props);
  const motes = new three.Points(seeded(MOTE_COUNT), materials.motes);
  motes.renderOrder = 2;
  return {
    objects: [terrain, puffs, trunk, boughs, motes],
    materials: Object.values(materials),
    bakeField: materials.bakeField,
    bakeLight: materials.bakeLight,
    spots: (layout) => vitalitySpots(layout),
    apply(spots, bounds) {
      const tree = spots?.tree ?? NO_TREE;
      const core = spots?.core;
      own.uCore.value.set(core?.x ?? 0, core?.y ?? 0, (core?.x ?? 0) + (core?.w ?? 0), (core?.y ?? 0) + (core?.h ?? 0));
      own.uRoot.value.set(tree.x, tree.y, tree.radius, tree.reach);
      own.uRootEnds.value.forEach((slot, i) => {
        const root = tree.roots[i];
        return root ? slot.set(root.end[0], root.end[1], 1, 0) : slot.set(0, 0, 0, 0);
      });
      own.uPools.value.forEach((slot, i) => {
        const pool = spots?.pools[i];
        return pool ? slot.set(pool.x, pool.y, pool.r, pool.strength) : slot.set(0, 0, 0, 0);
      });
      own.uPads.value.forEach((slot, i) => {
        const pad = tree.pads[i];
        return pad ? slot.set(pad.x, pad.y, pad.z, pad.r) : slot.set(0, 0, 0, 0);
      });
      const limbs = tree.trunk ? [tree.trunk, ...tree.boughs] : [];
      own.uLimbFrom.value.forEach((slot, i) => (limbs[i] ? slot.set(...limbs[i].from, limbs[i].r0) : slot.set(0, 0, 0, 0)));
      own.uLimbTo.value.forEach((slot, i) => (limbs[i] ? slot.set(...limbs[i].to, limbs[i].r1) : slot.set(0, 0, 0, 0)));
      const box = shadowBox(tree);
      own.uShadowBox.value.set(box.x0, box.y0, box.x1, box.y1);
      replaceGeometry(terrain, terrainGrid(bounds));
      const shown = Boolean(spots?.tree);
      for (const mesh of [puffs, trunk, boughs]) mesh.visible = shown;
      if (!shown) return;
      replaceGeometry(puffs, puffGeometry(three, spots));
      replaceGeometry(trunk, trunkGeometry(three, spots.tree));
      replaceGeometry(boughs, boughProps(spots.tree).build(three));
    },
  };
}
