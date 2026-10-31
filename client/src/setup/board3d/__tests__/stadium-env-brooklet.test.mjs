import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import * as brooklet from '../stadium-env-brooklet.mjs';
import {
  BANK_CEILING_PX,
  BAY_MAX,
  BEACH_RISE_PX,
  CLIFF_RISE_PX,
  FALL_MAX,
  LEDGE_TOP_PX,
  ROCK_MAX,
  STONEWORK_PARTS,
  SUNKEN_MAX,
  TERRACE_RISE_PX,
  TOWER_MAX,
  brookletSpots,
} from '../stadium-env-brooklet-layout.mjs';
import { MAX_FOOTPRINTS } from '../stadium-environment-glsl.mjs';
import { SCREEN_VIEWS, geometryOnCard, screenView } from './stadium-screen.mjs';

const shaders = Object.entries(brooklet).filter(([, value]) => typeof value === 'string' && value.includes('void main'));

// Words GLSL ES 3.00 keeps (or WebGL2 builds use as built-ins) that a shader must not name a variable.
const RESERVED = ['flat', 'smooth', 'half', 'sample', 'cast', 'texture', 'active', 'filter', 'input', 'output', 'common', 'partition'];

test('every Brooklet Hill shader is a whole program: one main, balanced brackets, no unfilled template', () => {
  assert.deepEqual(shaders.map(([name]) => name).sort(), [
    'FALLS_FRAGMENT',
    'FALLS_VERTEX',
    'FENCE_FRAGMENT',
    'FENCE_VERTEX',
    'FIELD_FRAGMENT',
    'LAKE_FRAGMENT',
    'LAKE_VERTEX',
    'LAND_FRAGMENT',
    'LAND_VERTEX',
    'MIST_FRAGMENT',
    'MIST_VERTEX',
    'STONEWORK_FRAGMENT',
    'STONEWORK_VERTEX',
  ]);
  for (const [name, source] of shaders) {
    assert.equal(source.match(/void main\(\)/g).length, 1, name);
    for (const [open, close] of [
      ['{', '}'],
      ['(', ')'],
      ['[', ']'],
    ]) {
      assert.equal(source.split(open).length, source.split(close).length, `${name} ${open}${close}`);
    }
    assert.ok(!source.includes('${') && !source.includes('undefined') && !source.includes('NaN'), `${name} is filled in`);
  }
});

test('no Brooklet Hill shader names a variable with a word GLSL ES 3.00 keeps', () => {
  for (const [name, source] of shaders) {
    for (const [, declared] of source.matchAll(/\b(?:float|int|bool|vec[234]|mat[234]|sampler2D)\s+(\w+)/g)) {
      assert.ok(!RESERVED.includes(declared), `${name} declares ${declared}`);
    }
  }
});

test("the shaders' uniform arrays hold every piece the layout can place", () => {
  const sizes = { uBays: BAY_MAX, uTowers: TOWER_MAX, uNotches: TOWER_MAX, uFalls: FALL_MAX, uFallShapes: FALL_MAX, uFallKind: FALL_MAX };
  Object.assign(sizes, { uRocks: ROCK_MAX, uSunken: SUNKEN_MAX, uFootprints: MAX_FOOTPRINTS });
  const seen = new Set();
  for (const [name, source] of shaders) {
    for (const [, uniform, size] of source.matchAll(/uniform\s+\w+\s+(\w+)\[(\d+)\]/g)) {
      assert.ok(uniform in sizes, `${name}: ${uniform} has a size to check`);
      assert.equal(Number(size), sizes[uniform], `${name}: ${uniform}`);
      seen.add(uniform);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(sizes).sort());
});

test('the stonework shader reads the parts as the layout numbers them', () => {
  // STONEWORK_FRAGMENT tells the copings (1, ledge 4) from the walls by these numbers.
  assert.deepEqual(STONEWORK_PARTS, { wall: 0, coping: 1, innerWall: 2, cheek: 3, ledgeTop: 4, ledgeWall: 5 });
  assert.match(brooklet.STONEWORK_FRAGMENT, /bool top = \(part > 0\.5 && part < 1\.5\) \|\| \(part > 3\.5 && part < 4\.5\);/);
});

test('the land ceiling the screen test bounds is still the bake\'s highest ground (design 082)', () => {
  // The banks rise highest: beach, cliff and terrace, each with its swell of ±2 px; the hill's
  // ledge and the near path stay under them.
  assert.equal(BANK_CEILING_PX, BEACH_RISE_PX + CLIFF_RISE_PX + TERRACE_RISE_PX + 4);
  assert.ok(LEDGE_TOP_PX < BANK_CEILING_PX);
  assert.match(brooklet.FIELD_FRAGMENT, /h \+= 40\.000 \* riser\(\(land - beach\) \/ 14\.000\);/);
  assert.match(brooklet.FIELD_FRAGMENT, /h \+= 32\.000 \* riser\(/);
  assert.match(brooklet.FIELD_FRAGMENT, /return h \+ 4\.0 \* \(fbm3\(p \/ 140\.0\) - 0\.5\)/);
});

test('no boulder or bush covers a card on screen, in either camera preset, the bushes risen on the land (design 082)', () => {
  let seen = 0;
  for (const view of SCREEN_VIEWS) {
    const { layout, projectors } = screenView(view);
    const spots = brookletSpots(layout);
    if (!spots) continue;
    const geometry = brooklet.brookletProps(spots).build(three);
    seen += spots.rocks.length + spots.trees.length;
    for (const { preset, project } of projectors) {
      const hit = geometryOnCard(geometry, layout, project, { ground: () => [0, BANK_CEILING_PX] });
      assert.equal(hit, null, `${view.profile} ${view.viewport.w}x${view.viewport.h} ${preset}: ${hit}`);
    }
  }
  assert.ok(seen > 0, 'the views place some boulders and bushes');
});

test('the land no longer bakes boulders or bushes: the kit draws them (design 082, I273)', () => {
  assert.doesNotMatch(brooklet.FIELD_FRAGMENT, /uTrees|treeCrown|boulder\(/);
  assert.doesNotMatch(brooklet.LAND_FRAGMENT, /boulderColour|TREE_MID/);
  const props = brooklet.brookletProps({ rocks: [{ x: 10, y: 0, r: 20, seed: 0.3 }], trees: [{ x: 200, y: 0, r: 24, seed: 0.5 }] });
  const foot = props.build(three).getAttribute('aFoot');
  let grounded = 0;
  let level = 0;
  for (let i = 0; i < foot.count; i += 1) (foot.getZ(i) > 0.5 ? (grounded += 1) : (level += 1));
  assert.ok(grounded > 0 && level > 0, 'the bush stands on the land, the boulder at the lake\'s level');
});
