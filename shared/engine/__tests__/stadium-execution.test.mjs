import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'stadium-test', seed: 42, rulesEnabled: true });
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
  return { state, rng };
}

test('stadium: activating stadium effect draws cards and tracks once-per-turn limit', () => {
  const { state, rng } = setupGame();
  const stadium = createCard({
    instanceId: 50,
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Once during each player’s turn, that player may search their deck for a Basic Pokémon that doesn’t have a Rule Box and put it onto their Bench. Then, that player shuffles their deck.',
  });
  state.stadium = stadium;

  // Deck has basic pokemon without rule box
  const mon = createCard({
    instanceId: 70,
    name: 'Charmander',
    hp: 70,
    stage: 'Basic',
    supertype: 'Pokémon',
  });
  state.players.p1.zones.deck.push(mon);

  // Activate stadium
  const res1 = applyCommand(state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.player, 'p1');
  assert.equal(res1.pendingChoice.options.length, 1);
  assert.equal(res1.pendingChoice.options[0].instanceId, 70);

  // Resolve choice
  const res2 = applyCommand(res1.state, {
    type: 'resolveChoice',
    payload: { choiceId: res1.pendingChoice.choiceId, selection: [70] },
    playerId: 'p1',
  }, rng);

  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.bench.length, 1);
  assert.equal(res2.state.players.p1.zones.bench[0].instanceId, 70);
  assert.equal(res2.state.players.p1.flags.stadiumUsedThisTurn, true);

  // Second activation in same turn rejected
  const res3 = applyCommand(res2.state, {
    type: 'stadium-effect',
    payload: {},
    playerId: 'p1',
  }, rng);

  assert.equal(res3.error, 'Stadium effect already used this turn.');
});

const energyCard = (instanceId, name, types) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', types });

const SCORCHED_EARTH_TEXT =
  "Once during each player's turn, that player may discard a Fire or Fighting Energy card from his or her hand. If that player does so, he or she draws 2 cards.";

const trainerStub = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer' });

test('stadium: Scorched Earth discards a Fire/Fighting Energy from hand then draws 2', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 54,
    name: 'Scorched Earth',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: SCORCHED_EARTH_TEXT,
  });
  state.players.p1.zones.hand.push(
    energyCard(90, 'Fire Energy', ['Fire']),
    energyCard(91, 'Fighting Energy', ['Fighting']),
    energyCard(92, 'Water Energy', ['Water']),
    trainerStub(93, "Professor's Research")
  );
  state.players.p1.zones.deck.push(trainerStub(100, 'Card A'), trainerStub(101, 'Card B'));

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  // Only the Fire/Fighting Energy are legal discard choices.
  assert.deepEqual(optionIds(res1).sort((a, b) => a - b), [90, 91]);

  const res2 = resolveChoice(res1, [91], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  const p1 = res2.state.players.p1;
  assert.equal(p1.zones.discard.length, 1);
  assert.equal(p1.zones.discard[0].instanceId, 91);
  assert.equal(p1.zones.hand.length, 5);
  assert.equal(p1.zones.deck.length, 0);
  assert.equal(p1.flags.stadiumUsedThisTurn, true);
});

test('stadium: Scorched Earth is a no-op (and not consumed) with no Fire/Fighting Energy in hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 55,
    name: 'Scorched Earth',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: SCORCHED_EARTH_TEXT,
  });
  state.players.p1.zones.hand.push(
    energyCard(92, 'Water Energy', ['Water']),
    trainerStub(93, "Professor's Research")
  );
  state.players.p1.zones.deck.push(trainerStub(100, 'Card A'), trainerStub(101, 'Card B'));

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 2);
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn);
});

const MYSTERY_GARDEN_TEXT =
  "Once during each player's turn, that player may discard an Energy card from their hand in order to draw cards until they have as many cards in their hand as they have {P} Pokémon in play.";

test('stadium: Mystery Garden discards an Energy then draws until hand size equals {P} Pokémon in play', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 56,
    name: 'Mystery Garden',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: MYSTERY_GARDEN_TEXT,
  });
  const mon = (instanceId, name, types) =>
    createCard({ instanceId, name, hp: 100, stage: 'Basic', supertype: 'Pokémon', types });
  state.players.p1.zones.active.push(mon(80, 'Mewtwo', ['Psychic']));
  state.players.p1.zones.bench.push(mon(81, 'Ralts', ['Psychic']));
  state.players.p1.zones.hand.push(
    energyCard(90, 'Psychic Energy', ['Psychic']),
    trainerStub(91, 'Card X')
  );
  state.players.p1.zones.deck.push(
    trainerStub(100, 'D1'),
    trainerStub(101, 'D2'),
    trainerStub(102, 'D3')
  );

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  // Only the Energy may pay the cost — the trainer in hand is not a legal pick.
  assert.deepEqual(optionIds(res1), [90]);

  const res2 = resolveChoice(res1, [90], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  const p1 = res2.state.players.p1;
  assert.equal(p1.zones.discard.length, 1);
  // hand was [Energy, trainer] → discard Energy → 1 card; target = 2 psychic
  // Pokémon in play → draw 1 more.
  assert.equal(p1.zones.hand.length, 2);
  assert.equal(p1.zones.deck.length, 2);
  assert.equal(p1.flags.stadiumUsedThisTurn, true);
});

