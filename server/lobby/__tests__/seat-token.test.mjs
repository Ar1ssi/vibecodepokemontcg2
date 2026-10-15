import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeatClaim, issueSeatToken } from '../seat-token.mjs';

const roomWith = (...usernames) => ({ players: new Set(usernames), spectators: new Set() });

test('design 069: an unseated username is a new player', () => {
  assert.equal(checkSeatClaim(roomWith('Ash'), 'Misty', undefined), 'new');
  assert.equal(checkSeatClaim(null, 'Misty', 'x'), 'new');
});

test('design 069 rows 5-6: a seated username needs its token', () => {
  const room = roomWith('Ash');
  const token = issueSeatToken(room, 'Ash', () => 'tok-1');
  assert.equal(token, 'tok-1');
  assert.equal(checkSeatClaim(room, 'Ash', 'tok-1'), 'owner');
  assert.equal(checkSeatClaim(room, 'Ash', 'tok-2'), 'taken');
  assert.equal(checkSeatClaim(room, 'Ash', undefined), 'taken');
});

test('design 069 row 2: malformed tokens never match', () => {
  const room = roomWith('Ash');
  issueSeatToken(room, 'Ash', () => 'x'.repeat(101));
  assert.equal(checkSeatClaim(room, 'Ash', 'x'.repeat(101)), 'taken');
  room.seatTokens.set('Ash', '5');
  assert.equal(checkSeatClaim(room, 'Ash', 5), 'taken');
  room.seatTokens.set('Ash', '');
  assert.equal(checkSeatClaim(room, 'Ash', ''), 'taken');
});

test('design 069: a seated name with no stored token (seated before tokens) is taken', () => {
  assert.equal(checkSeatClaim(roomWith('Ash'), 'Ash', 'anything'), 'taken');
});

test('design 069: the default mint returns distinct random tokens', () => {
  const room = roomWith('Ash');
  const first = issueSeatToken(room, 'Ash');
  const second = issueSeatToken(room, 'Ash');
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
  assert.equal(room.seatTokens.get('Ash'), second);
});
