import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import { hashState } from '../../../shared/engine/state.mjs';

// Design 074 D7 / edge rows 28-30: one socket plays both seats of a server-authoritative room.

const P1_DECK = [[1, 'Pikachu', 'Pokémon', 'pika.png', '1', 'SVI', 'svi-1']];
const P2_DECK = [[1, 'Eevee', 'Pokémon', 'eevee.png', '2', 'SVI', 'svi-2']];

function soloRoom() {
  const room = new GameRoom({ roomId: 'solo-test', rulesEnabled: false });
  assert.equal(room.addSoloPlayer('socket-solo', 'Ash', { p1: P1_DECK, p2: P2_DECK }), true);
  room.state.players.p1.zones.hand.push(createCard({ instanceId: 10, name: 'Pikachu' }));
  room.state.players.p2.zones.hand.push(createCard({ instanceId: 20, name: 'Eevee' }));
  return room;
}

function moveToBench(instanceId, clientSeq, seat) {
  return {
    type: 'moveCard',
    payload: { instanceId, from: 'hand', to: 'bench' },
    clientSeq,
    ...(seat === undefined ? {} : { seat }),
  };
}

test('addSoloPlayer seats p1 and p2 for one socket and marks the room solo', () => {
  const room = soloRoom();
  assert.equal(room.solo, true);
  assert.deepEqual([...room.soloSeats], ['p1', 'p2']);
  assert.equal(room.socketToPlayer.get('socket-solo'), 'p1');
  assert.equal(room.playerToSocket.get('p1'), 'socket-solo');
  assert.equal(room.playerToSocket.get('p2'), 'socket-solo');
  assert.equal(room.state.players.p1.username, 'Ash');
  assert.equal(room.state.players.p2.username, 'Ash (far)');
  assert.deepEqual(room.state.players.p1.deckList, P1_DECK);
  assert.deepEqual(room.state.players.p2.deckList, P2_DECK);
});

test('addSoloPlayer refuses a room that already has a seated player or spectator', () => {
  const seated = new GameRoom({ roomId: 'seated', rulesEnabled: false });
  seated.addPlayer('socket-gary', 'p1', 'Gary');
  assert.equal(seated.addSoloPlayer('socket-solo', 'Ash'), false);
  assert.equal(seated.solo, false);

  const watched = new GameRoom({ roomId: 'watched', rulesEnabled: false });
  watched.addSpectator('socket-watch');
  assert.equal(watched.addSoloPlayer('socket-solo', 'Ash'), false);
});

test('a second player cannot seat in a solo room; the solo user reclaims it on a new socket', () => {
  const room = soloRoom();
  assert.equal(room.addPlayer('socket-gary', 'p2', 'Gary'), false);
  assert.equal(room.addSoloPlayer('socket-other', 'Gary'), false);

  room.removeSocket('socket-solo');
  assert.equal(room.addSoloPlayer('socket-reload', 'Ash'), true);
  assert.equal(room.playerToSocket.get('p2'), 'socket-reload');
  assert.equal(room.state.players.p2.zones.hand.length, 1, 'the game survives the reload');
});

test('seat p2 moves a p2 card and seat p1 moves a p1 card, from the one socket', () => {
  const room = soloRoom();

  const far = room.handleClientCommand('socket-solo', moveToBench(20, 1, 'p2'));
  assert.equal(far.success, true, far.reason);
  assert.equal(room.state.players.p2.zones.bench.length, 1);
  assert.equal(room.state.players.p1.zones.bench.length, 0);

  const near = room.handleClientCommand('socket-solo', moveToBench(10, 2, 'p1'));
  assert.equal(near.success, true, near.reason);
  assert.equal(room.state.players.p1.zones.bench.length, 1);

  assert.equal(room.getClientSeq('p2'), 1);
  assert.equal(room.getClientSeq('p1'), 2);
  assert.equal(far.broadcasts.length, 1, 'one view for the one socket');
  assert.equal(near.broadcasts[0].lastClientSeq, 2);
});

test('seat on a non-solo room is ignored: the socket\'s own seat acts', () => {
  const room = new GameRoom({ roomId: 'duo', rulesEnabled: false });
  room.addPlayer('socket-ash', 'p1', 'Ash');
  room.addPlayer('socket-gary', 'p2', 'Gary');
  room.state.players.p1.zones.hand.push(createCard({ instanceId: 10, name: 'Pikachu' }));

  assert.equal(room.seatFor('socket-ash', { seat: 'p2' }), 'p1');
  const res = room.handleClientCommand('socket-ash', moveToBench(10, 1, 'p2'));
  assert.equal(res.success, true, res.reason);
  assert.equal(room.state.players.p1.zones.bench.length, 1);
  assert.equal(room.getClientSeq('p1'), 1);
  assert.equal(room.getClientSeq('p2'), 0);
});

test('a missing or unknown seat in a solo room is refused bad_seat without touching state', () => {
  const room = soloRoom();
  const before = [hashState(room.state, 'p1'), hashState(room.state, 'p2'), room.state.stateVersion];

  for (const seat of [undefined, 'p3', null]) {
    const res = room.handleClientCommand('socket-solo', moveToBench(20, 1, seat));
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'bad_seat');
    assert.equal(res.success, false);
  }
  assert.equal(room.seatFor('socket-solo', { seat: 'p3' }), null);
  assert.equal(room.resolveChoice('socket-solo', { choiceId: 'c', seat: 'p9' }, 3).reason, 'bad_seat');
  assert.deepEqual(room.peekDeck('socket-solo', { count: 1 }), { ok: false, reason: 'bad_seat' });
  assert.deepEqual(
    [hashState(room.state, 'p1'), hashState(room.state, 'p2'), room.state.stateVersion],
    before
  );
  assert.equal(room.getClientSeq('p1'), 0);
  assert.equal(room.getClientSeq('p2'), 0);
});

