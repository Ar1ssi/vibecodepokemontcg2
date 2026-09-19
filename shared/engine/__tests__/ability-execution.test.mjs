import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'ability-test', seed: 42, rulesEnabled: true });
  state.players.p1 = {
    playerId: 'p1',
    username: 'Alice',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'Bob',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

test('ability: activating draw ability (e.g. Kirlia Refinement / Bibarel Indomitable Stance)', () => {
  const { state, rng } = setupGame();
  const kirlia = createCard({
    instanceId: 10,
    name: 'Kirlia',
    hp: 80,
    supertype: 'Pokémon',
    abilityText: "Refinement: Once during your turn, you may draw 2 cards.",
    abilities: [
      {
        name: 'Refinement',
        type: 'Ability',
        text: 'Refinement: Once during your turn, you may draw 2 cards.',
      },
    ],
  });
  state.players.p1.zones.bench.push(kirlia);

  // Deck has cards to draw
  state.players.p1.zones.deck.push(createCard({ instanceId: 101 }), createCard({ instanceId: 102 }));

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 10 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 2);
  assert.equal(res.state.players.p1.zones.bench[0].abilityUsed, true);
  assert.equal(res.state.players.p1.flags.abilitiesUsed[10], true);

  // Attempting second use in same turn should be rejected
  const res2 = applyCommand(res.state, {
    type: 'useAbility',
    payload: { instanceId: 10 },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, 'Ability already used this turn.');
});

test('ability: activating search ability prompts choice and resumes', () => {
  const { state, rng } = setupGame();
  const pidgeot = createCard({
    instanceId: 20,
    name: 'Pidgeot ex',
    hp: 280,
    supertype: 'Pokémon',
    abilityText: 'Quick Search: Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck.',
    abilities: [
      {
        name: 'Quick Search',
        type: 'Ability',
        text: 'Quick Search: Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck.',
      },
    ],
  });
  state.players.p1.zones.active.push(pidgeot);

  // Deck has cards
  const deckCard1 = createCard({ instanceId: 50, name: 'Double Turbo Energy' });
  const deckCard2 = createCard({ instanceId: 51, name: 'Boss’s Orders' });
  state.players.p1.zones.deck.push(deckCard1, deckCard2);

  // Use ability
  const res1 = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 20 },
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.player, 'p1');
  assert.equal(res1.pendingChoice.options.length, 2);

  // Resolve choice
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [50] },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.hand.length, 1);
  assert.equal(res2.state.players.p1.zones.hand[0].instanceId, 50);
});

test('ability: two Pokémon sharing a name track "used" independently (I48)', () => {
  const { state, rng } = setupGame();
  const makeKirlia = (instanceId) => createCard({
    instanceId,
    name: 'Kirlia',
    hp: 80,
    supertype: 'Pokémon',
    abilityText: 'Refinement: Once during your turn, you may draw 2 cards.',
    abilities: [
      {
        name: 'Refinement',
        type: 'Ability',
        text: 'Refinement: Once during your turn, you may draw 2 cards.',
      },
    ],
  });
  const kirliaA = makeKirlia(10);
  const kirliaB = makeKirlia(11);
  state.players.p1.zones.active.push(kirliaA);
  state.players.p1.zones.bench.push(kirliaB);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 101 }),
    createCard({ instanceId: 102 }),
    createCard({ instanceId: 103 }),
    createCard({ instanceId: 104 })
  );

  const res1 = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 10 },
    playerId: 'p1',
  }, rng);
  assert.equal(res1.error, null);

  // Using kirliaA's ability must not block kirliaB's separate copy.
  const res2 = applyCommand(res1.state, {
    type: 'useAbility',
    payload: { instanceId: 11 },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.hand.length, 4);
});

// ── design 015: an Active-Spot ability cannot be activated from the Bench ──
// The inspector greys the panel, but a stale or hand-built command never goes through it, so the
// rule has to hold in the engine too. Before this guard, validateLegality checked only the
// once-per-turn flags and the dispatch was accepted from anywhere.
const SLEEPY_AURA =
  "Once during your turn, if this Pokémon is in the Active Spot, you may make your opponent's Active Pokémon Asleep.";
const makeHypno = (instanceId) =>
  createCard({
    instanceId,
    name: 'Hypno',
    hp: 110,
    supertype: 'Pokémon',
    abilityText: SLEEPY_AURA,
    abilities: [{ name: 'Sleepy Aura', type: 'Ability', text: SLEEPY_AURA }],
  });

test('ability: an Active-Spot ability is refused from the Bench', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.bench.push(makeHypno(30));

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 30 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, 'This ability can only be used from the Active Spot.');
  assert.equal(res.events.length, 0);
  assert.ok(!res.state.players.p1.zones.bench[0].abilityUsed);
});

test('ability: the same Active-Spot ability is allowed from the Active', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(makeHypno(31));

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 31 },
    playerId: 'p1',
  }, rng);

  // The guard must not block the legal position. What the effect engine then does with the
  // status condition is out of scope here.
  assert.notEqual(
    res.error,
    'This ability can only be used from the Active Spot.'
  );
});

test('ability: a non-positional ability from the Bench is unaffected by the guard', () => {
  const { state, rng } = setupGame();
  const kirlia = createCard({
    instanceId: 32,
    name: 'Kirlia',
    hp: 80,
    supertype: 'Pokémon',
    abilityText: 'Refinement: Once during your turn, you may draw 2 cards.',
    abilities: [
      {
        name: 'Refinement',
        type: 'Ability',
        text: 'Refinement: Once during your turn, you may draw 2 cards.',
      },
    ],
  });
  state.players.p1.zones.bench.push(kirlia);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 201 }),
    createCard({ instanceId: 202 })
  );

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 32 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 2);
});
