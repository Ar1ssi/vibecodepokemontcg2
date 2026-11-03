import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BUSH_CARD_GAP_PX,
  HERO_SIDE,
  LIGHT_POOL,
  MAX_LIMBS,
  MAX_PADS,
  MOTE_FRAGMENT,
  MOTE_VERTEX,
  PLANT_CARD_GAP_PX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  TREE_CARD_GAP_PX,
  VITALITY_GROUND_CEILING_PX,
  VITALITY_KEY,
  VITALITY_SUN,
  clearingDistance,
  trunkGrid,
  vitalityProps,
  vitalitySpots,
} from '../stadium-env-vitality.mjs';
import { SCREEN_VIEWS, geometryOnCard, pointOnCard, screenView } from './stadium-screen.mjs';

// Every mat profile at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at
// full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
const cardsOf = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

// customhb-030 is Forest of Vitality in client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Forest of Vitality by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-030' }), VITALITY_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '30' }), VITALITY_KEY);
});

test('vitalitySpots: one tree, its trunk beside every card on HERO_SIDE in the far half, clear of them (design 084: left)', () => {
  assert.equal(HERO_SIDE, -1, 'the audit moved the tree to the top-left margin');
  for (const layout of layouts) {
    const { tree } = vitalitySpots(layout);
    const table = tableBounds(layout);
    const cards = cardsOf(layout);
    assert.ok(cards.every((card) => tree.x + tree.flare < card.x), 'trunk left of the cards');
    assert.ok(tree.y > table.y + table.h / 2, 'trunk in the far half');
    for (const card of cards) assert.ok(distanceToRect(tree.x, tree.y, card) >= tree.flare + TREE_CARD_GAP_PX);
    for (const root of tree.roots) {
      for (const card of cards) assert.ok(distanceToRect(root.end[0], root.end[1], card) >= TREE_CARD_GAP_PX);
    }
  }
});

test('vitalitySpots: the crown is broad, every pad clear of every card seen from above', () => {
  for (const layout of layouts) {
    const { tree } = vitalitySpots(layout);
    assert.ok(tree.pads.length >= 20 && tree.pads.length <= MAX_PADS, `${tree.pads.length} pads`);
    assert.ok(tree.boughs.length >= 3 && tree.boughs.length < MAX_LIMBS);
    for (const pad of tree.pads) {
      for (const card of cardsOf(layout)) assert.ok(distanceToRect(pad.x, pad.y, card) >= pad.r + TREE_CARD_GAP_PX);
    }
  }
});

test('vitalitySpots: bushes stand off the meadow and off every card and the hand, clear of the tree', () => {
  for (const layout of layouts) {
    const { bushes, core, tree, hand } = vitalitySpots(layout);
    assert.ok(bushes.length > 30, `${bushes.length} bushes`);
    const obstacles = hand ? [...cardsOf(layout), hand] : cardsOf(layout);
    for (const bush of bushes) {
      assert.ok(clearingDistance(core, bush.x, bush.y) >= -bush.reach * 0.25 - 1e-9);
      assert.ok(Math.hypot(bush.x - tree.x, bush.y - tree.y) >= tree.reach);
      for (const rect of obstacles) assert.ok(distanceToRect(bush.x, bush.y, rect) >= bush.reach + BUSH_CARD_GAP_PX - 1e-6);
    }
  }
});

test('vitalitySpots: tall grass on the meadow edge, flower beds round the light pool, no toadstools (design 084)', () => {
  for (const layout of layouts) {
    const spots = vitalitySpots(layout);
    const { grass, flowers, core, hand, tree, glows } = spots;
    assert.ok(grass.length > 6, `${grass.length} tall grass patches`);
    assert.ok(flowers.length >= 5, `${flowers.length} flower beds`);
    assert.equal(spots.mushrooms, undefined, 'the card has no toadstools');
    const pool = glows[0];
    for (const bed of flowers) {
      const out = Math.hypot(bed.x - tree.x, bed.y - tree.y);
      assert.ok(out >= pool.r * 0.74 - 1e-6 && out <= pool.r + 1e-6, `a bed on the pool's rim (${out.toFixed(0)} of ${pool.r.toFixed(0)})`);
    }
    const obstacles = hand ? [...cardsOf(layout), hand] : cardsOf(layout);
    for (const plant of [...grass, ...flowers]) {
      for (const rect of obstacles) assert.ok(distanceToRect(plant.x, plant.y, rect) >= plant.reach + PLANT_CARD_GAP_PX - 1e-6);
    }
    for (const patch of grass) assert.ok(clearingDistance(core, patch.x, patch.y) > 0, 'tall grass grows outside the meadow');
  }
});

test('vitalitySpots: a warm light pools under the tree, about two card widths past its flare (design 084)', () => {
  for (const layout of layouts) {
    const { tree, glows, u } = vitalitySpots(layout);
    assert.equal(glows.length, 1);
    const [pool] = glows;
    assert.deepEqual([pool.x, pool.y], [tree.x, tree.y]);
    assert.equal(pool.colour, LIGHT_POOL.colour);
    assert.ok(pool.r >= tree.flare + 180 * u && pool.r <= tree.flare + 260 * u);
    assert.ok(pool.strength > 0.2 && pool.strength <= 0.8, 'a pool of light, not a flare');
  }
});

