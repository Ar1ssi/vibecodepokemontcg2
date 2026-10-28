import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor } from '../stadium-environment-layout.mjs';
import {
  BAKE_FIELD_FRAGMENT,
  BAKE_LIGHT_FRAGMENT,
  CENTER_KEY,
  MAX_BLOCKS,
  MAX_DISCS,
  PROP_FRAGMENT,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
  WALL_GAP_PX,
  centerProps,
  centerSpots,
} from '../stadium-env-pokecenter.mjs';
import { SCREEN_VIEWS, pointOnCard, screenView } from './stadium-screen.mjs';

const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));
const cardsOf = (layout) => {
  const { slabs, flats } = environmentFootprints(layout);
  return [...slabs, ...flats];
};

// customhb-362 is Pokemon Center (NXD 90) in the primary folder's client/src/assets/custom-sets/customhb/set.json.
test('environmentKeyFor: Pokemon Center by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-362' }), CENTER_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '362' }), CENTER_KEY);
});

test('centerSpots: the room holds every card with the walls a gap past them, and the walls run round it', () => {
  for (const layout of layouts) {
    const { room, walls, wallHeight, u, core } = centerSpots(layout);
    for (const r of cardsOf(layout)) assert.ok(r.x >= room.x0 && r.x + r.w <= room.x1 && r.y >= room.y0 && r.y + r.h <= room.y1);
    assert.ok(Math.abs(core.x - room.x0 - WALL_GAP_PX * u) < 1e-6);
    assert.equal(walls.length, 4);
    for (const w of walls) assert.ok(w.h === wallHeight && w.x1 > w.x0 && w.y1 > w.y0);
  }
});

test('centerSpots: the counter, the lounge, the shelves, the PCs, the bench, the plants and the columns stand clear of every card', () => {
  for (const layout of layouts) {
    const { counter, sofa, table, stools, rug, shelves, desks, deskStools, bench, plants, columns, room, clear, core, u } = centerSpots(layout);
    const rectClear = (r) => cardsOf(layout).every((c) => r.x1 <= c.x || c.x + c.w <= r.x0 || r.y1 <= c.y || c.y + c.h <= r.y0);
    assert.ok(counter.x === room.x0 && counter.dir === 1 && counter.y - counter.r > room.y0 && counter.y + counter.r < room.y1, 'the counter against the left wall');
    assert.ok(clear(counter.x + counter.r / 2, counter.y, counter.r * 0.55 + 4 * u, 8 * u) && counter.x + counter.r < core.x, 'counter');
    assert.ok(rectClear({ x0: sofa.x, x1: sofa.x + sofa.depth, y0: sofa.y0, y1: sofa.y1 }), 'sofa');
    assert.ok(rectClear({ x0: table.x - table.w / 2, x1: table.x + table.w / 2, y0: table.y - table.d / 2, y1: table.y + table.d / 2 }), 'table');
    assert.ok(rectClear(rug), 'rug');
    for (const s of [...stools, ...deskStools]) assert.ok(clear(s.x, s.y, 11 * u, 8 * u), 'stool');
    for (const s of shelves) assert.ok(rectClear({ x0: Math.min(s.x, s.x + s.dir * s.depth), x1: Math.max(s.x, s.x + s.dir * s.depth), y0: s.y0, y1: s.y1 }), 'shelf');
    for (const d of desks) assert.ok(clear(d.x + d.dir * d.d * 0.5, d.y, d.w * 0.6, 8 * u), 'desk');
    assert.ok(rectClear({ x0: Math.min(bench.x, bench.x + bench.dir * bench.depth), x1: Math.max(bench.x, bench.x + bench.dir * bench.depth), y0: bench.y0, y1: bench.y1 }), 'bench');
    for (const p of plants) assert.ok(clear(p.x, p.y, 20 * u, 8 * u), 'plant');
    for (const c of columns) assert.ok(clear(c.x, c.y, c.r, 6 * u), 'column');
  }
});

