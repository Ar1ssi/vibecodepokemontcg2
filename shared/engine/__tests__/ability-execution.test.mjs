import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition, hasAnyCondition } from '../rules/special-conditions.mjs';
import { parseAbility } from '../rules/abilities.mjs';

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
  // 120 HP so 6 counters (60) are non-lethal: this test is about the cost +
  // target pickers, not the knockout (covered separately below).
  state.players.p2.zones.active.push(
    createCard({ instanceId: 9, name: 'Charmander', hp: 120, supertype: 'Pokémon' })
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

test('ability: Mortal Shuriken counters exceeding remaining HP knock out and grant prizes', () => {
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
    createCard({ instanceId: 4, name: 'Fire Energy', supertype: 'Energy', types: ['Fire'] })
  );
  for (let i = 0; i < 6; i++) {
    state.players.p1.zones.prizes.push(createCard({ instanceId: 80 + i }));
  }
  // 50 HP, 6 counters = 60: more than the remaining HP, so it must be Knocked Out.
  state.players.p2.zones.active.push(
    createCard({ instanceId: 9, name: 'Charmander', hp: 50, supertype: 'Pokémon' })
  );
  // A second target keeps the damage-counter picker open so the choose-then-apply
  // resume path is what triggers the knockout.
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 10, name: 'Bulbasaur', hp: 70, supertype: 'Pokémon' })
  );

  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 1 }, playerId: 'p1' }, rng);
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [2] },
    playerId: 'p1',
  }, rng);
  const res3 = applyCommand(res2.state, {
    type: 'resolveChoice',
    payload: { choiceId: res2.pendingChoice.choiceId, selection: [9] },
    playerId: 'p1',
  }, rng);

  assert.equal(res3.error, null);
  assert.ok(
    !res3.state.players.p2.zones.active.some((c) => c.instanceId === 9),
    'the Knocked Out Charmander leaves the Active Spot'
  );
  assert.ok(
    res3.state.players.p2.zones.discard.some((c) => c.instanceId === 9),
    'the Knocked Out Pokémon is discarded'
  );
  // The knockout grants a prize entitlement; the tail raises the prize picker.
  assert.ok((res3.state.players.p1.flags.prizesOwed || 0) >= 1);
  assert.equal(res3.state.pendingChoice?.player, 'p1');
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

test('ability: a no-target heal ability is not consumed (A3)', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(makePrimarina(60, state.turn.number));

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 60 },
    playerId: 'p1',
  }, rng);

  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].abilityUsed, false, 'nothing to heal, ability stays available');
  assert.ok(!res.state.players.p1.flags.abilitiesUsed?.[60]);

  // Once there is something to heal, the same ability can still be used.
  res.state.players.p1.zones.active[0].damage = 30;
  const res2 = applyCommand(res.state, {
    type: 'useAbility',
    payload: { instanceId: 60 },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.active[0].damage, 0, 'the retry healed the damage');
  assert.equal(res2.state.players.p1.zones.active[0].abilityUsed, true, 'the successful use is consumed');
});

test('ability: removeAbilityCounter clears the turn flag too (A6)', () => {
  const { state, rng } = setupGame();
  const kirlia = createCard({
    instanceId: 70,
    name: 'Kirlia',
    hp: 80,
    supertype: 'Pokémon',
    abilityText: 'Refinement: Once during your turn, you may draw 2 cards.',
    abilities: [
      { name: 'Refinement', type: 'Ability', text: 'Refinement: Once during your turn, you may draw 2 cards.' },
    ],
  });
  state.players.p1.zones.bench.push(kirlia);
  for (let i = 0; i < 4; i += 1) state.players.p1.zones.deck.push(createCard({ instanceId: 101 + i }));

  const used = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 70 },
    playerId: 'p1',
  }, rng);
  assert.equal(used.error, null);
  assert.equal(used.state.players.p1.flags.abilitiesUsed[70], true);

  const cleared = applyCommand(used.state, {
    type: 'removeAbilityCounter',
    payload: { instanceId: 70 },
    playerId: 'p1',
  }, rng);
  assert.equal(cleared.error, null);
  assert.ok(!cleared.state.players.p1.flags.abilitiesUsed?.[70], 'turn flag cleared with the counter');

  const again = applyCommand(cleared.state, {
    type: 'useAbility',
    payload: { instanceId: 70 },
    playerId: 'p1',
  }, rng);
  assert.equal(again.error, null, 'the ability can be used again after clearing its counter');
  assert.equal(again.state.players.p1.zones.hand.length, 4);
});

test('ability: a "have no Abilities" Stadium blocks server ability use (A4)', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 90,
    name: "Team Rocket's Watchtower",
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities.",
  });
  state.players.p1.zones.bench.push(createCard({
    instanceId: 71,
    name: 'Kirlia',
    hp: 80,
    supertype: 'Pokémon',
    abilityText: 'Refinement: Once during your turn, you may draw 2 cards.',
    abilities: [
      { name: 'Refinement', type: 'Ability', text: 'Refinement: Once during your turn, you may draw 2 cards.' },
    ],
  }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 101 }), createCard({ instanceId: 102 }));

  const res = applyCommand(state, {
    type: 'useAbility',
    payload: { instanceId: 71 },
    playerId: 'p1',
  }, rng);

  assert.match(res.error, /blocked by the Stadium/);
  assert.equal(res.state.players.p1.zones.hand.length, 0, 'no cards drawn through the block');
});

const DYNAMOTOR_TEXT =
  'Once during your turn, you may attach a Basic {L} Energy card from your discard pile to 1 of your Benched Pokémon.';

function setupDynamotor() {
  const { state, rng } = setupGame();
  const eelektrik = createCard({
    instanceId: 70,
    name: 'Eelektrik',
    hp: 90,
    supertype: 'Pokémon',
    abilities: [{ name: 'Dynamotor', type: 'Ability', text: DYNAMOTOR_TEXT }],
  });
  const activeMon = createCard({ instanceId: 71, name: 'Tynamo', hp: 40, supertype: 'Pokémon' });
  const benchedMon = createCard({ instanceId: 72, name: 'Pikachu', hp: 60, supertype: 'Pokémon' });
  state.players.p1.zones.active.push(activeMon);
  state.players.p1.zones.bench.push(eelektrik, benchedMon);
  state.players.p1.zones.discard.push(
    createCard({ instanceId: 80, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'] }),
    createCard({ instanceId: 81, name: 'Basic Lightning Energy', supertype: 'Energy', subtypes: ['Basic'] })
  );
  return { state, rng };
}

test('ability: Eelektrik Dynamotor attaches a Basic {L} Energy from discard to a Benched Pokémon', () => {
  const { state, rng } = setupDynamotor();
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice, 'asks which Energy to attach');
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [81]);

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [81] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.ok(res2.pendingChoice, 'asks which Benched Pokémon receives it');
  assert.deepEqual(res2.pendingChoice.options.map((c) => c.instanceId).sort(), [70, 72]);

  const res3 = applyCommand(res2.state, {
    type: 'resolveChoice',
    payload: { choiceId: res2.pendingChoice.choiceId, selection: [72] },
    playerId: 'p1',
  }, rng);
  assert.equal(res3.error, null);
  const p1 = res3.state.players.p1;
  const energy = p1.zones.bench.find((c) => c.instanceId === 81);
  assert.equal(energy?.attachedTo, 72);
  assert.equal(p1.zones.discard.some((c) => c.instanceId === 81), false);
});

