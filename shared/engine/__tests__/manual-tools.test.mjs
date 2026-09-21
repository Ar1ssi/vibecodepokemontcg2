// Design 012: server side of the manual board tools that were dropped by the move to server
// authority — random face-down play, face-down redaction, and counters a player places on the
// opponent's Pokémon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { deckPeekFor, viewFor } from '../view.mjs';

function mainPhaseState({ rulesEnabled = true, seed = 7 } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled,
    seed,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

function withHand(state, playerId, names) {
  names.forEach((name, i) => {
    state.players[playerId].zones.hand.push(
      createCard({ instanceId: 100 + i, name, src: `/${name}.png`, ownerId: playerId })
    );
  });
}

const randomFaceDown = (playerId) => ({ type: 'playRandomCardFaceDown', payload: {}, playerId });

test('playRandomCardFaceDown moves exactly one hand card to the board, face down', () => {
  const state = mainPhaseState();
  withHand(state, 'p1', ['Pikachu', 'Potion', 'Switch']);
  const res = applyCommand(state, randomFaceDown('p1'));
  assert.equal(res.error, null);
  const { hand, board } = res.state.players.p1.zones;
  assert.equal(hand.length, 2);
  assert.equal(board.length, 1);
  assert.equal(board[0].faceDown, true);
  assert.equal(board[0].revealed, false);
  assert.deepEqual(res.events, [
    { type: 'cardPlayedFaceDown', instanceId: board[0].instanceId, playerId: 'p1' },
  ]);
});

test('playRandomCardFaceDown picks the same card for the same seed (undo replay stays in step)', () => {
  const pick = (seed) => {
    const state = mainPhaseState({ seed });
    withHand(state, 'p1', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    return applyCommand(state, randomFaceDown('p1')).state.players.p1.zones.board[0].instanceId;
  };
  assert.equal(pick(42), pick(42));
});

test('playRandomCardFaceDown with an empty hand is rejected and changes nothing', () => {
  const state = mainPhaseState();
  const res = applyCommand(state, randomFaceDown('p1'));
  assert.equal(res.error, 'stale_view');
  assert.equal(res.state, state);
});

test('playRandomCardFaceDown is the turn player\'s action in rules mode', () => {
  const state = mainPhaseState();
  withHand(state, 'p2', ['Pikachu']);
  assert.equal(applyCommand(state, randomFaceDown('p2')).error, "It's not your turn.");
});

test('playRandomCardFaceDown works off-turn when rules are off', () => {
  const state = mainPhaseState({ rulesEnabled: false });
  withHand(state, 'p2', ['Pikachu']);
  assert.equal(applyCommand(state, randomFaceDown('p2')).error, null);
});

test('a face-down board card is hidden from its owner, the opponent and spectators until revealed', () => {
  const state = mainPhaseState();
  withHand(state, 'p1', ['Pikachu']);
  const played = applyCommand(state, randomFaceDown('p1')).state;
  const id = played.players.p1.zones.board[0].instanceId;

  assert.deepEqual(viewFor(played, 'p1').you.zones.board, [{ instanceId: id }]);
  assert.deepEqual(viewFor(played, 'p2').them.zones.board, [{ instanceId: id }]);
  assert.deepEqual(viewFor(played, null).players.p1.zones.board, [{ instanceId: id }]);

  const revealed = applyCommand(played, {
    type: 'revealShortcut',
    payload: { zoneId: 'board', index: 0 },
    playerId: 'p1',
  }).state;
  assert.equal(viewFor(revealed, 'p2').them.zones.board[0].name, 'Pikachu');
});

test('a face-down card that leaves the board comes back face up', () => {
  const state = mainPhaseState();
  withHand(state, 'p1', ['Pikachu']);
  const played = applyCommand(state, randomFaceDown('p1')).state;
  const id = played.players.p1.zones.board[0].instanceId;

  const toHand = applyCommand(played, {
    type: 'moveCard',
    payload: { instanceId: id, from: 'board', to: 'hand' },
    playerId: 'p1',
  }).state;
  assert.equal(toHand.players.p1.zones.hand[0].faceDown, undefined);

  const backOnBoard = applyCommand(toHand, {
    type: 'moveCard',
    payload: { instanceId: id, from: 'hand', to: 'board' },
    playerId: 'p1',
  }).state;
  assert.equal(viewFor(backOnBoard, 'p2').them.zones.board[0].name, 'Pikachu');
});

test('the turn player can put damage and a condition on the opponent\'s Active Pokémon', () => {
  const state = mainPhaseState();
  state.players.p2.zones.active.push(createCard({ instanceId: 50, name: 'Eevee', hp: 60, ownerId: 'p2' }));

  const damaged = applyCommand(state, {
    type: 'addDamageCounter',
    payload: { instanceId: 50, amount: 30 },
    playerId: 'p1',
  });
  assert.equal(damaged.error, null);
  assert.equal(damaged.state.players.p2.zones.active[0].damage, 30);

  const poisoned = applyCommand(damaged.state, {
    type: 'addSpecialCondition',
    payload: { instanceId: 50, condition: 'Poisoned' },
    playerId: 'p1',
  });
  assert.equal(poisoned.error, null);
});

test('addSpecialCondition on a benched Pokémon is rejected (p.15)', () => {
  const state = mainPhaseState();
  state.players.p2.zones.active.push(createCard({ instanceId: 50, name: 'Eevee', hp: 60, ownerId: 'p2' }));
  state.players.p2.zones.bench.push(createCard({ instanceId: 51, name: 'Pikachu', hp: 60, ownerId: 'p2' }));

  const active = applyCommand(state, {
    type: 'addSpecialCondition',
    payload: { instanceId: 50, condition: 'Poisoned' },
    playerId: 'p1',
  });
  assert.equal(active.error, null);

  const benched = applyCommand(active.state, {
    type: 'addSpecialCondition',
    payload: { instanceId: 51, condition: 'Poisoned' },
    playerId: 'p1',
  });
  assert.equal(benched.error, 'special_condition_not_active');
});

function trainerTool(state, playerId, instanceId, name) {
  const card = createCard({ instanceId, name, ownerId: playerId });
  card.type = 'Trainer';
  card.trainerType = 'Tool';
  state.players[playerId].zones.hand.push(card);
  return instanceId;
}

test("a Team Flare Hyper Gear attaches to the opponent's Pokémon-EX (App. 24)", () => {
  const state = mainPhaseState();
  const toolId = trainerTool(state, 'p1', 100, 'Head Ringer Team Flare Hyper Gear');
  state.players.p2.zones.active.push(
    createCard({ instanceId: 50, name: 'Mewtwo-EX', supertype: 'Pokémon', hp: 170, ownerId: 'p2' })
  );

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: toolId, targetInstanceId: 50 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  const attached = res.state.players.p2.zones.active.find((c) => c.instanceId === toolId);
  assert.ok(attached, "the Tool lands in the opponent's zone");
  assert.equal(attached.attachedTo, 50);
});

test("a normal Tool still cannot be attached to the opponent's Pokémon", () => {
  const state = mainPhaseState();
  const toolId = trainerTool(state, 'p1', 101, 'Bravery Charm');
  state.players.p2.zones.active.push(
    createCard({ instanceId: 50, name: 'Mewtwo-EX', supertype: 'Pokémon', hp: 170, ownerId: 'p2' })
  );

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: toolId, targetInstanceId: 50 },
    playerId: 'p1',
  });
  assert.equal(res.error, 'stale_view');
});

