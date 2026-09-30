import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCardMarkers,
  gallerySetId,
  matchPrinting,
  nameKey,
  numberKey,
  renderCardMarkersModule,
} from '../generate-card-markers.mjs';

test('nameKey ignores punctuation and the Prism Star symbol', () => {
  assert.equal(nameKey('Pikachu & Zekrom-GX'), nameKey('Pikachu & Zekrom GX'));
  assert.equal(nameKey('Lugia {*}'), nameKey('Lugia ◇'));
  assert.equal(nameKey('Lugia Prism Star'), nameKey('Lugia ◇'));
  assert.notEqual(nameKey('Pikachu'), nameKey('Raichu'));
});

test('numberKey drops leading zeros and keeps prefixes', () => {
  assert.equal(numberKey('007'), '7');
  assert.equal(numberKey('TG07'), 'tg7');
  assert.equal(numberKey('SWSH123'), 'swsh123');
  assert.equal(numberKey('143a'), '143a');
});

test('matchPrinting needs both the number and the name', () => {
  const cards = [{ id: 'sv07-128', localId: '128', name: 'Terapagos ex' }];
  assert.equal(matchPrinting({ name: 'Terapagos ex', number: '128' }, cards), 'sv07-128');
  assert.match(matchPrinting({ name: 'Pikachu', number: '128' }, cards).message, /is "Terapagos ex"/);
  assert.match(matchPrinting({ name: 'Terapagos ex', number: '9' }, cards).message, /no #9/);
});

test('gallerySetId routes Trainer/Galarian Gallery numbers to the TCGdex subset', () => {
  const sets = new Map([['brilliant stars', 'swsh9'], ['brilliant stars trainer gallery', 'swsh9tg']]);
  assert.equal(gallerySetId(sets, { set: 'Brilliant Stars', number: 'TG18' }), 'swsh9tg');
  assert.equal(gallerySetId(sets, { set: 'Brilliant Stars', number: '18' }), null);
});

test('collectCardMarkers merges markers per id and reports what it skips', async () => {
  const printings = {
    'is:tera': [{ name: 'Terapagos ex', set: 'Stellar Crown', number: '128' }],
    'is:tag-team': [
      { name: 'Guzma & Hala', set: 'Cosmic Eclipse', number: '193' },
      { name: 'Lost Card', set: 'Nowhere', number: '1' },
    ],
  };
  const { markers, failures } = await collectCardMarkers({
    scrape: async (query) => printings[query] || [],
    setIndex: async () => new Map([['stellar crown', 'sv07'], ['cosmic eclipse', 'sm12']]),
    setCards: async (setId) =>
      ({
        sv07: [{ id: 'sv07-128', localId: '128', name: 'Terapagos ex' }],
        sm12: [{ id: 'sm12-193', localId: '193', name: 'Guzma & Hala' }],
      })[setId],
  });
  assert.deepEqual(markers, { 'sv07-128': ['Tera'], 'sm12-193': ['TAG TEAM'] });
  assert.deepEqual(failures, ['TAG TEAM: Lost Card (Nowhere 1): set not on TCGdex']);
  assert.match(renderCardMarkersModule(markers), /'sm12-193': \['TAG TEAM'\],\n {2}'sv07-128': \['Tera'\],/);
});
