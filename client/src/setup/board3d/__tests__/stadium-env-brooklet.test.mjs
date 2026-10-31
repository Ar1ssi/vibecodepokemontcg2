import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as brooklet from '../stadium-env-brooklet.mjs';
import { BAY_MAX, FALL_MAX, ROCK_MAX, STONEWORK_PARTS, SUNKEN_MAX, TOWER_MAX, TREE_MAX } from '../stadium-env-brooklet-layout.mjs';
import { MAX_FOOTPRINTS } from '../stadium-environment-glsl.mjs';

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
  Object.assign(sizes, { uRocks: ROCK_MAX, uSunken: SUNKEN_MAX, uTrees: TREE_MAX, uFootprints: MAX_FOOTPRINTS });
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
