import test from 'node:test';
    import assert from 'node:assert/strict';
    
    import {
      getSleeves,
      getSleeveById,
      filterSleevesByName,
    } from '../core/sleeves.mjs';
    import {
      createDeckInLibrary,
      createEmptyLibrary,
      setDeckSleeve,
    } from '../core/deck-library.mjs';
    
    test('sleeve catalog: all 107 Mega Evolution sleeves with data', () => {
      const sleeves = getSleeves();
      assert.equal(sleeves.length, 107);
    
      for (const sleeve of sleeves) {
        assert.ok(sleeve.id, `missing id: ${sleeve.name}`);
        assert.ok(sleeve.name, `missing name: ${sleeve.id}`);
        assert.ok(sleeve.image.startsWith('https://pokemon-sleeve-database.com/'), `bad image url: ${sleeve.id}`);
      }
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
    