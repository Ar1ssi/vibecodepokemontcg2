import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';

// design 002 slice 3.4e / I16: `loadDeck` and `undo`.
//
// `loadDeck` replaces the old direct `initializePlayerDeck(gameRoom.state, ...)` mutation
// (server.js) with a real logged command, because undo's replay ("commandLog minus tail,
// rebuilt from a fresh seeded state" — D6) can only reconstruct decks that were themselves
// populated through a logged command.

function deckData(prefix, count) {
  // [quantity, name, type, imageURL, number, set, tcgId] — `type` deliberately not one of
  // Trainer/Energy/Item/Supporter/Stadium so isPokemon()/isBasicPokemon() treat every card as
  // a Basic Pokémon, which keeps setupGame's mulligan loop from ever triggering.
  return [
    [count, `${prefix}mon`, 'Lightning', '', '1', 'testset', `${prefix}-1`],
  ];
}

function makeRoom(overrides = {}) {
  const room = new GameRoom({
    roomId: 'room-undo',
    rulesEnabled: false,
    seed: 42,
    ...overrides,
  });
  room.addPlayer('sock1', 'p1', 'Ash');
  room.addPlayer('sock2', 'p2', 'Gary');
  return room;
}

test('loadDeck: populates zones.deck, mints instanceId, records deckList, and is logged', () => {
  const room = makeRoom();
  const data = deckData('p1', 4);

  const res = room.handleCommand('sock1', {
    type: 'loadDeck',
    payload: { deckData: data },
  });

  assert.equal(res.success, true);
  assert.equal(room.state.players.p1.zones.deck.length, 4);
  const ids = room.state.players.p1.zones.deck.map((c) => c.instanceId);
  assert.deepEqual(ids, [...new Set(ids)], 'instanceIds must be unique');
  for (const id of ids) assert.ok(Number.isInteger(id));
  assert.deepEqual(room.state.players.p1.deckList, data);
  assert.equal(room.state.commandLog.length, 1);
  assert.equal(room.state.commandLog[0].type, 'loadDeck');
});

test('loadDeck is rejected once the game has started', () => {
  const room = makeRoom({ rulesEnabled: true });
  room.state.turn = { player: 'p1', number: 1, phase: 'main' };

  const res = room.handleCommand('sock1', {
    type: 'loadDeck',
    payload: { deckData: deckData('p1', 2) },
  });

  assert.equal(res.success, false);
  assert.match(res.error, /Cannot load a deck/);
  assert.equal(room.state.players.p1.zones.deck.length, 0);
});

test('undo: replays commandLog minus tail and exactly reverts the last command', () => {
  const room = makeRoom();

  room.handleCommand('sock1', {
    type: 'loadDeck',
    payload: { deckData: deckData('p1', 20) },
  });
  room.handleCommand('sock2', {
    type: 'loadDeck',
    payload: { deckData: deckData('p2', 20) },
  });
  room.handleCommand('sock1', {
    type: 'setup',
    payload: { firstPlayerId: 'p1' },
  });

  const postSetup = {
    p1Hand: room.state.players.p1.zones.hand.map((c) => c.instanceId),
    p1Deck: room.state.players.p1.zones.deck.map((c) => c.instanceId),
    stateVersion: room.state.stateVersion,
    commandLogLength: room.state.commandLog.length,
    rngCursor: room.state.rngCursor,
  };

  const drawRes = room.handleCommand('sock1', {
    type: 'draw',
    payload: { count: 1 },
  });
  assert.equal(drawRes.success, true);
  assert.equal(
    room.state.players.p1.zones.hand.length,
    postSetup.p1Hand.length + 1,
    'sanity: draw actually changed state before undo'
  );

  const undoRes = room.handleCommand('sock1', { type: 'undo', payload: {} });

  assert.equal(undoRes.success, true);
  assert.deepEqual(
    room.state.players.p1.zones.hand.map((c) => c.instanceId),
    postSetup.p1Hand
  );
  assert.deepEqual(
    room.state.players.p1.zones.deck.map((c) => c.instanceId),
    postSetup.p1Deck
  );
  assert.equal(room.state.stateVersion, postSetup.stateVersion);
  assert.equal(room.state.rngCursor, postSetup.rngCursor);
  assert.equal(
    room.state.commandLog.length,
    postSetup.commandLogLength,
    'undo itself must never be appended to commandLog'
  );
});

test('undo with count: 2 reverts two trailing commands in one call', () => {
  const room = makeRoom();

  room.handleCommand('sock1', {
    type: 'loadDeck',
    payload: { deckData: deckData('p1', 20) },
  });
  room.handleCommand('sock2', {
    type: 'loadDeck',
    payload: { deckData: deckData('p2', 20) },
  });
  room.handleCommand('sock1', {
    type: 'setup',
    payload: { firstPlayerId: 'p1' },
  });

  const postSetupHand = room.state.players.p1.zones.hand.map(
    (c) => c.instanceId
  );

  room.handleCommand('sock1', { type: 'draw', payload: { count: 1 } });
  room.handleCommand('sock1', { type: 'draw', payload: { count: 1 } });
  assert.equal(
    room.state.players.p1.zones.hand.length,
    postSetupHand.length + 2
  );

  const undoRes = room.handleCommand('sock1', {
    type: 'undo',
    payload: { count: 2 },
  });

  assert.equal(undoRes.success, true);
  assert.deepEqual(
    room.state.players.p1.zones.hand.map((c) => c.instanceId),
    postSetupHand
  );
});

// Edge Case 18: undo requested past the start of the command log is rejected, never rewinds
// into another game's log.
test('undo past the start of the command log is rejected and leaves state untouched', () => {
  const room = makeRoom();

  const res = room.handleCommand('sock1', { type: 'undo', payload: {} });

  assert.equal(res.success, false);
  assert.equal(res.error, 'nothing_to_undo');
  assert.equal(room.state.commandLog.length, 0);
});

test('undo requesting more actions than exist in the log is rejected', () => {
  const room = makeRoom();
  room.handleCommand('sock1', {
    type: 'loadDeck',
    payload: { deckData: deckData('p1', 2) },
  });

  const res = room.handleCommand('sock1', {
    type: 'undo',
    payload: { count: 5 },
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'nothing_to_undo');
  assert.equal(
    room.state.commandLog.length,
    1,
    'the one real command must survive the rejected undo'
  );
});