test('ability: Eelektrik Dynamotor with no Basic {L} Energy in discard is not consumed', () => {
  const { state, rng } = setupDynamotor();
  state.players.p1.zones.discard = state.players.p1.zones.discard.filter((c) => c.instanceId !== 81);
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});

const SINISTER_SURGE_TEXT =
  'Once during your turn, you may use this Ability. Search your deck for a Basic {D} Energy card and attach it to 1 of your Benched {D} Pokémon. Then, shuffle your deck. If you attached Energy to a Pokémon in this way, place 2 damage counters on that Pokémon.';

test('ability: Toxtricity Sinister Surge attaches the searched {D} Energy to the chosen Benched {D} Pokémon', () => {
  const { state, rng } = setupGame();
  const toxtricity = createCard({
    instanceId: 90,
    name: 'Toxtricity',
    hp: 130,
    supertype: 'Pokémon',
    types: ['Darkness'],
    abilities: [{ name: 'Sinister Surge', type: 'Ability', text: SINISTER_SURGE_TEXT }],
  });
  const darkBench = createCard({ instanceId: 91, name: 'Zorua', hp: 70, supertype: 'Pokémon', types: ['Darkness'] });
  const grassBench = createCard({ instanceId: 92, name: 'Oddish', hp: 60, supertype: 'Pokémon', types: ['Grass'] });
  state.players.p1.zones.active.push(toxtricity);
  state.players.p1.zones.bench.push(darkBench, grassBench);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 95, name: 'Basic Darkness Energy', supertype: 'Energy', subtypes: ['Basic'] }),
    createCard({ instanceId: 96, name: 'Basic Grass Energy', supertype: 'Energy', subtypes: ['Basic'] })
  );

  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 90 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [95]);

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [95] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null, 'the only Benched {D} Pokémon receives it without a prompt');
  const p1 = res2.state.players.p1;
  assert.equal(p1.zones.bench.find((c) => c.instanceId === 95)?.attachedTo, 91);
  assert.equal(p1.zones.hand.length, 0, 'Energy never goes to hand');
  assert.equal(p1.zones.bench.find((c) => c.instanceId === 91).damage, 20);
  assert.equal(p1.zones.active[0].damage || 0, 0);
});

const ADRENA_BRAIN_TEXT =
  "Once during your turn, if this Pokémon has any {D} Energy attached, you may move up to 3 damage counters from 1 of your Pokémon to 1 of your opponent's Pokémon.";

function setupAdrenaBrain({ withDarkEnergy }) {
  const { state, rng } = setupGame();
  const munkidori = createCard({
    instanceId: 100,
    name: 'Munkidori',
    hp: 110,
    supertype: 'Pokémon',
    abilities: [{ name: 'Adrena-Brain', type: 'Ability', text: ADRENA_BRAIN_TEXT }],
  });
  const damaged = createCard({ instanceId: 101, name: 'Pecharunt', hp: 80, supertype: 'Pokémon' });
  damaged.damage = 50;
  state.players.p1.zones.active.push(munkidori);
  state.players.p1.zones.bench.push(damaged);
  if (withDarkEnergy) {
    const energy = createCard({ instanceId: 102, name: 'Basic Darkness Energy', supertype: 'Energy', subtypes: ['Basic'] });
    energy.attachedTo = 100;
    state.players.p1.zones.active.push(energy);
  }
  state.players.p2.zones.active.push(createCard({ instanceId: 200, name: 'Pikachu', hp: 60, supertype: 'Pokémon' }));
  return { state, rng };
}

test('ability: Munkidori Adrena-Brain moves up to 3 damage counters from own Pokémon to the opponent', () => {
  const { state, rng } = setupAdrenaBrain({ withDarkEnergy: true });
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 100 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [101]);
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [101] },
    playerId: 'p1',
  }, rng);
  assert.deepEqual(res2.pendingChoice.options.map((c) => c.instanceId), [200]);
  const res3 = applyCommand(res2.state, {
    type: 'resolveChoice',
    payload: { choiceId: res2.pendingChoice.choiceId, selection: [200] },
    playerId: 'p1',
  }, rng);
  assert.equal(res3.error, null);
  const counterOptions = res3.pendingChoice.options;
  assert.deepEqual(counterOptions.map((o) => o.name), ['3 damage counters', '2 damage counters', '1 damage counter']);
  const res4 = applyCommand(res3.state, {
    type: 'resolveChoice',
    payload: { choiceId: res3.pendingChoice.choiceId, selection: [counterOptions[0].instanceId] },
    playerId: 'p1',
  }, rng);
  assert.equal(res4.error, null);
  assert.equal(res4.state.players.p1.zones.bench[0].damage, 20, 'source loses 3 counters');
  assert.equal(res4.state.players.p2.zones.active[0].damage, 30, 'target gains 3 counters');
});

test('ability: Munkidori Adrena-Brain lets the player move fewer than 3 counters (I83)', () => {
  const { state, rng } = setupAdrenaBrain({ withDarkEnergy: true });
  const resolve = (res, selection) => applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: 'p1',
  }, rng);
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 100 }, playerId: 'p1' }, rng);
  const res3 = resolve(resolve(res1, [101]), [200]);
  const oneCounter = res3.pendingChoice.options.find((o) => o.name === '1 damage counter');
  const res4 = resolve(res3, [oneCounter.instanceId]);
  assert.equal(res4.error, null);
  assert.equal(res4.state.players.p1.zones.bench[0].damage, 40);
  assert.equal(res4.state.players.p2.zones.active[0].damage, 10);
});

test('ability: Adrena-Brain with a source holding 1 counter moves it without a count prompt (I83)', () => {
  const { state, rng } = setupAdrenaBrain({ withDarkEnergy: true });
  state.players.p1.zones.bench[0].damage = 10;
  const resolve = (res, selection) => applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: 'p1',
  }, rng);
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 100 }, playerId: 'p1' }, rng);
  const res3 = resolve(resolve(res1, [101]), [200]);
  assert.equal(res3.pendingChoice, null);
  assert.equal(res3.state.players.p1.zones.bench[0].damage, 0);
  assert.equal(res3.state.players.p2.zones.active[0].damage, 10);
});

