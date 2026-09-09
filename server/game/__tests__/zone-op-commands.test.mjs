import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../room.mjs';
import { createCard } from '../../../shared/engine/cards.mjs';
import { viewFor } from '../../../shared/engine/view.mjs';

// design 002 slice 3.4a: zone-op translations. Each command round-trips through a
// GameRoom with rulesEnabled: false (no turn/legality gating — these are sandbox
// manual-board-manipulation tools, same as legacy) so the test can focus on the
// zone-op mechanics rather than turn structure.

function makeRoom() {
  const room = new GameRoom({
    roomId: 'room-zone-ops',
    rulesEnabled: false,
    seed: 7,
  });
  room.addPlayer('sock1', 'p1', 'Ash');
  room.addPlayer('sock2', 'p2', 'Gary');
  return room;
}

function card(instanceId, overrides = {}) {
  return createCard({
    instanceId,
    name: `Card ${instanceId}`,
    supertype: 'Trainer',
    ...overrides,
  });
}

test('shuffleIntoDeck: moves the card at the given index into the deck and shuffles', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.bench.push(card(1), card(2), card(3));
  p1.zones.deck.push(card(10), card(11));

  const res = room.handleCommand('sock1', {
    type: 'shuffleIntoDeck',
    payload: { from: 'bench', index: 1 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.bench.map((c) => c.instanceId),
    [1, 3]
  );
  assert.equal(p1After.zones.deck.length, 3);
  assert.ok(p1After.zones.deck.some((c) => c.instanceId === 2));
});

test('shuffleIntoDeck: stale index (card already moved) is rejected as stale_view', () => {
  const room = makeRoom();
  room.state.players.p1.zones.bench.push(card(1));

  const res = room.handleCommand('sock1', {
    type: 'shuffleIntoDeck',
    payload: { from: 'bench', index: 5 },
    clientSeq: 1,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'stale_view');
});

test('moveToDeckTop: moves the card at the given index to the front of the deck', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.deck.push(card(10), card(11));

  const res = room.handleCommand('sock1', {
    type: 'moveToDeckTop',
    payload: { from: 'hand', index: 0 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.hand.map((c) => c.instanceId),
    [2]
  );
  assert.equal(p1After.zones.deck[0].instanceId, 1);
});

test('switchWithDeckTop: swaps the indexed card with the current deck top', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.discard.push(card(1), card(2));
  p1.zones.deck.push(card(10), card(11));

  const res = room.handleCommand('sock1', {
    type: 'switchWithDeckTop',
    payload: { from: 'discard', index: 1 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.discard.map((c) => c.instanceId),
    [1, 10]
  );
  assert.equal(p1After.zones.deck[0].instanceId, 2);
  assert.equal(p1After.zones.deck.length, 2);
});

test('shuffleZone: reorders the zone in place without changing membership', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.deck.push(card(1), card(2), card(3), card(4), card(5));

  const res = room.handleCommand('sock1', {
    type: 'shuffleZone',
    payload: { zoneId: 'deck' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const ids = room.state.players.p1.zones.deck.map((c) => c.instanceId).sort();
  assert.deepEqual(ids, [1, 2, 3, 4, 5]);
});

test('shuffleBottom: moves the whole zone to the bottom of the deck', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shuffleBottom',
    payload: { zoneId: 'hand' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.hand.length, 0);
  assert.equal(p1After.zones.deck.length, 3);
  assert.equal(p1After.zones.deck[0].instanceId, 10);
});

test('shuffleAll: moves the whole zone into the deck and shuffles', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.discard.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shuffleAll',
    payload: { zoneId: 'discard' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.discard.length, 0);
  const ids = p1After.zones.deck.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 10]);
});

test('discardAll: moves the whole zone to discard', () => {
  const room = makeRoom();
  room.state.players.p1.zones.bench.push(card(1), card(2));

  const res = room.handleCommand('sock1', {
    type: 'discardAll',
    payload: { zoneId: 'bench' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.bench.length, 0);
  assert.deepEqual(
    p1After.zones.discard.map((c) => c.instanceId).sort(),
    [1, 2]
  );
});

test('lostZoneAll: moves the whole zone to the lost zone', () => {
  const room = makeRoom();
  room.state.players.p1.zones.active.push(card(1));

  const res = room.handleCommand('sock1', {
    type: 'lostZoneAll',
    payload: { zoneId: 'active' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.active.length, 0);
  assert.deepEqual(
    p1After.zones.lostZone.map((c) => c.instanceId),
    [1]
  );
});

test('handAll: moves the whole zone to hand', () => {
  const room = makeRoom();
  room.state.players.p1.zones.discard.push(card(1), card(2));

  const res = room.handleCommand('sock1', {
    type: 'handAll',
    payload: { zoneId: 'discard' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.discard.length, 0);
  assert.deepEqual(p1After.zones.hand.map((c) => c.instanceId).sort(), [1, 2]);
});

test('leaveAll: moves only Pokemon cards from the source zone to the destination zone', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.active.push(
    card(1, { supertype: 'Pokémon' }),
    card(2, { supertype: 'Energy', type: 'Energy' })
  );

  const res = room.handleCommand('sock1', {
    type: 'leaveAll',
    payload: { from: 'active', to: 'bench' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.active.map((c) => c.instanceId),
    [2]
  );
  assert.deepEqual(
    p1After.zones.bench.map((c) => c.instanceId),
    [1]
  );
});

test('discardAndDraw: discards the whole hand then draws count cards', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.deck.push(card(10), card(11), card(12));

  const res = room.handleCommand('sock1', {
    type: 'discardAndDraw',
    payload: { count: 2 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.hand.map((c) => c.instanceId),
    [10, 11]
  );
  assert.deepEqual(
    p1After.zones.discard.map((c) => c.instanceId).sort(),
    [1, 2]
  );
  assert.equal(p1After.zones.deck.length, 1);
});

test('shuffleAndDraw: shuffles hand into deck then draws count cards', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shuffleAndDraw',
    payload: { count: 1 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.hand.length, 1);
  assert.equal(p1After.zones.deck.length, 2);
});

test('shuffleBottomAndDraw: shuffles hand to deck bottom then draws count cards', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shuffleBottomAndDraw',
    payload: { count: 1 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.hand.length, 1);
  assert.equal(p1After.zones.hand[0].instanceId, 10);
  assert.equal(p1After.zones.deck.length, 2);
});

test('shufflePrizesToDeckBottom: moves the whole prize zone to the bottom of the deck', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.prizes.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shufflePrizesToDeckBottom',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.prizes.length, 0);
  assert.equal(p1After.zones.deck.length, 3);
  assert.equal(p1After.zones.deck[0].instanceId, 10);
});

// --- Prize & board ops (design 002 slice 3.4b) ---

test('takePrizes: moves count prize cards to hand', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.prizes.push(card(1), card(2), card(3));

  const res = room.handleCommand('sock1', {
    type: 'takePrizes',
    payload: { count: 2 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.hand.map((c) => c.instanceId),
    [1, 2]
  );
  assert.deepEqual(
    p1After.zones.prizes.map((c) => c.instanceId),
    [3]
  );
});

test('takePrizesByIndex: moves the specific indexed prize cards to hand', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.prizes.push(card(1), card(2), card(3));

  const res = room.handleCommand('sock1', {
    type: 'takePrizesByIndex',
    payload: { indices: [0, 2] },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.deepEqual(
    p1After.zones.hand.map((c) => c.instanceId).sort((a, b) => a - b),
    [1, 3]
  );
  assert.deepEqual(
    p1After.zones.prizes.map((c) => c.instanceId),
    [2]
  );
});

test('discardBoard: moves the literal board zone to discard', () => {
  const room = makeRoom();
  room.state.players.p1.zones.board.push(card(1), card(2));

  const res = room.handleCommand('sock1', {
    type: 'discardBoard',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.board.length, 0);
  assert.deepEqual(
    p1After.zones.discard.map((c) => c.instanceId),
    [1, 2]
  );
});

test('handBoard: moves the literal board zone to hand', () => {
  const room = makeRoom();
  room.state.players.p1.zones.board.push(card(1));

  const res = room.handleCommand('sock1', {
    type: 'handBoard',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.board.length, 0);
  assert.deepEqual(
    p1After.zones.hand.map((c) => c.instanceId),
    [1]
  );
});

test('shuffleBoard: moves the literal board zone into the deck and shuffles', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.board.push(card(1), card(2));
  p1.zones.deck.push(card(10));

  const res = room.handleCommand('sock1', {
    type: 'shuffleBoard',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.board.length, 0);
  const ids = p1After.zones.deck.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 10]);
});

test('lostZoneBoard: moves the literal board zone to the lost zone', () => {
  const room = makeRoom();
  room.state.players.p1.zones.board.push(card(1), card(2));

  const res = room.handleCommand('sock1', {
    type: 'lostZoneBoard',
    payload: {},
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  const p1After = room.state.players.p1;
  assert.equal(p1After.zones.board.length, 0);
  assert.deepEqual(
    p1After.zones.lostZone.map((c) => c.instanceId),
    [1, 2]
  );
});

// I19: revealShortcut/hideShortcut/revealCards/hideCards were 'replaced_by_redaction' with
// nothing server-side ever setting card.revealed=true, so the redaction they were meant to
// be replaced by was unreachable. Now real 'server_command's that flip the flag, and only on
// the sender's own zone (room.handleCommand always resolves playerId from the sending socket).

test('revealShortcut: flips card.revealed on one card, both players then see it in their view', () => {
  const room = makeRoom();
  room.state.players.p1.zones.prizes.push(card(1), card(2));

  const res = room.handleCommand('sock1', {
    type: 'revealShortcut',
    payload: { zoneId: 'prizes', index: 1 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  assert.equal(room.state.players.p1.zones.prizes[1].revealed, true);
  assert.equal(room.state.players.p1.zones.prizes[0].revealed, false);

  const ownerView = viewFor(room.state, 'p1');
  assert.equal(ownerView.you.zones.prizes[1].instanceId, 2);
  assert.equal(ownerView.you.zones.prizes[0].name, undefined);

  const opponentView = viewFor(room.state, 'p2');
  assert.equal(opponentView.them.zones.prizes[1].instanceId, 2);
  assert.equal(opponentView.them.zones.prizes[0].name, undefined);
});

test('hideShortcut: flips a revealed card back to redacted', () => {
  const room = makeRoom();
  room.state.players.p1.zones.prizes.push(card(1));
  room.state.players.p1.zones.prizes[0].revealed = true;

  const res = room.handleCommand('sock1', {
    type: 'hideShortcut',
    payload: { zoneId: 'prizes', index: 0 },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  assert.equal(room.state.players.p1.zones.prizes[0].revealed, false);
  const opponentView = viewFor(room.state, 'p2');
  assert.equal(opponentView.them.zones.prizes[0].instanceId, 1);
  assert.equal(opponentView.them.zones.prizes[0].name, undefined);
});

test('revealShortcut: out-of-range index is rejected as stale_view', () => {
  const room = makeRoom();
  room.state.players.p1.zones.prizes.push(card(1));

  const res = room.handleCommand('sock1', {
    type: 'revealShortcut',
    payload: { zoneId: 'prizes', index: 5 },
    clientSeq: 1,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'stale_view');
});

test("revealShortcut: sender can only reveal their OWN zone, never the opponent's", () => {
  const room = makeRoom();
  room.state.players.p2.zones.prizes.push(card(1));

  // sock1 is p1 — commands always resolve to the sender's own zones, so this can only
  // ever address p1's (empty) prizes, never p2's, regardless of payload intent.
  const res = room.handleCommand('sock1', {
    type: 'revealShortcut',
    payload: { zoneId: 'prizes', index: 0 },
    clientSeq: 1,
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'stale_view');
  assert.equal(room.state.players.p2.zones.prizes[0].revealed, false);
});

test('revealCards: flips every card in the zone', () => {
  const room = makeRoom();
  room.state.players.p1.zones.prizes.push(card(1), card(2), card(3));

  const res = room.handleCommand('sock1', {
    type: 'revealCards',
    payload: { zoneId: 'prizes' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  assert.deepEqual(
    room.state.players.p1.zones.prizes.map((c) => c.revealed),
    [true, true, true]
  );
});

test('hideCards: flips every card in the zone back', () => {
  const room = makeRoom();
  const p1 = room.state.players.p1;
  p1.zones.hand.push(card(1), card(2));
  p1.zones.hand.forEach((c) => (c.revealed = true));

  const res = room.handleCommand('sock1', {
    type: 'hideCards',
    payload: { zoneId: 'hand' },
    clientSeq: 1,
  });

  assert.equal(res.success, true);
  assert.deepEqual(
    room.state.players.p1.zones.hand.map((c) => c.revealed),
    [false, false]
  );
});

test('a newly translated action replayed twice via clientSeq dedupe advances state once', () => {
  const room = makeRoom();
  room.state.players.p1.zones.bench.push(card(1), card(2));

  const cmd = {
    type: 'discardAll',
    payload: { zoneId: 'bench' },
    clientSeq: 1,
  };
  const res1 = room.handleCommand('sock1', cmd);
  const res2 = room.handleCommand('sock1', cmd);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(room.state.players.p1.zones.discard.length, 2);
  assert.equal(room.state.players.p1.zones.bench.length, 0);
});
