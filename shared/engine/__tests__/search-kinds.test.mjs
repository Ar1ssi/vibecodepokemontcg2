import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { matchesSearch } from '../rules/search-match.mjs';

const { parseTrainerEffect } = await import('../rules/trainer-effects.mjs');

// Every text below is a row of out/pkmn-trainer-cards.json (set and number in the comment).
const CARDS = {
  // Arven, Paldean Fates 235
  arven:
    'Search your deck for an Item card and a Pokémon Tool card, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Volkner, Ultra Prism 135a
  volkner:
    'Search your deck for an Item card and a {L} Energy card, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Steven, Ancient Origins 95
  steven:
    'Search your deck for a Supporter card and a basic Energy card, reveal them, and put them into your hand. Shuffle your deck afterward.',
  // Irida, Crown Zenith GG63
  irida:
    'Search your deck for a {W} Pokémon and an Item card, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Piers, corpus row "Search your deck for an Energy card and a {D} Pokémon, …"
  piers:
    'Search your deck for an Energy card and a {D} Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Team Magma’s Great Ball, Double Crisis 31
  magmaBall:
    'Search your deck for a Basic Team Magma Pokémon and a basic {F} Energy card, reveal them, and put them into your hand. Shuffle your deck afterward.',
  // Nest Ball, Paldean Fates 084 — "and put it" is not a second kind
  nestBall: 'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.',
  // Roark, Paradox Rift 242
  roark: 'Draw 2 cards. Put a Basic Energy card from your discard pile into your hand.',
  // VS Seeker, Roaring Skies 110
  vsSeeker: 'Put a Supporter card from your discard pile into your hand.',
  // Miracle Headset, Surging Sparks 183
  miracleHeadset: 'Put up to 2 Supporter cards from your discard pile into your hand.',
  // Fire Crystal, Unbroken Bonds 231
  fireCrystal: 'Put 3 {R} Energy cards from your discard pile into your hand.',
  // Nemona’s Backpack, Paldean Fates 083
  nemonasBackpack: 'Put up to 2 Nemona cards from your discard pile into your hand.',
  // Dowsing Machine, Plasma Storm 128
  dowsingMachine:
    'Discard 2 cards from your hand. (If you can’t discard 2 cards, you can’t play this card.) Put a Trainer card from your discard pile into your hand.',
  // Lusamine, Ultra Prism 153a
  lusamine: 'Put 2 in any combination of Supporter and Stadium cards from your discard pile into your hand.',
  // Energy Retrieval, Chaos Rising 108
  energyRetrieval: 'Put up to 2 Basic Energy cards from your discard pile into your hand.',
};

function stages(text) {
  const step = parseTrainerEffect(text).steps[0];
  assert.equal(step.type, 'searchDeckSequence', text);
  return step.stages.map((s) => `${s.what}×${s.count}`);
}

test('two-kind deck searches take one card of each kind', () => {
  assert.deepEqual(stages(CARDS.arven), ['Item×1', 'Pokémon Tool×1']);
  assert.deepEqual(stages(CARDS.volkner), ['Item×1', 'Basic {L} Energy×1']);
  assert.deepEqual(stages(CARDS.steven), ['Supporter×1', 'Basic Energy×1']);
  assert.deepEqual(stages(CARDS.irida), ['Water Pokémon×1', 'Item×1']);
  assert.deepEqual(stages(CARDS.piers), ['Energy×1', 'Darkness Pokémon×1']);
  assert.deepEqual(stages(CARDS.magmaBall), ['Basic Team Magma Pokémon×1', 'Basic {F} Energy×1']);
});

test('"and put it onto your Bench" is not a second kind', () => {
  const step = parseTrainerEffect(CARDS.nestBall).steps[0];
  assert.equal(step.type, 'searchDeck');
  assert.equal(step.what, 'Basic Pokémon');
  assert.equal(step.destination, 'bench');
});

function recursion(text) {
  const steps = parseTrainerEffect(text).steps;
  const step = steps.find((s) => s.type === 'recursion');
  assert.ok(step, `${text} has a recursion step`);
  return { steps, step };
}

test('discard recovery keeps the printed kind and count', () => {
  assert.deepEqual(recursion(CARDS.vsSeeker).step, { type: 'recursion', what: 'Supporter', count: 1, from: 'discard' });
  assert.deepEqual(recursion(CARDS.miracleHeadset).step, {
    type: 'recursion',
    what: 'Supporter',
    count: 2,
    from: 'discard',
    upTo: true,
  });
  assert.deepEqual(recursion(CARDS.fireCrystal).step, { type: 'recursion', what: 'Basic {R} Energy', count: 3, from: 'discard' });
  assert.deepEqual(recursion(CARDS.nemonasBackpack).step, { type: 'recursion', what: 'Nemona', count: 2, from: 'discard', upTo: true });
  assert.equal(recursion(CARDS.dowsingMachine).step.what, 'Trainer');
  const lusamine = recursion(CARDS.lusamine).step;
  assert.equal(lusamine.count, 2);
  assert.match(lusamine.what, /Supporter/);
  assert.match(lusamine.what, /Stadium/);
  const retrieval = recursion(CARDS.energyRetrieval).step;
  assert.equal(retrieval.what, 'Basic Energy');
  assert.equal(retrieval.count, 2);
});

test('Roark draws 2 first, then recovers one Basic Energy', () => {
  const { steps } = recursion(CARDS.roark);
  assert.deepEqual(
    steps.map((s) => s.type),
    ['draw', 'recursion']
  );
  assert.equal(steps[0].count, 2);
  assert.equal(steps[1].what, 'Basic Energy');
  assert.equal(steps[1].count, 1);
});

test('matchesSearch: a plain Stadium kind matches only Stadium cards', () => {
  const stadium = createCard({ instanceId: 1, name: 'Area Zero Underdepths', supertype: 'Trainer', trainerType: 'Stadium' });
  const item = createCard({ instanceId: 2, name: 'Ultra Ball', supertype: 'Trainer', trainerType: 'Item' });
  const energy = createCard({ instanceId: 3, name: 'Basic Fire Energy', supertype: 'Energy', type: 'Energy' });
  assert.equal(matchesSearch(stadium, 'Stadium'), true);
  assert.equal(matchesSearch(item, 'Stadium'), false);
  assert.equal(matchesSearch(energy, 'Stadium'), false);
});

test('Arven fetches one Item and then one Pokémon Tool, never two of one kind', () => {
  const state = createGameState({ gameId: 'arven', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Ultra Ball', supertype: 'Trainer', trainerType: 'Item' }),
    createCard({ instanceId: 2, name: 'Nest Ball', supertype: 'Trainer', trainerType: 'Item' }),
    createCard({ instanceId: 3, name: 'Forest Seal Stone', supertype: 'Trainer', trainerType: 'Pokémon Tool' }),
    createCard({ instanceId: 4, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' })
  );
  const base = {
    steps: parseTrainerEffect(CARDS.arven).steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Arven' },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
  };
  const first = executeSteps(state, base);
  assert.deepEqual(first.pendingChoice.options.map((c) => c.instanceId).sort(), [1, 2]);
  assert.equal(first.pendingChoice.max, 1);
  const second = executeSteps(state, {
    ...base,
    fromStepIndex: first.pendingChoice.stepIndex,
    selection: [1],
    resume: first.pendingChoice.resumeToken,
  });
  assert.ok(second.pendingChoice, 'second stage asks for a Pokémon Tool');
  assert.deepEqual(second.pendingChoice.options.map((c) => c.instanceId), [3]);
});