test('ability: Munkidori Adrena-Brain does nothing without {D} Energy attached', () => {
  const { state, rng } = setupAdrenaBrain({ withDarkEnergy: false });
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 100 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 50);
  assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[100], true);
});

test('ability: deck-to-Bench search puts the card on the Bench, not in hand (I82)', () => {
  const { state, rng } = setupGame();
  const text = 'Once during your turn, you may search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.';
  const caller = createCard({
    instanceId: 30,
    name: 'Caller',
    hp: 90,
    supertype: 'Pokémon',
    abilityText: `Call Out: ${text}`,
    abilities: [{ name: 'Call Out', type: 'Ability', text }],
  });
  state.players.p1.zones.active.push(caller);
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 60, name: 'Pikachu', supertype: 'Pokémon', subtypes: ['Basic'] }),
  );

  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 30 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [60] },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p1.zones.bench.map((c) => c.instanceId), [60]);
  assert.equal(res2.state.players.p1.zones.hand.length, 0);
});

function setupStatusAbility(text) {
  const { state, rng } = setupGame();
  state.rulesEnabled = false;
  state.players.p1.zones.active.push(createCard({
    instanceId: 40,
    name: 'Status User',
    hp: 130,
    supertype: 'Pokémon',
    abilities: [{ name: 'Status Test', type: 'Ability', text }],
  }));
  state.players.p2.zones.active.push(createCard({ instanceId: 41, name: 'Opp', hp: 100, supertype: 'Pokémon' }));
  return { state, rng };
}

const conditionsOf = (card) => [card.specialCondition, ...(card.conditions || [])].filter(Boolean);

test("ability: statusAbility applies the printed condition to the opponent's Active, not the user's (I88)", () => {
  const { state, rng } = setupStatusAbility("Once during your turn, you may make your opponent's Active Pokémon Confused.");
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 40 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.deepEqual(conditionsOf(res.state.players.p2.zones.active[0]), ['Confused']);
  assert.deepEqual(conditionsOf(res.state.players.p1.zones.active[0]), []);
});

test('ability: coin-flip statusAbility only applies on heads (I88)', () => {
  const text = "Once during your turn, you may flip a coin. If heads, your opponent's Active Pokémon is now Asleep.";
  const faces = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const { state } = setupStatusAbility(text);
    const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 40 }, playerId: 'p1' }, createRng(seed));
    assert.equal(res.error, null);
    const flip = res.events.find((e) => e.type === 'coinFlipped');
    assert.ok(flip, 'a coin is flipped');
    faces.add(flip.face);
    const expected = flip.face === 'heads' ? ['Asleep'] : [];
    assert.deepEqual(conditionsOf(res.state.players.p2.zones.active[0]), expected);
    assert.deepEqual(conditionsOf(res.state.players.p1.zones.active[0]), []);
  }
  assert.deepEqual([...faces].sort(), ['heads', 'tails']);
});

function holderWithAbility(state, text) {
  const holder = createCard({
    instanceId: 70,
    name: 'Holder',
    hp: 200,
    supertype: 'Pokémon',
    abilities: [{ name: 'Test Ability', type: 'Ability', text }],
  });
  state.players.p1.zones.active.push(holder);
  const opp = createCard({ instanceId: 71, name: 'Opp', hp: 200, supertype: 'Pokémon' });
  state.players.p2.zones.active.push(opp);
  return { holder, opp };
}

test('ability: passive and triggered abilities cannot be activated from the ability button (I94)', () => {
  const passives = [
    "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 3 damage counters on the Attacking Pokémon.",
    'If this Pokémon is Knocked Out by damage from an attack from your opponent\'s Pokémon, search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.',
    "Damage can't be healed from any Pokémon (both yours and your opponent's).",
  ];
  for (const text of passives) {
    const { state, rng } = setupGame();
    state.players.p1.zones.deck.push(createCard({ instanceId: 80, name: 'Deck Card' }));
    holderWithAbility(state, text);
    const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
    assert.equal(res.error, "This Ability can't be activated; it works on its own.", text);
    assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0);
    assert.equal(res.state.players.p1.zones.hand.length, 0);
  }
});

test('ability: VSTAR Power "During your turn, you may" wording stays activatable (I94)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, "During your turn, you may put 4 damage counters on 1 of your opponent's Pokémon. (You can't use more than 1 VSTAR Power in a game.)");
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
});

test('ability: "flip a coin. If heads, …" only resolves on heads and is spent either way (I97)', () => {
  const text = 'Once during your turn, you may flip a coin. If heads, draw 2 cards.';
  const faces = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const { state } = setupGame();
    holderWithAbility(state, text);
    state.players.p1.zones.deck.push(createCard({ instanceId: 90 }), createCard({ instanceId: 91 }));
    const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, createRng(seed));
    assert.equal(res.error, null);
    const flips = res.events.filter((e) => e.type === 'coinFlipped');
    assert.equal(flips.length, 1);
    faces.add(flips[0].face);
    assert.equal(res.state.players.p1.zones.hand.length, flips[0].face === 'heads' ? 2 : 0);
    assert.equal(res.state.players.p1.flags.abilitiesUsed[70], true);
  }
  assert.deepEqual([...faces].sort(), ['heads', 'tails']);
});

test("ability: \"You must discard a card from your hand in order to use this Ability\" pays before drawing (I92)", () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'You must discard a card from your hand in order to use this Ability. Once during your turn, you may draw 2 cards.');
  state.players.p1.zones.hand.push(createCard({ instanceId: 95, name: 'Spare' }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 96 }), createCard({ instanceId: 97 }));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [95], 'only the pre-draw hand is offered');
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [95] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p1.zones.discard.map((c) => c.instanceId), [95]);
  assert.deepEqual(res2.state.players.p1.zones.hand.map((c) => c.instanceId).sort(), [96, 97]);
});

test('ability: a discard-cost draw ability with an empty hand does nothing and is not spent (I92)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'You must discard a card from your hand in order to use this Ability. Once during your turn, you may draw 2 cards.');
  state.players.p1.zones.deck.push(createCard({ instanceId: 96 }), createCard({ instanceId: 97 }));
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});

