import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { setupGame, mulliganBonusDraws, settleOpeningDraw } from '../setup.mjs';
import { applyCommand } from '../reduce.mjs';
import { createRng } from '../rng.mjs';

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

  const starter = state.turn.player;
  const p1Bonus = starter === 'p1' ? 1 : 0;
  const p2Bonus = starter === 'p2' ? 1 : 0;

  assert.equal(state.players.p1.zones.hand.length, 7 + p1Bonus);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p1.zones.deck.length, 30 - 7 - 6 - p1Bonus);

  assert.equal(state.players.p2.zones.hand.length, 7 + p2Bonus);
  assert.equal(state.players.p2.zones.prizes.length, 6);
  assert.equal(state.players.p2.zones.deck.length, 30 - 7 - 6 - p2Bonus);

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
  const starterBonus = state.turn.player === 'p2' ? 1 : 0;
  assert.equal(state.players.p2.zones.hand.length, 7 + mulligans.p1 + starterBonus);

  const mulliganEvents = events.filter((e) => e.type === 'mulliganTaken');
  assert.equal(mulliganEvents.length, mulligans.p1);
});

test('mulliganBonusDraws: only the net extra mulligans are owed', () => {
  assert.deepEqual(mulliganBonusDraws({ p1: 2, p2: 2 }, ['p1', 'p2']), {
    p1: 0,
    p2: 0,
  });
  assert.deepEqual(mulliganBonusDraws({ p1: 2, p2: 0 }, ['p1', 'p2']), {
    p1: 0,
    p2: 2,
  });
  assert.deepEqual(mulliganBonusDraws({ p1: 2, p2: 1 }, ['p1', 'p2']), {
    p1: 0,
    p2: 1,
  });
  assert.deepEqual(mulliganBonusDraws({ p1: 0, p2: 2 }, ['p1', 'p2']), {
    p1: 2,
    p2: 0,
  });
});

test('setupGame: lockstep mulligans award no bonus draws', () => {
  const state = createGameState({
    players: {
      p1: { username: 'NoBasicsA', zones: { deck: createTestDeck(false) } },
      p2: { username: 'NoBasicsB', zones: { deck: createTestDeck(false) } },
    },
    seed: 321,
  });

  const { mulligans, events } = setupGame(state, { maxMulligans: 2 });

  assert.equal(mulligans.p1, 2);
  assert.equal(mulligans.p2, 2);
  const starterBonus = state.turn.player === 'p1' ? [1, 0] : [0, 1];
  assert.equal(state.players.p1.zones.hand.length, 7 + starterBonus[0]);
  assert.equal(state.players.p2.zones.hand.length, 7 + starterBonus[1]);
  assert.equal(events.filter((e) => e.type === 'bonusDrawAwarded').length, 0);
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

test('setupGame: firstPrizeWins builds a playable sudden-death tiebreak game', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 7,
  });

  const { events } = setupGame(state, { firstPlayerId: 'p1', firstPrizeWins: true });

  assert.equal(state.firstPrizeWins, true);
  assert.equal(state.turn.phase, 'main');
  assert.equal(state.turn.player, 'p1');
  assert.ok(state.players.p1.zones.hand.length >= 7);
  assert.ok(state.players.p2.zones.hand.length >= 7);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p2.zones.prizes.length, 6);
  assert.ok(
    events.some((e) => e.type === 'gameSetupCompleted' && e.firstPrizeWins === true)
  );
});

test('setupGame: a normal setup clears any stale firstPrizeWins flag', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', zones: { deck: createTestDeck(true) } },
    },
    seed: 7,
  });
  state.firstPrizeWins = true;
  setupGame(state);
  assert.equal('firstPrizeWins' in state, false);
});

