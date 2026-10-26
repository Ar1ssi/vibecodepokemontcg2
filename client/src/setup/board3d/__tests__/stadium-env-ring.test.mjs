import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { environmentFootprints, environmentKeyFor, sceneBounds } from '../stadium-environment-layout.mjs';
import {
  ARENA_MARGIN_PX,
  BAKE_FIELD_FRAGMENT,
  CHAIN,
  KERB_PX,
  PROP_FRAGMENT,
  RING_KEY,
  TERRAIN_FRAGMENT,
  ringProps,
  ringSpots,
} from '../stadium-env-ring.mjs';

// Every mat profile (the no-mat default, the simulator's, one-player and full-size two-player mats)
// at the board width board3d.js lays out beside the sidebox (0.755 of 1920) and at full width.
const PROFILES = [NO_MAT_LAYOUT_ID, 'sim', 'one-player', 'two-player', 'edge-to-edge-two-player'];
const HALVES = [
  { w: 1449.6, h: 540 },
  { w: 1920, h: 540 },
];
const layouts = PROFILES.flatMap((profile) => HALVES.map((half) => flatLayout(getMatLayout(profile), half)));

test('environmentKeyFor: Mountain Ring by id, and by set and number', () => {
  assert.equal(environmentKeyFor({ id: 'customhb-240' }), RING_KEY);
  assert.equal(environmentKeyFor({ set: 'customhb', number: '240' }), RING_KEY);
});

test('ringSpots: the paving holds every card footprint; the stones stand outside it, in the scene', () => {
  for (const layout of layouts) {
    const { arena, stones } = ringSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    for (const r of [...slabs, ...flats]) {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        assert.ok(Math.hypot(x - arena.x, y - arena.y) <= arena.r - ARENA_MARGIN_PX + 1e-6);
      }
    }
    const scene = sceneBounds(layout, RING_KEY);
    assert.ok(stones.length >= 8);
    for (const stone of stones) {
      assert.ok(Math.hypot(stone.x - arena.x, stone.y - arena.y) - stone.radius > arena.r + KERB_PX, 'past the kerb');
      assert.ok(stone.x - stone.radius > scene.x && stone.x + stone.radius < scene.x + scene.w);
      assert.ok(stone.y - stone.radius > scene.y && stone.y + stone.radius < scene.y + scene.h);
    }
  }
  assert.equal(ringSpots(null), null);
});

test('ringSpots: the chain hangs off a stone and lies along the paving, every link clear of every card', () => {
  for (const layout of layouts) {
    const { arena, anchor, chain } = ringSpots(layout);
    const { slabs, flats } = environmentFootprints(layout);
    const scene = sceneBounds(layout, RING_KEY);
    for (const [x, y, z] of chain) {
      for (const r of [...slabs, ...flats]) {
        const d = Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
        assert.ok(d > CHAIN.length / 2, 'clear of the card');
      }
      assert.ok(x > scene.x && x < scene.x + scene.w && y > scene.y && y < scene.y + scene.h, 'in the scene');
      assert.ok(z >= CHAIN.width / 2 - 1e-6 && z <= anchor.height, 'between the ground and the stone\'s top');
      assert.ok(Math.hypot(x - arena.x, y - arena.y) <= Math.hypot(anchor.x - arena.x, anchor.y - arena.y), 'no further out than its stone');
    }
  }
  const { chain } = ringSpots(layouts[0]);
  assert.ok(chain.length >= 6, `the default board's chain has ${chain.length} links`);
  assert.ok(chain.at(-1)[2] < chain[0][2], 'it drops from the stone to the ground');
});

test('ringProps: stones, ropes and the chain build finite geometry', () => {
  const props = ringProps(ringSpots(layouts[0]));
  assert.ok(props.vertexCount() > 1000);
});

test('Mountain Ring shaders declare no GLSL ES 3.00 reserved word and every one has a main', () => {
  const reserved = /\b(?:float|vec[234]|int|bool)\s+(?:flat|half|smooth|noperspective|sample|patch|input|output|filter|active|common|fixed|long|short|out|in|inout|round)\b/;
  for (const shader of [BAKE_FIELD_FRAGMENT, TERRAIN_FRAGMENT, PROP_FRAGMENT]) {
    assert.match(shader, /void main\(\)/);
    assert.doesNotMatch(shader, reserved);
  }
});

test('ringSpots: the spires stand past the stones, inside the scene, apart from every stone and each other', () => {
  for (const layout of layouts) {
    const { arena, stones, spires } = ringSpots(layout);
    const scene = sceneBounds(layout, RING_KEY);
    assert.ok(spires.length >= 2, `${spires.length} spires`);
    spires.forEach((spire, i) => {
      assert.ok(spire.x - spire.radius > scene.x && spire.x + spire.radius < scene.x + scene.w);
      assert.ok(spire.y - spire.radius > scene.y && spire.y + spire.radius < scene.y + scene.h);
      assert.ok(Math.hypot(spire.x - arena.x, spire.y - arena.y) - spire.radius > arena.r + KERB_PX, 'off the paving');
      for (const stone of stones) assert.ok(Math.hypot(spire.x - stone.x, spire.y - stone.y) > spire.radius + stone.radius);
      for (const other of spires.slice(i + 1)) assert.ok(Math.hypot(spire.x - other.x, spire.y - other.y) > spire.radius + other.radius);
    });
  }
});
