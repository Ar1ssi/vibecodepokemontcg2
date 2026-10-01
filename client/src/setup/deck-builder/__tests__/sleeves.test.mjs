import test from 'node:test';
    import assert from 'node:assert/strict';
    
    import {
      getSleeves,
      getSleeveById,
      filterSleevesByName,
      ownedFirst,
    } from '../core/sleeves.mjs';
    import {
      createDeckInLibrary,
      createEmptyLibrary,
      setDeckSleeve,
    } from '../core/deck-library.mjs';
    
    test('sleeve catalog: all 450 Pokemon sleeves with data', () => {
      const sleeves = getSleeves();
      assert.equal(sleeves.length, 450);

      for (const sleeve of sleeves) {
        assert.ok(sleeve.id, `missing id: ${sleeve.name}`);
        assert.ok(sleeve.name, `missing name: ${sleeve.id}`);
        const isRemote = sleeve.image.startsWith('https://pokemon-sleeve-database.com/');
        const isLocal = sleeve.image.startsWith('src/assets/sleeves/');
        assert.ok(isRemote || isLocal, `bad image url: ${sleeve.id}`);
      }
    });

    test('coin catalog: all 939 Pokemon coins with data', async () => {
      const {
        COIN_MATERIALS,
        getCoins,
      } = await import('../core/coins.mjs');
      const coins = getCoins();
      assert.equal(coins.length, 939);

      const ids = new Set();
      for (const coin of coins) {
        assert.ok(coin.id, `missing id: ${coin.name}`);
        assert.ok(coin.name, `missing name: ${coin.id}`);
        assert.ok(coin.url, `bad url: ${coin.id}`);
        assert.ok(coin.thumb, `missing thumb: ${coin.id}`);
        assert.ok(coin.material, `missing material: ${coin.id}`);
        assert.ok(
          COIN_MATERIALS.includes(coin.material),
          `unknown material "${coin.material}": ${coin.id}`
        );
        assert.ok(!/\bdate\b/i.test(coin.release || ''), `unclean release: ${coin.id}`);
        assert.ok(!ids.has(coin.id), `duplicate id: ${coin.id}`);
        ids.add(coin.id);
      }

      assert.equal(ids.size, coins.length);
    });
    
    test('sleeve catalog entries are clones', () => {
      const sleeves = getSleeves();
      sleeves[0].name = 'tampered';
      assert.notEqual(getSleeves()[0].name, 'tampered');
    });
    
    test('getSleeveById finds and misses', () => {
      const sleeves = getSleeves();
      const found = getSleeveById(sleeves[0].id);
      assert.equal(found?.name, sleeves[0].name);
      assert.equal(getSleeveById('nonexistent'), null);
    });
    
    test('filterSleevesByName does substring matching', () => {
      const sleeves = getSleeves();
      const mega = filterSleevesByName(sleeves, 'mega');
      assert.ok(mega.length > 0 && mega.length < sleeves.length);
      assert.ok(mega.every((s) => s.name.toLowerCase().includes('mega')));
      assert.equal(filterSleevesByName(sleeves, '').length, sleeves.length);
    });
    
    test('setDeckSleeve persists sleeveId on a deck', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Test Deck');
      const sleeveId = getSleeves()[0].id;
    
      const updated = setDeckSleeve(library, deckId, sleeveId);
      assert.equal(updated.decks[deckId].sleeveId, sleeveId);
      // original untouched (still null from creation, not the new sleeve)
      assert.equal(library.decks[deckId].sleeveId, null);
    
      // clear
      const cleared = setDeckSleeve(updated, deckId, null);
      assert.equal(cleared.decks[deckId].sleeveId, null);
    });
    
    test('setDeckSleeve ignores unknown decks', () => {
      const { library } = createDeckInLibrary(createEmptyLibrary(), 'A');
      const same = setDeckSleeve(library, 'nope', 'x');
      assert.deepEqual(same, library);
    });

    test('default card back resolves to the local asset', async () => {
      const {
        DEFAULT_CARD_BACK_PATH,
        resolveDefaultCardBackSrc,
      } = await import('../../deck-constructor/default-card-back.mjs');
      assert.equal(DEFAULT_CARD_BACK_PATH, '/src/assets/cardback.png');
      assert.equal(resolveDefaultCardBackSrc(undefined), '/src/assets/cardback.png');
      assert.equal(
        resolveDefaultCardBackSrc('http://localhost:4000'),
        'http://localhost:4000/src/assets/cardback.png'
      );
    });
    
test('design 057: ownedFirst puts owned sleeves first and keeps each group in catalog order', () => {
  const [a, b, c] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(ownedFirst([a, b, c], ['c']), [c, a, b]);
  assert.deepEqual(ownedFirst([a, b, c], ['c', 'a']), [a, c, b], 'owned keep catalog order');
  assert.deepEqual(ownedFirst([a, b, c], []), [a, b, c]);
  assert.deepEqual(ownedFirst([a, b, c], null), [a, b, c]);
  assert.deepEqual(ownedFirst([a, b, c], ['zz']), [a, b, c], 'unknown ids change nothing');
  const sleeves = getSleeves();
  const etbSleeve = '08266b9d-1d37-4ddb-a458-9adc302edb62';
  const sorted = ownedFirst(sleeves, [etbSleeve]);
  assert.equal(sorted[0].id, etbSleeve);
  assert.equal(sorted.length, sleeves.length);
});
