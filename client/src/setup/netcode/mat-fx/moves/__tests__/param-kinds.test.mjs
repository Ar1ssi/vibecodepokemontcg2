import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAgainst, defaultOf, fillDefaults } from '../param-kinds.mjs';

const schema = {
  n: ['num', 0, 1, 0.5],
  i: ['int', 1, 4, 2],
  e: ['enum', ['a', 'b'], 'a'],
  d: ['deg', -90],
  t: ['target', 'defender'],
  a: ['arms', 'dai'],
  p: ['pair', 0, 2, [0.5, 1]],
};

test('defaults come from the right slot of each kind', () => {
  assert.deepEqual(fillDefaults(schema, {}), { n: 0.5, i: 2, e: 'a', d: -90, t: 'defender', a: 'dai', p: [0.5, 1] });
  assert.equal(defaultOf(schema.e), 'a');
});

test('fillDefaults keeps given values and hands out a fresh pair', () => {
  const out = fillDefaults(schema, { n: 0.9 });
  assert.equal(out.n, 0.9);
  out.p[0] = 9;
  assert.deepEqual(fillDefaults(schema, {}).p, [0.5, 1]);
});

test('every kind rejects an out-of-range or wrong-typed value', () => {
  const bad = { n: 2, i: 1.5, e: 'z', d: Number.NaN, t: 'both', a: 'nope', p: [1, 0.5] };
  const errors = checkAgainst(schema, bad, 'x');
  assert.equal(errors.length, 7);
  for (const key of Object.keys(bad)) assert.ok(errors.some((e) => e.includes(`'${key}'`)), key);
});

test('unknown keys and non-objects are rejected; missing params are fine', () => {
  assert.deepEqual(checkAgainst(schema, { zzz: 1 }, 'x'), ["x: unknown param 'zzz'"]);
  assert.deepEqual(checkAgainst(schema, undefined, 'x'), []);
  assert.equal(checkAgainst(schema, [], 'x').length, 1);
});

test('arms accept presets and explicit arm arrays', () => {
  assert.deepEqual(checkAgainst(schema, { a: 'ring' }, 'x'), []);
  assert.deepEqual(checkAgainst(schema, { a: [{ angle: 0, reach: 1 }] }, 'x'), []);
  assert.equal(checkAgainst(schema, { a: [] }, 'x').length, 1);
  assert.equal(checkAgainst(schema, { a: [{ angle: 0, reach: 0 }] }, 'x').length, 1);
});
