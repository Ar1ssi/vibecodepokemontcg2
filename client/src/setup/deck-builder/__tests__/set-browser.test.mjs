import test from 'node:test';
    import assert from 'node:assert/strict';
    
    import {
      getLegalSetRegistry,
      fetchSetCards,
      filterCardsByName,
      sortCardsWithinGroup,
    } from '../core/set-browser.mjs';
    import { getStarterDeckCatalog, getStarterDecks, loadStarterDecks } from '../core/starter-decks.mjs';
    import { getSleeves, loadSleeveCatalog } from '../core/sleeves.mjs';
    import { getCoins, loadCoinCatalog } from '../core/coins.mjs';

    await Promise.all([loadStarterDecks(), loadSleeveCatalog(), loadCoinCatalog()]);
    const STARTER_DECK_CATALOG = getStarterDeckCatalog();
    
    test('legal registry contains the 21 Standard 2026-27 sets', () => {
      const registry = getLegalSetRegistry();
      assert.equal(registry.length, 21);
    
      const ids = registry.map((entry) => entry.setId);
      // Scarlet & Violet sets
      for (const id of ['sv03.5', 'sv06', 'sv06.5', 'sv07', 'sv08', 'sv08.5', 'sv09', 'sv10', 'sv10.5b', 'sv10.5w', 'svp']) {
        assert.ok(ids.includes(id), `missing ${id}`);
      }
      // Mega Evolution series — all sets post September 2025 are legal
      for (const id of ['me01', 'me02', 'me02.5', 'me03', 'me04', 'me05', 'mee', 'mep', '30th']) {
        assert.ok(ids.includes(id), `missing ${id}`);
      }
      // McDonald's Collection
      assert.ok(ids.includes('2024sv'), 'missing McDonald\'s Collection');
    });
    
    test('registry entries are clones (mutation-safe)', () => {
      const registry = getLegalSetRegistry();
      registry[0].setId = 'tampered';
      const fresh = getLegalSetRegistry();
      assert.notEqual(fresh[0].setId, 'tampered');
    });
    
    test('starter decks: seven 60-card decks with resolved TCGdex cards', () => {
      const decks = getStarterDecks();
      assert.equal(Object.keys(decks).length, 7);

      for (const key of ['gengar', 'diancie', 'lucario', 'charizard', 'darkrai', 'dragonite', 'greninja']) {
        assert.ok(decks[key], `missing deck: ${key}`);
        assert.equal(
          decks[key].reduce((n, r) => n + r.qty, 0),
          60,
          `${key} should be 60 cards`
        );
      }

      const gengarNames = decks.gengar.map((r) => r.name);
      assert.ok(gengarNames.includes('Mega Gengar ex'));
      assert.ok(gengarNames.includes('Gastly'));
      const diancieNames = decks.diancie.map((r) => r.name);
      assert.ok(diancieNames.includes('Mega Diancie ex'));
      assert.ok(diancieNames.includes('Mimikyu'));
      assert.ok(decks.lucario.some((c) => c.name === 'Mega Lucario ex'));
      assert.ok(decks.charizard.some((c) => c.name === 'Mega Charizard X ex'));
      assert.ok(decks.darkrai.some((c) => c.name === 'Mega Darkrai ex'));
      assert.ok(decks.dragonite.some((c) => c.name === 'Mega Dragonite ex'));
      assert.ok(decks.greninja.some((c) => c.name === 'Mega Greninja ex'));
    });

    test('starter deck cards are fully resolved (id, image, qty)', () => {
      const decks = getStarterDecks();
      for (const card of Object.values(decks).flat()) {
        assert.ok(card.id, `missing id for ${card.name}`);
        assert.ok(card.name, 'missing name');
        assert.ok(card.image && card.image.includes('https://'), `missing image for ${card.name}`);
        assert.ok(card.images?.small && card.images?.large, `missing images for ${card.name}`);
        assert.ok(Number.isInteger(card.qty) && card.qty > 0, `bad qty for ${card.name}`);
        assert.ok(card.supertype, `missing supertype for ${card.name}`);
      }
    
      // energies use modern SVE printings
      const gengar = decks.gengar;
      const darkness = gengar.find((c) => c.name === 'Basic Darkness Energy');
      assert.ok(darkness, 'Gengar deck missing Basic Darkness Energy');
      assert.equal(darkness.qty, 13);
      assert.ok(darkness.id.startsWith('sve-'));
    });

    test('starter deck catalog maps to known sleeves and coins', () => {
      const sleeveIds = new Set(getSleeves().map((s) => s.id));
      const coinIds = new Set(getCoins().map((c) => c.id));
      for (const entry of STARTER_DECK_CATALOG) {
        assert.ok(sleeveIds.has(entry.sleeveId), `unknown sleeve for ${entry.key}`);
        assert.ok(coinIds.has(entry.coinId), `unknown coin for ${entry.key}`);
      }
    });
    
    test('filterCardsByName does substring matching, case-insensitive', () => {
      const cards = [
        { id: '1', name: 'Mega Lucario ex' },
        { id: '2', name: 'Bulbasaur' },
        { id: '3', name: 'Mega Charizard ex' },
      ];
      assert.equal(filterCardsByName(cards, 'mega').length, 2);
      assert.equal(filterCardsByName(cards, 'LUCARIO').length, 1);
      assert.equal(filterCardsByName(cards, '').length, 3);
      assert.equal(filterCardsByName(cards, 'zzz').length, 0);
    });
    
    test('sortCardsWithinGroup: numeric before non-numeric localIds, direction-aware', () => {
      const cards = [
        { id: 'a', name: 'Zeta', localId: '10' },
        { id: 'b', name: 'Alpha', localId: '2' },
        { id: 'c', name: 'Mid', localId: 'Museum' },
      ];
      const asc = sortCardsWithinGroup(cards, { sortBy: 'number', sortDirection: 'asc' });
      assert.equal(asc[0].id, 'b');
      assert.equal(asc[1].id, 'a');
      assert.equal(asc[2].id, 'c');
    
      const desc = sortCardsWithinGroup(cards, { sortBy: 'number', sortDirection: 'desc' });
      // numeric desc: 10, 2, then non-numeric trails
      assert.equal(desc[0].id, 'a');
      assert.equal(desc[1].id, 'b');
      assert.equal(desc[2].id, 'c');
    
      const byName = sortCardsWithinGroup(cards, { sortBy: 'name', sortDirection: 'asc' });
      assert.equal(byName[0].id, 'b');
    });
    
