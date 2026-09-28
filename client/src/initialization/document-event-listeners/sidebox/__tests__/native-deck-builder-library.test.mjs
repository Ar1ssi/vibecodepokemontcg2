import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  createDeckInLibrary,
  createEmptyLibrary,
  getDeckFromLibrary,
  LIBRARY_STORAGE_KEY,
  parseLibrary,
  saveDeckToLibrary,
  serializeLibrary,
} from '../../../../setup/deck-builder/core/deck-library.mjs';
import { initializeNativeDeckBuilderLibrary } from '../native-deck-builder-library.js';

const MARKUP = `
  <div id="nativeDeckBuilderLibraryBar">
    <button id="nativeDeckBuilderLibraryToggle"><span data-deck-picker-label></span></button>
    <div id="nativeDeckBuilderLibraryPopover" hidden>
      <div id="nativeDeckBuilderLibraryList"></div>
    </div>
    <button id="nativeDeckBuilderNewDeck"></button>
    <span id="nativeDeckBuilderLibraryStatus"></span>
  </div>`;

const pikachu = (count) => ({
  Pikachu: { cards: [{ data: { name: 'Pikachu', supertype: 'Pokémon' }, count }], totalCount: count },
});

// A localStorage stand-in that counts library writes and can be made to refuse them.
function makeStorage(initial) {
  const store = new Map([[LIBRARY_STORAGE_KEY, initial]]);
  const storage = {
    writes: 0,
    full: false,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (storage.full) throw new Error('QuotaExceededError');
      if (key === LIBRARY_STORAGE_KEY) storage.writes += 1;
      store.set(key, String(value));
    },
    removeItem: (key) => store.delete(key),
  };
  return storage;
}

// Boots the library controller on a fresh page whose storage holds one user
// deck, "Mine", with 4 Pikachu. Starter decks are seeded on top of it.
function boot({ allowDeckWrites = true, onExternalDeckChange } = {}) {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Mine', pikachu(4), 1);
  const storage = makeStorage(serializeLibrary(library));
  const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`, { url: 'http://localhost/' });
  Object.defineProperty(dom.window, 'localStorage', { value: storage, configurable: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CSS = { escape: (value) => String(value) };

  const opened = [];
  const controller = initializeNativeDeckBuilderLibrary({
    onOpenDeck: (target, id, cards) => opened.push({ target, id, cards }),
    onSaveCurrentDeck: () => {},
    allowDeckWrites,
    onExternalDeckChange,
  });
  const status = () => dom.window.document.getElementById('nativeDeckBuilderLibraryStatus').textContent;
  const stored = () => parseLibrary(storage.getItem(LIBRARY_STORAGE_KEY));
  // Another tab writes the library, then the browser fires `storage` here.
  const otherTabWrites = (nextLibrary) => {
    storage.setItem(LIBRARY_STORAGE_KEY, serializeLibrary(nextLibrary));
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: LIBRARY_STORAGE_KEY }));
  };
  return { controller, storage, deckId, opened, status, stored, otherTabWrites };
}

test('autosave with unchanged cards writes nothing, so it cannot revert another tab', () => {
  const { controller, storage, deckId, stored } = boot();
  assert.equal(controller.openDeckById('self', deckId), true);
  const writesBefore = storage.writes;

  assert.equal(controller.saveActiveDeck(pikachu(4)), true);
  assert.equal(storage.writes, writesBefore);

  assert.equal(controller.saveActiveDeck(pikachu(3)), true);
  assert.equal(storage.writes, writesBefore + 1);
  assert.equal(getDeckFromLibrary(stored(), deckId).Pikachu.totalCount, 3);
});

test('an edit from another tab reaches this tab, and its next autosave keeps it', () => {
  const changes = [];
  const { controller, storage, deckId, stored, otherTabWrites } = boot({
    onExternalDeckChange: (target, id, cards) => changes.push({ target, id, cards }),
  });
  controller.openDeckById('self', deckId);

  otherTabWrites(saveDeckToLibrary(stored(), deckId, pikachu(2), 5));

  assert.equal(changes.length, 1);
  assert.equal(changes[0].target, 'self');
  assert.equal(changes[0].id, deckId);
  assert.equal(changes[0].cards.Pikachu.totalCount, 2);

  // The builder now renders the adopted cards; autosaving them is a no-op.
  const writesBefore = storage.writes;
  controller.saveActiveDeck(changes[0].cards);
  assert.equal(storage.writes, writesBefore);
  assert.equal(getDeckFromLibrary(stored(), deckId).Pikachu.totalCount, 2);
});

test('the read-only game tab never adopts or writes deck cards', () => {
  const changes = [];
  const { controller, deckId, stored, otherTabWrites } = boot({
    allowDeckWrites: false,
    onExternalDeckChange: () => changes.push(true),
  });
  controller.setActiveDeck('self', deckId);
  otherTabWrites(saveDeckToLibrary(stored(), deckId, pikachu(1), 5));
  assert.equal(changes.length, 0);
  assert.equal(controller.saveActiveDeck(pikachu(4)), false);
});

test('a full or blocked storage fails the save out loud instead of saying "Deck saved."', () => {
  const { controller, storage, deckId, status, stored } = boot();
  controller.openDeckById('self', deckId);
  storage.full = true;

  assert.equal(controller.saveActiveDeck(pikachu(3)), false);
  assert.match(status(), /Could not save/);

  const result = controller.saveCurrentDeck(pikachu(3));
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'storage');
  assert.doesNotMatch(status(), /Deck saved/);

  storage.full = false;
  assert.equal(getDeckFromLibrary(stored(), deckId).Pikachu.totalCount, 4);
  // Once storage accepts writes again the unsaved edit still goes through.
  assert.equal(controller.saveActiveDeck(pikachu(3)), true);
  assert.equal(getDeckFromLibrary(stored(), deckId).Pikachu.totalCount, 3);
});

test('a new deck that storage refuses is not created or left bound', () => {
  const { controller, storage, stored } = boot();
  const decksBefore = stored().order.length;
  storage.full = true;
  window.prompt = () => 'Draft';

  const result = controller.saveCurrentDeck(pikachu(4));

  assert.deepEqual(result, { saved: false, created: false, name: null, reason: 'storage' });
  assert.equal(controller.getActiveDeckId('self'), null);
  assert.equal(controller.getLibrary().order.length, decksBefore);
});
