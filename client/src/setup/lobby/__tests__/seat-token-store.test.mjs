import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSeatToken,
  readSeatToken,
  seatTokenFor,
  writeSeatToken,
} from '../seat-token-store.mjs';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

test('design 069 row 7: a stored token round-trips per room and username', () => {
  const storage = memoryStorage();
  writeSeatToken('public:1', 'Ash', 'tok-1', storage);
  assert.deepEqual(readSeatToken('public:1', storage), { username: 'Ash', token: 'tok-1' });
  assert.equal(seatTokenFor('public:1', 'Ash', storage), 'tok-1');
  assert.equal(seatTokenFor('public:1', 'Misty', storage), null);
  assert.equal(seatTokenFor('public:2', 'Ash', storage), null);
  clearSeatToken('public:1', storage);
  assert.equal(readSeatToken('public:1', storage), null);
});

test('design 069 row 10: throwing or missing storage never throws and falls back to memory', () => {
  writeSeatToken('public:5', 'Ash', 'tok', throwingStorage);
  assert.equal(seatTokenFor('public:5', 'Ash', throwingStorage), 'tok');
  assert.equal(seatTokenFor('public:5', 'Ash', null), 'tok');
  clearSeatToken('public:5', throwingStorage);
  assert.equal(readSeatToken('public:5', throwingStorage), null);
  assert.equal(seatTokenFor('public:6', 'Ash', null), null);
});

test('design 069 row 2: corrupt stored values read as nothing', () => {
  const storage = memoryStorage();
  clearSeatToken('public:1', storage);
  storage.setItem('ptcg.seatToken.public:1', '{not json');
  assert.equal(readSeatToken('public:1', storage), null);
  storage.setItem('ptcg.seatToken.public:1', JSON.stringify({ username: 'Ash', token: 7 }));
  assert.equal(readSeatToken('public:1', storage), null);
});