const LEVINCIA_TEXT =
  "Once during each player's turn, that player may put up to 2 Basic {L} Energy cards from their discard pile into their hand.";

test('stadium: Levincia recovers up to 2 Basic {L} Energy from discard to hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 57,
    name: 'Levincia',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: LEVINCIA_TEXT,
  });
  state.players.p1.zones.discard.push(
    energyCard(90, 'Lightning Energy', ['Lightning']),
    energyCard(91, 'Water Energy', ['Water']),
    energyCard(92, 'Lightning Energy', ['Lightning'])
  );

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1).sort((a, b) => a - b), [90, 92]);

  const res2 = resolveChoice(res1, [90, 92], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  const p1 = res2.state.players.p1;
  assert.equal(p1.zones.hand.length, 2);
  assert.equal(p1.zones.discard.length, 1);
  assert.equal(p1.zones.discard[0].instanceId, 91);
  assert.equal(p1.flags.stadiumUsedThisTurn, true);
});

const FOSSIL_QUARRY_TEXT =
  'Once during each player\'s turn, that player may search their deck for up to 2 Item cards that have "Antique" in their name and put them onto their Bench. Then, that player shuffles their deck.';

test('stadium: Fossil Quarry searches "Antique" Items onto the Bench, not to hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 58,
    name: 'Fossil Quarry',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: FOSSIL_QUARRY_TEXT,
  });
  const item = (instanceId, name) =>
    createCard({
      instanceId,
      name,
      supertype: 'Trainer',
      type: 'Trainer',
      trainerType: 'Item',
      subtypes: ['Item'],
    });
  state.players.p1.zones.deck.push(
    item(90, 'Antique Cover Fossil'),
    item(91, 'Antique Root Fossil'),
    item(92, 'Nest Ball')
  );

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1).sort((a, b) => a - b), [90, 91]);

  const res2 = resolveChoice(res1, [90, 91], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  const p1 = res2.state.players.p1;
  assert.equal(p1.zones.bench.length, 2);
  assert.equal(p1.zones.hand.length, 0);
  assert.equal(p1.zones.deck.length, 1);
  assert.equal(p1.flags.stadiumUsedThisTurn, true);
});

const LUMIOSE_CITY_TEXT =
  "Once during each player's turn, that player may search their deck for a Basic Pokémon and put it onto their Bench. Then, that player shuffles their deck. If a player searches their deck in this way, their turn ends.";

test('stadium: Lumiose City searches a Basic to the Bench then ends the turn', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 59,
    name: 'Lumiose City',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: LUMIOSE_CITY_TEXT,
  });
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 70, name: 'Charmander', hp: 70, stage: 'Basic', supertype: 'Pokémon' })
  );
  // The incoming player must be able to draw at start of turn.
  state.players.p2.zones.deck.push(trainerStub(200, 'P2 card'));

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.state.turn.player, 'p1');

  const res2 = resolveChoice(res1, [70], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.bench.length, 1);
  assert.equal(res2.state.turn.player, 'p2');
});

test('stadium: Lumiose City declining the search does not end the turn', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 60,
    name: 'Lumiose City',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: LUMIOSE_CITY_TEXT,
  });
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 70, name: 'Charmander', hp: 70, stage: 'Basic', supertype: 'Pokémon' })
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  const res2 = resolveChoice(res1, [], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.bench.length, 0);
  assert.equal(res2.state.turn.player, 'p1');
});

const ROUGH_SEAS_TEXT =
  "Once during each player's turn, that player may heal 30 damage from each of their Water Pokémon and Lightning Pokémon.";

