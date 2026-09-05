import test from 'node:test';
import assert from 'node:assert/strict';

const {
  LEGACY_SET_CODE_TO_TCGDEX_ID,
  MODERN_SET_CODE_TO_TCGDEX_ID,
  buildLegacyCardId,
  buildSetCardIdCandidates,
  resolveTcgdexSetId,
  extractTcgdexIdFromImageUrl,
} = await import('../legacy-set-ids.mjs');

test('legacy table maps the codes import.js used to own', () => {
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.BS, 'base1');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.TRR, 'ex7');
  assert.equal(LEGACY_SET_CODE_TO_TCGDEX_ID.N1, 'neo1');
});

test('modern table maps Phantasmal Flames (PFL) to me02', () => {
  assert.equal(MODERN_SET_CODE_TO_TCGDEX_ID.PFL, 'me02');
  assert.equal(resolveTcgdexSetId('PFL'), 'me02');
});

test('buildSetCardIdCandidates pads modern collector numbers', () => {
  assert.deepEqual(buildSetCardIdCandidates('PFL', '24'), ['me02-24', 'me02-024']);
  assert.equal(buildLegacyCardId('TRR', '32'), 'ex7-32');
});

test('buildLegacyCardId returns null for unknown or missing set codes', () => {
  assert.equal(buildLegacyCardId('ZZZ', '32'), null);
  assert.equal(buildLegacyCardId(null, '32'), null);
});

test('buildLegacyCardId ignores prototype keys', () => {
  assert.equal(buildLegacyCardId('constructor', '1'), null);
});

test('resolveTcgdexSetId accepts raw TCGdex set ids from the deck builder', () => {
  assert.equal(resolveTcgdexSetId('me02'), 'me02');
  assert.equal(resolveTcgdexSetId('sv10.5b'), 'sv10.5b');
});

test('extractTcgdexIdFromImageUrl parses TCGdex CDN and limitlesstcg URLs', () => {
  assert.equal(
    extractTcgdexIdFromImageUrl(
      'https://assets.tcgdex.net/en/me/me02/024/high.webp'
    ),
    'me02-024'
  );
  assert.equal(
    extractTcgdexIdFromImageUrl(
      'https://images.pokemontcg.io/me02/024_hires.png'
    ),
    'me02-024'
  );
  assert.equal(
    extractTcgdexIdFromImageUrl(
      'https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/PFL/PFL_024_R_EN.png'
    ),
    'me02-024'
  );
});
