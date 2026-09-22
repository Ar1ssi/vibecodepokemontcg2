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

const basicMon = (instanceId, name, types) =>
  createCard({ instanceId, name, hp: 60, stage: 'Basic', supertype: 'Pokémon', type: 'Pokémon', types });

test('stadium: Artazon search excludes Rule Box Pokémon', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 58,
    name: 'Artazon',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may search their deck for a Basic Pokémon that doesn't have a Rule Box and put it onto their Bench. Then, that player shuffles their deck.",
  });
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 70, name: 'Charmander ex', hp: 60, stage: 'Basic', supertype: 'Pokémon', subtypes: ['ex'] }),
    basicMon(71, 'Bulbasaur', ['Grass'])
  );

  const res = activate(state, rng);
  assert.ok(res.pendingChoice);
  assert.deepEqual(optionIds(res), [71]);
});

test('stadium: Brooklet Hill search keeps the {W}/{F} type filter', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 59,
    name: 'Brooklet Hill',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may search their deck for a Basic {W} Pokémon or Basic {F} Pokémon, put it onto their Bench, and shuffle their deck.",
  });
  state.players.p1.zones.deck.push(
    basicMon(70, 'Psyduck', ['Water']),
    basicMon(71, 'Machop', ['Fighting']),
    basicMon(72, 'Pikachu', ['Lightning'])
  );

  const res = activate(state, rng);
  assert.ok(res.pendingChoice);
  assert.deepEqual(optionIds(res).sort((a, b) => a - b), [70, 71]);
});

const MT_CORONET_TEXT =
  "Once during each player's turn, that player may put 2 {M} Energy cards from their discard pile into their hand.";

test('stadium: Mt. Coronet recovers 2 {M} Energy from discard to hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 60,
    name: 'Mt. Coronet',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: MT_CORONET_TEXT,
  });
  state.players.p1.zones.discard.push(
    energyCard(90, 'Metal Energy', ['Metal']),
    energyCard(91, 'Water Energy', ['Water']),
    energyCard(92, 'Metal Energy', ['Metal'])
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1).sort((a, b) => a - b), [90, 92]);

  const res2 = resolveChoice(res1, [90, 92], rng);
  assert.equal(res2.pendingChoice, null);
  assert.equal(res2.state.players.p1.zones.hand.length, 2);
  assert.equal(res2.state.players.p1.zones.discard.length, 1);
});

test('stadium: Training Court recovers a basic Energy from discard', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 61,
    name: 'Training Court',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may put a basic Energy card from their discard pile into their hand.",
  });
  state.players.p1.zones.discard.push(
    energyCard(90, 'Water Energy', ['Water']),
    energyCard(91, 'Fire Energy', ['Fire'])
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  const res2 = resolveChoice(res1, [90], rng);
  assert.equal(res2.state.players.p1.zones.hand[0].instanceId, 90);
});

test('stadium: Rose Tower draws until the hand reaches 3', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 62,
    name: 'Rose Tower',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may draw cards until they have 3 cards in their hand.",
  });
  state.players.p1.zones.deck.push(trainerStub(100, 'A'), trainerStub(101, 'B'), trainerStub(102, 'C'), trainerStub(103, 'D'));

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 3);
  assert.equal(res.state.players.p1.zones.deck.length, 1);
});

test('stadium: Tropical Beach draws until the hand reaches 7 and ends the turn', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 63,
    name: 'Tropical Beach',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may draw cards until he or she has 7 cards in his or her hand. If he or she does, that player's turn ends.",
  });
  state.players.p1.zones.deck.push(
    ...[100, 101, 102, 103, 104, 105, 106, 107, 108].map((id) => trainerStub(id, `D${id}`))
  );

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 7);
  assert.equal(res.state.turn.player, 'p2');
});

test('stadium: Jubilife Village shuffles the hand in, draws 5, and ends the turn', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 64,
    name: 'Jubilife Village',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may shuffle their hand into their deck and draw 5 cards. If they do, their turn ends.",
  });
  state.players.p1.zones.hand.push(trainerStub(90, 'H1'), trainerStub(91, 'H2'));
  state.players.p1.zones.deck.push(
    ...[100, 101, 102, 103, 104, 105].map((id) => trainerStub(id, `D${id}`))
  );

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 5);
  // Old hand is back in the deck (8 total − 5 drawn = 3).
  assert.equal(res.state.players.p1.zones.deck.length, 3);
  assert.equal(res.state.turn.player, 'p2');
});

test('stadium: Cycling Road discards exactly 1 Basic Energy (not 2 any cards)', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 65,
    name: 'Cycling Road',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may discard a Basic Energy card from their hand in order to draw a card.",
  });
  state.players.p1.zones.hand.push(
    energyCard(90, 'Water Energy', ['Water']),
    trainerStub(91, 'Ultra Ball')
  );
  state.players.p1.zones.deck.push(trainerStub(100, 'A'));

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  assert.equal(res1.pendingChoice.min, 1);
  assert.equal(res1.pendingChoice.max, 1);
  assert.deepEqual(optionIds(res1), [90]);

  // [Water, Ultra Ball] → discard Water → draw 1 → 2 cards.
  const res2 = resolveChoice(res1, [90], rng);
  assert.equal(res2.state.players.p1.zones.hand.length, 2);
  assert.equal(res2.state.players.p1.zones.hand.some((c) => c.instanceId === 90), false);
});

