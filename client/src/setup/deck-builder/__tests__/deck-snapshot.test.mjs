import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeckInLibrary,
  createEmptyLibrary,
  saveDeckSnapshot,
} from '../core/deck-library.mjs';

const CARDS = {
  Pikachu: { totalCount: 4, cards: [{ count: 4, data: { name: 'Pikachu' } }] },
};
const OTHER_CARDS = {
  Bulbasaur: {
    totalCount: 2,
    cards: [{ count: 2, data: { name: 'Bulbasaur' } }],
  },
};

function libraryWithDeck(options = {}) {
  const { library, deckId } = createDeckInLibrary(
    createEmptyLibrary(),
    'My Deck',
    OTHER_CARDS,
    1000,
    options
  );
  return { library, deckId };
}

test('saving over a loaded deck replaces its cards and stamps the time', () => {
  const { library, deckId } = libraryWithDeck();

  const result = saveDeckSnapshot(library, { deckId, cards: CARDS }, 2000);

  assert.equal(result.created, false);
  assert.equal(result.deckId, deckId);
  assert.deepEqual(result.library.decks[deckId].cards, CARDS);
  assert.equal(result.library.decks[deckId].updatedAt, 2000);
  assert.equal(result.library.decks[deckId].name, 'My Deck');
});

test('saving writes the chosen sleeve, coin and mat onto the deck', () => {
  const { library, deckId } = libraryWithDeck();

  const result = saveDeckSnapshot(
    library,
    {
      deckId,
      cards: CARDS,
      sleeveId: 'sleeve-7',
      coinId: 'coin-3',
      matId: 'mat-1',
    },
    2000
  );

  const deck = result.library.decks[deckId];
  assert.equal(deck.sleeveId, 'sleeve-7');
  assert.equal(deck.coinId, 'coin-3');
  assert.equal(deck.matId, 'mat-1');
});

test('an omitted cosmetic leaves the saved one alone', () => {
  const { library, deckId } = libraryWithDeck({
    sleeveId: 'keep-me',
    coinId: 'keep-coin',
    matId: 'keep-mat',
  });

  const deck = saveDeckSnapshot(library, { deckId, cards: CARDS }, 2000).library
    .decks[deckId];
  assert.equal(deck.sleeveId, 'keep-me');
  assert.equal(deck.coinId, 'keep-coin');
  assert.equal(deck.matId, 'keep-mat');
});

test('an explicit null clears a cosmetic back to the default', () => {
  const { library, deckId } = libraryWithDeck({ sleeveId: 'old-sleeve' });

  const deck = saveDeckSnapshot(
    library,
    { deckId, cards: CARDS, sleeveId: null },
    2000
  ).library.decks[deckId];
  assert.equal(deck.sleeveId, null);
});

test('saving with no deck loaded creates one instead of losing the cards', () => {
  const result = saveDeckSnapshot(
    createEmptyLibrary(),
    { deckId: null, name: 'Fresh Deck', cards: CARDS, sleeveId: 'sleeve-2' },
    3000
  );

  assert.equal(result.created, true);
  assert.ok(result.deckId);
  const deck = result.library.decks[result.deckId];
  assert.equal(deck.name, 'Fresh Deck');
  assert.deepEqual(deck.cards, CARDS);
  assert.equal(deck.sleeveId, 'sleeve-2');
  assert.deepEqual(result.library.order, [result.deckId]);
});

test('a deckId that no longer exists creates a deck rather than dropping the save', () => {
  const { library } = libraryWithDeck();
  const result = saveDeckSnapshot(
    library,
    { deckId: 'deleted-deck', name: 'Recovered', cards: CARDS },
    3000
  );
  assert.equal(result.created, true);
  assert.notEqual(result.deckId, 'deleted-deck');
  assert.deepEqual(result.library.decks[result.deckId].cards, CARDS);
});

test('saving never mutates the library it was given', () => {
  const { library, deckId } = libraryWithDeck();
  const before = structuredClone(library);

  saveDeckSnapshot(library, { deckId, cards: CARDS, sleeveId: 'x' }, 2000);

  assert.deepEqual(library, before);
});

test('the saved cards are a copy, not a live reference to the editor state', () => {
  const { library, deckId } = libraryWithDeck();
  const editorCards = structuredClone(CARDS);

  const saved = saveDeckSnapshot(library, { deckId, cards: editorCards }, 2000)
    .library.decks[deckId];

  editorCards.Pikachu.totalCount = 99;
  assert.equal(saved.cards.Pikachu.totalCount, 4);
});

test('saving an empty deck is allowed and clears the stored cards', () => {
  const { library, deckId } = libraryWithDeck();
  const deck = saveDeckSnapshot(library, { deckId, cards: {} }, 2000).library
    .decks[deckId];
  assert.deepEqual(deck.cards, {});
});
