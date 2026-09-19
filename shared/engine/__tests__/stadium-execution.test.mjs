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