test('stadium: unmodeled once-per-turn text is a no-op instead of a deck search', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 66,
    name: 'Glimwood Tangle',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again.",
  });
  state.players.p1.zones.deck.push(trainerStub(100, 'A'), trainerStub(101, 'B'));

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
  assert.equal(res.state.players.p1.zones.deck.length, 2);
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn);
});

test('stadium: coin-flip once-per-turn draws only on heads', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 67,
    name: 'Battle City',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may flip a coin. If heads, the player draws a card.",
  });
  state.players.p1.zones.deck.push(trainerStub(100, 'A'));

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  const flip = (res.events || []).find((e) => e.type === 'coinFlipped');
  assert.ok(flip, 'a coin was flipped');
  assert.equal(res.state.players.p1.zones.hand.length, flip.face === 'heads' ? 1 : 0);
  assert.ok(res.state.players.p1.flags.stadiumUsedThisTurn);
});

const itemStub = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', trainerType: 'Item' });

const supporterStub = (instanceId, name) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', trainerType: 'Supporter' });

test('stadium: Pokémon Center heals 20 from a damaged Benched Pokémon', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 68,
    name: 'Pokémon Center',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may heal 20 damage from 1 of his or her Benched Pokémon.",
  });
  const active = basicMon(80, 'Pikachu', ['Lightning']);
  const hurtBench = basicMon(81, 'Raichu', ['Lightning']);
  hurtBench.damage = 50;
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(hurtBench);

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  assert.equal(cardInPlay(res.state, 81)?.damage, 30);
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, true);
});

test('stadium: PokéStop mills 3 and puts the Item cards into hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 69,
    name: 'PokéStop',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may discard 3 cards from the top of their deck. If a player discarded any Item cards in this way, they put those Item cards into their hand.",
  });
  state.players.p1.zones.deck.push(
    itemStub(100, 'Ultra Ball'),
    basicMon(101, 'Bulbasaur', ['Grass']),
    itemStub(102, 'Nest Ball'),
    trainerStub(103, 'Leftover')
  );

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  const p1 = res.state.players.p1;
  assert.equal(p1.zones.hand.length, 2);
  assert.deepEqual(p1.zones.hand.map((c) => c.instanceId).sort((a, b) => a - b), [100, 102]);
  assert.equal(p1.zones.discard.length, 1);
  assert.equal(p1.zones.discard[0].instanceId, 101);
  assert.equal(p1.zones.deck.length, 1);
});

test('stadium: Giant Hearth discards a card then searches up to 2 {R} Energy', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 70,
    name: 'Giant Hearth',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may discard a card from their hand. If they do, that player searches their deck for up to 2 {R} Energy cards, reveals them, and puts them into their hand. Then, that player shuffles their deck.",
  });
  state.players.p1.zones.hand.push(
    trainerStub(90, 'Ultra Ball'),
    energyCard(91, 'Water Energy', ['Water'])
  );
  state.players.p1.zones.deck.push(
    energyCard(110, 'Fire Energy', ['Fire']),
    energyCard(111, 'Water Energy', ['Water'])
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1), [90, 91]);

  const res2 = resolveChoice(res1, [90], rng);
  assert.ok(res2.pendingChoice);
  // Only the Fire Energy is a legal search pick.
  assert.deepEqual(optionIds(res2), [110]);

  const res3 = resolveChoice(res2, [110], rng);
  assert.equal(res3.pendingChoice, null);
  const p1 = res3.state.players.p1;
  assert.ok(p1.zones.hand.some((c) => c.instanceId === 110));
  assert.equal(p1.zones.discard.some((c) => c.instanceId === 90), true);
  assert.equal(p1.zones.deck.some((c) => c.instanceId === 110), false);
});

test('stadium: Giant Hearth is a no-op (and not consumed) with an empty hand', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 71,
    name: 'Giant Hearth',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: "Once during each player's turn, that player may discard a card from their hand. If they do, that player searches their deck for up to 2 {R} Energy cards, reveals them, and puts them into their hand. Then, that player shuffles their deck.",
  });
  state.players.p1.zones.deck.push(energyCard(110, 'Fire Energy', ['Fire']));

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.deck.length, 1);
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn);
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

const stadiumWith = (instanceId, name, text) =>
  createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Stadium'], text });

test('stadium: All-Night Party only fires while the Active is Asleep', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    70,
    'All-Night Party',
    "Once during each player's turn, if that player's Active Pokémon is Asleep, he or she may remove that Special Condition and heal 30 damage from that Pokémon."
  );
  const active = basicMon(80, 'Snorlax', ['Colorless']);
  active.damage = 50;
  state.players.p1.zones.active.push(active);

  // Not Asleep → no-op, not consumed.
  const before = activate(state, rng);
  assert.equal(before.state.players.p1.zones.active[0].damage, 50);
  assert.ok(!before.state.players.p1.flags.stadiumUsedThisTurn);

  // Asleep → cure + heal 30.
  state.players.p1.zones.active[0].specialCondition = 'Asleep';
  const res = activate(state, rng);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
  assert.equal(res.state.players.p1.zones.active[0].specialCondition, null);
});