// TCGdex /sets/sv03.5 lists sv03.5-004 Charmander and sv03.5-165 Rare Candy with no category
// (2026-10-15); /cards?category=Trainer lists Rare Candy.
test('fetchSetCards tags supertypes from the Trainer and Energy lists, alongside the set record', async () => {
  const requested = [];
  let indexRequestedBeforeRecord = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requested.push(parsed);
    const category = parsed.searchParams.get('category');
    let body;
    if (parsed.pathname.endsWith('/sets/sv03.5')) {
      indexRequestedBeforeRecord = requested.some((entry) => entry.searchParams.has('category'));
      body = {
        id: 'sv03.5',
        name: '151',
        releaseDate: '2023-09-22',
        cards: [
          { id: 'sv03.5-004', localId: '004', name: 'Charmander', image: 'https://assets.tcgdex.net/en/sv/sv03.5/004' },
          { id: 'sv03.5-165', localId: '165', name: 'Rare Candy', image: 'https://assets.tcgdex.net/en/sv/sv03.5/165' },
        ],
      };
    } else if (category === 'Trainer') {
      body = [{ id: 'sv03.5-165', localId: '165', name: 'Rare Candy' }];
    } else if (category === 'Energy') {
      body = [];
    } else {
      throw new Error(`unexpected request ${url}`);
    }
    return { ok: true, status: 200, json: async () => body };
  };
  try {
    const cards = await fetchSetCards('sv03.5');
    assert.deepEqual(
      cards.map((card) => [card.id, card.supertype]),
      [
        ['sv03.5-004', 'Pokémon'],
        ['sv03.5-165', 'Trainer'],
      ]
    );
    assert.ok(indexRequestedBeforeRecord, 'the index must not wait for the set record');
    assert.ok(
      !requested.some((entry) => entry.searchParams.get('category') === 'Pokemon'),
      'the ~2 MB Pokémon id list is never fetched'
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