// Quaquaval Up-Tempo, Surging Sparks 052 (out/pkmn-pokemon-cards.json): the cost is a card
// from hand to the bottom of the deck, and the player chooses which card.
test('ability: bottom-of-deck hand cost lets the player pick the card, then draws (Quaquaval Up-Tempo)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'You must put a card from your hand on the bottom of your deck in order to use this Ability. Once during your turn, you may draw cards until you have 5 cards in your hand.'
  );
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 110, name: 'Keep A' }),
    createCard({ instanceId: 111, name: 'Bottom B' }),
    createCard({ instanceId: 112, name: 'Keep C' })
  );
  for (const id of [120, 121, 122, 123, 124]) {
    state.players.p1.zones.deck.push(createCard({ instanceId: id }));
  }

  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(
    res1.pendingChoice.options.map((card) => card.instanceId).sort(),
    [110, 111, 112],
    'the whole pre-draw hand is offered'
  );
  assert.equal(res1.state.players.p1.zones.hand.length, 3, 'nothing moves until the pick resolves');

  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [111] },
    playerId: 'p1',
  }, rng);
  assert.equal(res2.error, null);
  assert.deepEqual(
    res2.state.players.p1.zones.deck.map((c) => c.instanceId),
    [123, 124, 111],
    'the chosen card — not an auto-picked one — is on the bottom'
  );
  assert.deepEqual(
    res2.state.players.p1.zones.hand.map((c) => c.instanceId).sort(),
    [110, 112, 120, 121, 122],
    'hand fills to 5 from the deck'
  );
});

test('ability: the bottom-of-deck hand cost is unpayable with an empty hand — no draw, not spent (Quaquaval Up-Tempo)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'You must put a card from your hand on the bottom of your deck in order to use this Ability. Once during your turn, you may draw cards until you have 5 cards in your hand.'
  );
  for (const id of [120, 121, 122, 123, 124]) {
    state.players.p1.zones.deck.push(createCard({ instanceId: id }));
  }
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 0, 'the cost could not be paid, so no draw');
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});

test('ability: "discard your hand and draw 3 cards" discards the hand first (I92)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may discard your hand and draw 3 cards.');
  state.players.p1.zones.hand.push(createCard({ instanceId: 95 }), createCard({ instanceId: 94 }));
  for (const id of [96, 97, 98, 99]) state.players.p1.zones.deck.push(createCard({ instanceId: id }));
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.deepEqual(res.state.players.p1.zones.discard.map((c) => c.instanceId).sort(), [94, 95]);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId), [96, 97, 98]);
});

function energyCard(instanceId, type) {
  return createCard({ instanceId, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, type: 'Energy' });
}
const attachedTo = (state, pid, rootId) =>
  [...state.players[pid].zones.active, ...state.players[pid].zones.bench]
    .filter((c) => c.attachedTo === rootId)
    .map((c) => c.instanceId)
    .sort();
const resolveWith = (res, selection, rng) => applyCommand(res.state, {
  type: 'resolveChoice',
  payload: { choiceId: res.pendingChoice.choiceId, selection },
  playerId: res.pendingChoice.player,
}, rng);

test('ability: "search … {G} Energy … attach them to 1 of your Pokémon" attaches, not to hand (I91)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may search your deck for up to 2 {G} Energy cards and attach them to 1 of your Pokémon. Then, shuffle your deck.');
  state.players.p1.zones.bench.push(createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' }));
  state.players.p1.zones.deck.push(energyCard(81, 'Grass'), energyCard(82, 'Grass'), energyCard(83, 'Water'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId).sort(), [81, 82], 'only {G} Energy offered');
  const res2 = resolveWith(res1, [81, 82], rng);
  const res3 = resolveWith(res2, [72], rng);
  assert.equal(res3.error, null);
  assert.deepEqual(attachedTo(res3.state, 'p1', 72), [81, 82]);
  assert.equal(res3.state.players.p1.zones.hand.length, 0);
});

test('ability: "search … and attach it to this Pokémon" attaches to this Pokémon only (I91)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may search your deck for a Basic {L} Energy card and attach it to this Pokémon. Then, shuffle your deck.');
  state.players.p1.zones.bench.push(createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' }));
  state.players.p1.zones.deck.push(energyCard(81, 'Lightning'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  const res2 = resolveWith(res1, [81], rng);
  assert.equal(res2.pendingChoice, null, 'this Pokémon is the only target: no prompt');
  assert.deepEqual(attachedTo(res2.state, 'p1', 70), [81]);
  assert.deepEqual(attachedTo(res2.state, 'p1', 72), []);
});

test('ability: "attach them to your Pokémon in any way you like" picks a target per card (I91)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may search your deck for up to 2 Basic {G} Energy cards and attach them to your Pokémon in any way you like. Then, shuffle your deck.');
  state.players.p1.zones.bench.push(createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' }));
  state.players.p1.zones.deck.push(energyCard(81, 'Grass'), energyCard(82, 'Grass'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  const res2 = resolveWith(res1, [81, 82], rng);
  const res3 = resolveWith(res2, [70], rng);
  assert.ok(res3.pendingChoice, 'second card asks again');
  const res4 = resolveWith(res3, [72], rng);
  assert.equal(res4.error, null);
  assert.deepEqual(attachedTo(res4.state, 'p1', 70), [81]);
  assert.deepEqual(attachedTo(res4.state, 'p1', 72), [82]);
});

test('ability: once-per-turn hand attach moves the Energy onto the chosen Pokémon (I90)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may attach a Basic {R} Energy card from your hand to 1 of your Benched {R} Pokémon.');
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 72, name: 'Fire Mon', hp: 100, supertype: 'Pokémon', types: ['Fire'] }),
    createCard({ instanceId: 73, name: 'Water Mon', hp: 100, supertype: 'Pokémon', types: ['Water'] }),
  );
  state.players.p1.zones.hand.push(energyCard(81, 'Fire'), energyCard(82, 'Water'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((c) => c.instanceId), [81], 'only Basic {R} Energy');
  const res2 = resolveWith(res1, [81], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(attachedTo(res2.state, 'p1', 72), [81], 'the only Benched {R} Pokémon receives it');
  assert.deepEqual(res2.state.players.p1.zones.hand.map((c) => c.instanceId), [82]);
  assert.equal(res2.state.players.p1.flags.abilitiesUsed[70], true);
});

test('ability: hand attach "or 1 of each … in any way you like" asks a target per card (I90)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may attach a Basic {R} Energy card, a Basic {F} Energy card, or 1 of each from your hand to your Pokémon in any way you like.');
  state.players.p1.zones.bench.push(createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' }));
  state.players.p1.zones.hand.push(energyCard(81, 'Fire'), energyCard(82, 'Fire'), energyCard(83, 'Fighting'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.pendingChoice.max, 2);
  const res2 = resolveWith(res1, [81, 83], rng);
  const res3 = resolveWith(res2, [70], rng);
  const res4 = resolveWith(res3, [72], rng);
  assert.equal(res4.error, null);
  assert.deepEqual(attachedTo(res4.state, 'p1', 70), [81]);
  assert.deepEqual(attachedTo(res4.state, 'p1', 72), [83]);
  assert.deepEqual(res4.state.players.p1.zones.hand.map((c) => c.instanceId), [82]);

  const twoFire = resolveWith(res1, [81, 82], rng);
  assert.equal(twoFire.pendingChoice.prompt.includes('Choose a Pokémon'), true);
  const done = resolveWith(twoFire, [72], rng);
  assert.deepEqual(attachedTo(done.state, 'p1', 72), [81], 'a second Fire is never taken');
});

