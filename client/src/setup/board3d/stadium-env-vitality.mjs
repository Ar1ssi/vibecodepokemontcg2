// Design 077 (prototype): Forest of Vitality (customhb-030) after its card art (MEG 117, Ayumi
// Odashima): a sunlit forest whose great broadleaf stands over a carpet of rounded bushes, a yellow-
// green glow of vitality welling up between them and round its foot. The user asked for one huge tree
// at the top right of the mat, casting its shadow from there; design 084 (the visual audit) moved it
// to the top-left margin (HERO_SIDE), out from under the chat panel. The cards lie on a soft meadow;
// the carpet of bushes runs round it; the tree's trunk stands in the band beside the cards near the
// far end, its crown of teal pads (lit jade on top, yellow-green at their rims, as the art's)
// spreading over the corner and overhanging the table, kept off every card (not off the cards' whole
// box). The board's sun stands beyond the tree, so the crown's shadow falls from it across the mat.
// Design 084: the shadow is lighter and soft-edged in two tones, dappled; a warm yellow-green light
// pools under the tree (the shared contact glow) and the ground grades warm near it to cool far off;
// the card's own flat-topped broadleaves stand in groves of three and five among the low bushes;
// flower beds ring the light pool; no toadstools (the card has none).
// World scale: a card's footprint is about a picnic blanket; the trunk is over a card wide.
// Design 081: every solid is the Stadium kit's (stadium-kit.mjs, stadium-kit-assets.mjs): the crown's
// pads, the kit's bushes, tall grass along the meadow's edge, beds of flowers, toadstools by the
// trunk. Design 082 (Brilliant Diamond / Shining Pearl): the crown is a canopy of leafy lumps, dark in
// its creases; the meadow and the undergrowth are the ground kit's clover grass (stadium-env-ground).
//
// Bake, once per layout: BAKE_FIELD writes R height px, G signed px from the meadow's edge (negative
// on it), B the crown's shade 0..1, A the trunk's and boughs' shade 0..1; the shared light bake (with
// this board's sun) adds normals, occlusion and the ground's own shadow. Per frame: TERRAIN paints the
// meadow, the undergrowth, the glow and the crown's shade; the kit's meshes draw the trunk (a lathe
// up its curved spine whose buttress fins run on into the roots' ridges in the ground), boughs,
// crown, bushes and plants; MOTES the motes of light rising off the glow.
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
  bakeLightFragment,
} from './stadium-environment-glsl.mjs';
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { LOOK, createPropBuilder } from './stadium-env-props.mjs';
import { GLOW, GRASS, LIGHT_MOTION } from './stadium-env-ground.mjs';
import { RISE_LEAN, frameWeight, patchy, shuffled, visibleArea } from './stadium-env-spots.mjs';
import { clumpPieces, scaledKinds } from './stadium-env-clumps.mjs';
import { createKitProps, glslColour, paint } from './stadium-kit.mjs';
import { measureAsset, placeAsset } from './stadium-kit-assets.mjs';
import { tableBounds } from './table-uv.mjs';

export const VITALITY_KEY = 'forest-of-vitality';
/**
 * Design 084: the side of the table the great tree stands on, -1 left, 1 right. The audit moved it
 * left, out from under the chat panel; 077 had it right at the user's ask. Flip here to move it back.
 */
export const HERO_SIDE = -1;
/**
 * This board's sun (toward it, table frame): beyond the tree, low from its side and the far end
 * (~27° up), so the crown's long shadow falls toward the near end, well across the mat.
 */