const spherePoints = ({ x, y, z, r }) => {
  const points = [];
  for (let i = 0; i <= 6; i += 1) {
    const latitude = -Math.PI / 2 + (Math.PI * i) / 6;
    for (let k = 0; k < 12; k += 1) {
      const longitude = (k / 12) * 2 * Math.PI;
      const reach = r * 1.12;
      points.push([x + Math.cos(latitude) * Math.cos(longitude) * reach, y + Math.cos(latitude) * Math.sin(longitude) * reach, z + Math.sin(latitude) * reach * 0.8]);
    }
  }
  return points;
};

test('the crown and the trunk never cover a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { tree } = vitalitySpots(layout);
    const { from, via, to, r0 } = tree.trunk;
    const trunk = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const at = [0, 1, 2].map((k) => (1 - t) ** 2 * from[k] + 2 * (1 - t) * t * via[k] + t ** 2 * to[k]);
      return [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [at[0] + sx * r0 * 1.75, at[1] + sy * r0 * 1.75, Math.max(at[2], 0)]));
    }).flat();
    const points = [...tree.pads.flatMap(spherePoints), ...trunk];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test("the sun stands beyond the tree, so the crown's shadow falls from its corner across the mat", () => {
  const [sx, sy, sz] = VITALITY_SUN;
  assert.ok(Math.sign(sx) === HERO_SIDE && sy > 0 && sz > 0);
  for (const layout of layouts) {
    const { tree } = vitalitySpots(layout);
    const table = tableBounds(layout);
    const middle = { x: table.x + table.w / 2, y: table.y + table.h / 2 };
    const crown = { x: 0, y: 0 };
    const shadow = { x: 0, y: 0 };
    for (const pad of tree.pads) {
      crown.x += pad.x / tree.pads.length;
      crown.y += pad.y / tree.pads.length;
      shadow.x += (pad.x - (sx / sz) * pad.z) / tree.pads.length;
      shadow.y += (pad.y - (sy / sz) * pad.z) / tree.pads.length;
    }
    assert.ok(Math.sign(crown.x - middle.x) === HERO_SIDE && crown.y > middle.y, 'crown at the top corner on its side');
    assert.ok(shadow.x > table.x && shadow.x < table.x + table.w && shadow.y > table.y && shadow.y < table.y + table.h, 'shadow on the mat');
    assert.ok(Math.hypot(shadow.x - middle.x, shadow.y - middle.y) < Math.hypot(crown.x - middle.x, crown.y - middle.y) * 0.75);
  }
});

test('vitalitySpots is null without a layout', () => {
  assert.equal(vitalitySpots(null), null);
  assert.equal(vitalitySpots({}), null);
});

test('every kit solid builds, and none lands on a card on screen in either camera preset, risen on the swells (design 083)', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const geometry = vitalityProps(vitalitySpots(layout)).build(three);
    assert.ok(geometry.getAttribute('position').count > 20000);
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project, { ground: () => [0, VITALITY_GROUND_CEILING_PX] });
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('trunkGrid: rings round the spine from the foot to the fork, each closed round itself', () => {
  const { tree } = vitalitySpots(layouts[0]);
  const grid = trunkGrid(tree);
  assert.equal(grid.length, 31);
  assert.ok(grid.every((row) => row.length === 40 && row.every((p) => p.every(Number.isFinite))));
  const foot = grid[0].reduce((sum, p) => sum + p[2], 0) / 40;
  const top = grid[30].reduce((sum, p) => sum + p[2], 0) / 40;
  assert.ok(foot < 0 && Math.abs(top - tree.fork[2]) < 1e-6);
});

test('Forest of Vitality shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, MOTE_VERTEX, MOTE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});

test('the ground ceiling the screen test bounds stays above the bake\'s swells (design 083)', () => {
  // The bake's height past the meadow: a ±0.4 px ripple plus 4 + 12 px of fbm swell.
  assert.match(BAKE_FIELD_FRAGMENT, /float h = 0\.8 \* \(fbm3\(p \/ 90\.0\) - 0\.5\) \+ outside \* \(4\.0 \+ 12\.0 \* fbm3\(p \/ 200\.0 \+ 7\.0\)\);/);
  assert.ok(0.4 + 4 + 12 <= VITALITY_GROUND_CEILING_PX);
});

test("the thickets gather in three greens; the card's flat-topped broadleaves stand in groves of three to five (design 084)", () => {
  for (const layout of layouts) {
    const spots = vitalitySpots(layout);
    const palettes = new Set(spots.bushes.map((bush) => bush.palette));
    assert.ok(palettes.size >= 2, `bush greens ${[...palettes]}`);
    const trees = spots.groves.filter((piece) => piece.asset === 'treeRound');
    assert.ok(trees.length >= 3, `${trees.length} broadleaves`);
    assert.ok(trees.every((piece) => piece.options.crown === 'umbrella'), "the card's umbrella crown");
    assert.ok(new Set(trees.map((piece) => Math.round(piece.size))).size >= 2, 'at least two sizes');
    const heroes = spots.groves.filter((piece) => piece.hero);
    assert.ok(heroes.length >= 1 && heroes.length < spots.groves.length, 'groves, not single trees in a row');
    assert.ok(spots.driftEmitters.length > 0 && spots.driftEmitters.length <= 12, 'leaves fall from the crown and the broadleaves');
    for (const e of spots.driftEmitters) assert.ok([e.x, e.y, e.r, e.z].every(Number.isFinite) && e.z > 0);
  }
});
