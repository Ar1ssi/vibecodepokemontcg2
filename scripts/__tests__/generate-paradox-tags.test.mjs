import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectParadoxTags,
  renderParadoxTagsModule,
  tcgdexCardId,
  tcgdexSetId,
} from '../generate-paradox-tags.mjs';

test('tcgdexSetId maps pokemontcg.io Scarlet & Violet set ids', () => {
  assert.equal(tcgdexSetId('sv4'), 'sv04');
  assert.equal(tcgdexSetId('sv4pt5'), 'sv04.5');
  assert.equal(tcgdexSetId('sv10'), 'sv10');
  assert.equal(tcgdexSetId('svp'), 'svp');
  assert.equal(tcgdexSetId('me1'), null);
  assert.equal(tcgdexSetId(undefined), null);
});

test('tcgdexCardId pads the collector number and rejects non-numeric numbers', () => {
  assert.equal(tcgdexCardId({ set: { id: 'sv4' }, number: '86' }), 'sv04-086');
  assert.equal(tcgdexCardId({ set: { id: 'svp' }, number: '67' }), 'svp-067');
  assert.equal(tcgdexCardId({ set: { id: 'sv4' }, number: 'SV86' }), null);
  assert.equal(tcgdexCardId({ set: { id: 'xy1' }, number: '1' }), null);
});

const printings = {
  Ancient: [{ id: 'sv4-86', name: 'Scream Tail', number: '86', set: { id: 'sv4' } }],
  Future: [{ id: 'sv5-122', name: 'Miraidon ex', number: '122', set: { id: 'sv5' } }],
};
const tcgdexNames = { 'sv04-086': 'Scream Tail', 'sv05-122': 'Miraidon ex' };

test('collectParadoxTags keys each printing by its TCGdex id', async () => {
  const tags = await collectParadoxTags({
    fetchPrintings: async (tag) => printings[tag],
    fetchTcgdexCard: async (id) => ({ name: tcgdexNames[id] }),
  });
  assert.deepEqual(tags, { 'sv04-086': 'Ancient', 'sv05-122': 'Future' });
});

test('collectParadoxTags throws when TCGdex names a different card (data drift)', async () => {
  await assert.rejects(
    collectParadoxTags({
      fetchPrintings: async (tag) => printings[tag],
      fetchTcgdexCard: async () => ({ name: 'Pikachu' }),
    }),
    /is "Pikachu" on TCGdex/
  );
});

test('collectParadoxTags treats curly and straight apostrophes as the same name', async () => {
  const tags = await collectParadoxTags({
    fetchPrintings: async (tag) =>
      tag === 'Ancient'
        ? [{ id: 'sv4-170', name: "Professor Sada's Vitality", number: '170', set: { id: 'sv4' } }]
        : [],
    fetchTcgdexCard: async () => ({ name: 'Professor Sada’s Vitality' }),
  });
  assert.deepEqual(tags, { 'sv04-170': 'Ancient' });
});

test('collectParadoxTags throws on an unmappable set and on a printing tagged both ways', async () => {
  await assert.rejects(
    collectParadoxTags({
      fetchPrintings: async () => [{ id: 'me1-1', name: 'X', number: '1', set: { id: 'me1' } }],
      fetchTcgdexCard: async () => ({ name: 'X' }),
    }),
    /No TCGdex id/
  );
  await assert.rejects(
    collectParadoxTags({
      fetchPrintings: async () => printings.Ancient,
      fetchTcgdexCard: async () => ({ name: 'Scream Tail' }),
    }),
    /tagged both Ancient and Future/
  );
});

test('renderParadoxTagsModule sorts ids and freezes the table', () => {
  const src = renderParadoxTagsModule({ 'sv05-122': 'Future', 'sv04-086': 'Ancient' });
  assert.ok(src.indexOf("'sv04-086'") < src.indexOf("'sv05-122'"));
  assert.match(src, /export const PARADOX_TAGS = Object\.freeze\(\{/);
});
