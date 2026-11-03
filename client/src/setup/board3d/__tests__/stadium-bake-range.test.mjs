import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAKE_FIELD_FRAGMENT as JUNGLE_BAKE } from '../stadium-env-forest.mjs';
import { BAKE_FIELD_FRAGMENT as LUMIOSE_BAKE } from '../stadium-env-lumiose.mjs';
import { BAKE_FIELD_FRAGMENT as NEUTRAL_BAKE } from '../stadium-env-neutral.mjs';
import { BAKE_BASIN_FRAGMENT as MAGMA_BAKE } from '../stadium-env-magma.mjs';

// Design 084: the bakes render into half-float targets (largest 65504). A "nothing here" distance
// of 100000 or 1e5 written raw stores as Inf, which texture filtering turns into NaN: Magma Basin's
// falls lit every wall with it. Every bake that can write such a value clamps it under the limit.
const HALF_FLOAT_MAX = 65504;

/** The bake's output line and every numeric literal in it. */
const output = (shader) => {
  const line = shader.split('\n').find((l) => l.includes('gl_FragColor = vec4('));
  assert.ok(line, 'the bake writes gl_FragColor');
  return { line, numbers: (line.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) };
};

const cases = [
  ['Magma Basin falls distance', MAGMA_BAKE, /min\(fallsDistance\(p, outerSD\), \d+(\.\d+)?\)/],
  ['Perilous Jungle water distance (no bog fits)', JUNGLE_BAKE, /clamp\(waterSD, -\d+(\.\d+)?, \d+(\.\d+)?\)/],
  ['Lumiose City bed distance (no beds)', LUMIOSE_BAKE, /min\(bed, \d+(\.\d+)?\)/],
  ['Neutralization Zone platform distance (no platform)', NEUTRAL_BAKE, /clamp\(distance\(p, uPlatform\.xy\) - uPlatform\.z, -\d+(\.\d+)?, \d+(\.\d+)?\)/],
];

for (const [name, shader, clamp] of cases) {
  test(`bake output fits a half-float target: ${name}`, () => {
    const { line, numbers } = output(shader);
    assert.match(line, clamp, `${name} is clamped`);
    for (const n of numbers) assert.ok(Math.abs(n) < HALF_FLOAT_MAX, `${n} fits`);
  });
}