test("a Team Flare Hyper Gear cannot attach to the opponent's non-EX Pokémon", () => {
  const state = mainPhaseState();
  const toolId = trainerTool(state, 'p1', 102, 'Jamming Net Team Flare Hyper Gear');
  state.players.p2.zones.active.push(
    createCard({ instanceId: 52, name: 'Eevee', supertype: 'Pokémon', hp: 60, ownerId: 'p2' })
  );

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: toolId, targetInstanceId: 52 },
    playerId: 'p1',
  });
  assert.ok(res.error, 'the attach is rejected');
  assert.equal(res.state.players.p1.zones.hand.length, 1, 'the Tool stays in hand');
});

function trainerItem(state, playerId, instanceId, name) {
  const card = createCard({ instanceId, name, ownerId: playerId });
  card.type = 'Trainer';
  card.trainerType = 'Item';
  state.players[playerId].zones.hand.push(card);
  return instanceId;
}

test('a plain Item cannot be attached to a Pokémon (only Tools/Energy can)', () => {
  const state = mainPhaseState();
  const itemId = trainerItem(state, 'p1', 103, "Professor's Research");
  state.players.p1.zones.active.push(
    createCard({ instanceId: 50, name: 'Pikachu', supertype: 'Pokémon', hp: 60, ownerId: 'p1' })
  );

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: itemId, targetInstanceId: 50 },
    playerId: 'p1',
  });
  assert.equal(
    res.error,
    'Only Pokémon Tools and Energy can be attached to a Pokémon.'
  );
  assert.equal(res.state.players.p1.zones.hand.length, 1, 'the Item stays in hand');
  assert.equal(res.state.players.p1.zones.active.length, 1, 'nothing was attached');
});

