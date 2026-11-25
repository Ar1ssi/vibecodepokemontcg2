import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyLibrary,
  createDeckInLibrary,
  saveDeckSnapshot,
  setDeckSleeve,
  setDeckStarterKey,
} from '../core/deck-library.mjs';

const libraryWithDeck = () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Deck', {}, 1000, { sleeveId: 'red' });
  return { library, deckId };
};

test('an empty cosmetic id means the default on the snapshot path, as it does in the setters', () => {
  const { library, deckId } = libraryWithDeck();
  const saved = saveDeckSnapshot(library, { deckId, cards: {}, sleeveId: '', coinId: '', matId: '', deckBoxId: '', wallpaperId: '' });
  const deck = saved.library.decks[deckId];
  assert.deepEqual(
    [deck.sleeveId, deck.coinId, deck.matId, deck.deckBoxId, deck.wallpaperId],
    [null, null, null, null, null]
  );
  assert.equal(setDeckSleeve(library, deckId, '').decks[deckId].sleeveId, null);
  const created = saveDeckSnapshot(library, { name: 'New', cards: {}, sleeveId: '' });
  assert.equal(created.library.decks[created.deckId].sleeveId, null);
});

test('setters leave an unknown deck alone, stamp updatedAt, and the starter key does not', () => {
  const { library, deckId } = libraryWithDeck();
  assert.deepEqual(setDeckSleeve(library, 'nope', 'x'), library);
  assert.ok(setDeckSleeve(library, deckId, 'blue').decks[deckId].updatedAt > 1000);
  const tagged = setDeckStarterKey(library, deckId, 'gengar').decks[deckId];
  assert.equal(tagged.starterKey, 'gengar');
  assert.equal(tagged.updatedAt, 1000);
});