export const VITALITY_SUN = Object.freeze([0.7128 * HERO_SIDE, 0.5346, 0.454]);
/** Design 084: the light pool under the tree (the shared contact glow): its colour, reach past the trunk's flare, strength. */
export const LIGHT_POOL = Object.freeze({ colour: '#d9e86a', reachPx: 230, strength: 0.75, breath: 0.07 });
/** Meadow kept round the cards' box before the bushes begin, and how far its edge wanders out. */
export const CLEARING_PX = 30;
export const CLEARING_WOBBLE_PX = 26;
/** Least gap between any part of the tree, seen from above, and a card or the opponent's hand. */
export const TREE_CARD_GAP_PX = 16;
/** Least gap between a bush, seen from above, and a card or the opponent's hand. */
export const BUSH_CARD_GAP_PX = 10;
/** Least gap between tall grass, a flower bed or a toadstool, seen from above, and a card or the hand. */
export const PLANT_CARD_GAP_PX = 12;
/**
 * Design 083: the highest the ground rises under a prop (the swells past the meadow, 4 + 12 px of
 * noise, plus its ±0.4 px ripple): the kit stands on it, the screen test bounds it.
 */
export const VITALITY_GROUND_CEILING_PX = 17;
export const MAX_PADS = 72;
export const MAX_LIMBS = 10;
export const MAX_POOLS = 20;
/** Buttress fins round the trunk's foot, each running on into a root. */
export const TRUNK_FINS = 5;
const MOTE_COUNT = 70;
/** How far a pad reaches past its radius, seen from above (a margin). */
const PUFF_REACH = 1.06;
/** A flower's width in the beds out among the bushes (px at world unit 1): BDSP's chunky blooms. */
export const FLOWER_HEAD_PX = 7;

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
 * The great tree: its trunk's root in the band beside the cards on HERO_SIDE, toward the far end; its
 * crown of pads domed over that corner and overhanging the table, every pad clear of every card and
 * the opponent's hand by TREE_CARD_GAP_PX seen from above (design 084: of each card, not of the
 * cards' whole box, so the crown is not cut down to a stump; the cameras stand over the table's
 * middle, so on screen a pad out past the cards only moves further out); boughs from the trunk's
 * fork up into the inner pads; roots spreading over the ground and diving into it.
 */
