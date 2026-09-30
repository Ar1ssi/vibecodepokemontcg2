import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { parseTrainerEffect, describeStep } from '../rules/trainer-effects.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { classifyTrainer } from '../../../scripts/lib/trainer-behaviour.mjs';

// Design 061 slice 4 (optional hand cost with an "If you do" bonus; going-second search count).
// Texts are rows of out/pkmn-trainer-cards.json.
const TEXTS = {
  // Cosmic Eclipse 193 / 229
  guzmaHala:
    'Search your deck for a Stadium card, reveal it, and put it into your hand. Then, shuffle your deck. When you play this card, you may discard 2 other cards from your hand. If you do, you may also search for a Pokémon Tool card and a Special Energy card in this way.',
  // Cosmic Eclipse 202 / 234
  redBlue:
    'Search your deck for a Pokémon-GX that evolves from 1 of your Pokémon and put it onto that Pokémon to evolve it. Then, shuffle your deck. (You can’t use this card during your first turn or on a Pokémon that was put into play this turn.) When you play this card, you may discard 2 other cards from your hand. If you do, search your deck for up to 2 basic Energy cards and attach them to the Pokémon you evolved in this way.',
  // Team Up 145 / 177
  jasmine:
    'Search your deck for a {M} Pokémon, reveal it, and put it into your hand. If you go second and it’s your first turn, search for 5 {M} Pokémon instead of 1. Then, shuffle your deck.',
  // Energy Spinner (Trainer corpus row)
  energySpinner:
    'Search your deck for a basic Energy card, reveal it, and put it into your hand. If you go second and it’s your first turn, search for up to 3 basic Energy cards instead of 1. Then, shuffle your deck.',
  // Sabrina & Brycen (Cosmic Eclipse), Misty & Lorelei, Mallow & Lana: bonus not implemented yet
  sabrinaBrycen:
    'Search your deck for up to 2 basic Energy cards, reveal them, and put them into your hand. Then, shuffle your deck. When you play this card, you may discard 5 other cards from your hand. If you do, you may also search for up to 3 Pokémon of different types in this way.',
  mallowLana:
    'Switch your Active Pokémon with 1 of your Benched Pokémon. When you play this card, you may discard 2 other cards from your hand. If you do, heal 120 damage from the Pokémon you moved to your Bench.',
};

