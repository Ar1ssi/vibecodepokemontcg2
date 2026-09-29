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

// "cards with X in their name" (design 058 slice 1). Texts are out/pkmn-trainer-cards.json rows.
const NAMED = {
  // Apricorn Maker, Celestial Storm 161
  apricornCes:
    'Search your deck for up to 2 Item cards that have the word “Ball” in their name, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Apricorn Maker, Skyridge 121
  apricornSkyridge:
    'Search your deck for up to 2 Trainer cards with Ball in their names, show them to your opponent, and put them into your hand. Shuffle your deck afterward.',
  // Ball Guy, Shining Fates 065
  ballGuy:
    'Search your deck for up to 3 different Item cards that have the word “Ball” in their name, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Looker Whistle, Ultra Prism 127
  lookerWhistle:
    'Search your deck for up to 2 cards named Looker, reveal them, and put them into your hand. Then, shuffle your deck.',
  // The Boss’s Way, Legendary Collection 105
  bossWay:
    'Search your deck for an Evolution card with Dark in its name. Show it to your opponent and put it into your hand. Shuffle your deck afterward.',
  // Archie, Team Magma vs Team Aqua 71
  archie:
    'Search your deck for a Pokémon with Team Aqua in its name and put it onto your Bench. Shuffle your deck afterward. Treat the new Benched Pokémon as a Basic Pokémon. If it is a Stage 2 Pokémon, put 2 damage counters on that Pokémon.',
  // Professor Laventon, Silver Tempest 162
  laventon: 'Put up to 3 Pokémon that have “Hisuian” in their names from your discard pile into your hand.',
  // Aether Foundation Employee, Lost Thunder SV81
  aetherEmployee: 'Put 3 Pokémon that have “Alolan” in their names from your discard pile into your hand.',
};

function firstStep(text) {
  return parseTrainerEffect(text).steps[0];
}

test('name-clause searches carry the kind and a nameFilter', () => {
  const search = (fields) => ({ type: 'searchDeck', destination: 'hand', ...fields });
  assert.deepEqual(firstStep(NAMED.apricornCes), search({ what: 'Item', count: 2, upTo: true, nameFilter: 'Ball', reveal: true }));
  assert.deepEqual(firstStep(NAMED.apricornSkyridge), search({ what: 'Trainer', count: 2, upTo: true, nameFilter: 'Ball' }));
  assert.deepEqual(firstStep(NAMED.ballGuy), search({ what: 'Item', count: 3, upTo: true, nameFilter: 'Ball', reveal: true }));
  assert.deepEqual(firstStep(NAMED.lookerWhistle), search({ what: 'card', count: 2, upTo: true, nameFilter: 'Looker', reveal: true }));
  assert.deepEqual(firstStep(NAMED.bossWay), search({ what: 'Evolution Pokémon', count: 1, nameFilter: 'Dark' }));
  assert.deepEqual(
    firstStep(NAMED.archie),
    search({ what: 'Pokémon', count: 1, destination: 'bench', nameFilter: 'Team Aqua' })
  );
});

test('name-clause discard recovery carries the kind and a nameFilter', () => {
  assert.deepEqual(recursion(NAMED.laventon).step, {
    type: 'recursion',
    what: 'Pokémon',
    count: 3,
    upTo: true,
    from: 'discard',
    nameFilter: 'Hisuian',
  });
  assert.deepEqual(recursion(NAMED.aetherEmployee).step, {
    type: 'recursion',
    what: 'Pokémon',
    count: 3,
    from: 'discard',
    nameFilter: 'Alolan',
  });
});

