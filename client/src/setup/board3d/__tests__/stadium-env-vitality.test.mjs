import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { cameraFromCssTilt, cameraTcgLive, projectToScreen, tableToWorld } from '../board-camera.mjs';
import { flatLayout, halfFromViewport } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  MAX_LIMBS,
  MAX_PADS,
  MOTE_FRAGMENT,
  MOTE_VERTEX,
  PROP_FRAGMENT,
  PUFF_FRAGMENT,
  PUFF_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  TREE_CARD_GAP_PX,
  VITALITY_KEY,
  VITALITY_SUN,
  boughProps,
  clearingDistance,
  puffGeometry,
  trunkGeometry,
  vitalitySpots,
} from '../stadium-env-vitality.mjs';

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

test('vitalitySpots: one tree, its trunk right of every card in the far half, clear of them', () => {
  for (const layout of layouts) {
    const { tree } = vitalitySpots(layout);
    const table = tableBounds(layout);
    const cards = cardsOf(layout);
    assert.ok(cards.every((card) => tree.x - tree.flare > card.x + card.w), 'trunk right of the cards');
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

test('vitalitySpots: bushes stand off the meadow and off every card, clear of the tree', () => {
  for (const layout of layouts) {
    const { bushes, core, tree } = vitalitySpots(layout);
    assert.ok(bushes.length > 50);
    for (const bush of bushes) {
      assert.ok(clearingDistance(core, bush.x, bush.y) >= -bush.r * 0.3 - 1e-9);
      assert.ok(Math.hypot(bush.x - tree.x, bush.y - tree.y) >= tree.reach);
      for (const puff of bush.puffs) {
        for (const card of cardsOf(layout)) assert.ok(distanceToRect(puff.x, puff.y, card) >= puff.r);
      }
    }
  }
});

// The board as both camera presets draw it, at three window sizes: no part of the crown or trunk
// lands on a card's screen box.
const VIEWS = [
  ...[
    { w: 1920, h: 1080 },
    { w: 1366, h: 768 },
    { w: 2560, h: 1440 },
  ].map((viewport) => ({ viewport, profile: NO_MAT_LAYOUT_ID })),
  ...PROFILES.slice(1).map((profile) => ({ viewport: { w: 1920, h: 1080 }, profile })),
];
const screenBox = (project, rect) => {
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ].map(([x, y]) => project(x, y, 0));
  return {
    x0: Math.min(...corners.map((p) => p.x)),
    x1: Math.max(...corners.map((p) => p.x)),
    y0: Math.min(...corners.map((p) => p.y)),
    y1: Math.max(...corners.map((p) => p.y)),
  };
};
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
  for (const { viewport, profile } of VIEWS) {
    const half = halfFromViewport(viewport);
    const layout = flatLayout(getMatLayout(profile), half, { viewport });
    const params = { viewportW: viewport.w, viewportH: viewport.h, nearHalf: half };
    const cameras = [cameraFromCssTilt(params), cameraTcgLive({ ...params, cardHeightPx: layout.self.cardBox.active.h })];
    const { tree } = vitalitySpots(layout);
    const parts = [
      ...tree.pads.flatMap(spherePoints),
      ...Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        const { from, via, to, r0 } = tree.trunk;
        const at = [0, 1, 2].map((k) => (1 - t) ** 2 * from[k] + 2 * (1 - t) * t * via[k] + t ** 2 * to[k]);
        return [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [at[0] + sx * r0 * 1.75, at[1] + sy * r0 * 1.75, Math.max(at[2], 0)]));
      }).flat(),
    ];
    for (const camera of cameras) {
      const project = (x, y, z) => projectToScreen(camera, tableToWorld({ x, y, z }, camera));
      const boxes = cardsOf(layout).map((rect) => screenBox(project, rect));
      for (const [x, y, z] of parts) {
        const p = project(x, y, z);
        if (!p) continue;
        const hit = boxes.find((b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1);
        assert.equal(hit, undefined, `${profile} ${viewport.w}x${viewport.h}: (${x | 0}, ${y | 0}, ${z | 0}) on a card`);
      }
    }
  }
});

test("the sun stands at the far right, so the crown's shadow falls from the top right across the mat", () => {
  const [sx, sy, sz] = VITALITY_SUN;
  assert.ok(sx > 0 && sy > 0 && sz > 0);
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
    assert.ok(crown.x > middle.x && crown.y > middle.y, 'crown at the top right');
    assert.ok(shadow.x > table.x && shadow.x < table.x + table.w && shadow.y > table.y && shadow.y < table.y + table.h, 'shadow on the mat');
    assert.ok(Math.hypot(shadow.x - middle.x, shadow.y - middle.y) < Math.hypot(crown.x - middle.x, crown.y - middle.y) * 0.75);
  }
});

test('vitalitySpots is null without a layout', () => {
  assert.equal(vitalitySpots(null), null);
  assert.equal(vitalitySpots({}), null);
});

test('the tree, its boughs and every puff build into geometry', () => {
  const spots = vitalitySpots(layouts[0]);
  const trunk = trunkGeometry(three, spots.tree);
  assert.ok(trunk.getAttribute('position').count > 500);
  assert.equal(trunk.getAttribute('aColor').itemSize, 4);
  assert.ok(boughProps(spots.tree).vertexCount() > 0);
  const puffs = puffGeometry(three, spots);
  assert.equal(puffs.instanceCount, spots.tree.pads.length + spots.bushes.reduce((sum, bush) => sum + bush.puffs.length, 0));
});

test('Forest of Vitality shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PUFF_VERTEX, PUFF_FRAGMENT, PROP_FRAGMENT, MOTE_VERTEX, MOTE_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