test('setupGame: deal, mulligan and bonus-draw events name the cards they put in hand', () => {
  const state = createGameState({
    players: {
      p1: { username: 'NoBasics', zones: { deck: createTestDeck(false) } },
      p2: { username: 'HasBasics', zones: { deck: createTestDeck(true) } },
    },
    seed: 12345,
  });
  const { events } = setupGame(state, { maxMulligans: 3 });
  const ids = (event) => event.cards.map((c) => c.instanceId);
  const dealt = events.filter((e) => e.type === 'openingHandDealt');
  assert.equal(dealt.length, 2);
  for (const event of dealt) assert.equal(event.cards.length, event.count);
  const redeals = events.filter((e) => e.type === 'mulliganTaken');
  assert.ok(redeals.length > 0);
  const lastRedeal = redeals[redeals.length - 1];
  const p1Hand = state.players.p1.zones.hand.map((c) => c.instanceId);
  for (const id of ids(lastRedeal)) assert.ok(p1Hand.includes(id), `p1 holds ${id}`);
  const bonuses = events.filter((e) => e.type === 'bonusDrawAwarded');
  assert.ok(bonuses.length > 0);
  const p2Hand = state.players.p2.zones.hand.map((c) => c.instanceId);
  for (const event of bonuses) assert.ok(p2Hand.includes(ids(event)[0]), 'bonus card is in p2 hand');
});

// ── Design 051: the deck format sets the Prize count (Prerelease rules, pokemon.com) ──

function fortyCardDeck(idBase) {
  return Array.from({ length: 40 }, (_, i) =>
    createCard({
      instanceId: idBase + i,
      name: i < 12 ? `Sandile ${i}` : 'Fighting Energy',
      supertype: i < 12 ? 'Pokémon' : 'Energy',
      stage: i < 12 ? 'Basic' : undefined,
    })
  );
}

test('setupGame: a Build & Battle deck of 40 deals 7 to hand and 4 Prizes, leaving 29', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', deckFormat: 'build-battle', zones: { deck: fortyCardDeck(1) } },
      p2: { username: 'Gary', deckFormat: 'build-battle', zones: { deck: fortyCardDeck(101) } },
    },
    seed: 7,
  });
  const { events } = setupGame(state, { firstPlayerId: 'p1' });

  for (const pid of ['p1', 'p2']) {
    const bonus = pid === 'p1' ? 1 : 0; // the starter's first-turn draw
    assert.equal(state.players[pid].zones.prizes.length, 4, pid);
    assert.equal(state.players[pid].zones.hand.length, 7 + bonus, pid);
    assert.equal(state.players[pid].zones.deck.length, 29 - bonus, pid);
  }
  const prizeEvents = events.filter((e) => e.type === 'prizesSet');
  assert.deepEqual(prizeEvents.map((e) => e.count), [4, 4]);
});

test('setupGame: a Standard deck still deals 6 Prizes and players default to Standard', () => {
  const state = createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: { username: 'Gary', deckFormat: 'tcg', zones: { deck: createTestDeck(true) } },
    },
    seed: 42,
  });
  assert.equal(state.players.p1.deckFormat, 'tcg');
  const { events } = setupGame(state);
  assert.equal(state.players.p1.zones.prizes.length, 6);
  assert.equal(state.players.p2.zones.prizes.length, 6);
  assert.deepEqual(
    events.filter((e) => e.type === 'prizesSet').map((e) => e.count),
    [6, 6]
  );
});

test('setupGame: a 3-card Build & Battle deck deals what is left after the hand', () => {
  const tinyDeck = (idBase) =>
    Array.from({ length: 10 }, (_, i) =>
      createCard({ instanceId: idBase + i, name: `Pikachu ${i}`, supertype: 'Pokémon', stage: 'Basic' })
    );
  const state = createGameState({
    players: {
      p1: { username: 'Ash', deckFormat: 'build-battle', zones: { deck: tinyDeck(1) } },
      p2: { username: 'Gary', deckFormat: 'build-battle', zones: { deck: tinyDeck(101).slice(0, 3) } },
    },
    seed: 3,
  });
  setupGame(state, { firstPlayerId: 'p1' });
  // 10 cards: 7 in hand, 3 left for Prizes (min of 4 and the deck).
  assert.equal(state.players.p1.zones.prizes.length, 3);
  // 3 cards: all three go to hand; the Prize count is capped by the empty deck.
  assert.equal(state.players.p2.zones.hand.length, 3);
  assert.equal(state.players.p2.zones.prizes.length, 0);
});