function namedState(gameId) {
  const state = createGameState({ gameId, seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

function runCard(state, text, name) {
  return executeSteps(state, {
    steps: parseTrainerEffect(text).steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
  });
}

test('Professor Laventon offers only Hisuian Pokémon from the discard', () => {
  const state = namedState('laventon');
  state.players.p1.zones.discard.push(
    createCard({ instanceId: 1, name: 'Hisuian Zoroark', supertype: 'Pokémon', subtypes: 'Stage 1' }),
    createCard({ instanceId: 2, name: 'Hisuian Arcanine', supertype: 'Pokémon', subtypes: 'Stage 1' }),
    createCard({ instanceId: 3, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' }),
    createCard({ instanceId: 4, name: 'Basic Fire Energy', supertype: 'Energy', type: 'Energy' })
  );
  const result = runCard(state, NAMED.laventon, 'Professor Laventon');
  assert.deepEqual(result.pendingChoice.options.map((c) => c.instanceId).sort(), [1, 2]);
  assert.equal(result.pendingChoice.max, 2);
});

test('Apricorn Maker offers only Items with Ball in their name', () => {
  const state = namedState('apricorn');
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 1, name: 'Ultra Ball', supertype: 'Trainer', trainerType: 'Item' }),
    createCard({ instanceId: 2, name: 'Nest Ball', supertype: 'Trainer', trainerType: 'Item' }),
    createCard({ instanceId: 3, name: 'Rare Candy', supertype: 'Trainer', trainerType: 'Item' }),
    createCard({ instanceId: 4, name: 'Pikachu', supertype: 'Pokémon', subtypes: 'Basic' })
  );
  const result = runCard(state, NAMED.apricornCes, 'Apricorn Maker');
  assert.deepEqual(result.pendingChoice.options.map((c) => c.instanceId).sort(), [1, 2]);
});

// "search your deck for up to N cards and discard them" (design 058 slice 2). Texts are
// out/pkmn-trainer-cards.json rows.
const DISCARD_SEARCH = {
  // Brilliant Blender, Surging Sparks 164
  brilliantBlender: 'Search your deck for up to 5 cards and discard them. Then, shuffle your deck.',
  // Professor Burnet, Silver Tempest TG26
  burnet: 'Search your deck for up to 2 cards and discard them. Then, shuffle your deck.',
  // Battle Compressor Team Flare Gear, Phantom Forces 92
  battleCompressor: 'Search your deck for up to 3 cards and discard them. Shuffle your deck afterward.',
};

test('discard-search cards parse to searchDeck with destination discard', () => {
  for (const [key, count] of [['brilliantBlender', 5], ['burnet', 2], ['battleCompressor', 3]]) {
    const steps = parseTrainerEffect(DISCARD_SEARCH[key]).steps;
    assert.equal(steps.length, 1, key);
    assert.deepEqual(
      { type: steps[0].type, what: steps[0].what, count: steps[0].count, upTo: steps[0].upTo, destination: steps[0].destination },
      { type: 'searchDeck', what: 'card', count, upTo: true, destination: 'discard' },
      key
    );
  }
});

test('Brilliant Blender moves the chosen deck cards to the discard pile', () => {
  const state = namedState('blender');
  for (let i = 1; i <= 6; i++) {
    state.players.p1.zones.deck.push(
      createCard({ instanceId: i, name: `Card ${i}`, supertype: 'Trainer', trainerType: 'Item' })
    );
  }
  const first = runCard(state, DISCARD_SEARCH.brilliantBlender, 'Brilliant Blender');
  assert.ok(first.pendingChoice);
  const events = [];
  executeSteps(state, {
    steps: parseTrainerEffect(DISCARD_SEARCH.brilliantBlender).steps,
    fromStepIndex: first.pendingChoice.stepIndex,
    effectType: 'trainer',
    sourceCard: { name: 'Brilliant Blender' },
    playerId: 'p1',
    activeRng: createRng(1),
    events,
    selection: [2, 5],
    resume: first.pendingChoice.resumeToken,
  });
  const zones = state.players.p1.zones;
  assert.deepEqual(zones.discard.map((c) => c.instanceId).sort(), [2, 5]);
  assert.equal(zones.hand.length, 0);
  assert.equal(zones.deck.length, 4);
  assert.ok(!events.some((e) => e.type === 'cardsRevealed'));
});