test('stadium: Champions Festival requires 6 Pokémon in play to heal', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    71,
    'Champions Festival',
    "Once during each player's turn, if that player has 6 Pokémon in play, they may heal 10 damage from each of their Pokémon."
  );
  for (let i = 0; i < 5; i++) {
    const mon = basicMon(80 + i, `Mon${i}`, ['Colorless']);
    mon.damage = 30;
    state.players.p1.zones.bench.push(mon);
  }
  // Only 5 in play → no-op.
  assert.equal(activate(state, rng).state.players.p1.flags.stadiumUsedThisTurn, undefined);

  // 6 in play → heal 10 from each.
  const sixth = basicMon(90, 'Sixth', ['Colorless']);
  sixth.damage = 30;
  state.players.p1.zones.active.push(sixth);
  const res = activate(state, rng);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 20);
});

test('stadium: Ultra Space searches the deck for an Ultra Beast', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    72,
    'Ultra Space',
    "Once during each player's turn, that player may search their deck for an Ultra Beast card, reveal it, put it into their hand, and shuffle their deck."
  );
  const beast = createCard({ instanceId: 100, name: 'Buzzwole', hp: 130, stage: 'Basic', supertype: 'Pokémon', subtypes: ['Ultra Beast'], type: 'Pokémon' });
  state.players.p1.zones.deck.push(beast, basicMon(101, 'Pikachu', ['Lightning']));

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1), [100]);
  const res2 = resolveChoice(res1, [100], rng);
  assert.ok(res2.state.players.p1.zones.hand.some((c) => c.instanceId === 100));
});

test('stadium: Shopping Center returns an attached Tool to hand', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    73,
    'Shopping Center',
    "Once during each player's turn, that player may put a Pokémon Tool attached to 1 of their Pokémon into their hand."
  );
  const active = basicMon(80, 'Pikachu', ['Lightning']);
  state.players.p1.zones.active.push(active);
  const tool = createCard({ instanceId: 90, name: 'Big Charm', supertype: 'Trainer', type: 'Trainer', trainerType: 'Tool' });
  tool.attachedTo = 80;
  state.players.p1.zones.bench.push(tool);
  // The attached tool is not a bench Pokémon.
  state.players.p1.zones.bench = state.players.p1.zones.bench.filter((c) => c.instanceId === 90);

  const res = activate(state, rng);
  assert.ok(res.state.players.p1.zones.hand.some((c) => c.instanceId === 90));
});

test('stadium: Strange Cave puts a fossil Pokémon from hand onto the Bench', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    74,
    'Strange Cave',
    "Once during each player's turn, that player may put an Omanyte, Kabuto, Aerodactyl, Aerodactyl ex, Lileep, or Anorith onto his or her Bench from his or her hand. Treat the new Benched Pokémon as Basic Pokémon."
  );
  const kabuto = createCard({ instanceId: 100, name: 'Kabuto', hp: 60, stage: 'Stage 1', supertype: 'Pokémon', type: 'Pokémon' });
  state.players.p1.zones.hand.push(kabuto);

  const res = activate(state, rng);
  const placed = res.state.players.p1.zones.bench.find((c) => c.instanceId === 100);
  assert.ok(placed);
  assert.equal(placed.stage, 'Basic');
  assert.equal(res.state.players.p1.zones.hand.some((c) => c.instanceId === 100), false);
});

test('stadium: Power Tree is a no-op with Special Energy in the discard', () => {
  const { state, rng } = setupGame();
  const text =
    "Once during each player's turn, if the player has no Special Energy cards in his or her discard pile, that player searches his or her discard pile for a basic Energy card, show it to the opponent, and put it into his or her hand.";
  state.stadium = stadiumWith(75, 'Power Tree', text);
  const dce = createCard({ instanceId: 90, name: 'Double Colorless Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Special'] });
  state.players.p1.zones.discard.push(dce, energyCard(91, 'Fire Energy', ['Fire']));

  assert.equal(activate(state, rng).state.players.p1.flags.stadiumUsedThisTurn, undefined);

  // Remove the Special Energy → recovers the basic Energy.
  state.players.p1.zones.discard = [energyCard(91, 'Fire Energy', ['Fire'])];
  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  const res2 = resolveChoice(res1, [91], rng);
  assert.ok(res2.state.players.p1.zones.hand.some((c) => c.instanceId === 91));
});

test('stadium: Magma Basin attaches a {R} Energy from discard then damages it', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    76,
    'Magma Basin',
    "Once during each player's turn, that player may attach a {R} Energy card from their discard pile to 1 of their Benched {R} Pokémon. If a player attached Energy to a Pokémon in this way, put 2 damage counters on that Pokémon."
  );
  const active = basicMon(80, 'Charmander', ['Fire']);
  const benchFire = basicMon(81, 'Charmeleon', ['Fire']);
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(benchFire);
  state.players.p1.zones.discard.push(energyCard(90, 'Fire Energy', ['Fire']));

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  // Choose the Energy, then the only legal target is auto-selected.
  const res2 = resolveChoice(res1, [90], rng);
  const target = res2.state.players.p1.zones.bench.find((c) => c.instanceId === 81);
  assert.ok(res2.state.players.p1.zones.bench.concat(res2.state.players.p1.zones.discard).some((c) => c.instanceId === 90));
  assert.equal(target.damage, 20);
});

test('stadium: Primordial Altar offers to discard the top card', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    77,
    'Primordial Altar',
    "Once during each player's turn, that player may look at the top card of their deck. They may discard that card."
  );
  state.players.p1.zones.deck.push(trainerStub(100, 'Top'), trainerStub(101, 'Second'));

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1), [100]);
  const res2 = resolveChoice(res1, [100], rng);
  assert.equal(res2.state.players.p1.zones.discard.some((c) => c.instanceId === 100), true);
  assert.equal(res2.state.players.p1.zones.deck.length, 1);
});

