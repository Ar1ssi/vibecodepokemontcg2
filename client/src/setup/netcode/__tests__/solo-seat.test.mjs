import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  farSeat,
  makeSoloRoomId,
  soloFarName,
  soloOwnerName,
  seatForSide,
  sideForSeat,
  soloCommandSeat,
} from '../solo-seat.mjs';

test('farSeat: the other seat of the table', () => {
  assert.equal(farSeat('p1'), 'p2');
  assert.equal(farSeat('p2'), 'p1');
});

test('seatForSide: self is the near seat, opp the far one, for either near seat', () => {
  assert.equal(seatForSide('self', 'p1'), 'p1');
  assert.equal(seatForSide('opp', 'p1'), 'p2');
  assert.equal(seatForSide('self', 'p2'), 'p2');
  assert.equal(seatForSide('opp', 'p2'), 'p1');
});

test('seatForSide: an unknown near seat reads as p1', () => {
  assert.equal(seatForSide('self', undefined), 'p1');
  assert.equal(seatForSide('opp', 'p3'), 'p2');
});

test('sideForSeat: inverts seatForSide for both near seats', () => {
  for (const nearSeat of ['p1', 'p2']) {
    for (const side of ['self', 'opp']) {
      assert.equal(sideForSeat(seatForSide(side, nearSeat), nearSeat), side, `${side}@${nearSeat}`);
    }
  }
  assert.equal(sideForSeat('p2', 'p2'), 'self');
  assert.equal(sideForSeat('p1', 'p2'), 'opp');
});

test('soloCommandSeat: no seat outside a solo room', () => {
  assert.equal(soloCommandSeat({ solo: false, nearSeat: 'p1', user: 'self' }), undefined);
  assert.equal(soloCommandSeat({ solo: false, nearSeat: 'p2', user: 'opp' }), undefined);
  assert.equal(soloCommandSeat(), undefined);
});

test('soloCommandSeat: the acting side\'s seat in a solo room, both near seats', () => {
  assert.equal(soloCommandSeat({ solo: true, nearSeat: 'p1', user: 'self' }), 'p1');
  assert.equal(soloCommandSeat({ solo: true, nearSeat: 'p1', user: 'opp' }), 'p2');
  assert.equal(soloCommandSeat({ solo: true, nearSeat: 'p2', user: 'self' }), 'p2');
  assert.equal(soloCommandSeat({ solo: true, nearSeat: 'p2', user: 'opp' }), 'p1');
  // A missing user acts for the near seat, as an unmarked command does.
  assert.equal(soloCommandSeat({ solo: true, nearSeat: 'p2' }), 'p2');
});

test('makeSoloRoomId: solo- and 8 base36 characters', () => {
  assert.match(makeSoloRoomId(), /^solo-[0-9a-z]{8}$/);
  assert.equal(makeSoloRoomId(() => [0, 1, 10, 35, 36, 71, 255, 9]), 'solo-01az0z39');
  assert.notEqual(makeSoloRoomId(), makeSoloRoomId());
});

test('soloOwnerName: the p1 seat\'s name wherever it sits', () => {
  const names = { p2SelfUsername: 'Ash', p2OppUsername: 'Ash (far)' };
  assert.equal(soloOwnerName({ ...names, nearSeat: 'p1' }), 'Ash');
  assert.equal(
    soloOwnerName({ nearSeat: 'p2', p2SelfUsername: 'Ash (far)', p2OppUsername: 'Ash' }),
    'Ash'
  );
  assert.equal(soloFarName('Ash'), 'Ash (far)');
});