test('ability: hand attach with no matching Energy in hand is not spent (I90)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may attach a Basic Energy card from your hand to 1 of your Pokémon.');
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});

const TEAL_DANCE = 'Once during your turn, you may attach a Basic {G} Energy card from your hand to this Pokémon. If you attached Energy to a Pokémon in this way, draw a card.';

test('ability: Teal Dance attaches first and only then draws (I93)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, TEAL_DANCE);
  state.players.p1.zones.hand.push(energyCard(81, 'Grass'));
  state.players.p1.zones.deck.push(createCard({ instanceId: 90 }));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  const res2 = resolveWith(res1, [81], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(attachedTo(res2.state, 'p1', 70), [81]);
  assert.deepEqual(res2.state.players.p1.zones.hand.map((c) => c.instanceId), [90]);
});

test('ability: Teal Dance with no {G} Energy in hand draws nothing (I93)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, TEAL_DANCE);
  state.players.p1.zones.deck.push(createCard({ instanceId: 90 }));
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});

test('ability: Ripening Charge heals the Pokémon that received the Energy (I93)', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, 'Once during your turn, you may attach a Basic {G} Energy card from your hand to 1 of your Pokémon. If you attached Energy to a Pokémon in this way, heal 30 damage from that Pokémon.');
  state.players.p1.zones.active[0].damage = 50;
  const benched = createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' });
  benched.damage = 40;
  state.players.p1.zones.bench.push(benched);
  state.players.p1.zones.hand.push(energyCard(81, 'Grass'));
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  const res2 = resolveWith(res1, [81], rng);
  const res3 = resolveWith(res2, [72], rng);
  assert.equal(res3.error, null);
  assert.equal(res3.pendingChoice, null);
  assert.deepEqual(attachedTo(res3.state, 'p1', 72), [81]);
  assert.equal(res3.state.players.p1.zones.bench[0].damage, 10);
  assert.equal(res3.state.players.p1.zones.active[0].damage, 50);
});

test("ability: Biting Spree puts 2 counters on each of 2 chosen opponent's Pokémon (I96)", () => {
  const { state, rng } = setupGame();
  const { holder } = holderWithAbility(state, "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may choose 2 of your opponent's Pokémon and put 2 damage counters on each of them.");
  holder.enteredPlayTurn = state.turn.number;
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 74, name: 'Opp Bench A', hp: 100, supertype: 'Pokémon' }),
    createCard({ instanceId: 75, name: 'Opp Bench B', hp: 100, supertype: 'Pokémon' }),
  );
  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.equal(res1.pendingChoice.min, 2);
  const res2 = resolveWith(res1, [71, 75], rng);
  assert.equal(res2.error, null);
  const opp = res2.state.players.p2.zones;
  assert.equal(opp.active[0].damage, 20);
  assert.deepEqual(opp.bench.map((c) => c.damage || 0), [0, 20]);
});

// ── design 034 slice 5: ability executables ──────────────────────────────

test('ability: Strange Behavior moves a damage counter between own Pokémon', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may move 1 damage counter from 1 of your other Pokémon to this Pokémon.'
  );
  const source = createCard({ instanceId: 72, name: 'Damaged', hp: 100, supertype: 'Pokémon', damage: 30 });
  state.players.p1.zones.bench.push(source);

  const res1 = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId).sort(), [72]);
  const res2 = resolveWith(res1, [72], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.bench[0].damage, 20);
  assert.equal(res2.state.players.p1.zones.active[0].damage, 10);
});

test('ability: an "as often as you like" ability is not spent by a use', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may move 1 damage counter from 1 of your other Pokémon to this Pokémon.'
  );
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 72, name: 'Damaged', hp: 100, supertype: 'Pokémon', damage: 30 })
  );
  let current = state;
  for (const expected of [20, 10]) {
    const res = applyCommand(current, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
    assert.equal(res.error, null);
    const done = resolveWith(res, [72], rng);
    assert.equal(done.error, null);
    assert.equal(done.state.players.p1.zones.bench[0].damage, expected);
    current = done.state;
  }
});

test('ability: an "as often as you like" hand attach (Emboar) attaches the matching Energy', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may attach a Basic {R} Energy card from your hand to 1 of your Pokémon.'
  );
  state.players.p1.zones.hand.push(energyCard(81, 'Fire'), energyCard(82, 'Water'));
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [81]);
  const done = resolveWith(res, [81], rng);
  assert.equal(done.error, null);
  assert.deepEqual(attachedTo(done.state, 'p1', 70), [81]);
});

test('ability: Busybody Nurse cures every Special Condition on the Active', () => {
  const { state, rng } = setupGame();
  const { holder } = holderWithAbility(
    state,
    'Once during your turn, you may use this Ability. Your Active Pokémon recovers from all Special Conditions.'
  );
  addCondition(holder, 'Poisoned');
  addCondition(holder, 'Confused');

  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  const active = res.state.players.p1.zones.active[0];
  assert.equal(hasAnyCondition(active), false);
});

test('ability: Torrential Heart self-damages then grants a this-Pokémon damage bonus', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'Once during your turn, you may put 5 damage counters on this Pokémon. If you do, during this turn, attacks used by this Pokémon do 120 more damage to your opponent\u2019s Active Pokémon (before applying Weakness and Resistance).'
  );
  state.players.p1.zones.deck.push(createCard({ instanceId: 90, name: 'Deck' }));

  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 50);
  const bonus = res.state.players.p1.flags.turnDamageBonuses?.[0];
  assert.equal(bonus?.amount, 120);
  assert.equal(bonus?.attackerInstanceId, 70);
});

test("ability: Enthusiastic Dance boosts the team's Basic attackers, not the holder", async () => {
  const { executeSteps } = await import('../effects/executor.mjs');
  const { turnDamageBonusTotal } = await import('../rules/turn-damage-bonus.mjs');
  const { state } = setupGame();
  const ludicolo = createCard({ instanceId: 70, name: 'Ludicolo', supertype: 'Pokémon', subtypes: ['Stage 2'] });
  const steps = parseAbility(
    "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may use this Ability. During this turn, your Basic Pokémon's attacks do 100 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."
  ).filter((step) => step.type === 'turnDamageBonusAbility');
  executeSteps(state, {
    steps,
    playerId: 'p1',
    effectType: 'ability',
    sourceCard: ludicolo,
    activeRng: createRng(1),
    events: [],
  });
  const bonuses = state.players.p1.flags.turnDamageBonuses;
  const basic = { instanceId: 71, name: 'Lotad', subtypes: ['Basic'] };
  assert.equal(turnDamageBonusTotal(bonuses, basic, { name: 'Defender' }), 100);
  assert.equal(turnDamageBonusTotal(bonuses, ludicolo, { name: 'Defender' }), 0);
});

