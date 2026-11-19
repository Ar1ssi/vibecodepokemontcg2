import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOM_SET_STORAGE_KEY,
  CUSTOM_SET_UNREADABLE_BACKUP_KEY,
  createEmptyCustomSet,
  loadCustomSetFromStorage,
} from '../custom-set.mjs';

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: data,
  };
};

test('an unreadable stored set is kept under a backup key before the empty set can overwrite it', () => {
  const storage = memoryStorage({ [CUSTOM_SET_STORAGE_KEY]: '{oops' });
  assert.deepEqual(loadCustomSetFromStorage(storage), createEmptyCustomSet());
  assert.equal(storage.raw.get(CUSTOM_SET_UNREADABLE_BACKUP_KEY), '{oops');
});

test('a later unreadable value does not replace the first backup, and an absent set makes none', () => {
  const storage = memoryStorage({ [CUSTOM_SET_STORAGE_KEY]: '{first', [CUSTOM_SET_UNREADABLE_BACKUP_KEY]: '{older' });
  loadCustomSetFromStorage(storage);
  assert.equal(storage.raw.get(CUSTOM_SET_UNREADABLE_BACKUP_KEY), '{older');
  const empty = memoryStorage();
  loadCustomSetFromStorage(empty);
  assert.equal(empty.raw.has(CUSTOM_SET_UNREADABLE_BACKUP_KEY), false);
});