test('stadium: Tower of Darkness discards a Single Strike card then draws 2', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    78,
    'Tower of Darkness',
    "Once during each player's turn, that player may draw 2 cards. In order to use this effect, that player must discard a Single Strike card from their hand."
  );
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 90,
      name: 'Single Strike Urshifu V',
      supertype: 'Pokémon',
      type: 'Pokémon',
    }),
    trainerStub(91, "Professor's Research")
  );
  state.players.p1.zones.deck.push(
    trainerStub(100, 'A'),
    trainerStub(101, 'B'),
    trainerStub(102, 'C')
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  // Only the Single Strike card is a legal cost.
  assert.deepEqual(optionIds(res1), [90]);
  const res2 = resolveChoice(res1, [90], rng);
  assert.equal(
    res2.state.players.p1.zones.discard.some((c) => c.instanceId === 90),
    true
  );
  // Started with 2, discarded 1, drew 2 → 3.
  assert.equal(res2.state.players.p1.zones.hand.length, 3);
});

test('stadium: Tower of Darkness is a no-op without a Single Strike card', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    78,
    'Tower of Darkness',
    "Once during each player's turn, that player may draw 2 cards. In order to use this effect, that player must discard a Single Strike card from their hand."
  );
  state.players.p1.zones.hand.push(trainerStub(91, "Professor's Research"));
  state.players.p1.zones.deck.push(trainerStub(100, 'A'), trainerStub(101, 'B'));

  const res = activate(state, rng);
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p1.zones.hand.length, 1);
  assert.equal(res.state.players.p1.zones.deck.length, 2);
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn);
});

test('stadium: Lost World wins with 6 opponent Pokémon in the Lost Zone', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    79,
    'Lost World',
    "Once during each player's turn, if that player's opponent has 6 or more Pokémon in the Lost Zone, the player may choose to win the game."
  );
  for (let i = 0; i < 5; i++) {
    state.players.p2.zones.lostZone.push(basicMon(200 + i, `Lost${i}`, ['Colorless']));
  }
  // Only 5 → condition unmet, no-op.
  const before = activate(state, rng);
  assert.notEqual(before.state.winner, 'p1');
  assert.ok(!before.state.players.p1.flags.stadiumUsedThisTurn);

  state.players.p2.zones.lostZone.push(basicMon(205, 'Lost5', ['Colorless']));
  const res = activate(state, rng);
  assert.equal(res.state.winner, 'p1');
  assert.equal(res.state.turn.phase, 'ended');
});

test('stadium: Ancient Ruins reveals hand and draws only when no Supporter', () => {
  const text =
    "Once during each player's turn, if he or she has not played a Supporter card, that player may reveal his or her hand to his or her opponent. If that player reveals his or her hand and there is no Supporter card there, that player draws a card.";

  // No Supporter in hand → reveal and draw 1.
  {
    const { state, rng } = setupGame();
    state.stadium = stadiumWith(80, 'Ancient Ruins', text);
    state.players.p1.zones.hand.push(trainerStub(90, 'Item'));
    state.players.p1.zones.deck.push(trainerStub(100, 'Top'));
    const res = activate(state, rng);
    assert.equal(res.state.players.p1.zones.hand.length, 2);
    assert.ok(
      (res.events || []).some(
        (e) => e.type === 'cardsRevealed' && e.playerId === 'p1'
      )
    );
  }

  // Supporter in hand → reveal but do not draw.
  {
    const { state, rng } = setupGame();
    state.stadium = stadiumWith(80, 'Ancient Ruins', text);
    state.players.p1.zones.hand.push(
      trainerStub(90, 'Item'),
      supporterStub(92, 'Boss')
    );
    state.players.p1.zones.deck.push(trainerStub(100, 'Top'));
    const res = activate(state, rng);
    assert.equal(res.state.players.p1.zones.hand.length, 2);
  }

  // Supporter already played this turn → whole activation is a no-op.
  {
    const { state, rng } = setupGame();
    state.stadium = stadiumWith(80, 'Ancient Ruins', text);
    state.players.p1.zones.hand.push(trainerStub(90, 'Item'));
    state.players.p1.zones.deck.push(trainerStub(100, 'Top'));
    state.players.p1.flags.supporterPlayed = true;
    const res = activate(state, rng);
    assert.equal(res.state.players.p1.zones.hand.length, 1);
    assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn);
  }
});

test('stadium: Mystery Zone trades a hand Evolution card for a Basic Energy', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    81,
    'Mystery Zone',
    "Once during each player's turn, if that player has an Evolution card in his or her hand, he or she may search his or her deck for a basic Energy card, show it to his or her opponent, and put it into his or her hand. Then that player chooses an Evolution card from his or her hand and puts it into his or her deck. That player shuffles his or her deck afterward."
  );
  state.players.p1.zones.hand.push(stage1Card(90, 'Ivysaur', 'Bulbasaur'), trainerStub(91, 'Item'));
  state.players.p1.zones.deck.push(
    energyCard(100, 'Fire Energy', ['Fire']),
    trainerStub(101, 'Other')
  );

  const res1 = activate(state, rng);
  assert.ok(res1.pendingChoice);
  // Only the Basic Energy is a legal search target.
  assert.deepEqual(optionIds(res1), [100]);
  const res2 = resolveChoice(res1, [100], rng);
  assert.ok(res2.pendingChoice);
  // Only the Evolution card can be put back.
  assert.deepEqual(optionIds(res2), [90]);
  const res3 = resolveChoice(res2, [90], rng);
  assert.ok(res3.state.players.p1.zones.hand.some((c) => c.instanceId === 100));
  assert.equal(
    res3.state.players.p1.zones.deck.some((c) => c.instanceId === 90),
    true
  );
  assert.equal(
    res3.state.players.p1.zones.deck.some((c) => c.instanceId === 100),
    false
  );
});

