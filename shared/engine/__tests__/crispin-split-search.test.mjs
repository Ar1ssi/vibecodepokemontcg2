import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

// Crispin, Prismatic Evolutions 171 (out/pkmn-trainer-cards.json).
const CRISPIN =
  'Search your deck for up to 2 Basic Energy cards of different types, reveal them, and put 1 of them into your hand. Attach the other to 1 of your Pokémon. Then, shuffle your deck.';

const mon = (instanceId, name) => ({ instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', types: ['Colorless'] });
const basicEnergy = (instanceId, name) => ({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'] });

const DECK = () => [
  basicEnergy(1, 'Basic Fire Energy'),
  basicEnergy(2, 'Basic Water Energy'),
  basicEnergy(3, 'Basic Fire Energy'),
  mon(4, 'Pikachu'),
];

function setup({ deck = DECK(), bench = [mon(701, 'Eevee')] } = {}) {
  const state = createGameState({ gameId: 'crispin', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  const card = createCard({ instanceId: 900, name: 'Crispin', supertype: 'Trainer', type: 'Supporter', text: CRISPIN });
  const zones = state.players.p1.zones;
  zones.hand.push(card);
  zones.deck.push(...deck.map((c) => createCard(c)));
  zones.active.push(createCard(mon(700, 'Terapagos')));
  zones.bench.push(...bench.map((c) => createCard(c)));
  return { state, card, rng: createRng(1) };
}

// Answers each prompt in turn; returns every prompt shown and the final result.
function play({ state, card, rng }, answers) {
  const events = [];
  const prompts = [];
  let res = executeTrainer(state, { card, playerId: 'p1', activeRng: rng, events });
  for (const answer of answers) {
    assert.ok(res.pendingChoice, `expected a prompt before answer ${JSON.stringify(answer)}`);
    prompts.push(res.pendingChoice);
    res = executeTrainer(state, {
      card,
      playerId: 'p1',
      activeRng: rng,
      events,
      selection: answer,
      resumeToken: res.pendingChoice.resumeToken,
    });
  }
  return { res, prompts, events, zones: state.players.p1.zones };
}

const names = (cards) => cards.map((c) => c.name);
const attachedTo = (zones, rootId) => names([...zones.active, ...zones.bench].filter((c) => c.attachedTo === rootId));

test('Crispin parses as a split search: 1 to hand, the other attached', () => {
  assert.deepEqual(parseTrainerEffect(CRISPIN).steps, [
    { type: 'searchDeck', what: 'Basic Energy', count: 2, destination: 'hand', upTo: true, reveal: true, distinctTypes: true, attachRest: true },
  ]);
});

test('Crispin: 2 picks ask which goes to the hand, then which Pokémon gets the other', () => {
  const { res, prompts, events, zones } = play(setup(), [[1, 2], [2], [701]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(prompts.length, 3);
  assert.deepEqual(names(prompts[0].options), ['Basic Fire Energy', 'Basic Water Energy', 'Basic Fire Energy']);
  assert.match(prompts[1].prompt, /put into your hand/);
  assert.deepEqual(names(prompts[1].options), ['Basic Fire Energy', 'Basic Water Energy']);
  assert.deepEqual(names(prompts[2].options), ['Terapagos', 'Eevee']);
  assert.deepEqual(names(zones.hand), ['Basic Water Energy']);
  assert.deepEqual(attachedTo(zones, 701), ['Basic Fire Energy']);
  assert.deepEqual(attachedTo(zones, 700), []);
  assert.deepEqual(names(zones.deck).sort(), ['Basic Fire Energy', 'Pikachu']);
  const revealed = events.find((e) => e.type === 'cardsRevealed');
  assert.deepEqual(names(revealed.cards), ['Basic Fire Energy', 'Basic Water Energy']);
  assert.equal(events.filter((e) => e.type === 'deckShuffled').length, 1);
});

test('Crispin: with one Pokémon in play the other Energy attaches without a target prompt', () => {
  const { res, prompts, zones } = play(setup({ bench: [] }), [[1, 2], [1]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(prompts.length, 2);
  assert.deepEqual(names(zones.hand), ['Basic Fire Energy']);
  assert.deepEqual(attachedTo(zones, 700), ['Basic Water Energy']);
});

test('Crispin: a single pick goes to the hand and nothing is attached', () => {
  const { res, prompts, zones } = play(setup(), [[2]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(prompts.length, 1);
  assert.deepEqual(names(zones.hand), ['Basic Water Energy']);
  assert.deepEqual(attachedTo(zones, 700).concat(attachedTo(zones, 701)), []);
});

test('Crispin: Energy whose type cannot be read is not treated as a duplicate', () => {
  const deck = [basicEnergy(1, 'Mystery Energy A'), basicEnergy(2, 'Mystery Energy B')];
  const { res, zones } = play(setup({ deck, bench: [] }), [[1, 2], [1]]);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(names(zones.hand), ['Mystery Energy A']);
  assert.deepEqual(attachedTo(zones, 700), ['Mystery Energy B']);
});

test('Crispin: two Energy of the same type keep only the first', () => {
  const { res, prompts, zones } = play(setup(), [[1, 3]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(prompts.length, 1);
  assert.deepEqual(names(zones.hand), ['Basic Fire Energy']);
  assert.deepEqual(attachedTo(zones, 700).concat(attachedTo(zones, 701)), []);
});
