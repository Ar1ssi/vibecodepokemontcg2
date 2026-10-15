import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deckBoxIdForSave, effectiveCosmeticId, importedDeckBoxId } from '../cosmetic-state.mjs';

const catalog = { default: 'db_default', boxes: [{ id: 'db_default' }, { id: 'db_a' }] };

test('with a deck loaded the shown id is the deck record, never the stale mirror', () => {
  assert.equal(effectiveCosmeticId({ loadedDeckId: 'd1', activeId: 'db_a', mirrored: 'db_old' }), 'db_a');
  assert.equal(effectiveCosmeticId({ loadedDeckId: 'd1', activeId: null, mirrored: 'db_old' }), null);
  assert.equal(effectiveCosmeticId({ loadedDeckId: 'd1', activeId: undefined, mirrored: 'db_old' }), null);
});

test('with nothing loaded the shown id is the mirror, or null', () => {
  assert.equal(effectiveCosmeticId({ loadedDeckId: null, activeId: 'db_a', mirrored: 'db_x' }), 'db_x');
  assert.equal(effectiveCosmeticId({ loadedDeckId: undefined, activeId: 'db_a', mirrored: undefined }), null);
});

test('Save leaves the deck box of a loaded deck alone and seeds a new deck from the mirror', () => {
  assert.equal(deckBoxIdForSave({ loadedDeckId: 'd1', mirrored: 'db_stale' }), undefined);
  assert.equal(deckBoxIdForSave({ loadedDeckId: null, mirrored: 'db_x' }), 'db_x');
  assert.equal(deckBoxIdForSave({ loadedDeckId: null, mirrored: undefined }), null);
});

test('an imported box id: the default becomes null, a listed box stays, anything else is ignored', () => {
  assert.equal(importedDeckBoxId(catalog, 'db_default'), null);
  assert.equal(importedDeckBoxId(catalog, 'db_a'), 'db_a');
  assert.equal(importedDeckBoxId(catalog, 'db_gone'), undefined);
  assert.equal(importedDeckBoxId(catalog, null), undefined);
  assert.equal(importedDeckBoxId(catalog, ''), undefined);
  assert.equal(importedDeckBoxId(null, 'db_a'), undefined, 'catalog not loaded yet');
});
