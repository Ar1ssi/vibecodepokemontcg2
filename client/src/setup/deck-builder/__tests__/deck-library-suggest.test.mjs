import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeckInLibrary,
  createEmptyLibrary,
  getDeckSuggestPrefs,
  parseLibrary,
  saveDeckSnapshot,
  serializeLibrary,
  setDeckSuggestPrefs,
} from '../core/deck-library.mjs';

const EMPTY = { locked: [], accepted: [], dismissed: [], goals: [] };
const PREFS = { locked: ['t:iono'], accepted: [], dismissed: ['t:switch'], goals: ['setup'] };

test('a deck saved before design 069, or with corrupt steering, reads as empty prefs', () => {
  const json = JSON.stringify({
    decks: {
      old: { id: 'old', name: 'Old', cards: {} },
      bad: { id: 'bad', name: 'Bad', cards: {}, suggestPrefs: 'garbage' },
    },
    order: ['old', 'bad'],
  });
  const library = parseLibrary(json);
  assert.deepEqual(getDeckSuggestPrefs(library, 'old'), EMPTY);
  assert.deepEqual(library.decks.bad.suggestPrefs, EMPTY);
  assert.deepEqual(getDeckSuggestPrefs(library, 'missing'), EMPTY);
});

test('setDeckSuggestPrefs round-trips through storage and normalizes', () => {
  const { library, deckId } = createDeckInLibrary(createEmptyLibrary(), 'Dragapult', {});
  assert.deepEqual(library.decks[deckId].suggestPrefs, EMPTY);
  const next = setDeckSuggestPrefs(library, deckId, { ...PREFS, goals: ['setup', 'bogus'] });
  assert.deepEqual(getDeckSuggestPrefs(parseLibrary(serializeLibrary(next)), deckId), PREFS);
  assert.deepEqual(setDeckSuggestPrefs(library, 'nope', PREFS), library);
});

test('saveDeckSnapshot writes the draft steering on create and on update; undefined keeps it', () => {
  const created = saveDeckSnapshot(createEmptyLibrary(), { name: 'Draft', cards: {}, suggestPrefs: PREFS });
  assert.equal(created.created, true);
  assert.deepEqual(getDeckSuggestPrefs(created.library, created.deckId), PREFS);

  const kept = saveDeckSnapshot(created.library, { deckId: created.deckId, cards: {} });
  assert.deepEqual(getDeckSuggestPrefs(kept.library, created.deckId), PREFS);

  const cleared = saveDeckSnapshot(created.library, { deckId: created.deckId, cards: {}, suggestPrefs: null });
  assert.deepEqual(getDeckSuggestPrefs(cleared.library, created.deckId), EMPTY);
});
