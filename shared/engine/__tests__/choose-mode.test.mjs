import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { classifyTrainer } from '../../../scripts/lib/trainer-behaviour.mjs';

// Design 061 slice 2 ("Choose 1:" cards). Every text is a row of out/pkmn-trainer-cards.json.
const CARDS = {
  // Sword & Shield Promos SWSH302
  klara:
    'Choose 1 or both: • Put up to 2 Pokémon from your discard pile into your hand. • Put up to 2 basic Energy cards from your discard pile into your hand.',
  // Prismatic Evolutions 174
  kieran:
    'Choose 1: • Switch your Active Pokémon with 1 of your Benched Pokémon. • During this turn, attacks used by your Pokémon do 30 more damage to your opponent’s Active Pokémon ex and Active Pokémon V (before applying Weakness and Resistance).',
  // Silver Tempest 207
  serena:
    'Choose 1: • Discard up to 3 cards from your hand. (You must discard at least 1 card.) If you do, draw cards until you have 5 cards in your hand. • Switch 1 of your opponent’s Benched Pokémon V with their Active Pokémon.',
  // Celestial Storm 148a
  tateLiza:
    'Choose 1: Shuffle your hand into your deck. Then, draw 5 cards. Switch your Active Pokémon with 1 of your Benched Pokémon.',
  // Team Up 176
  ingoEmmet:
    'Look at the top card of your deck, and then choose 1: Discard your hand and draw 5 cards. Discard your hand and draw 5 cards from the bottom of your deck.',
  // BREAKthrough 162
  giovannisScheme:
    'Choose 1: Draw cards until you have 5 cards in your hand. During this turn, your Pokémon’s attacks do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).',
  // Chaos Rising 078
  greatHaulNet:
    'Choose 1 or both: • Shuffle up to 3 {W} Pokémon from your discard pile into your deck. • Shuffle up to 3 Basic {W} Energy cards from your discard pile into your deck.',
  // Sword & Shield 215
  ordinaryRod:
    'Choose 1 or both: Shuffle up to 2 Pokémon from your discard pile into your deck. Shuffle up to 2 basic Energy cards from your discard pile into your deck.',
  // Guardians Rising 130a
  rescueStretcher:
    'Choose 1: Put a Pokémon from your discard pile into your hand. Shuffle 3 Pokémon from your discard pile into your deck.',
  // Team Up 194
  judgeWhistle: 'Choose 1: Draw a card. Put a Judge card from your discard pile into your hand.',
  // Celestial Storm 128
  energyRecycleSystem:
    'Choose 1: Put a basic Energy card from your discard pile into your hand. Shuffle 3 basic Energy cards from your discard pile into your deck.',
  // Forbidden Light 107
  fossilExcavationMap:
    'Choose 1: Search your deck for an Unidentified Fossil card, reveal it, and put it into your hand. Then, shuffle your deck. Put an Unidentified Fossil card from your discard pile into your hand.',
};

