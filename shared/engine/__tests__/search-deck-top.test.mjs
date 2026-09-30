import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { parseTrainerEffect, describeStep } from '../rules/trainer-effects.mjs';
import { classifyTrainer } from '../../../scripts/lib/trainer-behaviour.mjs';

// Design 059 slice 3 (search N, shuffle, put them on top in any order). Texts are rows of
// out/pkmn-trainer-cards.json.
const TEXTS = {
  // Guardians Rising 145, Prismatic Evolutions 104, Temporal Forces 145/198
  then: 'Search your deck for 2 cards, shuffle your deck, then put those cards on top of it in any order.',
  // Guardians Rising 127
  and: 'Search your deck for 2 cards, shuffle your deck, and put those cards on top of your deck in any order.',
  // BREAKthrough 147
  reservedTicket: 'Flip a coin. If heads, search your deck for a card, shuffle your deck, then put that card on top of it.',
};

const mon = (instanceId, name) => ({ instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', types: ['Colorless'] });

function setup(text, { deck } = {}) {
  const state = createGameState({ gameId: 'deck-top', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const card = createCard({ instanceId: 900, name: 'Test Card', supertype: 'Trainer', type: 'Supporter', text });
  state.players.p1.zones.hand.push(card);
  state.players.p1.zones.deck.push(...deck.map((c) => createCard(c)));
  return { state, card, rng: createRng(1) };
}

function play({ state, card, rng }, answers) {
  const events = [];
  const prompts = [];
  let res = executeTrainer(state, { card, playerId: 'p1', activeRng: rng, events });
  for (const answer of answers) {
    assert.ok(res.pendingChoice, 'expected a prompt');
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

const deckOf = () => [mon(1, 'Aron'), mon(2, 'Bidoof'), mon(3, 'Cleffa'), mon(4, 'Drowzee'), mon(5, 'Eevee')];
const names = (cards) => cards.map((c) => c.name);

test('both printed wordings parse to a deckTop search of 2 cards', () => {
  for (const key of ['then', 'and']) {
    const parsed = parseTrainerEffect(TEXTS[key]);
    assert.equal(parsed.recognizable, true, key);
    assert.deepEqual(parsed.steps, [{ type: 'searchDeck', what: 'card', count: 2, destination: 'deckTop' }], key);
    assert.equal(classifyTrainer({ name: key, text: TEXTS[key] }).gaps.length, 0, key);
  }
  assert.match(describeStep(parseTrainerEffect(TEXTS.then).steps[0]), /on top of your deck in any order/);
});

test('Reserved Ticket keeps its coin flip and puts the one card on top', () => {
  const [flip] = parseTrainerEffect(TEXTS.reservedTicket).steps;
  assert.equal(flip.type, 'coinFlip');
  assert.equal(flip.heads.destination, 'deckTop');
});

test('two picks return on top; a second prompt sets which one is first', () => {
  const env = setup(TEXTS.then, { deck: deckOf() });
  const { res, prompts, zones } = play(env, [[4, 2], [4]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].prompt, /1st from the top of your deck/);
  assert.deepEqual(prompts[1].options.map((o) => o.name).sort(), ['Bidoof', 'Drowzee']);
  assert.deepEqual(names(zones.deck.slice(0, 2)), ['Drowzee', 'Bidoof']);
  assert.equal(zones.deck.length, 5);
  assert.equal(names(zones.hand).includes('Drowzee'), false);
});

test('the order prompt can put the first pick second', () => {
  const env = setup(TEXTS.and, { deck: deckOf() });
  const { zones } = play(env, [[4, 2], [2]]);
  assert.deepEqual(names(zones.deck.slice(0, 2)), ['Bidoof', 'Drowzee']);
});

test('picking one card, or none, needs no order prompt and still shuffles', () => {
  const one = play(setup(TEXTS.then, { deck: deckOf() }), [[3]]);
  assert.equal(one.res.pendingChoice, null);
  assert.equal(one.zones.deck[0].name, 'Cleffa');
  assert.ok(one.events.some((e) => e.type === 'deckShuffled'));
  const none = play(setup(TEXTS.then, { deck: deckOf() }), [[]]);
  assert.equal(none.res.pendingChoice, null);
  assert.equal(none.zones.deck.length, 5);
});

test('ids that are not in the deck are ignored', () => {
  const { zones } = play(setup(TEXTS.then, { deck: deckOf() }), [[4, 999]]);
  assert.equal(zones.deck[0].name, 'Drowzee');
  assert.equal(zones.deck.length, 5);
});

test('an empty deck finishes without a prompt', () => {
  const env = setup(TEXTS.then, { deck: [] });
  const events = [];
  const res = executeTrainer(env.state, { card: env.card, playerId: 'p1', activeRng: env.rng, events });
  assert.equal(res.pendingChoice, null);
});

test('a 3-card search asks one position at a time and the last card needs no pick', () => {
  const env = setup('Search your deck for 3 cards, shuffle your deck, then put those cards on top of it in any order.', {
    deck: deckOf(),
  });
  const { res, prompts, zones } = play(env, [[1, 2, 3], [3], [1]]);
  assert.equal(res.pendingChoice, null);
  assert.match(prompts[1].prompt, /1st from the top/);
  assert.match(prompts[2].prompt, /2nd from the top/);
  assert.deepEqual(names(zones.deck.slice(0, 3)), ['Cleffa', 'Aron', 'Bidoof']);
  assert.equal(zones.deck.length, 5);
});