const GLIMWOOD_TEXT =
  "Once during each player's turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again.";

const coinAttacker = () =>
  createCard({
    instanceId: 80,
    name: 'Toucannon',
    hp: 150,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    attacks: [
      {
        name: 'Beak Blast',
        cost: [],
        damage: 40,
        text: 'Flip a coin. If heads, this attack does 60 more damage.',
      },
    ],
  });

const bigDefender = () =>
  createCard({
    instanceId: 81,
    name: 'Lunatone',
    hp: 400,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });

const seedPrizes = (state) => {
  for (let i = 0; i < 6; i++) {
    state.players.p1.zones.prizes.push(trainerStub(300 + i, 'Prize'));
    state.players.p2.zones.prizes.push(trainerStub(400 + i, 'Prize'));
  }
};

test('stadium: Glimwood Tangle offers a re-flip and "keep" uses the original coins', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(83, 'Glimwood Tangle', GLIMWOOD_TEXT);
  state.players.p1.zones.active.push(coinAttacker());
  state.players.p2.zones.active.push(bigDefender());
  seedPrizes(state);

  const res1 = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(
    res1.pendingChoice.options.map((o) => o.instanceId),
    [1, 2]
  );
  // The offer suspends before any damage is applied.
  assert.equal(res1.state.players.p2.zones.active[0].damage || 0, 0);
  const firstFlip = (res1.events || []).find((e) => e.type === 'attackCoinFlipped');
  assert.ok(firstFlip);

  const res2 = applyCommand(
    res1.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: res1.pendingChoice.choiceId, selection: [1] },
      playerId: 'p1',
    },
    rng
  );
  assert.equal(res2.pendingChoice, null);
  assert.equal(
    res2.state.players.p2.zones.active[0].damage,
    firstFlip.coin === 'heads' ? 100 : 40
  );
  assert.ok((res2.events || []).some((e) => e.type === 'attackExecuted'));
  assert.equal(res2.state.players.p1.flags.glimwoodUsedThisTurn, true);
});

test('stadium: Glimwood Tangle "re-flip" resolves on the new coins', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(84, 'Glimwood Tangle', GLIMWOOD_TEXT);
  state.players.p1.zones.active.push(coinAttacker());
  state.players.p2.zones.active.push(bigDefender());
  seedPrizes(state);

  const res1 = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.ok(res1.pendingChoice);
  const firstFlip = (res1.events || []).find((e) => e.type === 'attackCoinFlipped');

  const res2 = applyCommand(
    res1.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: res1.pendingChoice.choiceId, selection: [2] },
      playerId: 'p1',
    },
    rng
  );
  assert.equal(res2.pendingChoice, null);
  const reflipEvent = (res2.events || []).find(
    (e) => e.type === 'attackCoinFlipped' && e.reflip
  );
  assert.ok(reflipEvent, 'a re-flip event was emitted');
  // The re-flip is a genuinely new roll off the same RNG stream.
  assert.equal(
    res2.state.players.p2.zones.active[0].damage,
    reflipEvent.coin === 'heads' ? 100 : 40
  );
  assert.equal(res2.state.players.p1.flags.glimwoodUsedThisTurn, true);
  assert.ok(firstFlip);
});

test('stadium: Glimwood Tangle does not suspend an attack that flips no coins', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(85, 'Glimwood Tangle', GLIMWOOD_TEXT);
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 80,
      name: 'Pidgeotto',
      hp: 90,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      attacks: [{ name: 'Gust', cost: [], damage: 30 }],
    })
  );
  state.players.p2.zones.active.push(bigDefender());
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.pendingChoice, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 30);
});

test('stadium: Pokémon Park heals 1 counter on Energy attached from hand to Bench', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    82,
    'Pokémon Park',
    "Once during each of his or her turns, whenever a player attaches an Energy card from his or her hand to 1 of his or her Benched Pokémon, he or she removes 1 damage counter, if any, from that Pokémon."
  );
  const active = basicMon(80, 'Pikachu', ['Lightning']);
  const bench = basicMon(81, 'Raichu', ['Lightning']);
  bench.damage = 30;
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(bench);
  state.players.p1.zones.hand.push(energyCard(90, 'Lightning Energy', ['Lightning']));

  const res = applyCommand(
    state,
    { type: 'attachCard', payload: { instanceId: 90, targetInstanceId: 81 }, playerId: 'p1' },
    rng
  );
  const target = res.state.players.p1.zones.bench.find((c) => c.instanceId === 81);
  assert.equal(target.damage, 20);
  assert.ok(
    (res.events || []).some(
      (e) => e.type === 'stadiumTriggered' && e.name === 'Pokémon Park'
    )
  );
});