test('stadium: Rough Seas heals 30 from each Water/Lightning Pokémon (Active and Bench) and leaves other types', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 52,
    name: 'Rough Seas',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: ROUGH_SEAS_TEXT,
  });
  const mk = (instanceId, name, types, damage) =>
    createCard({ instanceId, name, hp: 120, stage: 'Basic', supertype: 'Pokémon', types, damage });
  state.players.p1.zones.active.push(mk(80, 'Blastoise', ['Water'], 50));
  state.players.p1.zones.bench.push(
    mk(81, 'Pikachu', ['Lightning'], 20),
    mk(82, 'Charmander', ['Fire'], 40),
    mk(83, 'Squirtle', ['Water'], 0)
  );

  const res = activate(state, rng);

  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(cardInPlay(res.state, 80).damage, 20);
  assert.equal(cardInPlay(res.state, 81).damage, 0);
  assert.equal(cardInPlay(res.state, 82).damage, 40);
  assert.equal(cardInPlay(res.state, 83).damage, 0);
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, true);
});

const GRAND_TREE_TEXT =
  "Once during each player's turn, that player may search their deck for a Stage 1 Pokémon that evolves from 1 of their Pokémon in play and put it onto that Pokémon to evolve it. If that Pokémon evolved during this turn, that player may search their deck for a Stage 2 Pokémon that evolves from that Pokémon and put it onto that Pokémon to evolve it. Then, that player shuffles their deck.";

function grandTreeGame({ hosts = ['Charmander'], deck = [] } = {}) {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 51,
    name: 'Grand Tree',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: GRAND_TREE_TEXT,
  });
  hosts.forEach((name, i) => {
    const host = createCard({
      instanceId: 60 + i,
      name,
      hp: 60,
      stage: 'Basic',
      supertype: 'Pokémon',
    });
    (i === 0 ? state.players.p1.zones.active : state.players.p1.zones.bench).push(host);
  });
  state.players.p1.zones.deck.push(...deck);
  return { state, rng };
}

const activate = (state, rng) =>
  applyCommand(state, { type: 'stadium-effect', payload: {}, playerId: 'p1' }, rng);

const resolveChoice = (res, selection, rng) =>
  applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: res.pendingChoice.choiceId, selection },
      playerId: 'p1',
    },
    rng
  );

const inPlay = (state) => [...state.players.p1.zones.active, ...state.players.p1.zones.bench];
const cardInPlay = (state, instanceId) => inPlay(state).find((c) => c.instanceId === instanceId);
const shuffleCount = (res) => (res.events || []).filter((e) => e.type === 'deckShuffled').length;
const optionIds = (res) => res.pendingChoice.options.map((o) => o.instanceId);

const stage1Card = (instanceId, name, evolvesFrom) =>
  createCard({ instanceId, name, hp: 90, stage: 'Stage 1', supertype: 'Pokémon', evolvesFrom });
const stage2Card = (instanceId, name, evolvesFrom) =>
  createCard({ instanceId, name, hp: 150, stage: 'Stage 2', supertype: 'Pokémon', evolvesFrom });

test('stadium: Grand Tree evolves a Stage 1 from the deck onto its Pokémon in play, then chains the Stage 2', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const charizard = stage2Card(72, 'Charizard', 'Charmeleon');
  const { state, rng } = grandTreeGame({ deck: [charmeleon, charizard] });

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.deepEqual(optionIds(res1), [71]);

  const res2 = resolveChoice(res1, [71], rng);
  assert.equal(res2.error, null);
  // Chained Stage 2 offered, and the Stage 1 is already attached to the host.
  assert.ok(res2.pendingChoice);
  assert.deepEqual(optionIds(res2), [72]);
  assert.equal(cardInPlay(res2.state, 71).attachedTo, 60);
  assert.equal(res2.state.players.p1.zones.hand.length, 0);

  const res3 = resolveChoice(res2, [72], rng);
  assert.equal(res3.error, null);
  assert.equal(res3.pendingChoice, null);
  assert.equal(cardInPlay(res3.state, 72).attachedTo, 60);
  assert.equal(res3.state.players.p1.zones.deck.length, 0);
  assert.equal(res3.state.players.p1.flags.stadiumUsedThisTurn, true);
  // One shuffle for the whole activation, not one per evolve step.
  assert.equal(shuffleCount(res1) + shuffleCount(res2) + shuffleCount(res3), 1);
});

test('stadium: Grand Tree with no matching Evolution card in the deck completes without a choice', () => {
  const unrelated = stage1Card(73, 'Lucario', 'Riolu');
  const { state, rng } = grandTreeGame({ deck: [unrelated] });

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(cardInPlay(res.state, 73), undefined);
  assert.equal(res.state.players.p1.zones.deck.length, 1);
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, true);
  assert.equal(shuffleCount(res), 1);
});

test('stadium: Grand Tree with an empty deck completes without a choice', () => {
  const { state, rng } = grandTreeGame({ deck: [] });

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, true);
});

