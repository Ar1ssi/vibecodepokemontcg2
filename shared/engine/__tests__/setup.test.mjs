import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { setupGame } from '../setup.mjs';

function createTestDeck(hasBasics = true) {
  const cards = [];
  // Add 10 Pokemon
  for (let i = 1; i <= 10; i++) {
    cards.push(
      createCard({
        instanceId: i,
        name: hasBasics ? `Pikachu ${i}` : `Stage 2 Charizard ${i}`,
        supertype: 'Pokémon',
        stage: hasBasics ? 'Basic' : 'Stage 2',
      })
    );
  }
  // Add 20 Energy
  for (let i = 11; i <= 30; i++) {
    cards.push(
      createCard({
        instanceId: i,
        name: 'Lightning Energy',
        supertype: 'Energy',
        type: 'Energy',
      })
    );
  }
  return cards;
}

test('setupGame: deals 7 cards to hand and 6 cards to prizes', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 42,
  });

  const { events, mulligans } = setupGame(state);
  assert.ok(Array.isArray(events));

  assert.equal(state.players.p1.zones.hand.length, 7);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p1.zones.deck.length, 30 - 7 - 6);

  assert.equal(state.players.p2.zones.hand.length, 7);
  assert.equal(state.players.p2.zones.prizes.length, 6);
  assert.equal(state.players.p2.zones.deck.length, 30 - 7 - 6);

  assert.equal(mulligans.p1, 0);
  assert.equal(mulligans.p2, 0);
  assert.equal(state.turn.number, 1);
  assert.equal(state.turn.phase, 'main');
  assert.ok(['p1', 'p2'].includes(state.turn.player));
});

test('setupGame: evaluates mulligans when player has no basic Pokemon and awards opponent bonus draws', () => {
  // p1 has no basic Pokemon (only Stage 2)
  // p2 has normal basic Pokemon
  const state = createGameState({
    players: {
      p1: { username: 'NoBasics', zones: { deck: createTestDeck(false) } },
      p2: { username: 'HasBasics', zones: { deck: createTestDeck(true) } },
    },
    seed: 12345,
  });

  const { mulligans, events } = setupGame(state, { maxMulligans: 3 });

  assert.ok(mulligans.p1 > 0, 'p1 should have taken mulligans');
  assert.equal(mulligans.p2, 0, 'p2 should have 0 mulligans');
  // p2 should have received bonus draws equal to p1 mulligan count
  assert.equal(state.players.p2.zones.hand.length, 7 + mulligans.p1);

  const mulliganEvents = events.filter((e) => e.type === 'mulliganTaken');
  assert.equal(mulliganEvents.length, mulligans.p1);
});

test('setupGame: respects explicit firstPlayerId and deterministic seed', () => {
  const state1 = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 999,
  });

  setupGame(state1, { firstPlayerId: 'p2' });
  assert.equal(state1.turn.player, 'p2');

  const state2 = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 999,
  });

  setupGame(state2);
  const starterWithoutOption = state2.turn.player;

  // With same seed, should pick the same starter deterministically
  const state3 = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 999,
  });

  setupGame(state3);
  assert.equal(state3.turn.player, starterWithoutOption);
});