// ── Continuous passive stadiums ────────────────────────────────────────────

const typedAttacker = (instanceId, name, types, damage) =>
  createCard({
    instanceId,
    name,
    hp: 300,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    types,
    attacks: [{ name: 'Strike', cost: [], damage }],
  });

const typedDefender = (instanceId, name, types, weakness, resistance, hp = 400) =>
  createCard({
    instanceId,
    name,
    hp,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    types,
    weakness,
    resistance,
  });

test('stadium: Altar of the Sunne removes {R}/{M} Weakness', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    86,
    'Altar of the Sunne',
    "{R} Pokémon and {M} Pokémon (both yours and your opponent's) have no Weakness."
  );
  state.players.p1.zones.active.push(typedAttacker(90, 'Flareon', ['Fire'], 50));
  state.players.p2.zones.active.push(
    typedDefender(91, 'Copperajah', ['Metal'], { type: 'Fire', value: 2 })
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
});

test('stadium: Lake Boundary forces Weakness to ×2', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    87,
    'Lake Boundary',
    "Apply Weakness for each Pokémon (both yours and your opponent's) as ×2 instead."
  );
  state.players.p1.zones.active.push(typedAttacker(90, 'Flareon', ['Fire'], 50));
  state.players.p2.zones.active.push(
    typedDefender(91, 'Torterra', ['Grass'], { type: 'Fire', value: 20 })
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.state.players.p2.zones.active[0].damage, 100);
});

test('stadium: Magnetic Storm ignores Resistance for {P}/{F} attackers', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    88,
    'Magnetic Storm',
    "Any damage done by attacks from {P} Pokémon and {F} Pokémon (both yours and your opponent's) is not affected by Resistance."
  );
  state.players.p1.zones.active.push(typedAttacker(90, 'Mewtwo', ['Psychic'], 50));
  state.players.p2.zones.active.push(
    typedDefender(91, 'Machamp', ['Fighting'], null, { type: 'Psychic', value: 30 })
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
});

test("stadium: Drake's Stadium reduces damage to {C} Active by 10", () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    89,
    "Drake's Stadium",
    "Any damage done to {C} Active Pokémon (both yours and your opponent's) by an opponent's attack is reduced by 10 (after applying Weakness and Resistance)."
  );
  state.players.p1.zones.active.push(typedAttacker(90, 'Flareon', ['Fire'], 50));
  state.players.p2.zones.active.push(
    typedDefender(91, 'Snorlax', ['Colorless'], null, null)
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.state.players.p2.zones.active[0].damage, 40);
});

test('stadium: Shrine of Punishment damages every GX/EX between turns', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    90,
    'Shrine of Punishment',
    "Between turns, put 1 damage counter on each Pokémon-GX and Pokémon-EX (both yours and your opponent's)."
  );
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 90,
      name: 'Darkrai-GX',
      hp: 300,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      subtypes: ['GX'],
    })
  );
  state.players.p2.zones.bench.push(
    createCard({
      instanceId: 91,
      name: 'Shaymin-EX',
      hp: 200,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      subtypes: ['EX'],
    })
  );

  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
  assert.equal(res.state.players.p2.zones.bench[0].damage, 10);
});

test('stadium: Cursed Stone damages Pokémon with a Poké-Power between turns', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    91,
    'Cursed Stone',
    'At any time between turns, each player puts 1 damage counter on his or her Pokémon that has a Poké-Power.'
  );
  const powered = createCard({
    instanceId: 90,
    name: 'Gengar',
    hp: 300,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    abilities: [{ type: 'Poké-Power', text: 'Once during your turn, you may...' }],
  });
  const plain = createCard({
    instanceId: 91,
    name: 'Pikachu',
    hp: 300,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });
  state.players.p1.zones.active.push(powered);
  state.players.p1.zones.bench.push(plain);

  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rng
  );
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 0);
});

test('stadium: Desert Ruins damages only high-HP Pokémon-ex between turns', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    92,
    'Desert Ruins',
    'At any time between turns, each player puts 1 damage counter on his or her Pokémon-ex with maximum HP of at least 100.'
  );
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 90,
      name: 'Kyogre-EX',
      hp: 180,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      subtypes: ['EX'],
    })
  );
  state.players.p1.zones.bench.push(
    createCard({
      instanceId: 91,
      name: 'Small-EX',
      hp: 90,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      subtypes: ['EX'],
    })
  );

  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rng
  );
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 0);
});

test('stadium: Lost City sends a Knocked Out Pokémon to the Lost Zone', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    93,
    'Lost City',
    "Whenever a Pokémon (either yours or your opponent's) is Knocked Out, put that Pokémon in the Lost Zone instead of the discard pile. (Discard all attached cards.)"
  );
  state.players.p1.zones.active.push(typedAttacker(90, 'Machamp', ['Fighting'], 300));
  state.players.p2.zones.active.push(
    typedDefender(91, 'Clefairy', ['Colorless'], null, null, 100)
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  assert.ok(
    res.state.players.p2.zones.lostZone.some((c) => c.instanceId === 91),
    'victim is in the Lost Zone'
  );
  assert.equal(
    res.state.players.p2.zones.discard.some((c) => c.instanceId === 91),
    false
  );
});