test('stadium: Grand Tree declined at the first pick evolves nothing and still consumes the activation', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const { state, rng } = grandTreeGame({ deck: [charmeleon] });

  const res1 = activate(state, rng);
  const res2 = resolveChoice(res1, [], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(cardInPlay(res2.state, 71), undefined);
  assert.equal(res2.state.players.p1.zones.deck.length, 1);
  assert.equal(shuffleCount(res1) + shuffleCount(res2), 1);

  const res3 = activate(res2.state, rng);
  assert.equal(res3.error, 'Stadium effect already used this turn.');
});

test('stadium: Grand Tree declined at the Stage 2 pick keeps the Stage 1 evolution', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const charizard = stage2Card(72, 'Charizard', 'Charmeleon');
  const { state, rng } = grandTreeGame({ deck: [charmeleon, charizard] });

  const res2 = resolveChoice(activate(state, rng), [71], rng);
  const res3 = resolveChoice(res2, [], rng);
  assert.equal(res3.error, null);
  assert.equal(res3.pendingChoice, null);
  assert.equal(cardInPlay(res3.state, 71).attachedTo, 60);
  assert.equal(cardInPlay(res3.state, 72), undefined);
  assert.equal(res3.state.players.p1.zones.deck.length, 1);
});

test('stadium: Grand Tree offers no Stage 2 whose evolvesFrom names a different Pokémon', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const gardevoir = stage2Card(74, 'Gardevoir', 'Kirlia');
  const { state, rng } = grandTreeGame({ deck: [charmeleon, gardevoir] });

  const res2 = resolveChoice(activate(state, rng), [71], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.pendingChoice, null);
  assert.equal(cardInPlay(res2.state, 71).attachedTo, 60);
  assert.equal(res2.state.players.p1.zones.deck.length, 1);
});

test('stadium: Grand Tree asks which Pokémon to evolve when two hosts match, then chains from that host', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const charizard = stage2Card(72, 'Charizard', 'Charmeleon');
  const { state, rng } = grandTreeGame({
    hosts: ['Charmander', 'Charmander'],
    deck: [charmeleon, charizard],
  });

  const res2 = resolveChoice(activate(state, rng), [71], rng);
  assert.deepEqual(optionIds(res2), [60, 61]);

  // Pick the benched Charmander as the host.
  const res3 = resolveChoice(res2, [61], rng);
  assert.deepEqual(optionIds(res3), [72]);
  assert.equal(cardInPlay(res3.state, 71).attachedTo, 61);

  const res4 = resolveChoice(res3, [72], rng);
  assert.equal(res4.pendingChoice, null);
  assert.equal(cardInPlay(res4.state, 72).attachedTo, 61);
});

test('stadium: Grand Tree keeps the Stage 2 choice pending across a suspension and resumes it', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const charizard = stage2Card(72, 'Charizard', 'Charmeleon');
  const { state, rng } = grandTreeGame({ deck: [charmeleon, charizard] });

  const res2 = resolveChoice(activate(state, rng), [71], rng);
  // The suspended choice survives on the state, as a reconnecting client would find it.
  assert.equal(res2.state.pendingChoice.choiceId, res2.pendingChoice.choiceId);

  const resumed = applyCommand(
    JSON.parse(JSON.stringify(res2.state)),
    {
      type: 'resolveChoice',
      payload: { choiceId: res2.pendingChoice.choiceId, selection: [72] },
      playerId: 'p1',
    },
    rng
  );
  assert.equal(resumed.error, null);
  assert.equal(resumed.pendingChoice, null);
  assert.equal(cardInPlay(resumed.state, 72).attachedTo, 60);
});

test('stadium: Grand Tree given a Stage 2 selection no longer in the deck evolves nothing further', () => {
  const charmeleon = stage1Card(71, 'Charmeleon', 'Charmander');
  const charizard = stage2Card(72, 'Charizard', 'Charmeleon');
  const { state, rng } = grandTreeGame({ deck: [charmeleon, charizard] });

  const res2 = resolveChoice(activate(state, rng), [71], rng);
  const stale = JSON.parse(JSON.stringify(res2.state));
  const deck = stale.players.p1.zones.deck;
  const [removed] = deck.splice(deck.findIndex((c) => c.instanceId === 72), 1);
  stale.players.p1.zones.discard.push(removed);

  const res3 = applyCommand(
    stale,
    {
      type: 'resolveChoice',
      payload: { choiceId: res2.pendingChoice.choiceId, selection: [72] },
      playerId: 'p1',
    },
    rng
  );
  assert.equal(res3.pendingChoice, null);
  assert.equal(cardInPlay(res3.state, 72), undefined);
  assert.equal(cardInPlay(res3.state, 71).attachedTo, 60);
});
