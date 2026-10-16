import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import {
  applySetupAction,
  cacheSetupAction,
  dealOrderPayload,
  instanceMapPayload,
  isPlayerRequestedReset,
  isSeatSetupAction,
  setupActionCacheKey,
  setupActionSeat,
} from '../setup-actions.mjs';

// Design 074 D7: the legacy per-seat pushActions in a solo room act for `data.seat`.

const DECK = [
  [2, 'Pikachu', 'Pokémon', 'pika.png', '1', 'SVI', 'svi-1'],
  [1, 'Iono', 'Trainer', 'iono.png', '2', 'PAL', 'pal-2'],
];

function soloRoom() {
  const room = new GameRoom({ roomId: 'solo-setup', rulesEnabled: false });
  assert.equal(room.addSoloPlayer('socket-solo', 'Ash'), true);
  return room;
}

function loadDeckPacket(seat) {
  return { roomId: 'solo-setup', action: 'loadDeckData', parameters: [DECK, 'tcg'], seat };
}

function readyPacket(seat) {
  return { roomId: 'solo-setup', action: 'readyUp', parameters: [], seat };
}

function act(room, data) {
  const { seat, refused } = setupActionSeat(room, 'socket-solo', data);
  if (refused) return { refused };
  return applySetupAction(room, 'socket-solo', seat, data);
}

test('solo loadDeckData with seat p2 fills p2\'s deck and leaves p1 empty', () => {
  const room = soloRoom();
  const outcome = act(room, loadDeckPacket('p2'));
  assert.equal(outcome.deckLoaded, true);
  assert.equal(room.state.players.p2.zones.deck.length, 3);
  assert.equal(room.state.players.p1.zones.deck.length, 0);
  assert.ok(room.state.players.p2.zones.deck.every((card) => card.ownerId === 'p2'));
});

test('solo readyUp with seat p2 readies only p2; both seats ready → isReadyToDeal', () => {
  const room = soloRoom();
  act(room, loadDeckPacket('p1'));
  act(room, loadDeckPacket('p2'));

  assert.equal(act(room, readyPacket('p2')).readied, true);
  assert.deepEqual([...room.readyPlayerIds], ['p2']);
  assert.equal(room.isReadyToDeal(), false);

  assert.equal(act(room, readyPacket('p1')).readied, true);
  assert.equal(room.isReadyToDeal(), true);
});

test('a missing or unknown seat on a solo per-seat packet is refused bad_seat', () => {
  const room = soloRoom();
  for (const seat of [undefined, 'p3']) {
    assert.deepEqual(act(room, readyPacket(seat)), { refused: 'bad_seat' });
    assert.deepEqual(act(room, loadDeckPacket(seat)), { refused: 'bad_seat' });
  }
  assert.equal(room.readyPlayerIds.size, 0);
  assert.equal(room.state.players.p1.zones.deck.length, 0);

  const stranger = setupActionSeat(room, 'socket-stranger', readyPacket('p1'));
  assert.deepEqual(stranger, { seat: null, refused: null }, 'a stranger is ignored as before');
});

test('the Reset request is reported for its seat', () => {
  const room = soloRoom();
  const reset = { roomId: 'solo-setup', action: 'reset', parameters: [false], seat: 'p2' };
  assert.equal(isPlayerRequestedReset(reset), true);
  assert.equal(isSeatSetupAction(reset), true);
  assert.equal(isPlayerRequestedReset({ action: 'reset', parameters: [true] }), false);
  assert.equal(act(room, reset).resetRequested, true);
  assert.deepEqual(act(room, { ...reset, seat: undefined }), { refused: 'bad_seat' });
});

test('a normal room ignores seat: the socket\'s own seat loads and readies', () => {
  const room = new GameRoom({ roomId: 'duo', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');
  const data = { roomId: 'duo', action: 'loadDeckData', parameters: [DECK], seat: 'p2' };

  const { seat, refused } = setupActionSeat(room, 'socket-ash', data);
  assert.equal(seat, 'p1');
  assert.equal(refused, null);
  applySetupAction(room, 'socket-ash', seat, data);
  assert.equal(room.state.players.p1.zones.deck.length, 3);
  assert.equal(room.state.players.p2.zones.deck.length, 0);
  assert.equal(setupActionCacheKey(room, 'socket-ash', seat), 'socket-ash');
  assert.equal(setupActionCacheKey(null, 'socket-relay', null), 'socket-relay');
});

test('the setup cache keeps one packet per seat in a solo room', () => {
  const room = soloRoom();
  const cache = new Map();
  for (const seat of ['p1', 'p2', 'p2']) {
    cacheSetupAction(cache, setupActionCacheKey(room, 'socket-solo', seat), loadDeckPacket(seat));
  }
  cacheSetupAction(cache, 'solo:p1', readyPacket('p1'));
  assert.deepEqual([...cache.keys()], ['solo:p1', 'solo:p2']);
  assert.equal(cache.get('solo:p2').loadDeckData.seat, 'p2');
  assert.equal(cache.get('solo:p1').readyUp, undefined, 'only deck packets are cached');

  // A rejoin on a new socket replaces the seat's entry instead of adding one.
  room.removeSocket('socket-solo');
  room.addSoloPlayer('socket-reload', 'Ash');
  const key = setupActionCacheKey(room, 'socket-reload', 'p1');
  cacheSetupAction(cache, key, loadDeckPacket('p1'));
  assert.equal(cache.size, 2);
});

test('instanceMap and dealOrder payloads name their seat', () => {
  const room = soloRoom();
  act(room, loadDeckPacket('p2'));
  const map = instanceMapPayload(room, 'solo-setup', 'p2');
  assert.deepEqual(Object.keys(map), ['roomId', 'seat', 'map']);
  assert.equal(map.seat, 'p2');
  assert.equal(Object.keys(map.map).length, 3);

  const p1 = room.state.players.p1.zones;
  p1.prizes.push(createCard({ instanceId: 90, syncInstance: 4 }));
  p1.hand.push(createCard({ instanceId: 91, syncInstance: 2 }));
  p1.deck.push(createCard({ instanceId: 92, syncInstance: 0 }));
  room.state.turn.player = 'p2';

  assert.deepEqual(dealOrderPayload(room, 'solo-setup', 'p1'), {
    roomId: 'solo-setup',
    seat: 'p1',
    order: [4, 2, 0],
    starter: 'opp',
  });
  assert.equal(dealOrderPayload(room, 'solo-setup', 'p2').starter, 'self');
  assert.equal(dealOrderPayload(room, 'solo-setup', 'p2').seat, 'p2');
});