test('ability: Swelling Flash puts a hand copy onto the Bench only with more Prizes', async () => {
  const { executeSteps } = await import('../effects/executor.mjs');
  const { state } = setupGame();
  const luxray = createCard({
    instanceId: 70,
    name: 'Luxray',
    hp: 160,
    supertype: 'Pokémon',
  });
  state.players.p1.zones.hand.push(luxray);
  state.players.p1.zones.prizes.push(createCard({ instanceId: 91 }), createCard({ instanceId: 92 }));
  state.players.p2.zones.prizes.push(createCard({ instanceId: 93 }));

  const step = {
    type: 'selfBenchPlacementAbility',
    swapActive: false,
    condition: 'morePrizes',
  };
  const res = executeSteps(state, {
    steps: [step],
    playerId: 'p1',
    effectType: 'ability',
    sourceCard: luxray,
    activeRng: createRng(1),
    events: [],
  });
  assert.ok(res.completed);
  assert.equal(state.players.p1.zones.bench.length, 1);
  assert.equal(state.players.p1.zones.bench[0].instanceId, 70);
  assert.equal(state.players.p1.zones.hand.length, 0);
});

test('ability: Buzzing Boost-style self-return to hand promotes a lone Benched Pokémon', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'Once during your turn, you may return this Pokémon and all cards attached to it to your hand.'
  );
  const benchMon = createCard({ instanceId: 72, name: 'Benched', hp: 100, supertype: 'Pokémon' });
  state.players.p1.zones.bench.push(benchMon);

  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.some((c) => c.instanceId === 70), true);
  assert.equal(res.state.players.p1.zones.active[0].instanceId, 72);
});

test('ability: self-bench placement is refused without a hand copy', async () => {
  const { executeSteps } = await import('../effects/executor.mjs');
  const { state } = setupGame();
  const holder = createCard({
    instanceId: 70,
    name: 'Luxray',
    hp: 160,
    supertype: 'Pokémon',
  });
  // On the Active, not in hand: the handler must skip and leave the Bench empty.
  state.players.p1.zones.active.push(holder);
  const events = [];
  const res = executeSteps(state, {
    steps: [{ type: 'selfBenchPlacementAbility', condition: 'morePrizes' }],
    playerId: 'p1',
    effectType: 'ability',
    sourceCard: holder,
    activeRng: createRng(1),
    events,
  });
  assert.ok(res.completed);
  assert.equal(state.players.p1.zones.bench.length, 0);
  assert.ok(events.some((e) => e.type === 'effectStepSkipped'));
});

const energyOn = (instanceId, name, attachedTo, types = []) =>
  createCard({ instanceId, name, supertype: 'Energy', subtypes: ['Basic'], types, attachedTo });
const benchMon = (instanceId, name = 'Benched', extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', ...extra });
const hostOf = (state, instanceId) =>
  [...state.players.p1.zones.active, ...state.players.p1.zones.bench].find(
    (c) => c.instanceId === instanceId
  )?.attachedTo;
const use70 = (state, rng) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);

const BUBBLE_GATHERING =
  'As often as you like during your turn, you may use this Ability. Move an Energy from 1 of your other Pokémon to this Pokémon.';

test('ability: Bubble Gathering moves the only other Energy to this Pokémon without a prompt', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, BUBBLE_GATHERING);
  state.players.p1.zones.bench.push(benchMon(72), energyOn(73, 'Water Energy', 72));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(hostOf(res.state, 73), 70);
});

test('ability: Bubble Gathering asks for exactly one Energy when several qualify', () => {
  const { state, rng } = setupGame();
  holderWithAbility(state, BUBBLE_GATHERING);
  state.players.p1.zones.bench.push(
    benchMon(72),
    energyOn(73, 'Water Energy', 72),
    energyOn(74, 'Fire Energy', 72),
    energyOn(75, 'Grass Energy', 70)
  );

  const res1 = use70(state, rng);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId), [73, 74], 'not its own Energy');
  assert.equal(res1.pendingChoice.min, 1);
  assert.equal(res1.pendingChoice.max, 1);
  const res2 = resolveWith(res1, [74], rng);
  assert.equal(res2.error, null);
  assert.equal(hostOf(res2.state, 74), 70);
  assert.equal(hostOf(res2.state, 73), 72);
});

test('ability: Wash Out from the Bench moves a Benched {W} Energy to the Active, not to itself', () => {
  const { state, rng } = setupGame();
  const active = benchMon(60, 'Active');
  const dewgong = createCard({
    instanceId: 70,
    name: 'Dewgong',
    hp: 100,
    supertype: 'Pokémon',
    abilities: [{
      name: 'Wash Out',
      type: 'Ability',
      text: 'As often as you like during your turn, you may use this Ability. Move a {W} Energy from 1 of your Benched Pokémon to your Active Pokémon.',
    }],
  });
  state.players.p1.zones.active.push(active);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));
  state.players.p1.zones.bench.push(
    dewgong,
    benchMon(72),
    energyOn(73, 'Water Energy', 72),
    energyOn(74, 'Fire Energy', 72)
  );

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'the one {W} Energy moves without a prompt');
  assert.equal(hostOf(res.state, 73), 60);
  assert.equal(hostOf(res.state, 74), 72);
});

test('ability: Energy Trans moves a {G} Energy between two of your Pokémon, target chosen', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may move a {G} Energy from 1 of your Pokémon to another of your Pokémon.'
  );
  state.players.p1.zones.bench.push(
    benchMon(72, 'A'),
    benchMon(76, 'B'),
    energyOn(73, 'Grass Energy', 72),
    energyOn(74, 'Grass Energy', 70),
    energyOn(75, 'Fire Energy', 72)
  );

  // Source Pokémon first (client: mat picker), then the lone {G} Energy on it is
  // taken automatically, then the destination.
  const res1 = use70(state, rng);
  assert.deepEqual(
    res1.pendingChoice.options.map((o) => o.instanceId).sort(),
    [70, 72],
    'the Pokémon holding a {G} Energy'
  );
  const res2 = resolveWith(res1, [72], rng);
  assert.deepEqual(
    res2.pendingChoice.options.map((o) => o.instanceId).sort(),
    [70, 76],
    'any of your Pokémon except the one it is on'
  );
  const res3 = resolveWith(res2, [76], rng);
  assert.equal(res3.error, null);
  assert.equal(hostOf(res3.state, 73), 76);
});

