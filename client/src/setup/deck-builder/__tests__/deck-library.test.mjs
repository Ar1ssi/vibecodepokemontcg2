import test from 'node:test';
    import assert from 'node:assert/strict';
    
    import {
      createEmptyLibrary,
      createDeckInLibrary,
      renameDeckInLibrary,
      deleteDeckFromLibrary,
      getDeckFromLibrary,
      getDeckFormat,
      saveDeckSnapshot,
      saveDeckToLibrary,
      setDeckSprites,
      listDecks,
      setDeckWallpaper,
      parseLibrary,
      serializeLibrary,
      loadLibraryFromStorage,
      saveLibraryToStorage,
      LIBRARY_STORAGE_KEY,
      MAX_LIBRARY_DECKS,
      deckCardsKey,
      hasUnsavedDraft,
    } from '../core/deck-library.mjs';
    import { restorableDeckId } from '../core/last-session.mjs';
    
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

    test('last-session save/load round-trips active deck id', async () => {
      const { saveLastSession, loadLastSession, LAST_SESSION_STORAGE_KEY } = await import('../core/last-session.mjs');
      const storage = makeStorage();
      saveLastSession(storage, { deckId: 'deck1234', target: 'self' });
      const loaded = loadLastSession(storage);
      assert.equal(loaded.deckId, 'deck1234');
      assert.equal(loaded.target, 'self');
      assert.ok(storage.getItem(LAST_SESSION_STORAGE_KEY));
    });
    
// --- Pokémon sprite slots (design 024) ---

test('a new deck starts with no sprites, and can be created with some', () => {
  const bare = createDeckInLibrary(createEmptyLibrary(), 'Bare', {}, 1000);
  assert.deepEqual(bare.library.decks[bare.deckId].sprites, []);

  const withSprites = createDeckInLibrary(createEmptyLibrary(), 'Themed', {}, 1000, {
    sprites: [{ slug: 'charizard', shiny: true }],
  });
  assert.deepEqual(withSprites.library.decks[withSprites.deckId].sprites, [
    { slug: 'charizard', shiny: true },
  ]);
});

test('setDeckSprites writes the slots and stamps updatedAt', () => {
  const { library, deckId } = createDeckInLibrary(
    createEmptyLibrary(),
    'Deck',
    {},
    1000
  );

  const next = setDeckSprites(library, deckId, ['pikachu', { slug: 'mew', shiny: true }]);
  assert.deepEqual(next.decks[deckId].sprites, [
    { slug: 'pikachu', shiny: false },
    { slug: 'mew', shiny: true },
  ]);
  assert.ok(next.decks[deckId].updatedAt >= 1000);
  assert.deepEqual(library.decks[deckId].sprites, [], 'the input library is untouched');
});

test('setDeckSprites on a missing deck is a no-op copy', () => {
  const library = createEmptyLibrary();
  assert.deepEqual(setDeckSprites(library, 'nope', ['pikachu']), library);
});

test('setDeckSprites caps the strip at two and drops unknown slugs', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000);
  const next = setDeckSprites(library, deckId, [
    'missingno',
    'pikachu',
    'eevee',
    'mew',
    'snorlax',
  ]);
  assert.deepEqual(
    next.decks[deckId].sprites.map((sprite) => sprite.slug),
    ['pikachu', 'eevee']
  );
});

test('a library saved before sprites existed parses to empty strips', () => {
  const legacy = JSON.stringify({
    decks: {
      abc12345: {
        id: 'abc12345',
        name: 'Old Deck',
        createdAt: 1,
        updatedAt: 1,
        cards: {},
      },
    },
    order: ['abc12345'],
  });

  const parsed = parseLibrary(legacy);
  assert.deepEqual(parsed.decks.abc12345.sprites, []);
  assert.deepEqual(listDecks(parsed)[0].sprites, []);
});

test('a corrupted sprites field parses to an empty strip rather than throwing', () => {
  const corrupted = JSON.stringify({
    decks: {
      abc12345: {
        id: 'abc12345',
        name: 'Broken',
        createdAt: 1,
        updatedAt: 1,
        cards: {},
        sprites: 'pikachu, eevee',
      },
    },
    order: ['abc12345'],
  });
  assert.deepEqual(parseLibrary(corrupted).decks.abc12345.sprites, []);
});

test('sprites round-trip through serialize and parse', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, {
    sprites: [{ slug: 'gengar', shiny: true }],
  });
  const parsed = parseLibrary(serializeLibrary(library));
  assert.deepEqual(parsed.decks[deckId].sprites, [{ slug: 'gengar', shiny: true }]);
});

