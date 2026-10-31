import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as beach from '../stadium-env-beach.mjs';
import * as volcanic from '../stadium-environment-glsl.mjs';
import { environmentFootprints } from '../stadium-environment-layout.mjs';
import * as three from 'three';
import { DRESSING_CARD_GAP_PX, beachSpots, shoreFrame } from '../stadium-env-beach-layout.mjs';
import { measureAsset } from '../stadium-kit-assets.mjs';
import { SCREEN_VIEWS, geometryOnCard, screenView } from './stadium-screen.mjs';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';

// GLSL ES 3.00 keywords and words reserved for future use that read like ordinary names (spec §3.6),
// plus texture, the built-in a name would hide.
const RESERVED = [
  'flat', 'smooth', 'half', 'sample', 'patch', 'noperspective', 'input', 'output', 'active', 'filter',
  'common', 'partition', 'fixed', 'long', 'short', 'double', 'union', 'enum', 'class', 'packed',
  'resource', 'superp', 'in', 'out', 'inout', 'buffer', 'shared', 'coherent', 'volatile', 'restrict',
  'readonly', 'writeonly', 'subroutine', 'asm', 'typedef', 'template', 'this', 'goto', 'inline',
  'noinline', 'public', 'static', 'extern', 'external', 'interface', 'unsigned', 'sizeof', 'cast',
  'namespace', 'using', 'layout', 'centroid', 'invariant', 'precision', 'texture',
];
const DECLARATION = new RegExp(
  `\\b(?:float|int|bool|vec[234]|mat[234]|sampler2D|struct|Sea|Swash)\\s+(${RESERVED.join('|')})\\b`,
  'g'
);
const shadersOf = (module) => Object.entries(module).filter(([, value]) => typeof value === 'string' && value.includes('void main'));

test('every beach shader is a full program: one main, balanced braces and brackets', () => {
  const shaders = shadersOf(beach);
  assert.deepEqual(shaders.map(([name]) => name).sort(), ['BEACH_FIELD_FRAGMENT', 'SAND_FRAGMENT', 'SAND_VERTEX', 'SEA_FRAGMENT', 'SEA_VERTEX']);
  for (const [name, source] of shaders) {
    assert.equal(source.match(/void main\(\)/g).length, 1, name);
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      assert.equal(source.split(open).length, source.split(close).length, `${name} ${open}${close}`);
    }
    assert.ok(!source.includes('${'), `${name} has no unfilled template`);
  }
});

test('no environment shader declares a GLSL ES 3.00 reserved word as a name', () => {
  for (const [name, source] of [...shadersOf(beach), ...shadersOf(volcanic)]) {
    assert.deepEqual(source.match(DECLARATION) ?? [], [], name);
  }
});

test('the rock uniform array holds every rock cluster the layout places', () => {
  for (const profile of ['edge-to-edge', 'sim']) {
    const layout = flatLayout(getMatLayout(profile), { w: 1920, h: 540 });
    assert.ok(beachSpots(layout, environmentFootprints(layout)).rocks.length <= beach.MAX_ROCKS, profile);
  }
});

const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

test('the beach dressing stands clear of every card: finds by the water, parasol sets and dune grass on the dry sand', () => {
  for (const profile of ['edge-to-edge', 'sim', 'two-player']) {
    const layout = flatLayout(getMatLayout(profile), { w: 1920, h: 540 });
    const footprints = environmentFootprints(layout);
    const rects = [...footprints.slabs, ...footprints.flats];
    const { dressing, u } = beachSpots(layout, footprints);
    assert.ok(dressing.finds.length >= 3, `${profile}: ${dressing.finds.length} finds`);
    assert.ok(dressing.sets.length >= 1, `${profile}: ${dressing.sets.length} parasol sets`);
    const pieces = [
      ...dressing.finds.map((find) => [find.x, find.y, measureAsset(find.kind, { size: find.size }).reach]),
      ...dressing.sets.map((set) => [set.x, set.y, measureAsset('parasol', { size: set.size }).reach]),
      ...dressing.grass.map((clump) => [clump.x, clump.y, measureAsset('tallGrass', { size: clump.size, blade: 17 * u }).reach]),
    ];
    for (const [x, y, reach] of pieces) {
      for (const rect of rects) assert.ok(distanceToRect(x, y, rect) >= reach + DRESSING_CARD_GAP_PX * 0.5, `${profile}: piece at ${x},${y}`);
    }
  }
});

/**
 * The sand's height under a foot, bounded: BEACH_FIELD_FRAGMENT's beachHeight with its dunes and
 * hummocks at their extremes, the waterline wandering its most toward the sea (shoreWobble, 16 px),
 * and as far up the beach as groundAt's neighbour samples and a bake texel reach.
 */
const SHORE_WANDER_PX = 16;
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sandHeight = (shore) => (x, y) => {
  const up = Math.max(0, -shoreFrame(shore, x, y).offshore + SHORE_WANDER_PX + volcanic.TERRAIN_SPACING_PX / 2 + 2);
  const face = 15 * (1 - Math.exp(-up / 70)) + 0.035 * up;
  return [-12, face + 0.55 * 22 * smooth(110, 260, up) + 2 * smooth(60, 140, up)];
};

test('the sand height the screen test bounds is still the field bake\'s', () => {
  for (const piece of [
    'float face = 15.0 * (1.0 - exp(-upBeach / 70.0)) + 0.035 * upBeach;',
    '(fbm3(p / 230.0 + 3.3) - 0.45) * 22.0 * smoothstep(110.0, 260.0, upBeach)',
    '(gnoise(p / 60.0 + 1.1) - 0.5) * 4.0 * smoothstep(60.0, 140.0, upBeach)',
    '24.0 * (fbm3(vec2(along / 320.0, 4.2)) - 0.5) + 4.0 * sin(along * 0.0748)',
  ]) {
    assert.ok(beach.BEACH_FIELD_FRAGMENT.includes(piece), piece);
  }
});

test('no palm, rock or piece of dressing covers a card on screen, in either camera preset, risen on the sand', () => {
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const spots = beachSpots(layout, environmentFootprints(layout));
    const geometry = beach.beachProps(spots).build(three);
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project, { ground: sandHeight(spots.shore) });
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
});
