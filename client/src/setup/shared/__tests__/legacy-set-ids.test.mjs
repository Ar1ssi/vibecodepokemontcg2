import test from 'node:test';
import assert from 'node:assert/strict';

const { LEGACY_SET_CODE_TO_TCGDEX_ID, buildLegacyCardId } = await import(
  '../legacy-set-ids.mjs'
);

test('legacy table maps the codes import.js used to own', () => {
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.BS, 'base1');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.TRR, 'ex7');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.N1, 'neo1');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.LA, 'dp6');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID['PR-NP'], 'np');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.FUT20, 'fut20');
});

test('buildLegacyCardId joins set id and collector number', () => {
  assert.equal(buildLegacyCardId('TRR', '32'), 'ex7-32');
  assert.equal(buildLegacyCardId('BS', 4), 'base1-4');
  assert.equal(buildLegacyCardId('SK', '144'), 'ecard3-144');
});

test('buildLegacyCardId trims surrounding whitespace', () => {
  assert.equal(buildLegacyCardId(' TRR ', ' 32 '), 'ex7-32');
});

test('buildLegacyCardId returns null for unknown or missing set codes', () => {
  // Modern sets aren't in the table — callers fall back to the name search.
  assert.equal(buildLegacyCardId('SVI', '32'), null);
  assert.equal(buildLegacyCardId(null, '32'), null);
  assert.equal(buildLegacyCardId('', '32'), null);
  assert.equal(buildLegacyCardId(undefined, '32'), null);
});

test('buildLegacyCardId returns null without a collector number', () => {
  assert.equal(buildLegacyCardId('TRR', null), null);
  assert.equal(buildLegacyCardId('TRR', ''), null);
  assert.equal(buildLegacyCardId('TRR', undefined), null);
});

test('buildLegacyCardId is case-sensitive on the set code (matches import.js)', () => {
  // 'pop1'..'pop9' are deliberate lowercase entries; other codes are uppercase.
  assert.equal(buildLegacyCardId('pop1', '1'), 'pop1-1');
  assert.equal(buildLegacyCardId('trr', '32'), null);
});

test('buildLegacyCardId ignores prototype keys', () => {
  assert.equal(buildLegacyCardId('constructor', '1'), null);
  assert.equal(buildLegacyCardId('toString', '1'), null);
});
