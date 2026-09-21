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

// Mega Greninja ex — Mortal Shuriken. Two engine defects: the server
// discard-cost step offered every hand card (the parser never populated the
// executor's energyType/basic filter fields), and the follow-up damage step
// had no handler, so no target picker was raised.
test("ability: Mega Greninja ex Mortal Shuriken — Water-only discard then damage picker", () => {
  const { state, rng } = setupGame();
  const TEXT =
    "Once during your turn, if this Pokémon is in the Active Spot, you may discard a Basic {W} Energy card from your hand in order to use this Ability. Place 6 damage counters on 1 of your opponent's Pokémon.";
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mega Greninja ex',
      hp: 330,
      supertype: 'Pokémon',
      abilityText: TEXT,
      abilities: [{ name: 'Mortal Shuriken', type: 'Ability', text: TEXT }],
    })
  );
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 2, name: 'Water Energy', supertype: 'Energy', types: ['Water'] }),
    createCard({ instanceId: 3, name: 'Fire Energy', supertype: 'Energy', types: ['Fire'] }),
    createCard({ instanceId: 4, name: "Professor's Research", supertype: 'Trainer' })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 9, name: 'Charmander', hp: 60, supertype: 'Pokémon' })
  );
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 10, name: 'Bulbasaur', hp: 70, supertype: 'Pokémon' })
  );

  const res1 = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 1 },
    playerId: 'p1',
  }, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  // Only the Basic {W} Energy is a legal cost — not the Fire Energy, Trainer,
  // or any other hand card.
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId), [2]);

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [2] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.equal(
    res2.state.players.p1.zones.discard.some((c) => c.instanceId === 2),
    true
  );
  // The cost is paid, then the damage-counter target picker opens over the
  // opponent's in-play Pokémon.
  assert.ok(res2.pendingChoice);
  assert.deepEqual(
    res2.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b),
    [9, 10]
  );

  const res3 = applyCommand(res2.state, {
    type: 'resolveChoice',
    payload: { choiceId: res2.pendingChoice.choiceId, selection: [9] },
    playerId: 'p1',
  }, rng);
  assert.equal(res3.error, null);
  assert.equal(res3.pendingChoice, null);
  assert.equal(res3.state.players.p2.zones.active[0].damage, 60);
  assert.ok(!res3.state.players.p2.zones.bench[0].damage);
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

// ── Primarina Enriching Melody: an evolve-triggered, target-chosen full heal ──
// The ability is a one-shot on the turn it evolves ("when you play this Pokémon
// from your hand to evolve"), and heals ALL damage from a chosen Pokémon, not a
// flat 30 on the ability's owner (which used to make the click a no-op).
const ENRICHING_MELODY =
  'Once during your turn, when you play this Pokémon from your hand to evolve 1 of your Pokémon, you may use this Ability. Heal all damage from 1 of your Pokémon.';

const makePrimarina = (instanceId, enteredPlayTurn) =>
  createCard({
    instanceId,
    name: 'Primarina',
    hp: 150,
    supertype: 'Pokémon',
    stage: 'Stage 2',
    enteredPlayTurn,
    abilityText: ENRICHING_MELODY,
    abilities: [{ name: 'Enriching Melody', type: 'Ability', text: ENRICHING_MELODY }],
  });

test('ability: Primarina Enriching Melody heals a chosen Pokémon to full', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(makePrimarina(40, state.turn.number));
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 41, name: 'Brionne', hp: 90, supertype: 'Pokémon', damage: 50 }),
    createCard({ instanceId: 42, name: 'Popplio', hp: 70, supertype: 'Pokémon', damage: 20 })
  );

  const res1 = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 40 },
    playerId: 'p1',
  }, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice, 'expected a heal-target choice');
  assert.equal(res1.pendingChoice.options.length, 2);

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [41] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.bench.find((c) => c.instanceId === 41).damage, 0);
  assert.equal(res2.state.players.p1.zones.bench.find((c) => c.instanceId === 42).damage, 20);
});

