import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as beach from '../stadium-env-beach.mjs';
import * as volcanic from '../stadium-environment-glsl.mjs';
import { environmentFootprints } from '../stadium-environment-layout.mjs';
import { beachSpots } from '../stadium-env-beach-layout.mjs';
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
  assert.deepEqual(shaders.map(([name]) => name).sort(), [
    'BEACH_FIELD_FRAGMENT', 'PALM_FRAGMENT', 'PALM_SHADOW_FRAGMENT', 'PALM_SHADOW_VERTEX', 'PALM_VERTEX',
    'SAND_FRAGMENT', 'SAND_VERTEX', 'SEA_FRAGMENT', 'SEA_VERTEX',
  ]);
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
