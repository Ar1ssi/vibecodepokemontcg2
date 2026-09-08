import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { executeSteps } from '../effects/executor.mjs';

function setupGame(benchCount = 0) {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'bench-limit-test', seed: 42, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: {},
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: {},
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };

  // Setup active Pokemon for p1
  state.players.p1.zones.active.push(
    createCard({ instanceId: 100, name: 'Active Mon', supertype: 'Pokémon', type: 'Pokémon' })
  );

  // Setup initial bench Pokemon
  for (let i = 1; i <= benchCount; i++) {
    state.players.p1.zones.bench.push(
      createCard({ instanceId: 100 + i, name: `Bench Mon ${i}`, supertype: 'Pokémon', type: 'Pokémon' })
    );
  }

  return { state, rng };
}

test('Finding 15: executeSteps with dest === bench skips when bench is full (5 max)', () => {
  const { state, rng } = setupGame(5);
  const events = [];

  // Put Basic Pokemon in deck
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 2, name: 'Charmander', supertype: 'Pokémon', subtypes: 'Basic' })
  );

  const steps = [
    { type: 'searchDeck', what: 'Basic Pokémon', count: 1, destination: 'bench' },
  ];

  const res = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Nest Ball' },
    playerId: 'p1',
    activeRng: rng,
    events,
  });

  assert.equal(res.completed, true);
  assert.equal(res.pendingChoice, null);
  assert.equal(state.players.p1.zones.bench.length, 5);
  assert.equal(state.players.p1.zones.deck.length, 2);

  const skippedEvt = events.find((e) => e.type === 'effectStepSkipped');
  assert.ok(skippedEvt);
  assert.equal(skippedEvt.reason, 'bench_full');
});

test('Finding 15: executeSteps clamps choice max to available bench slots when bench has 4 Pokemon', () => {
  const { state, rng } = setupGame(4);
  const events = [];

  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic', hp: 60 }),
    createCard({ instanceId: 2, name: 'Charmander', supertype: 'Pokémon', subtypes: 'Basic', hp: 60 }),
    createCard({ instanceId: 3, name: 'Squirtle', supertype: 'Pokémon', subtypes: 'Basic', hp: 60 })
  );

  // Buddy-Buddy Poffin allows up to 2, but only 1 bench slot is open
  const steps = [
    { type: 'searchDeck', what: 'Basic Pokémon ≤70 HP', count: 2, destination: 'bench', upTo: true },
  ];

  const res = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Buddy-Buddy Poffin' },
    playerId: 'p1',
    activeRng: rng,
    events,
  });

  assert.equal(res.completed, false);
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.max, 1);
  assert.ok(res.pendingChoice.prompt.includes('Select up to 1 card'));
});

test('Finding 15: executeSteps resume does not overfill bench if stepSelection exceeds capacity', () => {
  const { state, rng } = setupGame(4);
  const events = [];

  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 2, name: 'Charmander', supertype: 'Pokémon', subtypes: 'Basic' })
  );

  const steps = [
    { type: 'searchDeck', what: 'Basic Pokémon', count: 2, destination: 'bench' },
  ];

  // Attempting to resume with 2 cards when only 1 slot is free
  const res = executeSteps(state, {
    steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Buddy-Buddy Poffin' },
    playerId: 'p1',
    activeRng: rng,
    events,
    selection: [1, 2],
  });

  assert.equal(res.completed, true);
  assert.equal(res.pendingChoice, null);
  // Bench must not exceed 5
  assert.equal(state.players.p1.zones.bench.length, 5);
  assert.ok(state.players.p1.zones.bench.some((c) => c.instanceId === 1));
  // 2nd card was not moved to bench; remains in deck
  assert.ok(state.players.p1.zones.deck.some((c) => c.instanceId === 2));
});

test('Finding 15: playTrainer with Nest Ball is rejected bench_full when bench has 5 Pokemon', () => {
  const { state, rng } = setupGame(5);

  const nestBall = createCard({
    instanceId: 50,
    name: 'Nest Ball',
    supertype: 'Trainer',
    type: 'Item',
    text: 'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.',
  });
  state.players.p1.zones.hand.push(nestBall);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' })
  );

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 50 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, 'bench_full');
  assert.equal(state.players.p1.zones.hand.length, 1);
});

test('Finding 15: playTrainer with Buddy-Buddy Poffin is rejected bench_full when bench has 5 Pokemon', () => {
  const { state, rng } = setupGame(5);

  const poffin = createCard({
    instanceId: 51,
    name: 'Buddy-Buddy Poffin',
    supertype: 'Trainer',
    type: 'Item',
    text: 'Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.',
  });
  state.players.p1.zones.hand.push(poffin);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic', hp: 60 })
  );

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 51 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, 'bench_full');
});

test('Finding 15: playTrainer with Nest Ball is allowed when bench has 4 Pokemon', () => {
  const { state, rng } = setupGame(4);

  const nestBall = createCard({
    instanceId: 50,
    name: 'Nest Ball',
    supertype: 'Trainer',
    type: 'Item',
    text: 'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.',
  });
  state.players.p1.zones.hand.push(nestBall);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' })
  );

  const res = applyCommand(state, {
    type: 'playTrainer',
    payload: { instanceId: 50 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.max, 1);
});

test('Finding 15: stadium-effect with search-bench is rejected bench_full when bench has 5 Pokemon', () => {
  const { state, rng } = setupGame(5);

  state.stadium = createCard({
    instanceId: 80,
    name: 'Brooklet Hill',
    supertype: 'Trainer',
    subtypes: 'Stadium',
    text: "Once during each player's turn, that player may search their deck for a Basic {W} or Basic {F} Pokémon and put it onto their Bench. Then, that player shuffles their deck.",
  });

  const res = applyCommand(state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, 'bench_full');
});
