import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import * as brooklet from '../stadium-env-brooklet.mjs';
import {
  BANK_CEILING_PX,
  BAY_MAX,
  FALL_MAX,
  ROCK_MAX,
  STONEWORK_PARTS,
  SUNKEN_MAX,
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

test('the land ceiling the screen test bounds is above the bake\'s highest ground (design 082)', () => {
  // Read the bake's own height functions: each rise's height and each swell's amplitude (fbm3 - 0.5
  // lies within ±0.5), so a rise raised in the shader without the ceiling fails here. groundHeight
  // blends the zones with shares where the bank takes what the hill and the near shore leave, so the
  // land stays under the bank's top, or the hill's and the near shore's together where both overlap.
  const source = brooklet.FIELD_FRAGMENT;
  const body = (name) => {
    const match = new RegExp(`float ${name}\\(vec2 p, float land\\) \\{([\\s\\S]*?)\\n\\}`).exec(source);
    assert.ok(match, `${name} is in the bake`);
    return match[1];
  };
  const numbers = (text, pattern) => [...text.matchAll(pattern)].map((match) => Number(match[1]));
  const constant = (name) => numbers(source, new RegExp(`const float ${name} = (\\d+\\.\\d+);`, 'g'))[0];

  const bank = body('bankHeight');
  const rises = numbers(bank, /h \+?= (\d+\.\d+) \* (?:smoothstep|riser)\(/g);
  const [bankSwell] = numbers(bank, /return h \+ (\d+\.\d+) \* \(fbm3\(/g);
  assert.equal(rises.length, 3, 'the beach, the cliff and the terrace');
  const bankTop = rises.reduce((sum, rise) => sum + rise, 0) + bankSwell / 2;

  const hill = body('hillHeight');
  const [flats] = numbers(hill, /float flats = (\d+\.\d+) \* smoothstep\(/g);
  const [ledgeSwell] = numbers(hill, /LEDGE_TOP - DROP \+ (\d+\.\d+) \* \(fbm3\(/g);
  const hillTop = Math.max(flats, constant('LEDGE_TOP') - constant('DROP') + ledgeSwell / 2);

  const near = body('nearHeight');
  const [path] = numbers(near, /float h = (\d+\.\d+) \* smoothstep\(/g);
  const [nearSwell] = numbers(near, /\+ (\d+\.\d+) \* \(fbm3\(/g);
  const nearTop = path + nearSwell / 2;

  for (const value of [bankTop, hillTop, nearTop]) assert.ok(Number.isFinite(value), 'every height read from the bake');
  const highest = Math.max(bankTop, hillTop + nearTop);
  assert.ok(highest <= BANK_CEILING_PX, `the land rises to ${highest} px, the ceiling is ${BANK_CEILING_PX}`);
  assert.ok(BANK_CEILING_PX - bankTop <= 4, 'the ceiling hugs the banks, so the bushes are not held needlessly far from the cards');
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