const pokemon = (instanceId, name, types = ['Colorless']) => ({
  instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', types,
});
const energy = (instanceId, name) => ({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'] });
const trainer = (instanceId, name, type = 'Item') => ({ instanceId, name, supertype: 'Trainer', type });

function modes(text) {
  const [step] = parseTrainerEffect(text).steps.filter((s) => s.type === 'chooseMode');
  assert.ok(step, text);
  return step;
}

test('every "Choose 1" card parses into one chooseMode with a step list per mode', () => {
  const both = new Set(['klara', 'greatHaulNet', 'ordinaryRod']);
  for (const [key, text] of Object.entries(CARDS)) {
    // Fossil Excavation Map is the fossil parser's searchOrRecover step (rules/fossil.mjs).
    if (key === 'fossilExcavationMap') continue;
    const parsed = parseTrainerEffect(text);
    assert.equal(parsed.recognizable, true, key);
    const step = modes(text);
    assert.equal(step.modes.length, 2, key);
    assert.equal(step.max, both.has(key) ? 2 : 1, key);
    assert.ok(step.modes.every((m) => m.label && m.steps.length > 0), key);
    assert.equal(classifyTrainer({ name: key, text }).gaps.length, 0, `${key}: ${classifyTrainer({ name: key, text }).gaps}`);
  }
});

test('mode labels read as printed sentences', () => {
  const step = modes(CARDS.kieran);
  assert.equal(step.modes[0].label, 'Switch your active Pokémon with 1 of your benched Pokémon');
  assert.match(step.modes[1].label, /^During this turn, attacks used by your Pokémon do 30 more damage/);
});

test('Ingo & Emmet looks at the top card first, and mode 2 draws from the bottom', () => {
  const { steps } = parseTrainerEffect(CARDS.ingoEmmet);
  assert.deepEqual(steps[0], { type: 'lookAtTop', count: 1, lookOnly: true });
  assert.equal(steps[1].modes[1].steps[0].fromBottom, true);
  assert.equal(steps[1].modes[0].steps[0].fromBottom, undefined);
});

function setup(text, { hand = [], deck = [], discard = [], p1Extra } = {}) {
  const state = createGameState({ gameId: 'choose-mode', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const card = createCard({ instanceId: 900, name: 'Test Card', supertype: 'Trainer', type: 'Supporter', text });
  const zones = state.players.p1.zones;
  zones.hand.push(card, ...hand.map((c) => createCard(c)));
  zones.deck.push(...deck.map((c) => createCard(c)));
  zones.discard.push(...discard.map((c) => createCard(c)));
  p1Extra?.(state);
  return { state, card, rng: createRng(1) };
}

// Plays the card, then answers each prompt with the next scripted selection (null = a check).
function play(env, answers) {
  const { state, card, rng } = env;
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
  return { res, prompts, events, zones: state.players.p1.zones, flags: state.players.p1.flags };
}

const names = (cards) => cards.map((c) => c.name);

test('Klara: both modes run, each with its own pick, in printed order', () => {
  const env = setup(CARDS.klara, {
    discard: [pokemon(1, 'Pikachu'), pokemon(2, 'Raichu'), pokemon(3, 'Eevee'), energy(4, 'Fire Energy'), energy(5, 'Water Energy'), trainer(6, 'Potion')],
  });
  const { res, prompts, zones } = play(env, [[1, 2], [1, 2], [4, 5]]);
  assert.equal(prompts[0].options.length, 2);
  assert.equal(prompts[0].min, 1);
  assert.equal(prompts[0].max, 2);
  assert.deepEqual(prompts[0].options.map((o) => o.type), ['option', 'option']);
  assert.deepEqual(prompts[1].options.map((o) => o.instanceId), [1, 2, 3]);
  assert.deepEqual(prompts[2].options.map((o) => o.instanceId), [4, 5]);
  assert.equal(res.pendingChoice, null);
  assert.deepEqual(names(zones.hand), ['Pikachu', 'Raichu', 'Fire Energy', 'Water Energy']);
});

test('Klara: choosing only the second mode skips the Pokémon pick', () => {
  const env = setup(CARDS.klara, { discard: [pokemon(1, 'Pikachu'), energy(4, 'Fire Energy')] });
  const { prompts, zones } = play(env, [[2], [4]]);
  assert.deepEqual(prompts[1].options.map((o) => o.instanceId), [4]);
  assert.deepEqual(names(zones.hand), ['Fire Energy']);
});

test('an out-of-range or empty mode answer does nothing and does not stall the effect', () => {
  const env = setup(CARDS.klara, { discard: [pokemon(1, 'Pikachu')] });
  const { res, events, zones } = play(env, [[7]]);
  assert.equal(res.pendingChoice, null);
  assert.ok(events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'no_mode_chosen'));
  assert.deepEqual(zones.hand, []);
});

test('a "Choose 1" card cannot run both modes', () => {
  const env = setup(CARDS.judgeWhistle, { deck: [trainer(1, 'A'), trainer(2, 'B')], discard: [trainer(3, 'Judge', 'Supporter')] });
  const { prompts, zones } = play(env, [[1, 2]]);
  assert.equal(prompts[0].max, 1);
  assert.deepEqual(names(zones.hand), ['A']);
});

test('Judge Whistle mode 2 puts a Judge card from the discard pile into hand', () => {
  const env = setup(CARDS.judgeWhistle, {
    discard: [trainer(1, 'Judge', 'Supporter'), trainer(2, 'Potion'), trainer(3, 'Lady', 'Supporter')],
  });
  const { prompts, zones } = play(env, [[2], [1]]);
  assert.deepEqual(prompts[1].options.map((o) => o.name), ['Judge']);
  assert.deepEqual(names(zones.hand), ['Judge']);
});

test('Fossil Excavation Map: the deck-search prompt follows the mode pick', () => {
  const env = setup(CARDS.fossilExcavationMap, {
    deck: [trainer(1, 'Unidentified Fossil'), trainer(2, 'Potion')],
    discard: [trainer(3, 'Unidentified Fossil')],
  });
  const { prompts, zones } = play(env, [[1], [1]]);
  assert.deepEqual(prompts[1].options.map((o) => o.instanceId), [1]);
  assert.deepEqual(names(zones.hand), ['Unidentified Fossil']);
  assert.equal(zones.discard.some((c) => c.instanceId === 3), true);
});

test('Kieran: the damage bonus is queued only if its mode is chosen', () => {
  const bench = (s) => {
    s.players.p1.zones.active.push(createCard(pokemon(50, 'Active')));
    s.players.p1.zones.bench.push(createCard(pokemon(51, 'Benched')));
  };
  const first = play(setup(CARDS.kieran, { p1Extra: bench }), [[1]]);
  assert.equal(first.flags.turnDamageBonuses, undefined);
  assert.deepEqual(first.prompts.length, 1);

  const second = play(setup(CARDS.kieran, { p1Extra: bench }), [[2]]);
  assert.equal(second.flags.turnDamageBonuses.length, 1);
  assert.equal(second.flags.turnDamageBonuses[0].amount, 30);
  assert.equal(second.flags.turnDamageBonuses[0].defenderFilter, 'exOrV');
  assert.equal(second.res.pendingChoice, null);
});

test('Giovanni’s Scheme: mode 1 draws up to 5 and queues no bonus; mode 2 queues +20 only', () => {
  const deck = Array.from({ length: 8 }, (_, i) => trainer(i + 1, `D${i + 1}`));
  const hand = [trainer(20, 'H1'), trainer(21, 'H2')];
  const draw = play(setup(CARDS.giovannisScheme, { deck, hand }), [[1]]);
  assert.equal(draw.zones.hand.length, 5);
  assert.equal(draw.flags.turnDamageBonuses, undefined);

  const bonus = play(setup(CARDS.giovannisScheme, { deck, hand }), [[2]]);
  assert.equal(bonus.zones.hand.length, 2);
  assert.equal(bonus.flags.turnDamageBonuses[0].amount, 20);
});

test('Serena mode 1 discards 1 to 3 cards, then draws until 5', () => {
  const deck = Array.from({ length: 8 }, (_, i) => trainer(i + 1, `D${i + 1}`));
  const hand = [trainer(20, 'H1'), trainer(21, 'H2'), trainer(22, 'H3'), trainer(23, 'H4')];
  const { prompts, zones, res } = play(setup(CARDS.serena, { deck, hand }), [[1], [20, 21]]);
  assert.equal(prompts[1].min, 1);
  assert.equal(prompts[1].max, 3);
  assert.equal(res.pendingChoice, null);
  assert.equal(zones.hand.length, 5);
  assert.equal(zones.discard.filter((c) => [20, 21].includes(c.instanceId)).length, 2);
});

test('Serena mode 1 with an empty hand cannot pay the cost and draws nothing', () => {
  const deck = Array.from({ length: 4 }, (_, i) => trainer(i + 1, `D${i + 1}`));
  const { zones, res } = play(setup(CARDS.serena, { deck }), [[1]]);
  assert.equal(res.pendingChoice, null);
  assert.equal(zones.hand.length, 0);
});

test('Ingo & Emmet: mode 2 draws 5 from the bottom of the deck', () => {
  const deck = Array.from({ length: 8 }, (_, i) => trainer(i + 1, `D${i + 1}`));
  const top = play(setup(CARDS.ingoEmmet, { deck, hand: [trainer(20, 'H1')] }), [[1]]);
  assert.deepEqual(names(top.zones.hand), ['D1', 'D2', 'D3', 'D4', 'D5']);
  const bottom = play(setup(CARDS.ingoEmmet, { deck, hand: [trainer(20, 'H1')] }), [[2]]);
  assert.deepEqual(names(bottom.zones.hand), ['D4', 'D5', 'D6', 'D7', 'D8']);
  assert.ok(bottom.events.some((e) => e.type === 'cardsRevealed' && e.revealedTo === 'p1'));
});

test('Great Haul Net offers only {W} Pokémon and Basic {W} Energy', () => {
  const water = pokemon(1, 'Wooper', ['Water']);
  const fire = pokemon(2, 'Vulpix', ['Fire']);
  assert.equal(matchesSearch(createCard(water), '{W} Pokémon'), true);
  assert.equal(matchesSearch(createCard(fire), '{W} Pokémon'), false);

  const env = setup(CARDS.greatHaulNet, {
    discard: [water, fire, energy(3, 'Water Energy'), energy(4, 'Fire Energy')],
  });
  const { prompts } = play(env, [[1, 2], [], []]);
  assert.deepEqual(prompts[1].options.map((o) => o.instanceId), [1]);
  assert.deepEqual(prompts[2].options.map((o) => o.instanceId), [3]);
});

test('Ordinary Rod and Rescue Stretcher: a shuffle mode returns the pick to the deck', () => {
  const rod = play(setup(CARDS.ordinaryRod, { discard: [pokemon(1, 'Pikachu'), energy(2, 'Fire Energy')] }), [[2], [2]]);
  assert.equal(rod.zones.deck.some((c) => c.instanceId === 2), true);
  assert.equal(rod.zones.hand.length, 0);

  const stretcher = play(setup(CARDS.rescueStretcher, { discard: [pokemon(1, 'Pikachu')] }), [[1], [1]]);
  assert.deepEqual(names(stretcher.zones.hand), ['Pikachu']);
});
