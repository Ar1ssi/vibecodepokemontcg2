import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLegalStandardSets, fetchSetCards, GEN_1_2_SET_ID } from '../set-browser.mjs';
import { GEN_1_2_ORDER } from '../gen-1-2-order.generated.mjs';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const card = (setId, localId, name) => ({
  id: `${setId}-${localId}`,
  localId,
  name,
  image: `https://assets.tcgdex.net/en/x/${setId}/${localId}`,
});

// Ids/names per TCGdex (2026-10-01): base1-1 Alakazam (#65), base1-4 Charizard (#6),
// base1-58 Pikachu (#25), base1-91 Bill (Trainer), base1-98 Fire Energy, base4-1 Alakazam.
const SETS = {
  base1: { id: 'base1', name: 'Base Set', releaseDate: '1999-01-09', cards: [card('base1', '98', 'Fire Energy'), card('base1', '91', 'Bill'), card('base1', '1', 'Alakazam'), card('base1', '4', 'Charizard'), card('base1', '58', 'Pikachu')] },
  base3: { id: 'base3', name: 'Fossil', releaseDate: '1999-10-10', cards: [] },
  base4: { id: 'base4', name: 'Base Set 2', releaseDate: '2000-02-24', cards: [card('base4', '1', 'Alakazam')] },
  lc: { id: 'lc', name: 'Legendary Collection', releaseDate: '2002-05-24', cards: [card('lc', '100', 'Full Heal Energy'), card('lc', '101', 'Potion Energy')] },
  neo1: { id: 'neo1', name: 'Neo Genesis', releaseDate: '2000-12-16', cards: [] },
};

function stubSets() {
  global.fetch = async (url) => {
    const match = /\/sets\/([^/?]+)$/.exec(url);
    const record = match && SETS[match[1]];
    if (!record) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => record };
  };
}

describe('1 + 2 dex (Other tab)', () => {
  it('orders Base Set / Fossil / Base Set 2 / Neo Genesis cards by the baked dex order', async () => {
    stubSets();
    const ids = (await fetchSetCards(GEN_1_2_SET_ID)).map((c) => c.id);
    assert.deepEqual(ids, [
      'base1-4', // Charizard #6
      'base1-58', // Pikachu #25
      'base1-1', // Alakazam #65; the Base Set 2 reprint (base4-1) is dropped
      'base1-91', // Trainer
      'base1-98', // Energy
      'base1-98-reverse', // Energize Your Game holo copy of Base Set Fire Energy
      'lc-100-reverse', 'lc-101-reverse', // Gen 1 Reverse Holo Energy (Legendary Collection)
    ]);
  });

  it('bakes each card once with reprints dropped, Pokémon first', () => {
    assert.equal(GEN_1_2_ORDER.length, 285);
    assert.equal(new Set(GEN_1_2_ORDER).size, 285);
    assert.ok(!GEN_1_2_ORDER.includes('base4-1'), 'Base Set 2 Alakazam is a Base Set reprint');
    assert.ok(GEN_1_2_ORDER.indexOf('base1-4') < GEN_1_2_ORDER.indexOf('base1-91'));
    assert.ok(GEN_1_2_ORDER.indexOf('base1-91') < GEN_1_2_ORDER.indexOf('base1-98'));
  });

  it('is listed in the Other tab as "1 + 2 dex" with the combined count', async () => {
    stubSets();
    const sets = await fetchLegalStandardSets();
    const entry = sets.find((s) => s.setId === GEN_1_2_SET_ID);
    assert.equal(entry.name, '1 + 2 dex');
    assert.equal(entry.category, 'other');
    assert.equal(entry.cardCount, GEN_1_2_ORDER.length + 11);
  });
});
