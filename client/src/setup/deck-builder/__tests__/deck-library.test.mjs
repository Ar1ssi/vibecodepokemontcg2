import test from 'node:test';
    import assert from 'node:assert/strict';
    
    import {
      createEmptyLibrary,
      createDeckInLibrary,
      renameDeckInLibrary,
      deleteDeckFromLibrary,
      getDeckFromLibrary,
      saveDeckToLibrary,
      listDecks,
      parseLibrary,
      serializeLibrary,
      loadLibraryFromStorage,
      saveLibraryToStorage,
      LIBRARY_STORAGE_KEY,
      MAX_LIBRARY_DECKS,
    } from '../core/deck-library.mjs';
    
    function makeCards(overrides = {}) {
      return {
        Pikachu: {
          cards: [{ data: { name: 'Pikachu', supertype: 'Pokémon', image: 'https://example.com/pikachu.png' }, count: 4 }],
          totalCount: 4,
        },
        ...overrides,
      };
    }
    
    function makeStorage(initialValue = undefined) {
      const store = new Map();
      if (initialValue !== undefined) store.set(LIBRARY_STORAGE_KEY, initialValue);
      return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      };
    }
    
    test('createEmptyLibrary returns empty decks and order', () => {
      const library = createEmptyLibrary();
      assert.deepEqual(library, { decks: {}, order: [] });
      assert.deepEqual(listDecks(library), []);
    });
    
    test('createDeckInLibrary adds a deck with generated id and order entry', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Charizard ex', makeCards(), 1000);
    
      assert.equal(typeof deckId, 'string');
      assert.equal(deckId.length, 8);
      assert.ok(library.decks[deckId]);
      assert.equal(library.decks[deckId].name, 'Charizard ex');
      assert.deepEqual(library.order, [deckId]);
      assert.equal(listDecks(library).length, 1);
    });
    
    test('createDeckInLibrary clones cards and does not mutate the input', () => {
      const cards = makeCards();
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Clone test', cards, 1000);
    
      library.decks[deckId].cards.Pikachu.cards[0].count = 99;
      assert.equal(cards.Pikachu.cards[0].count, 4);
    });
    
    test('createDeckInLibrary sanitizes empty names to Untitled Deck', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), '   ', {}, 1000);
      assert.equal(library.decks[deckId].name, 'Untitled Deck');
    });
    
    test('createDeckInLibrary caps name length at 60 characters', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'x'.repeat(200), {}, 1000);
      assert.equal(library.decks[deckId].name.length, 60);
      assert.equal(MAX_LIBRARY_DECKS, 60);
    });
    
    test('renameDeckInLibrary renames and ignores unknown ids', () => {
      let { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Old', {}, 1000);
      library = renameDeckInLibrary(library, deckId, 'New Name');
      assert.equal(library.decks[deckId].name, 'New Name');
    
      const unchanged = renameDeckInLibrary(library, 'nope', 'Nope');
      assert.equal(unchanged.decks[deckId].name, 'New Name');
    });
    
    test('deleteDeckFromLibrary removes deck and keeps order consistent', () => {
      const a = createDeckInLibrary(createEmptyLibrary(), 'A', {}, 1000);
      const b = createDeckInLibrary(a.library, 'B', {}, 2000);
      const library = deleteDeckFromLibrary(b.library, a.deckId);
    
      assert.equal(library.decks[a.deckId], undefined);
      assert.deepEqual(library.order, [b.deckId]);
      assert.equal(listDecks(library).length, 1);
    });
    
    test('getDeckFromLibrary returns cloned cards and null for unknown id', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'A', makeCards(), 1000);
    
      const cards = getDeckFromLibrary(library, deckId);
      assert.equal(cards.Pikachu.totalCount, 4);
    
      cards.Pikachu.totalCount = 42;
      assert.equal(library.decks[deckId].cards.Pikachu.totalCount, 4);
    
      assert.equal(getDeckFromLibrary(library, 'unknown'), null);
    });
    
    test('saveDeckToLibrary updates cards and updatedAt, ignores unknown id', () => {
      const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'A', {}, 1000);
      const next = saveDeckToLibrary(library, deckId, makeCards(), 5000);
    
      assert.equal(next.decks[deckId].cards.Pikachu.totalCount, 4);
      assert.equal(next.decks[deckId].updatedAt, 5000);
      assert.equal(library.decks[deckId].cards.Pikachu, undefined);
    
      const unchanged = saveDeckToLibrary(next, 'nope', {}, 9999);
      assert.deepEqual(unchanged, next);
    });
    
    test('parseLibrary round-trips through serializeLibrary', () => {
      let library = createEmptyLibrary();
      const a = createDeckInLibrary(library, 'A', makeCards(), 1000);
      const b = createDeckInLibrary(a.library, 'B', {}, 2000);
    
      const roundTripped = parseLibrary(serializeLibrary(b.library));
      assert.deepEqual(roundTripped, b.library);
    });
    
    test('parseLibrary repairs malformed shapes gracefully', () => {
      assert.deepEqual(
        parseLibrary('not json'),
        createEmptyLibrary()
      );
      assert.deepEqual(
        parseLibrary(JSON.stringify({ decks: 'nope', order: 3 })),
        createEmptyLibrary()
      );
      // order references a missing deck -> dropped
      const repaired = parseLibrary(JSON.stringify({ decks: {}, order: ['ghost'] }));
      assert.deepEqual(repaired, { decks: {}, order: [] });
      // deck missing from order -> appended
      const appended = parseLibrary(
        JSON.stringify({ decks: { abc: { id: 'abc', name: 'A', cards: {} } }, order: [] })
      );
      assert.deepEqual(appended.order, ['abc']);
    });
    
    test('storage helpers persist and reload a library', () => {
      const storage = makeStorage();
      const a = createDeckInLibrary(createEmptyLibrary(), 'Persisted', makeCards(), 1000);
    
      assert.equal(saveLibraryToStorage(storage, a.library), true);
      const reloaded = loadLibraryFromStorage(storage);
      assert.deepEqual(reloaded, a.library);
      assert.equal(listDecks(reloaded)[0].name, 'Persisted');
    });
    
    test('storage helpers tolerate broken storage and missing methods', () => {
      assert.deepEqual(loadLibraryFromStorage(undefined), createEmptyLibrary());
      assert.deepEqual(loadLibraryFromStorage(makeStorage('###')), createEmptyLibrary());
      assert.equal(saveLibraryToStorage(undefined, createEmptyLibrary()), false);
      assert.equal(saveLibraryToStorage({ setItem: () => { throw new Error('full'); } }, createEmptyLibrary()), false);
    });
    