const mon = (instanceId, name, extra = {}) => ({
  instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', types: ['Colorless'], ...extra,
});
const stadium = (instanceId, name) => ({ instanceId, name, supertype: 'Trainer', type: 'Stadium', trainerType: 'Stadium' });
const tool = (instanceId, name) => ({ instanceId, name, supertype: 'Trainer', type: 'Pokémon Tool', trainerType: 'Pokémon Tool' });
const basicEnergy = (instanceId, name) => ({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'] });
const specialEnergy = (instanceId, name) => ({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Special'] });
const filler = (n) => Array.from({ length: n }, (_, i) => mon(500 + i, `Filler ${i + 1}`));

function setup(text, { deck = [], hand = [], active = null, bench = [], turnNumber = 4 } = {}) {
  const state = createGameState({ gameId: 'optional-cost', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: turnNumber, phase: 'main' };
  const card = createCard({ instanceId: 900, name: 'Test Card', supertype: 'Trainer', type: 'Supporter', text });
  const zones = state.players.p1.zones;
  zones.hand.push(card, ...hand.map((c) => createCard(c)));
  zones.deck.push(...deck.map((c) => createCard(c)));
  if (active) zones.active.push(createCard(active));
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
// The played Supporter lands in the discard pile too; the cost's own discards are the rest.
const paidDiscards = (zones) => names(zones.discard).filter((n) => n !== 'Test Card');

test('Guzma & Hala: the bonus search is optional and gated on the discard', () => {
  const parsed = parseTrainerEffect(TEXTS.guzmaHala);
  assert.equal(parsed.recognizable, true);
  assert.deepEqual(parsed.steps, [
    { type: 'optionalDiscardCost', count: 2 },
    { type: 'searchDeck', what: 'Stadium', count: 1, destination: 'hand', reveal: true },
    {
      type: 'searchDeckSequence',
      stages: [
        { what: 'Pokémon Tool', count: 1, destination: 'hand' },
        { what: 'Special Energy', count: 1, destination: 'hand' },
      ],
      requiresHandCost: true,
    },
  ]);
  assert.equal(classifyTrainer({ name: 'Guzma & Hala', text: TEXTS.guzmaHala }).gaps.length, 0);
  assert.match(describeStep(parsed.steps[0]), /may discard 2 other cards/);
  assert.match(describeStep(parsed.steps[2]), /^If you discarded the cards: /);
});

const guzmaDeck = () => [stadium(1, 'Path to the Peak'), tool(2, 'Bravery Charm'), specialEnergy(3, 'Double Turbo Energy'), basicEnergy(4, 'Basic Fire Energy'), mon(5, 'Aron')];

test('Guzma & Hala: paying the cost searches the Stadium, a Tool and a Special Energy', () => {
  const env = setup(TEXTS.guzmaHala, { deck: guzmaDeck(), hand: filler(3) });
  const { res, prompts, zones, events } = play(env, [[500, 501], [1], [2], [3]]);
  assert.equal(res.pendingChoice, null);
  assert.match(prompts[0].prompt, /may discard 2 other cards/);
  assert.equal(prompts[0].min, 0);
  assert.equal(prompts[0].options.some((c) => c.instanceId === 900), false, 'the Supporter itself is not offered');
  assert.deepEqual(paidDiscards(zones), ['Filler 1', 'Filler 2']);
  assert.deepEqual(names(zones.hand).sort(), ['Bravery Charm', 'Double Turbo Energy', 'Filler 3', 'Path to the Peak']);
  assert.deepEqual(prompts[3].options.map((c) => c.name), ['Double Turbo Energy'], 'Basic Energy is not a Special Energy');
  assert.ok(events.some((e) => e.type === 'deckShuffled'));
});

test('Guzma & Hala: declining the discard still searches the Stadium and nothing else', () => {
  for (const decline of [[], [500]]) {
    const env = setup(TEXTS.guzmaHala, { deck: guzmaDeck(), hand: filler(3) });
    const { res, zones } = play(env, [decline, [1]]);
    assert.equal(res.pendingChoice, null, JSON.stringify(decline));
    assert.equal(paidDiscards(zones).length, 0, JSON.stringify(decline));
    assert.deepEqual(names(zones.hand).sort(), ['Filler 1', 'Filler 2', 'Filler 3', 'Path to the Peak']);
  }
});

test('Guzma & Hala: a hand too small to pay skips the cost prompt', () => {
  const env = setup(TEXTS.guzmaHala, { deck: guzmaDeck(), hand: filler(1) });
  const { res, prompts, zones } = play(env, [[1]]);
  assert.equal(res.pendingChoice, null);
  assert.match(prompts[0].prompt, /Select up to 1/);
  assert.equal(paidDiscards(zones).length, 0);
});

test('Red & Blue: parses to a GX-only evolve plus the gated Energy attach', () => {
  const parsed = parseTrainerEffect(TEXTS.redBlue);
  assert.equal(parsed.recognizable, true);
  assert.equal(parsed.playCondition, 'notFirstTurn');
  assert.deepEqual(parsed.steps, [
    { type: 'optionalDiscardCost', count: 2 },
    { type: 'searchEvolve', what: 'Pokémon-GX' },
    {
      type: 'searchDeck',
      what: 'Basic Energy',
      count: 2,
      destination: 'attach',
      upTo: true,
      attachTarget: 'evolved',
      requiresHandCost: true,
    },
  ]);
  assert.equal(classifyTrainer({ name: 'Red & Blue', text: TEXTS.redBlue }).gaps.length, 0);
  assert.match(describeStep(parsed.steps[2]), /attach to the Pokémon you evolved/);
});

const redBlueSetup = () =>
  setup(TEXTS.redBlue, {
    active: mon(10, 'Ralts'),
    // A second Pokémon in play: only the evolved one may take the Energy, so no target prompt.
    bench: [mon(11, 'Pikachu')],
    deck: [
      mon(20, 'Gardevoir-GX', { stage: 'Stage 2', evolvesFrom: 'Ralts', subtypes: ['GX'] }),
      mon(21, 'Kirlia', { stage: 'Stage 1', evolvesFrom: 'Ralts' }),
      basicEnergy(30, 'Basic Fire Energy'),
      basicEnergy(31, 'Basic Water Energy'),
      basicEnergy(32, 'Basic Grass Energy'),
    ],
    hand: filler(3),
  });

test('Red & Blue: paying the cost evolves into a GX, then attaches Energy to that Pokémon', () => {
  const env = redBlueSetup();
  const { res, prompts, zones } = play(env, [[500, 501], [20], [30, 31]]);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(prompts[1].options.map((c) => c.name), ['Gardevoir-GX'], 'a non-GX Evolution is not offered');
  assert.equal(zones.active.find((c) => c.instanceId === 20).attachedTo, 10);
  assert.deepEqual(zones.active.filter((c) => c.attachedTo === 10 && c.supertype === 'Energy').map((c) => c.name).sort(), [
    'Basic Fire Energy',
    'Basic Water Energy',
  ]);
  assert.equal(paidDiscards(zones).length, 2);
});

test('Red & Blue: declining the discard evolves only', () => {
  const env = redBlueSetup();
  const { res, zones } = play(env, [[], [20]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(zones.active.find((c) => c.instanceId === 20).attachedTo, 10);
  assert.equal(zones.active.some((c) => c.supertype === 'Energy'), false);
  assert.equal(paidDiscards(zones).length, 0);
});

test('Red & Blue: paid cost but no GX to evolve into ends without an attach', () => {
  const env = setup(TEXTS.redBlue, {
    active: mon(10, 'Ralts'),
    deck: [mon(21, 'Kirlia', { stage: 'Stage 1', evolvesFrom: 'Ralts' }), basicEnergy(30, 'Basic Fire Energy')],
    hand: filler(3),
  });
  const { res, zones } = play(env, [[500, 501]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(zones.active.some((c) => c.supertype === 'Energy'), false);
});

test('going-second search count: Jasmine and Energy Spinner', () => {
  const jasmine = parseTrainerEffect(TEXTS.jasmine).steps[0];
  assert.equal(jasmine.what, 'Metal Pokémon');
  assert.deepEqual(jasmine.countIf, { goingSecondFirstTurn: 5 });
  const spinner = parseTrainerEffect(TEXTS.energySpinner).steps[0];
  assert.deepEqual(spinner.countIf, { goingSecondFirstTurn: 3 });
  assert.equal(classifyTrainer({ name: 'Jasmine', text: TEXTS.jasmine }).gaps.length, 0);
});

const metalDeck = () => Array.from({ length: 6 }, (_, i) => mon(i + 1, `Metal ${i + 1}`, { types: ['Metal'] }));

test('Jasmine on the second player’s first turn searches up to 5', () => {
  const { prompts } = play(setup(TEXTS.jasmine, { deck: metalDeck(), turnNumber: 2 }), [[1, 2, 3, 4, 5]]);
  assert.match(prompts[0].prompt, /up to 5/);
  assert.equal(prompts[0].max, 5);
});

test('Jasmine on any other turn searches 1', () => {
  for (const turnNumber of [3, 4]) {
    const { prompts } = play(setup(TEXTS.jasmine, { deck: metalDeck(), turnNumber }), [[1]]);
    assert.equal(prompts[0].max, 1, `turn ${turnNumber}`);
  }
});

test('Special Energy search kind matches non-basic Energy only', () => {
  assert.equal(matchesSearch(specialEnergy(1, 'Double Turbo Energy'), 'Special Energy'), true);
  assert.equal(matchesSearch(basicEnergy(2, 'Basic Fire Energy'), 'Special Energy'), false);
  assert.equal(matchesSearch(mon(3, 'Aron'), 'Special Energy'), false);
});

test('bonuses not implemented yet no longer force the discard', () => {
  for (const key of ['sabrinaBrycen', 'mallowLana']) {
    const steps = parseTrainerEffect(TEXTS[key]).steps;
    assert.equal(steps.some((s) => s.type === 'discardCost' || s.type === 'optionalDiscardCost'), false, key);
  }
});