function growTree(table, scene, core, obstacles, u) {
  const side = HERO_SIDE;
  const radius = 58 * u;
  const flare = radius * 1.7;
  const edge = side < 0 ? core.x : core.x + core.w;
  const wanted = edge + side * (TREE_CARD_GAP_PX + flare + 70 * u);
  const x = side < 0 ? Math.max(wanted, scene.x + flare * 1.2) : Math.min(wanted, scene.x + scene.w - flare * 1.2);
  const y = table.y + table.h * 0.7;
  const fork = [x + side * 30 * u, y + 48 * u, 215 * u];
  // The crown: a dome of overlapping pads over an ellipse out past the trunk (longer up the table
  // than across it), highest in its middle; pads on a jittered grid, so no two rings line up.
  const centre = { x: x + side * 50 * u, y: y + 130 * u };
  const reach = { x: 330 * u, y: 400 * u };
  const step = 60 * u;
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
    const px = fork[0] + side * 24 * u + Math.cos(angle) * out;
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
    const away = Math.max(0, side * Math.cos(angle));
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
  const obstacles = hand ? [...cards, hand] : cards;
  const tree = growTree(table, scene, core, obstacles, u);
  const inScene = (x, y, inset) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset;
  // Design 084: the warm light pooling under the tree, as the card's vitality glow (the shared GLOW).
  const poolReach = tree.flare + LIGHT_POOL.reachPx * u;
  const glows = [{ x: tree.x, y: tree.y, r: poolReach, colour: LIGHT_POOL.colour, strength: LIGHT_POOL.strength, breath: LIGHT_POOL.breath }];

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
  const clear = (x, y, r) => obstacles.every((rect) => distanceToRect(x, y, rect) >= r);
  const offPools = (x, y, r) => pools.every((pool) => Math.hypot(x - pool.x, y - pool.y) >= pool.r * 0.55 + r * 0.5);
  const area = visibleArea(table, scene) ?? scene;
  const wanted = (x) => frameWeight(x, table);

  // Design 084: the card's flat-topped broadleaves in groves of three and five (two sizes, the
  // satellites smaller), well out past the meadow, where the frame shows them; then the carpet of low
  // bushes in thickets round and between them (design 083's patches), in three greens. Each piece
  // leans a little and varies in size, so no two stand alike; every one clears the cards and the hand
  // by its reach, its lean over the tilted view (RISE_LEAN of its height on the swells) and a gap.
  const reachOff = (gap) => (x, y, reach, height) =>
    inScene(x, y, reach * 0.5) &&
    clear(x, y, reach + RISE_LEAN * (height + VITALITY_GROUND_CEILING_PX) + gap) &&
    Math.hypot(x - tree.x, y - tree.y) >= tree.reach + reach * 0.4 &&
    offPools(x, y, reach);
  const groveFits = reachOff(TREE_CARD_GAP_PX);
  const groves = clumpPieces(area, {
    step: 300 * u,
    mix: scaledKinds(
      [
        { asset: 'treeRound', weight: 1, size: [50, 62], options: { crown: 'umbrella' }, lean: 0.05, spread: 0.08 },
        { asset: 'treeRound', weight: 1, size: [34, 44], options: { crown: 'umbrella' }, lean: 0.06, spread: 0.1 },
      ],
      u
    ),
    satellites: scaledKinds(
      [
        { asset: 'treeRound', weight: 2, size: [32, 42], options: { crown: 'umbrella' }, lean: 0.07, spread: 0.12 },
        { asset: 'bush', weight: 1, size: [30, 42], lean: 0.05, spread: 0.2 },
      ],
      u
    ),
    fits: (x, y, reach, height) => clearingDistance(core, x, y) > 70 * u && groveFits(x, y, reach, height),
    thick: 0.72,
    count: [2, 4],
    cap: 16,
    spacing: 0.72,
    salt: 61,
    taken: [{ x: tree.x, y: tree.y, r: tree.reach }],
    weight: (x) => 0.5 + 0.5 * wanted(x),
  }).map((piece) => ({ ...piece, palette: Math.floor(hash(piece.x, piece.y, 67) * 2) }));
  // Design 084: the flower beds round the light pool's rim, as the card's blossoms gather where the
  // glow spreads; then tall grass along the meadow's edge. Each clear of every card, the hand, the
  // tree, the groves and one another.
  const taken = [{ x: tree.x, y: tree.y, r: tree.reach }, ...groves.map((piece) => ({ x: piece.x, y: piece.y, r: piece.reach * 0.85 }))];
  const free = (x, y, r) => taken.every((spot) => Math.hypot(x - spot.x, y - spot.y) >= spot.r + r);
  const flowers = [];
  for (let k = 0; k < 60 && flowers.length < 8; k += 1) {
    const angle = hash(k, tree.x, 81) * 2 * Math.PI;
    const out = poolReach * (0.74 + 0.26 * hash(k, tree.y, 82));
    const x = tree.x + Math.cos(angle) * out;
    const y = tree.y + Math.sin(angle) * out;
    const size = (18 + 12 * hash(k, 3, 83)) * u;
    const { reach } = measureAsset('flowerBed', { size, head: FLOWER_HEAD_PX * u });
    if (!inScene(x, y, reach) || !clear(x, y, reach + PLANT_CARD_GAP_PX) || !free(x, y, reach)) continue;
    flowers.push({ x, y, size, reach, seed: hash(k, 4, 84), warm: hash(k, 5, 85) < 0.6 });
    taken.push({ x, y, r: reach });
  }
  const bushFits = reachOff(BUSH_CARD_GAP_PX);
  const bushes = clumpPieces(area, {
    step: 104 * u,
    mix: scaledKinds([{ asset: 'bush', weight: 1, size: [30, 46], lean: 0.06, spread: 0.22 }], u),
    fits: (x, y, reach, height) => clearingDistance(core, x, y) >= -reach * 0.25 && bushFits(x, y, reach, height),
    thick: 0.62,
    count: [2, 4],
    cap: 110,
    spacing: 0.8,
    salt: 71,
    taken: taken.map((spot) => ({ ...spot })),
    weight: (x) => 0.55 + 0.45 * wanted(x),
  }).map((piece) => ({
    ...piece,
    palette: Math.min(2, Math.floor(patchy(piece.x, piece.y, { scale: 420 * u, contrast: 0.6, salt: 47 }) * 1.66)),
  }));
  taken.push(...bushes.map((piece) => ({ x: piece.x, y: piece.y, r: piece.reach * 0.85 })));
  const grass = [];
  const dress = 58 * u;
  for (let gy = scene.y + dress / 2; gy < scene.y + scene.h; gy += dress) {
    for (let gx = scene.x + dress / 2; gx < scene.x + scene.w; gx += dress) {
      const roll = (salt) => hash(gx, gy, salt + 300);
      const x = gx + (roll(1) - 0.5) * dress * 0.8;
      const y = gy + (roll(2) - 0.5) * dress * 0.8;
      const edge = clearingDistance(core, x, y);
      if (!(edge > 0 && edge < 70 * u && roll(3) < 0.6)) continue;
      const size = (18 + 10 * roll(4)) * u;
      const blade = 15 * u;
      const { reach } = measureAsset('tallGrass', { size, blade });
      if (!inScene(x, y, reach) || !clear(x, y, reach + PLANT_CARD_GAP_PX) || !free(x, y, reach * 0.7)) continue;
      grass.push({ x, y, size, blade, reach, seed: roll(5) });
      taken.push({ x, y, r: reach * 0.7 });
    }
  }
  // Design 083: leaves fall from the crown's outer pads and from the broadleaves of the groves.
  const crownPads = shuffled(tree.pads.filter((pad) => pad.tier > 0.5), 5).slice(0, 8);
  const heroes = shuffled(groves.filter((grove) => grove.asset === 'treeRound'), 9).slice(0, 4);
  const driftEmitters = [
    ...crownPads.map((pad) => ({ x: pad.x, y: pad.y, r: pad.r, z: pad.z })),
    ...heroes.map((grove) => ({ x: grove.x, y: grove.y, r: grove.reach, z: grove.height * 0.75 })),
  ];
  return { table, scene, core, u, hand, tree, pools, groves, bushes, grass, flowers, driftEmitters, glows };
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
    float breath = 0.94 + 0.06 * sin(t * 0.5 + pool.x * 0.031 + pool.y * 0.017);
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
`;

const CANOPY = /* glsl */ `
uniform vec4 uPads[${MAX_PADS}];
uniform vec4 uLimbFrom[${MAX_LIMBS}];
uniform vec4 uLimbTo[${MAX_LIMBS}];
// The ground the tree's shadow can reach (x0, y0, x1, y1): the bake skips the rest.
uniform vec4 uShadowBox;
// How much of the sun the crown's pads hide from the point p at height h, 0..1: the ray toward the
// sun passing through a pad's lumpy outline. Design 084: a soft edge (a broad penumbra), so the
// shadow reads as light through foliage, not a cut-out stain.
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
    if (miss > pad.w * 1.25) continue;
    if (miss < pad.w * 0.5) return 1.0;
    float edge = pad.w * (0.96 + 0.16 * (gnoise(off.xy / (pad.w * 0.38) + pad.xy * 0.013) - 0.5));
    shade = max(shade, 1.0 - smoothstep(edge * 0.55, edge * 1.15, miss));
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

// The meadow and the undergrowth as BDSP paints them (authored as shown, inverted through Neutral
// tone mapping), the glow the card art's.
const PALETTE = /* glsl */ `
// Design 084: the meadow grades from a warm green by the tree to a cooler one far from it, the depth
// the card has (warm gold foreground, cool blue-green distance); the undergrowth likewise.
const vec3 MEADOW_WARM = ${glslColour('#86c45a')};
const vec3 MEADOW_COOL = ${glslColour('#5fa36a')};
const vec3 UNDERGROWTH_WARM = ${glslColour('#4a9238')};
const vec3 UNDERGROWTH_COOL = ${glslColour('#2f7c4a')};
const vec3 GLOW = vec3(0.836, 0.828, 0.131);
const vec3 GLOW_CORE = vec3(0.95, 0.94, 0.45);
// Shade under the crown is lit by the blue sky: cooler, not just darker. Design 084: two tones, a
// light soft one where the crown is thin and a deeper one under its dense middle (no dark blob).
const vec3 SHADE_SOFT = vec3(0.74, 0.8, 0.86);
const vec3 SHADE_DEEP = vec3(0.54, 0.62, 0.72);
vec3 edgeHaze(vec3 col, vec2 uv) {
  vec2 edgeUv = min(uv, 1.0 - uv);
  return col * mix(0.5, 1.0, smoothstep(0.0, 0.035, min(edgeUv.x, edgeUv.y)));
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
${TERRAIN_UNIFORMS}
${NOISE}
${FILTERING}
${FOOTPRINTS}
${REVEAL}
${GRASS}
${LIGHT_MOTION}
${GLOW}
${PALETTE}
${VITALITY}
varying vec2 vPos;
varying vec2 vUv;
varying float vGrowth;
void main() {
  vec2 p = vPos;
  filterPixel = pixelSize(p);
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
  float calm = fieldCalm(p, 120.0);

  // Design 082: the meadow is BDSP's clover grass (broad soft patches, little clover marks, quieter
  // round the cards); tufts and flowers are the kit's solids. Design 084: warm by the tree, cool far off.
  float far = smoothstep(0.1, 0.85, distance(p, uRoot.xy) / length(uSize));
  vec3 col = cloverGrass(p, mix(MEADOW_WARM, MEADOW_COOL, far), calm);

  // Past the meadow's edge, the undergrowth under the bushes: a deeper green, lighter on the swells.
  vec3 under = cloverGrass(p + 31.0, mix(UNDERGROWTH_WARM, UNDERGROWTH_COOL, far), 0.0) * mix(0.8, 1.05, smoothstep(4.0, 14.0, field.r));
  vec2 ridge = rootRidge(p);
  float wild = smoothstep(16.0, 44.0, d) * smoothstep(uRoot.w * 0.75, uRoot.w + 40.0, distance(p, uRoot.xy));
  col = mix(col, under, wild);
  // The roots: plain bark, lighter along their backs, sinking into the grass.
  float rootMask = smoothstep(0.8, 3.0, ridge.x);
  vec3 rootBark = vec3(0.2, 0.14, 0.065) * mix(0.72, 1.1, smoothstep(0.6, 0.95, n.z));
  col = mix(col, rootBark, rootMask);

  col *= (0.6 + 0.4 * min(sunlit, 1.15)) * mix(0.45, 1.0, smoothstep(0.3, 0.9, light.b));

  // The crown's shade, cool and deep, opened by a few broad soft gaps where the crown is thin.
  float t = uTime;
  float crownShade = field.b;
  float gap = smoothstep(0.6, 0.72, fbm3(p / 120.0 + 9.0)) * 0.7 * (1.0 - 0.6 * calm);
  // The shadow comes and goes with the tree, as the reveal grows it from its root and the exit sinks it.
  float treeUp = uReveal >= 1.0 ? 1.0 : 1.0 - smoothstep(revealFront() - 0.12, revealFront(), revealReach(uRoot.xy));
  treeUp = treeUp * treeUp * (3.0 - 2.0 * treeUp) * exitKeep(uRoot.xy);
  // Over the cards the shade is lighter (design 080), so the field keeps one value band under its
  // cards; out in the bushes it is as deep as the crown makes it. Design 084: soft, in two tones (a
  // light one where the crown is thin, a deeper one under its dense middle), and dappled.
  float shade = max(crownShade * (1.0 - gap), field.a) * vGrowth * treeUp * mix(1.0, 0.5, calm);
  vec3 shadeTint = mix(SHADE_SOFT, SHADE_DEEP, smoothstep(0.55, 0.95, shade));
  col = mix(col, col * shadeTint, smoothstep(0.0, 0.5, shade));
  // Design 083: sun flecks through the crown, shifting as its leaves move; none near the cards.
  float offBlock = smoothstep(40.0, 140.0, length(max(max(uFootprintBox.xy - p, p - uFootprintBox.zw), 0.0)));
  col *= 1.0 + 0.34 * dapple(p, t, 24.0) * crownShade * treeUp * offBlock;

  // The glow welling up between the bushes and round the trunk's foot: it lights the ground yellow,
  // brightest at each pool's heart. A faint glow wells up through all the undergrowth too, as the
  // art's light between every bush.
  float glow = (poolGlow(p, t) + 0.05 * wild * smoothstep(0.35, 0.7, fbm3(p / 90.0 + 13.0))) * vGrowth;
  col += GLOW * glow * 0.5 * (1.0 - 0.6 * rootMask);
  col = mix(col, GLOW_CORE, smoothstep(0.75, 1.2, glow) * 0.3);
  // Design 084: the warm light pooling under the tree (the shared contact glow), grown in with it.
  col = mix(col, glowOn(col, p), treeUp);

  col = edgeHaze(col, vUv);
  vec3 dawn = vec3(0.85, 0.95, 0.35);
  col += dawn * revealGlow(p, 0.035) * 0.7;
  col += dawn * exitGlow(p) * 0.7;
  gl_FragColor = vec4(col, 1.0);
${OUTPUT}
}
`;

// The kit's solids in BDSP's greens, the crown keeping the card art's teal jade (pixel samples:
// #038577, #1da095) with its yellow-green rim.
const BARK = paint('#7d5232');
const CROWN = Object.freeze({ body: paint('#1f8a6c'), top: paint('#34a88a'), fringe: paint('#9cc447') });
const BUSH_COLOURS = Object.freeze({ leaf: '#3f9a3a', leafLight: '#7cc44a' });
// Design 083: the thickets in three greens, and the broadleaves standing over them.
const BUSH_PALETTES = Object.freeze([BUSH_COLOURS, Object.freeze({ leaf: '#327f34', leafLight: '#5fae46' }), Object.freeze({ leaf: '#5aa63a', leafLight: '#a4d24e' })]);
// Design 084: the groves' broadleaves in the card's teal greens, two of them so a grove is not one stamp.
const BROADLEAVES = Object.freeze([Object.freeze({ leaf: '#22896b', leafLight: '#8fc24a' }), Object.freeze({ leaf: '#2f8f55', leafLight: '#a6c843' })]);
const TALL_GRASS = Object.freeze({ grass: '#2f7f34', tip: '#86c94e' });
const BLOOMS = Object.freeze({ warm: ['#fff4d6', '#ffd94a'], cool: ['#ffffff', '#f7a1c4'] });

/** A point on the quadratic curve from `from` via `via` to `to` at t. */
const onCurve = ({ from, via, to }, t) => [0, 1, 2].map((k) => (1 - t) ** 2 * from[k] + 2 * (1 - t) * t * via[k] + t ** 2 * to[k]);

/**
 * The trunk's surface: rings up its curved spine, bunched toward the foot, tapering to the fork,
 * its foot swelling into TRUNK_FINS buttress fins (each running on into a root ridge in the
 * ground); every ring square to the spine, its angle kept in the table's frame so the fins line up
 * with the roots. grid[ring][around].
 */
export function trunkGrid(tree) {
  const rings = 30;
  const around = 40;
  const { r0, r1 } = tree.trunk;
  const grid = [];
  for (let i = 0; i <= rings; i += 1) {
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
      const radial = [Math.cos(angle), Math.sin(angle), 0];
      const along = radial[0] * unitTangent[0] + radial[1] * unitTangent[1];
      const square = radial.map((v, axis) => v - unitTangent[axis] * along);
      const sLength = Math.hypot(...square) || 1;
      row.push(square.map((v, axis) => centre[axis] + (v / sLength) * r));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Everything solid on the board in the kit's one look (design 081): the trunk and its boughs, the
 * crown's pads as leafy lumps (teal, the highest jade, the rim yellow-green as the art's), the
 * groves of flat-topped broadleaves and the low bushes (design 084), tall grass on the meadow's edge
 * and the beds of flowers round the light pool.
 */
export function vitalityProps(spots) {
  const props = createPropBuilder();
  const { tree } = spots;
  const kit = { sun: VITALITY_SUN };
  if (tree.trunk) {
    props.surface(trunkGrid(tree), { color: BARK, wrap: true });
    for (const bough of tree.boughs) {
      const points = Array.from({ length: 11 }, (_, i) => onCurve(bough, i / 10));
      props.tube(points, points.map((_, i) => bough.r0 + ((bough.r1 - bough.r0) * i) / 10), BARK, { sides: 12 });
    }
  }
  // The crown: every pad a leafy lump, dark where it tucks in under its neighbours, built about the
  // trunk so the leaves on its flat tops lie outward from it.
  const zTop = Math.max(...tree.pads.map((pad) => pad.z), 1);
  const lumps = tree.pads.map((pad) => ({
    x: pad.x - tree.x,
    y: pad.y - tree.y,
    z: pad.z,
    rx: pad.r,
    rz: pad.r * 0.78,
    color: pad.tier > 0.84 ? CROWN.fringe : pad.z > zTop * 0.84 ? CROWN.top : CROWN.body,
  }));
  props.at({ x: tree.x, y: tree.y, ground: false }, () =>
    props.look({ kind: LOOK.foliage, leaf: 11 * spots.u }, () => props.lumps(lumps, { crease: 0.5 }))
  );
  const piece = (p, colors) => ({ ...kit, ...p.options, x: p.x, y: p.y, size: p.size, yaw: p.yaw, lean: p.lean ?? undefined, seed: p.seed * 997, colors });
  for (const grove of spots.groves) {
    const colors = grove.asset === 'bush' ? BUSH_PALETTES[1] : BROADLEAVES[grove.palette] ?? BROADLEAVES[0];
    placeAsset(props, grove.asset, piece(grove, colors));
  }
  for (const bush of spots.bushes) placeAsset(props, 'bush', piece(bush, BUSH_PALETTES[bush.palette] ?? BUSH_COLOURS));
  for (const patch of spots.grass) placeAsset(props, 'tallGrass', { ...kit, x: patch.x, y: patch.y, size: patch.size, blade: patch.blade, seed: patch.seed * 991, colors: TALL_GRASS });
  for (const clump of spots.flowers) {
    placeAsset(props, 'flowerBed', { ...kit, x: clump.x, y: clump.y, size: clump.size, depth: 0.7, head: FLOWER_HEAD_PX * spots.u, seed: clump.seed * 983, petals: clump.warm ? BLOOMS.warm : BLOOMS.cool, yaw: clump.seed * 6.28 });
  }
  return props;
}

/** Motes of light rising off the pools of glow, drifting as they climb. */
export const MOTE_VERTEX = /* glsl */ `
${TABLE_UNIFORMS}
uniform float uTime;
uniform float uFocal;
${NOISE}
${FOOTPRINTS}
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
  // Design 080: none rise beside a card.
  float shown = revealBurned(start) * exitKeep(start) * step(0.001, pool.z) * step(fieldCalm(start, 60.0), 0.001);
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
    motes: make(MOTE_VERTEX, MOTE_FRAGMENT, { transparent: true, depthWrite: false, blending: three.AdditiveBlending }),
    bakeField: make(FULLSCREEN_VERTEX, BAKE_FIELD_FRAGMENT, bakeOptions),
    bakeLight: make(FULLSCREEN_VERTEX, bakeLightFragment(), bakeOptions),
  };
  const kit = createKitProps({ three, material, own, mood: 'day', reveal: 'vec3(0.85, 0.95, 0.35)', ground: true });
  const terrain = new three.Mesh(new three.BufferGeometry(), materials.terrain);
  const motes = new three.Points(seeded(MOTE_COUNT), materials.motes);
  motes.renderOrder = 2;
  return {
    objects: [terrain, ...kit.objects, motes],
    materials: [...Object.values(materials), ...kit.materials],
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
      kit.set(spots?.tree ? vitalityProps(spots) : null);
    },
  };
}