test('a stranger socket is still refused as unauthorized in a solo room', () => {
  const room = soloRoom();
  const res = room.handleClientCommand('socket-stranger', moveToBench(20, 1, 'p2'));
  assert.equal(res.success, false);
  assert.equal(res.error, 'unauthorized');
});

test('peekDeck reads the named seat\'s deck in a solo room', () => {
  const room = soloRoom();
  room.state.players.p2.zones.deck.push(createCard({ instanceId: 30, name: 'Far Deck Eevee' }));
  const res = room.peekDeck('socket-solo', { side: 'you', count: 1, seat: 'p2' });
  assert.equal(res.ok, true);
  assert.equal(res.cards[0].name, 'Far Deck Eevee');
});

test('turn-order call and choice resolve the seat from the payload in a solo room', () => {
  const room = soloRoom();
  for (const seat of ['p1', 'p2']) {
    room.state.players[seat].zones.deck.push(createCard({ instanceId: seat === 'p1' ? 40 : 41 }));
    room.markReady(seat);
  }
  const opened = room.beginTurnOrderCall();
  assert.ok(opened);
  const caller = opened.callerPlayerId;
  const other = caller === 'p1' ? 'p2' : 'p1';

  assert.equal(
    room.submitTurnOrderCall('socket-solo', { callId: opened.callId, call: 'heads' }).reason,
    'bad_seat'
  );
  assert.equal(
    room.submitTurnOrderCall('socket-solo', { callId: opened.callId, call: 'heads', seat: other })
      .reason,
    'not_caller'
  );
  const flip = room.submitTurnOrderCall('socket-solo', {
    callId: opened.callId,
    call: 'heads',
    seat: caller,
  });
  assert.equal(flip.ok, true);

  const resolution = room.submitTurnOrderChoice('socket-solo', {
    choiceId: flip.choiceId,
    goFirst: true,
    seat: flip.winnerPlayerId,
  });
  assert.equal(resolution.ok, true);
  assert.equal(resolution.starterPlayerId, flip.winnerPlayerId);
});

test('addSpectator and canView refuse a stranger in a solo room; the solo socket can view', () => {
  const room = soloRoom();
  assert.equal(room.addSpectator('socket-watch'), false);
  assert.equal(room.spectatorSockets.size, 0);
  assert.equal(room.canView('socket-watch'), false);
  assert.equal(room.canView('socket-solo'), true);
});

test('getViewForSocket returns the solo view with both hands; setSoloNearSeat flips it', () => {
  const room = soloRoom();
  const view = room.getViewForSocket('socket-solo');
  assert.equal(view.solo, true);
  assert.equal(view.you.playerId, 'p1');
  assert.deepEqual(view.you.zones.hand.map((c) => c.name), ['Pikachu']);
  assert.deepEqual(view.them.zones.hand.map((c) => c.name), ['Eevee']);

  assert.equal(room.setSoloNearSeat('socket-solo', 'p3'), false);
  assert.equal(room.setSoloNearSeat('socket-stranger', 'p2'), false);
  assert.equal(room.setSoloNearSeat('socket-solo', 'p2'), true);
  const flipped = room.getViewForSocket('socket-solo');
  assert.equal(flipped.you.playerId, 'p2');
  assert.deepEqual(flipped.them.zones.hand.map((c) => c.name), ['Pikachu']);

  const duo = new GameRoom({ roomId: 'duo', rulesEnabled: false });
  duo.addPlayer('socket-ash', 'p1', 'Ash');
  assert.equal(duo.setSoloNearSeat('socket-ash', 'p2'), false);
  assert.equal(duo.getViewForSocket('socket-ash').solo, undefined);
});

test('viewTargets yields one entry per connected socket', () => {
  const room = soloRoom();
  assert.deepEqual(room.viewTargets(), [{ socketId: 'socket-solo', playerId: 'p1' }]);
  room.setSoloNearSeat('socket-solo', 'p2');
  assert.deepEqual(room.viewTargets(), [{ socketId: 'socket-solo', playerId: 'p2' }]);

  const duo = new GameRoom({ roomId: 'duo', rulesEnabled: false });
  duo.addPlayer('socket-ash', 'p1', 'Ash');
  duo.addPlayer('socket-gary', 'p2', 'Gary');
  duo.addSpectator('socket-watch');
  assert.deepEqual(duo.viewTargets(), [
    { socketId: 'socket-ash', playerId: 'p1' },
    { socketId: 'socket-gary', playerId: 'p2' },
  ]);
});

test('removeSocket clears both seats of a solo room', () => {
  const room = soloRoom();
  room.handleClientCommand('socket-solo', moveToBench(20, 1, 'p2'));
  room.removeSocket('socket-solo');
  assert.equal(room.socketToPlayer.size, 0);
  assert.equal(room.playerToSocket.size, 0);
  assert.equal(room.getClientSeq('p2'), 0);
  assert.deepEqual(room.viewTargets(), []);
  assert.equal(room.canView('socket-solo'), false);
});