function withDeck(state, playerId, count) {
  for (let i = 0; i < count; i++) {
    state.players[playerId].zones.deck.push(
      createCard({ instanceId: 500 + i, name: `${playerId} card ${i}`, ownerId: playerId })
    );
  }
}

test('deckPeekFor shows the top or bottom N cards in deck order and changes nothing', () => {
  const state = mainPhaseState();
  withDeck(state, 'p1', 10);
  const before = JSON.stringify(state);

  const top = deckPeekFor(state, 'p1', { side: 'you', count: 3, fromTop: true });
  assert.equal(top.ok, true);
  assert.deepEqual(top.cards.map((c) => c.instanceId), [500, 501, 502]);
  assert.equal(top.deckCount, 10);

  const bottom = deckPeekFor(state, 'p1', { count: 2, fromTop: false });
  assert.deepEqual(bottom.cards.map((c) => c.instanceId), [508, 509]);
  assert.equal(JSON.stringify(state), before);
});

test('deckPeekFor clamps to the deck and refuses empty decks, bad counts and non-players', () => {
  const state = mainPhaseState();
  withDeck(state, 'p1', 2);
  assert.equal(deckPeekFor(state, 'p1', { count: 9 }).cards.length, 2);
  for (const count of [0, -1, 1.5, '3', undefined]) {
    assert.equal(deckPeekFor(state, 'p1', { count }).ok, false, `count ${count}`);
  }
  assert.equal(deckPeekFor(state, 'p2', { count: 1 }).ok, false);
  assert.equal(deckPeekFor(state, 'nobody', { count: 1 }).ok, false);
  assert.equal(deckPeekFor(state, 'p1', { side: 'theirs', count: 1 }).ok, false);
});

test('deckPeekFor shows the opponent\'s deck only when rules are off', () => {
  const ruled = mainPhaseState();
  withDeck(ruled, 'p2', 5);
  const refused = deckPeekFor(ruled, 'p1', { side: 'them', count: 2 });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /rules on/);

  const free = mainPhaseState({ rulesEnabled: false });
  withDeck(free, 'p2', 5);
  assert.deepEqual(
    deckPeekFor(free, 'p1', { side: 'them', count: 2 }).cards.map((c) => c.name),
    ['p2 card 0', 'p2 card 1']
  );
});

test('a peeked card can be taken from the deck by its instanceId', () => {
  const state = mainPhaseState();
  withDeck(state, 'p1', 4);
  const [card] = deckPeekFor(state, 'p1', { count: 1 }).cards;
  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: card.instanceId, from: 'deck', to: 'hand' },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand[0].instanceId, card.instanceId);
  assert.equal(res.state.players.p1.zones.deck.length, 3);
});