test('centerSpots: the boxes and round pieces the light is cast from fit the shader arrays, none of them over a card', () => {
  for (const layout of layouts) {
    const { blocks, discs, walls } = centerSpots(layout);
    assert.ok(blocks.length <= MAX_BLOCKS && discs.length <= MAX_DISCS, `${blocks.length} blocks, ${discs.length} discs`);
    assert.ok(blocks.length >= walls.length + 6 && discs.length >= 8);
    for (const c of cardsOf(layout)) {
      for (const b of blocks.slice(walls.length)) assert.ok(b.x1 <= c.x || c.x + c.w <= b.x0 || b.y1 <= c.y || c.y + c.h <= b.y0, 'a box lies on a card');
      for (const d of discs) assert.ok(Math.hypot(Math.max(c.x - d.x, 0, d.x - c.x - c.w), Math.max(c.y - d.y, 0, d.y - c.y - c.h)) >= d.r - 1e-6, 'a round piece lies on a card');
    }
  }
});

test('no wall, counter, shelf, column or plant covers a card on screen, in either camera preset', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const { room, walls, wallHeight, counter, shelves, desks, plants, columns, sofa, bench, u } = centerSpots(layout);
    const along = (from, to, n) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
    const points = [
      ...along(room.y0, room.y1, 12).flatMap((y) => [[room.x0, y, wallHeight], [room.x1, y, wallHeight]]),
      ...along(room.x0, room.x1, 12).flatMap((x) => [[x, room.y0, wallHeight], [x, room.y1, wallHeight]]),
      ...walls.flatMap((w) => [[w.x0, w.y0, w.h], [w.x1, w.y1, w.h]]),
      ...along(-Math.PI / 2, Math.PI / 2, 12).flatMap((t) => [[counter.x + counter.dir * counter.r * Math.cos(t), counter.y + counter.r * Math.sin(t), counter.h + 24 * u]]),
      ...shelves.flatMap((s) => [[s.x + s.dir * s.depth, s.y0, s.h], [s.x + s.dir * s.depth, s.y1, s.h]]),
      ...desks.flatMap((d) => [[d.x + d.dir * d.d, d.y - d.w / 2, d.h + 28 * u], [d.x + d.dir * d.d, d.y + d.w / 2, d.h + 28 * u]]),
      ...plants.flatMap((p) => [[p.x, p.y, 70 * u], [p.x + 20 * u, p.y, 56 * u], [p.x - 20 * u, p.y, 56 * u], [p.x, p.y + 20 * u, 56 * u], [p.x, p.y - 20 * u, 56 * u]]),
      ...columns.flatMap((c) => [[c.x, c.y, c.h], [c.x - c.r, c.y, c.h], [c.x + c.r, c.y, c.h], [c.x, c.y - c.r, c.h], [c.x, c.y + c.r, c.h]]),
      [sofa.x + sofa.depth, sofa.y0, 58 * u],
      [sofa.x + sofa.depth, sofa.y1, 58 * u],
      [bench.x + bench.dir * bench.depth, bench.y0, 42 * u],
      [bench.x + bench.dir * bench.depth, bench.y1, 42 * u],
    ];
    for (const { preset, project } of projectors) {
      const hit = pointOnCard(points, layout, project);
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});

test('centerSpots is null without a layout; the props build into a good deal of geometry', () => {
  assert.equal(centerSpots(null), null);
  const props = centerProps(centerSpots(layouts[0]));
  assert.ok(props.vertexCount() > 6000);
  const geometry = props.build(three);
  assert.equal(geometry.getAttribute('position').count, props.vertexCount());
});

test('Pokemon Center shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, BAKE_LIGHT_FRAGMENT, TERRAIN_VERTEX, TERRAIN_FRAGMENT, PROP_FRAGMENT]) {
    assert.doesNotMatch(shader, reserved);
    assert.match(shader, /void main\(\)/);
  }
});