test('ability: Solar Transfer falls back to the Energy picker when a Pokémon holds several', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may use this Ability. Move a Basic {G} Energy from 1 of your Pokémon to another of your Pokémon.'
  );
  state.players.p1.zones.bench.push(
    benchMon(72, 'A'),
    benchMon(76, 'B'),
    energyOn(73, 'Grass Energy', 72, ['Grass']),
    energyOn(74, 'Grass Energy', 70, ['Grass']),
    energyOn(77, 'Grass Energy', 72, ['Grass'])
  );

  const res1 = use70(state, rng);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId).sort(), [70, 72]);
  const res2 = resolveWith(res1, [72], rng);
  assert.deepEqual(
    res2.pendingChoice.options.map((o) => o.instanceId).sort(),
    [73, 77],
    'several {G} Energy on the chosen Pokémon'
  );
  const res3 = resolveWith(res2, [77], rng);
  assert.deepEqual(res3.pendingChoice.options.map((o) => o.instanceId).sort(), [70, 76]);
  const res4 = resolveWith(res3, [76], rng);
  assert.equal(res4.error, null);
  assert.equal(hostOf(res4.state, 77), 76);
  assert.equal(hostOf(res4.state, 73), 72);
});

test('ability: Rapid Strike Connection only moves Energy to a Rapid Strike Pokémon', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'As often as you like during your turn, you may move an Energy from 1 of your Pokémon to 1 of your Rapid Strike Pokémon.'
  );
  state.players.p1.zones.bench.push(
    benchMon(72, 'Plain'),
    benchMon(76, 'Striker', { subtypes: ['Basic', 'Rapid Strike'] }),
    energyOn(73, 'Water Energy', 72)
  );

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'one Energy, one legal target');
  assert.equal(hostOf(res.state, 73), 76);
});

test('ability: move-Energy wordings parse to their printed destination', () => {
  const shapeOf = (text) =>
    [parseAbility(text)].flat().flatMap((r) => r.steps || [r]).find((s) => s.type === 'moveEnergyAbility');
  const metalRoad = shapeOf(
    'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may use this Ability. Move any amount of {M} Energy from your other Pokémon to this Pokémon.'
  );
  assert.equal(metalRoad.target, 'self');
  assert.equal(metalRoad.anyAmount, true);
  const lustrous = shapeOf(
    'Once during your turn, when your Mega Latias ex moves from your Bench to the Active Spot, you may use this Ability. Move any amount of Energy from your Benched Pokémon to your Active Pokémon.'
  );
  assert.equal(lustrous.target, 'active');
  assert.equal(lustrous.source, 'bench');
  const plunge = shapeOf(
    'Once during your turn (before your attack), if this Pokémon is on your Bench, you may move all Energy from your Active Pokémon to this Pokémon. If you do, switch it with your Active Pokémon.'
  );
  assert.equal(plunge.source, 'active');
  assert.equal(plunge.anyAmount, true);
  const magma = shapeOf(
    "Once during your turn (before your attack), you may move a basic Energy from 1 of your Pokémon to 1 of your Team Magma's Pokémon."
  );
  assert.equal(magma.target, 'between');
  assert.equal(magma.targetTag, "team magma's");
  assert.equal(magma.exact, true);
  assert.equal(magma.upTo, 1);
});

const benchPlayedHolder = (state, name, text, extra = {}) => {
  const holder = createCard({
    instanceId: 70,
    name,
    hp: 100,
    supertype: 'Pokémon',
    playedToBenchTurn: state.turn.number,
    abilities: [{ name: 'When Played', type: 'Ability', text }],
    ...extra,
  });
  state.players.p1.zones.active.push(benchMon(60, 'Active'));
  state.players.p1.zones.bench.push(holder);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));
  return holder;
};

test("ability: Farfetch'd Impromptu Carrier searches a Pokémon Tool, not a Pokémon, and attaches it", () => {
  const { state, rng } = setupGame();
  benchPlayedHolder(
    state,
    "Farfetch'd",
    'When you play this Pokémon from your hand onto your Bench during your turn, you may search your deck for a Pokémon Tool card and attach it to this Pokémon. Then, shuffle your deck.'
  );
  const tool = createCard({ instanceId: 80, name: 'Choice Belt', supertype: 'Trainer', subtypes: ['Pokémon Tool'] });
  state.players.p1.zones.deck.push(benchMon(81, 'Pikachu'), tool);

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId), [80], 'only the Tool is offered');
  const res2 = resolveWith(res1, [80], rng);
  assert.equal(res2.error, null);
  assert.equal(hostOf(res2.state, 80), 70);
});

test('ability: Durant ex Sudden Shearing discards the top card of the opponent’s deck', () => {
  const { state, rng } = setupGame();
  benchPlayedHolder(
    state,
    'Durant ex',
    "When you play this Pokémon from your hand onto your Bench during your turn, you may discard the top card of your opponent's deck."
  );
  state.players.p2.zones.deck.push(benchMon(90, 'Top'), benchMon(91, 'Next'));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.deepEqual(res.state.players.p2.zones.discard.map((c) => c.instanceId), [90]);
  assert.deepEqual(res.state.players.p2.zones.deck.map((c) => c.instanceId), [91]);
});

test('ability: Gyarados Untamed One ("you must") discards the top 5 cards of your deck', () => {
  const { state, rng } = setupGame();
  const gyarados = createCard({
    instanceId: 70,
    name: 'Gyarados',
    hp: 180,
    supertype: 'Pokémon',
    stage: 'Stage 1',
    enteredPlayTurn: state.turn.number,
    abilities: [{
      name: 'Untamed One',
      type: 'Ability',
      text: 'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you must discard the top 5 cards of your deck.',
    }],
  });
  state.players.p1.zones.active.push(gyarados);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));
  for (let i = 0; i < 7; i++) state.players.p1.zones.deck.push(benchMon(100 + i, `Deck${i}`));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.discard.length, 5);
  assert.equal(res.state.players.p1.zones.deck.length, 2);
});

const oppHand = (state, ...cards) => state.players.p2.zones.hand.push(...cards);
const basicMon = (instanceId, name, hp = 60) =>
  createCard({ instanceId, name, hp, supertype: 'Pokémon', stage: 'Basic' });

test('ability: Zubat Revealing Echo reveals the opponent’s hand from the Active Spot', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'Once during your turn, if this Pokémon is in the Active Spot, you may have your opponent reveal their hand.'
  );
  oppHand(state, basicMon(90, 'Pichu'), energyOn(91, 'Fire Energy', null));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  const reveal = res.events.find((e) => e.type === 'cardsRevealed');
  assert.deepEqual(reveal.cards.map((c) => c.instanceId), [90, 91]);
  assert.equal(res.state.players.p2.zones.hand.length, 2, 'a reveal moves nothing');
});

test('ability: Mandibuzz Look for Prey benches the one Basic with 70 HP or less', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    "Once during your turn, you may use this Ability. Your opponent reveals their hand, and you put a Basic Pokémon with 70 HP or less that you find there onto your opponent's Bench."
  );
  oppHand(state, basicMon(90, 'Small', 60), basicMon(91, 'Big', 120));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(res.state.players.p2.zones.bench.map((c) => c.instanceId), [90]);
  assert.deepEqual(res.state.players.p2.zones.hand.map((c) => c.instanceId), [91]);
});