test('createGameState: an unknown deck format reads as Standard', () => {
  const state = createGameState({ players: { p1: { username: 'Ash', deckFormat: 'pocket' } } });
  assert.equal(state.players.p1.deckFormat, 'tcg');
});

function twoPlayerState(seed = 42) {
  return createGameState({
    players: {
      p1: { username: 'Ash', zones: { deck: createTestDeck(true) } },
      p2: {
        username: 'Gary',
        zones: { deck: createTestDeck(true).map((card) => ({ ...card, instanceId: card.instanceId + 100 })) },
      },
    },
    seed,
  });
}

const basicInHand = (state, pid) => state.players[pid].zones.hand.find((card) => card.supertype === 'Pokémon');

test('setupGame: deferStarterDraw holds the turn-1 draw until both Actives are placed', () => {
  const state = twoPlayerState();
  const { events } = setupGame(state, { firstPlayerId: 'p1', deferStarterDraw: true });
  assert.equal(state.players.p1.zones.hand.length, 7);
  assert.equal(state.openingDrawPending, 'p1');
  assert.equal(events.some((event) => event.type === 'cardsDrawn'), false);

  const later = [];
  state.players.p1.zones.active.push(...state.players.p1.zones.hand.splice(0, 1));
  assert.equal(settleOpeningDraw(state, later), false, 'one Active is not enough');

  state.players.p2.zones.active.push(...state.players.p2.zones.hand.splice(0, 1));
  const topCard = state.players.p1.zones.deck[0];
  assert.equal(settleOpeningDraw(state, later), true);
  assert.deepEqual(later, [{ type: 'cardsDrawn', playerId: 'p1', count: 1, cards: [{ instanceId: topCard.instanceId }] }]);
  assert.equal(state.players.p1.zones.hand.at(-1), topCard);
  assert.equal('openingDrawPending' in state, false);
  assert.equal(settleOpeningDraw(state, later), false, 'draws once');
});

test('setup command: the starter draws in the batch that fills the last Active Spot', () => {
  const rng = createRng(7);
  let state = twoPlayerState(7);
  let res = applyCommand(state, { type: 'setup', payload: { firstPlayerId: 'p2' }, playerId: 'p1' }, rng);
  state = res.state;
  assert.equal(state.players.p2.zones.hand.length, 7);
  assert.equal(res.events.some((event) => event.type === 'cardsDrawn'), false);

  for (const pid of ['p2', 'p1']) {
    res = applyCommand(state, {
      type: 'moveCard',
      payload: { instanceId: basicInHand(state, pid).instanceId, from: 'hand', to: 'active' },
      playerId: pid,
    }, rng);
    assert.equal(res.error, null);
    state = res.state;
  }
  const drawn = res.events.filter((event) => event.type === 'cardsDrawn');
  assert.deepEqual(drawn.map((event) => event.playerId), ['p2']);
  assert.equal(state.players.p2.zones.hand.length, 7);
  assert.equal(state.openingDrawPending, undefined);
});

test('setup command: a starter who ends turn 1 before the opponent places still gets the card', () => {
  const rng = createRng(7);
  let state = applyCommand(twoPlayerState(7), { type: 'setup', payload: { firstPlayerId: 'p1' }, playerId: 'p1' }, rng).state;
  const handBefore = state.players.p1.zones.hand.length;
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.ok(res.events.some((event) => event.type === 'cardsDrawn' && event.playerId === 'p1'));
  assert.equal(res.state.players.p1.zones.hand.length, handBefore + 1);
  assert.equal(res.state.openingDrawPending, undefined);
});

test('setupGame: a normal setup draws at once and clears a stale openingDrawPending', () => {
  const state = twoPlayerState();
  state.openingDrawPending = 'p2';
  setupGame(state, { firstPlayerId: 'p1' });
  assert.equal(state.players.p1.zones.hand.length, 8);
  assert.equal('openingDrawPending' in state, false);
});