test('ability: Primarina Enriching Melody is refused when not used the turn it evolved', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(makePrimarina(43, state.turn.number - 1));
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 44, name: 'Brionne', hp: 90, supertype: 'Pokémon', damage: 50 })
  );

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 43 },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, 'This ability can only be used the turn it evolved.');
  assert.equal(res.state.players.p1.zones.bench[0].damage, 50);
});

// ── Meowth ex Last Ditch Catch: a played-onto-Bench one-shot trigger ──
// Legal only while it sits on the Bench the turn it was played there from hand;
// never from the Active Spot and never on a later turn.
const LAST_DITCH_CATCH =
  'When you play this Pokémon from your hand onto your Bench during your turn, you may use this Ability. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck. You can\'t use more than 1 Last-Ditch Catch Ability during your turn.';

const makeMeowth = (instanceId) =>
  createCard({
    instanceId,
    name: 'Meowth ex',
    hp: 170,
    supertype: 'Pokémon',
    abilityText: LAST_DITCH_CATCH,
    abilities: [{ name: 'Last-Ditch Catch', type: 'Ability', text: LAST_DITCH_CATCH }],
  });

const BENCH_TRIGGER_REFUSAL =
  "This ability only works the turn it's played from hand to the Bench.";

test('ability: Meowth ex Last-Ditch Catch is allowed the turn it is played from hand to Bench', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(createCard({ instanceId: 50, name: 'Pikachu', hp: 60, supertype: 'Pokémon' }));
  state.players.p1.zones.hand.push(makeMeowth(51));
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 52, name: 'Judge', supertype: 'Trainer', subtypes: ['Supporter'] })
  );

  const moved = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 51, from: 'hand', to: 'bench' },
    playerId: 'p1',
  }, rng);
  assert.equal(moved.error, null);

  const res = applyCommand(moved.state, {
    type: 'useAbility',
    payload: { instanceId: 51 },
    playerId: 'p1',
  }, rng);
  assert.notEqual(res.error, BENCH_TRIGGER_REFUSAL);
});

test('ability: Meowth ex Last-Ditch Catch is refused from the Active Spot', () => {
  const { state, rng } = setupGame();
  const meowth = makeMeowth(53);
  meowth.playedToBenchTurn = state.turn.number;
  state.players.p1.zones.active.push(meowth);

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 53 },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, BENCH_TRIGGER_REFUSAL);
  assert.equal(res.events.length, 0);
});

test('ability: Meowth ex Last-Ditch Catch is refused on a later turn', () => {
  const { state, rng } = setupGame();
  const meowth = makeMeowth(54);
  meowth.playedToBenchTurn = state.turn.number - 2;
  state.players.p1.zones.bench.push(meowth);

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 54 },
    playerId: 'p1',
  }, rng);
  assert.equal(res.error, BENCH_TRIGGER_REFUSAL);
});

test('ability: Fezandipiti ex Flip the Script needs a Knockout during the opponent\'s last turn', () => {
  const { state, rng } = setupGame();
  const text =
    "Flip the Script: Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn, you may draw 3 cards. You can't use more than 1 Flip the Script Ability each turn.";
  state.players.p1.zones.bench.push(
    createCard({
      instanceId: 10,
      name: 'Fezandipiti ex',
      hp: 210,
      supertype: 'Pokémon',
      abilityText: text,
      abilities: [{ name: 'Flip the Script', type: 'Ability', text }],
    })
  );
  for (let i = 0; i < 3; i += 1) state.players.p1.zones.deck.push(createCard({ instanceId: 101 + i }));
  const use = (s) => applyCommand(s, { type: 'useAbility', payload: { instanceId: 10 }, playerId: 'p1' }, rng);

  const blocked = use(state);
  assert.match(blocked.error, /Knocked Out during your opponent's last turn/);
  assert.equal(blocked.state.players.p1.zones.hand.length, 0);

  state.players.p1.flags.koedLastOppTurn = true;
  const allowed = use(state);
  assert.equal(allowed.error, null);
  assert.equal(allowed.state.players.p1.zones.hand.length, 3);
});