test('ability: Dusknoir Dark Invitation benches a Basic and puts 3 damage counters on it', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    "Once during your turn (before your attack), you may have your opponent reveal their hand. Put a Basic Pokémon you find there onto your opponent's Bench, and put 3 damage counters on that Pokémon."
  );
  oppHand(state, basicMon(90, 'Victim', 90));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  const benched = res.state.players.p2.zones.bench.find((c) => c.instanceId === 90);
  assert.equal(benched.damage, 30);
});

test('ability: Mawile-GX Captivating Wink benches any number of Basics, capped by Bench room', () => {
  const { state, rng } = setupGame();
  benchPlayedHolder(
    state,
    'Mawile-GX',
    'When you play this Pokémon from your hand onto your Bench during your turn, you may have your opponent reveal their hand and put any number of Basic Pokémon you find there onto their Bench.'
  );
  for (let i = 0; i < 3; i++) state.players.p2.zones.bench.push(basicMon(80 + i, `B${i}`));
  oppHand(state, basicMon(90, 'A'), basicMon(91, 'B'), basicMon(92, 'C'), energyOn(93, 'Fire Energy', null));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId), [90, 91, 92]);
  assert.equal(res1.pendingChoice.min, 0);
  assert.equal(res1.pendingChoice.max, 2, 'only 2 Bench spaces left');
  const res2 = resolveWith(res1, [90, 92], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p2.zones.bench.map((c) => c.instanceId).sort(), [80, 81, 82, 90, 92]);
});

test('ability: Thievul Rob-’n’-Run shuffles 2 chosen Energy cards into the opponent’s deck', () => {
  const { state, rng } = setupGame();
  const thievul = createCard({
    instanceId: 70,
    name: 'Thievul',
    hp: 100,
    supertype: 'Pokémon',
    stage: 'Stage 1',
    enteredPlayTurn: state.turn.number,
    abilities: [{
      name: "Rob-'n'-Run",
      type: 'Ability',
      text: "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may have your opponent reveal their hand, and then you choose 2 Energy cards you find there and shuffle them into your opponent's deck.",
    }],
  });
  state.players.p1.zones.active.push(thievul);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));
  oppHand(
    state,
    energyOn(90, 'Fire Energy', null),
    energyOn(91, 'Water Energy', null),
    energyOn(92, 'Grass Energy', null),
    basicMon(93, 'Pichu')
  );

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(res1.pendingChoice.options.map((o) => o.instanceId), [90, 91, 92]);
  const res2 = resolveWith(res1, [90, 92], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p2.zones.deck.map((c) => c.instanceId).sort(), [90, 92]);
  assert.deepEqual(res2.state.players.p2.zones.hand.map((c) => c.instanceId).sort(), [91, 93]);
  assert.ok(res2.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
});

test('ability: Tsareena Queenly Majesty reveals the hand, then you discard a card from it', () => {
  const { state, rng } = setupGame();
  const tsareena = createCard({
    instanceId: 70,
    name: 'Tsareena',
    hp: 150,
    supertype: 'Pokémon',
    stage: 'Stage 2',
    enteredPlayTurn: state.turn.number,
    abilities: [{
      name: 'Queenly Majesty',
      type: 'Ability',
      text: 'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may have your opponent reveal their hand. Then, discard a card from it.',
    }],
  });
  state.players.p1.zones.active.push(tsareena);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));
  oppHand(state, basicMon(90, 'Keep'), energyOn(91, 'Fire Energy', null));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.equal(res1.pendingChoice.player, 'p1', 'the Ability user picks');
  const res2 = resolveWith(res1, [91], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p2.zones.discard.map((c) => c.instanceId), [91]);
  assert.deepEqual(res2.state.players.p2.zones.hand.map((c) => c.instanceId), [90]);
});

test('ability: Dawn Wings Necrozma-GX Invasion swaps itself in with no bench picker (pkmncards SM101)', () => {
  const { state, rng } = setupGame();
  const holder = createCard({
    instanceId: 70,
    name: 'Dawn Wings Necrozma-GX',
    hp: 190,
    supertype: 'Pokémon',
    abilities: [
      {
        name: 'Invasion',
        type: 'Ability',
        text: 'Once during your turn (before your attack), if this Pokémon is on your Bench, you may switch it with your Active Pokémon.',
      },
    ],
  });
  state.players.p1.zones.active.push(benchMon(60, 'Active'));
  state.players.p1.zones.bench.push(benchMon(61, 'Other'), holder);
  state.players.p2.zones.active.push(benchMon(71, 'Opp'));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'no picker');
  assert.deepEqual(res.state.players.p1.zones.active.map((c) => c.instanceId), [70]);
});

test('ability: Naganadel-GX Ultra Conversion prompts for an Ultra Beast discard, then draws 3', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'Once during your turn (before your attack), you may discard an Ultra Beast card from your hand. If you do, draw 3 cards.'
  );
  const beast = createCard({
    instanceId: 95,
    name: 'Buzzwole',
    hp: 130,
    supertype: 'Pokémon',
    subtypes: ['Ultra Beast'],
  });
  const notBeast = createCard({ instanceId: 94, name: 'Professor Research', supertype: 'Trainer' });
  state.players.p1.zones.hand.push(beast, notBeast);
  for (const id of [96, 97, 98]) state.players.p1.zones.deck.push(createCard({ instanceId: id }));

  const res1 = use70(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice, 'the discard cost opens a picker');
  assert.deepEqual(
    res1.pendingChoice.options.map((c) => c.instanceId),
    [95],
    'only the Ultra Beast is offered'
  );

  const res2 = resolveWith(res1, [95], rng);
  assert.equal(res2.error, null);
  assert.deepEqual(res2.state.players.p1.zones.discard.map((c) => c.instanceId), [95]);
  assert.deepEqual(res2.state.players.p1.zones.hand.map((c) => c.instanceId).sort(), [94, 96, 97, 98]);
  assert.equal(res2.state.players.p1.flags.abilitiesUsed[70], true);
});

test('ability: Ultra Conversion with no Ultra Beast in hand draws nothing and is not spent', () => {
  const { state, rng } = setupGame();
  holderWithAbility(
    state,
    'Once during your turn (before your attack), you may discard an Ultra Beast card from your hand. If you do, draw 3 cards.'
  );
  state.players.p1.zones.hand.push(createCard({ instanceId: 94, name: 'Professor Research', supertype: 'Trainer' }));
  for (const id of [96, 97, 98]) state.players.p1.zones.deck.push(createCard({ instanceId: id }));

  const res = use70(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.deck.length, 3);
  assert.notEqual(res.state.players.p1.flags.abilitiesUsed[70], true);
});