test('listDecks exposes sprites, cards and wallpaper so the deck chips can draw them', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, {
    sprites: ['pikachu'],
    wallpaperId: 'cave',
  });
  assert.deepEqual(listDecks(library), [
    {
      id: deckId,
      name: 'Deck',
      createdAt: 1000,
      updatedAt: 1000,
      sprites: [{ slug: 'pikachu', shiny: false }],
      cards: {},
      wallpaperId: 'cave',
      format: 'tcg',
    },
  ]);
});

test('setDeckWallpaper stores the wallpaper and null resets it', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000);
  assert.equal(library.decks[deckId].wallpaperId, null);
  const set = setDeckWallpaper(library, deckId, 'snow');
  assert.equal(set.decks[deckId].wallpaperId, 'snow');
  assert.equal(library.decks[deckId].wallpaperId, null);
  assert.equal(setDeckWallpaper(set, deckId, null).decks[deckId].wallpaperId, null);
  assert.deepEqual(setDeckWallpaper(library, 'nope', 'snow'), library);
});

test('wallpaper round-trips through serialize and parse', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, {
    wallpaperId: 'volcano',
  });
  assert.equal(parseLibrary(serializeLibrary(library)).decks[deckId].wallpaperId, 'volcano');
});

// ── Deck format (design 051) ──

test('a new deck is Standard unless created as Build & Battle', () => {
  const standard = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000);
  assert.equal(standard.library.decks[standard.deckId].format, 'tcg');
  assert.equal(getDeckFormat(standard.library, standard.deckId), 'tcg');

  const boxDeck = createDeckInLibrary(standard.library, 'B&B Ceruledge #42', {}, 1000, {
    format: 'build-battle',
  });
  assert.equal(getDeckFormat(boxDeck.library, boxDeck.deckId), 'build-battle');
  assert.equal(listDecks(boxDeck.library)[1].format, 'build-battle');
  assert.equal(getDeckFormat(boxDeck.library, 'missing'), null);

  const unknown = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, { format: 'pocket' });
  assert.equal(getDeckFormat(unknown.library, unknown.deckId), 'tcg');
});

test('the format survives serialize/parse; legacy or bad values read as Standard', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, {
    format: 'build-battle',
  });
  assert.equal(parseLibrary(serializeLibrary(library)).decks[deckId].format, 'build-battle');

  const legacy = JSON.stringify({
    decks: {
      abc12345: { id: 'abc12345', name: 'Old', cards: {} },
      bad00000: { id: 'bad00000', name: 'Bad', cards: {}, format: { evil: true } },
    },
    order: ['abc12345', 'bad00000'],
  });
  const parsed = parseLibrary(legacy);
  assert.equal(parsed.decks.abc12345.format, 'tcg');
  assert.equal(parsed.decks.bad00000.format, 'tcg');
});

test('saving over a Build & Battle deck keeps its format; a created snapshot takes the given one', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, {
    format: 'build-battle',
  });
  const saved = saveDeckSnapshot(library, { deckId, cards: makeCards() }, 2000);
  assert.equal(getDeckFormat(saved.library, deckId), 'build-battle');

  const created = saveDeckSnapshot(createEmptyLibrary(), { name: 'New', format: 'build-battle' }, 2000);
  assert.equal(created.created, true);
  assert.equal(getDeckFormat(created.library, created.deckId), 'build-battle');
});

test('deckCardsKey matches equal decks and tells edited ones apart', () => {
  assert.equal(deckCardsKey(makeCards()), deckCardsKey(makeCards()));
  assert.notEqual(deckCardsKey(makeCards()), deckCardsKey({}));
  assert.equal(deckCardsKey(null), deckCardsKey({}));
});

test('only cards with no saved deck behind them count as an unsaved draft', () => {
  assert.equal(hasUnsavedDraft(null, makeCards()), true);
  assert.equal(hasUnsavedDraft('deck-1', makeCards()), false);
  assert.equal(hasUnsavedDraft(null, {}), false);
  assert.equal(hasUnsavedDraft(null, undefined), false);
});

test('the builder tab reopens the last-used deck only while it still exists', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Mine', makeCards(), 1);
  assert.equal(restorableDeckId({ deckId }, library), deckId);
  assert.equal(restorableDeckId({ deckId: 'deleted' }, library), null);
  assert.equal(restorableDeckId(null, library), null);
  assert.equal(restorableDeckId({ deckId }, null), null);
});