test('stadium: Dyna Tree Hill blocks attack healing', () => {
  const { state, rng } = setupGame();
  const healer = createCard({
    instanceId: 90,
    name: 'Vileplume',
    hp: 300,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    damage: 50,
    attacks: [
      { name: 'Drain', cost: [], damage: '0', text: 'Heal 30 damage from this Pokémon.' },
    ],
  });
  state.players.p1.zones.active.push(healer);
  state.players.p2.zones.active.push(
    typedDefender(91, 'Snorlax', ['Colorless'], null, null)
  );
  seedPrizes(state);

  // Control: without the Stadium the heal applies.
  const plain = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(plain.state.players.p1.zones.active[0].damage, 20);

  // With Dyna Tree Hill the heal is suppressed.
  state.stadium = stadiumWith(
    94,
    'Dyna Tree Hill',
    "Pokémon (both yours and your opponent's) can't be healed."
  );
  const blocked = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rng
  );
  assert.equal(blocked.state.players.p1.zones.active[0].damage, 50);
});

test('stadium: Sea of Nothingness keeps Special Conditions through evolution', () => {
  const { state, rng } = setupGame();
  state.turn.number = 3;
  state.stadium = stadiumWith(
    95,
    'Sea of Nothingness',
    "Special Conditions are not removed when Pokémon (both yours and your opponent's) evolve or devolve."
  );
  const base = createCard({
    instanceId: 90,
    name: 'Bulbasaur',
    hp: 70,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    specialCondition: 'Asleep',
    enteredPlayTurn: 1,
  });
  state.players.p1.zones.active.push(base);
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 91,
      name: 'Ivysaur',
      hp: 100,
      stage: 'Stage 1',
      evolvesFrom: 'Bulbasaur',
      supertype: 'Pokémon',
      type: 'Pokémon',
    })
  );

  const res = applyCommand(
    state,
    { type: 'attachCard', payload: { instanceId: 91, targetInstanceId: 90 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  const root = res.state.players.p1.zones.active.find((c) => c.instanceId === 90);
  assert.equal(root.specialCondition, 'Asleep');
});

test('stadium: Shrine of Memories lets an evolved Pokémon use a prior Evolution attack', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    96,
    'Shrine of Memories',
    "Each player's evolved Pokémon can use any attack from its previous Evolutions. (That player still needs the necessary Energy to use each attack.)"
  );
  const root = createCard({
    instanceId: 90,
    name: 'Bulbasaur',
    hp: 70,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
    attacks: [{ name: 'Tackle', cost: [], damage: 10 }],
  });
  const evo = createCard({
    instanceId: 91,
    name: 'Ivysaur',
    hp: 100,
    stage: 'Stage 1',
    evolvesFrom: 'Bulbasaur',
    supertype: 'Pokémon',
    type: 'Pokémon',
    attachedTo: 90,
    attacks: [{ name: 'Vine Whip', cost: [], damage: 30 }],
  });
  state.players.p1.zones.active.push(root, evo);
  state.players.p2.zones.active.push(
    typedDefender(92, 'Snorlax', ['Colorless'], null, null, 400)
  );
  seedPrizes(state);

  // Index 1 is the inherited Tackle (printed attacks are only [Vine Whip]).
  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 1 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 10);
});

test("stadium: Rocket's Tricky Gym grants Feint Attack to a qualifying Pokémon", () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    97,
    "Rocket's Tricky Gym",
    "Each Pokémon with Dark or Rocket's in its name (both yours and your opponent's) can use attacks on this card instead of its own. {C} → Feint Attack Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon."
  );
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 90,
      name: 'Darkrai',
      hp: 120,
      stage: 'Basic',
      supertype: 'Pokémon',
      type: 'Pokémon',
      attacks: [{ name: 'Dark Pulse', cost: [], damage: 30 }],
    }),
    createCard({
      instanceId: 95,
      name: 'Colorless Energy',
      supertype: 'Energy',
      type: 'Energy',
      types: ['Colorless'],
      attachedTo: 90,
    })
  );
  state.players.p2.zones.active.push(
    typedDefender(92, 'Snorlax', ['Colorless'], null, null, 400)
  );
  seedPrizes(state);

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 1 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
});

test('stadium: Saffron City Gym returns a Basic Energy from a Sabrina Pokémon', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    98,
    'Saffron City Gym',
    "As often as each player likes during his or her turn (before attacking), that player may return 1 basic Energy card attached to 1 of his or her Pokémon with Sabrina in its name to his or her hand."
  );
  const sabrina = createCard({
    instanceId: 90,
    name: "Sabrina's Alakazam",
    hp: 130,
    stage: 'Stage 1',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });
  const energy = createCard({
    instanceId: 95,
    name: 'Psychic Energy',
    supertype: 'Energy',
    type: 'Energy',
    types: ['Psychic'],
    attachedTo: 90,
  });
  state.players.p1.zones.active.push(sabrina, energy);

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);
  assert.deepEqual(optionIds(res1), [95]);

  const res2 = resolveChoice(res1, [95], rng);
  assert.equal(res2.error, null);
  assert.equal(res2.state.players.p1.zones.hand.some((c) => c.instanceId === 95), true);
});

test('stadium: Celadon City Gym discards an Energy to cure an Erika Pokémon', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    99,
    'Celadon City Gym',
    "During each player's turn, that player may choose to discard an Energy card attached to 1 of his or her Pokémon with Erika in its name. If that player does so, that Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned."
  );
  const erika = createCard({
    instanceId: 90,
    name: "Erika's Vileplume",
    hp: 120,
    stage: 'Stage 1',
    supertype: 'Pokémon',
    type: 'Pokémon',
    specialCondition: 'Asleep',
  });
  const energy = createCard({
    instanceId: 95,
    name: 'Grass Energy',
    supertype: 'Energy',
    type: 'Energy',
    types: ['Grass'],
    attachedTo: 90,
  });
  state.players.p1.zones.active.push(erika, energy);

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);

  const res2 = resolveChoice(res1, [95], rng);
  assert.equal(res2.error, null);
  const root = res2.state.players.p1.zones.active.find((c) => c.instanceId === 90);
  assert.equal(root.specialCondition, null);
  assert.equal(res2.state.players.p1.zones.discard.some((c) => c.instanceId === 95), true);
});

test('stadium: Ultimate Zone moves Bench Energy to Active Arceus', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    100,
    'Ultimate Zone',
    "During each player's turn, the player may move an Energy card attached to 1 of his or her Benched Pokémon to his or her Active Arceus as often as he or she likes."
  );
  const arceus = createCard({
    instanceId: 90,
    name: 'Arceus',
    hp: 120,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });
  const bench = createCard({
    instanceId: 91,
    name: 'Pikachu',
    hp: 60,
    stage: 'Basic',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });
  const energy = createCard({
    instanceId: 95,
    name: 'Water Energy',
    supertype: 'Energy',
    type: 'Energy',
    types: ['Water'],
    attachedTo: 91,
  });
  state.players.p1.zones.active.push(arceus);
  state.players.p1.zones.bench.push(bench, energy);

  const res1 = activate(state, rng);
  assert.equal(res1.error, null);
  assert.ok(res1.pendingChoice);

  const res2 = resolveChoice(res1, [95], rng);
  assert.equal(res2.error, null);
  const moved = res2.state.players.p1.zones.active.find((c) => c.instanceId === 95);
  assert.ok(moved, 'energy is now in the active zone');
  assert.equal(moved.attachedTo, 90);
});

test('stadium: unlimited "as often as" actions repeat without spending the once-per-turn flag', () => {
  const { state, rng } = setupGame();
  state.stadium = stadiumWith(
    98,
    'Saffron City Gym',
    "As often as each player likes during his or her turn (before attacking), that player may return 1 basic Energy card attached to 1 of his or her Pokémon with Sabrina in its name to his or her hand."
  );
  const sabrina = createCard({
    instanceId: 90,
    name: "Sabrina's Alakazam",
    hp: 130,
    stage: 'Stage 1',
    supertype: 'Pokémon',
    type: 'Pokémon',
  });
  const e1 = createCard({
    instanceId: 95,
    name: 'Psychic Energy',
    supertype: 'Energy',
    type: 'Energy',
    types: ['Psychic'],
    attachedTo: 90,
  });
  const e2 = createCard({
    instanceId: 96,
    name: 'Psychic Energy',
    supertype: 'Energy',
    type: 'Energy',
    types: ['Psychic'],
    attachedTo: 90,
  });
  state.players.p1.zones.active.push(sabrina, e1, e2);

  const r1 = activate(state, rng);
  const r2 = resolveChoice(r1, [95], rng);
  assert.equal(r2.error, null);
  assert.equal(r2.state.players.p1.flags.stadiumUsedThisTurn, undefined);

  const r3 = activate(r2.state, rng);
  assert.equal(r3.error, null, 'a repeat activation is allowed');
  assert.ok(r3.pendingChoice);
  assert.deepEqual(optionIds(r3), [96]);
  const r4 = resolveChoice(r3, [96], rng);
  assert.equal(r4.error, null);
  assert.equal(
    r4.state.players.p1.zones.hand.filter((c) => c.instanceId === 95 || c.instanceId === 96).length,
    2
  );
});

const PRISM_TOWER_TEXT =
  "Once during each player's turn, that player may discard 2 cards from their hand in order to draw a card.";

test('stadium: Prism Tower (discard 2) is a no-op with fewer than 2 cards in hand, never a soft-lock', () => {
  const { state, rng } = setupGame();
  state.stadium = createCard({
    instanceId: 58,
    name: 'Prism Tower',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: PRISM_TOWER_TEXT,
  });
  state.players.p1.zones.hand.push(trainerStub(90, 'Only Card'));
  state.players.p1.zones.deck.push(trainerStub(100, 'D1'), trainerStub(101, 'D2'));

  const res = activate(state, rng);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'must not open an unsatisfiable discard choice');
  assert.equal(res.state.players.p1.zones.hand.length, 1, 'no card was discarded');
  assert.equal(res.state.players.p1.zones.deck.length, 2, 'no card was drawn');
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn, 'activation not consumed');

  // The same activation succeeds once the hand can pay the cost.
  res.state.players.p1.zones.hand.push(trainerStub(91, 'Second Card'));
  const res2 = activate(res.state, rng);
  assert.ok(res2.pendingChoice);
  assert.deepEqual(optionIds(res2).sort((a, b) => a - b), [90, 91]);
  const res3 = resolveChoice(res2, [90, 91], rng);
  assert.equal(res3.error, null);
  assert.equal(res3.pendingChoice, null);
  assert.equal(res3.state.players.p1.zones.deck.length, 1);
  assert.equal(res3.state.players.p1.flags.stadiumUsedThisTurn, true);
});
