// Reworded search clauses parse through the grammar, with no branch per card.
//
// Sources: client/src/assets/custom-sets/customhb/set.json customhb-515 (Colress's Tenacity,
// "and" → "or"), customhb-377 (Hilda), customhb-395 and the user's scan of Telepathic {P} Energy
// (Perfect Order 088/088: "a Basic {P} Pokémon … put it onto your Bench"). The other texts are
// rewordings of those cards, not printed cards: they hold the grammar to wordings no branch names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { parseAbility } from '../rules/abilities.mjs';
import { parseSpecialEnergyEffects } from '../rules/special-energy-parse.mjs';
import { matchesSearch } from '../rules/search-match.mjs';

const TAIL = ', reveal it, and put it into your hand. Then, shuffle your deck.';
const searchStep = (text) => parseTrainerEffect(text).steps[0];

test('homebrew Colress\'s Tenacity (customhb-515): a Stadium card or an Energy card is one pick', () => {
  const step = searchStep(`Search your deck for a Stadium card or an Energy card${TAIL}`);
  assert.equal(step.type, 'searchDeck');
  assert.equal(step.what, 'Stadium or Energy');
  assert.equal(step.count, 1);
  assert.equal(step.destination, 'hand');
});

test('an or-list keeps every printed kind, not the first one', () => {
  assert.equal(searchStep(`Search your deck for an Item card or a Supporter card${TAIL}`).what, 'Item or Supporter');
  assert.equal(
    searchStep(`Search your deck for a Supporter card, an Item card, or a Stadium card${TAIL}`).what,
    'Supporter or Item or Stadium'
  );
  assert.equal(
    searchStep(`Search your deck for an Evolution Pokémon or an Energy card${TAIL}`).what,
    'Evolution Pokémon or Energy'
  );
});

test('an or-list keeps its printed count', () => {
  const step = searchStep(
    'Search your deck for up to 2 Evolution Pokémon or Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.'
  );
  assert.equal(step.what, 'Evolution Pokémon or Energy');
  assert.equal(step.count, 2);
  assert.equal(step.upTo, true);
});

test('a range is not an or-list', () => {
  const step = searchStep(`Search your deck for a Pokémon with 90 HP or less${TAIL}`);
  assert.equal(step.what, 'Pokémon ≤90 HP');
});

test('a three-kind or-list filters the deck to those kinds', () => {
  const { what } = searchStep(`Search your deck for a Supporter card, an Item card, or a Stadium card${TAIL}`);
  const trainer = (trainerType) => ({ name: trainerType, supertype: 'Trainer', type: 'Trainer', trainerType });
  assert.equal(matchesSearch(trainer('Supporter'), what), true);
  assert.equal(matchesSearch(trainer('Item'), what), true);
  assert.equal(matchesSearch(trainer('Stadium'), what), true);
  assert.equal(matchesSearch({ name: 'Ralts', supertype: 'Pokémon', type: 'Pokémon', hp: 60 }, what), false);
});

const PROVIDES = 'As long as this card is attached to a Pokémon, it provides {P} Energy.\n\n';
const attachSearch = (clause) =>
  parseSpecialEnergyEffects({
    name: 'Telepathic Psychic Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    text: `${PROVIDES}When you attach this card from your hand to a {P} Pokémon, ${clause} Then, shuffle your deck.`,
  }).steps.find((s) => s.type === 'onAttachSearch');

test('Telepathic {P} Energy: the printed count and kind of the on-attach search are read, whatever they are', () => {
  assert.deepEqual(attachSearch('search your deck for a Basic {P} Pokémon and put it onto your Bench.'), {
    type: 'onAttachSearch',
    what: 'Basic Psychic Pokémon',
    count: 1,
    destination: 'bench',
    hostType: 'Psychic',
  });
  const two = attachSearch('search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench.');
  assert.equal(two.what, 'Basic Psychic Pokémon');
  assert.equal(two.count, 2);
  const three = attachSearch('search your deck for up to 3 {P} Pokémon and put them onto your Bench.');
  // Only a Basic Pokémon can go from the deck onto the Bench, so the grammar adds "Basic".
  assert.equal(three.what, 'Basic {P} Pokémon');
  assert.equal(three.count, 3);
  const toHand = attachSearch('search your deck for a Basic {P} Pokémon, reveal it, and put it into your hand.');
  assert.equal(toHand.destination, 'hand');
  assert.equal(toHand.count, 1);
});

test('TCGdex word-form text ("Psychic Pokémon") reads the same as the symbol form', () => {
  const step = parseSpecialEnergyEffects({
    name: 'Telepathic Psychic Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    text: 'As long as this card is attached to a Pokémon, it provides Psychic Energy. When you attach this card from your hand to a Psychic Pokémon, search your deck for a Basic Psychic Pokémon and put it onto your Bench. Then, shuffle your deck.',
  }).steps.find((s) => s.type === 'onAttachSearch');
  assert.equal(step.what, 'Basic Psychic Pokémon');
  assert.equal(step.count, 1);
  assert.equal(step.hostType, 'Psychic');
});

function attachGame(clause) {
  const state = createGameState({ gameId: 'search-wording', seed: 1, rulesEnabled: true });
  const zones = () => ({ deck: [], hand: [], active: [], bench: [], discard: [], prizes: [], stadium: [], lostZone: [] });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: zones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: zones(), flags: {} };
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 60, stage: 'Basic', ...props });
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Mew', types: ['Psychic'] }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 2,
      name: 'Telepathic Psychic Energy',
      supertype: 'Energy',
      type: 'Energy',
      subtypes: ['Special'],
      text: `${PROVIDES}When you attach this card from your hand to a {P} Pokémon, ${clause} Then, shuffle your deck.`,
    })
  );
  state.players.p1.zones.deck.push(
    pokemon({ instanceId: 50, name: 'Ralts', types: ['Psychic'] }),
    pokemon({ instanceId: 51, name: 'Abra', types: ['Psychic'] }),
    pokemon({ instanceId: 52, name: 'Pikachu', types: ['Lightning'] })
  );
  return applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
}

const resolve = (res, selection) =>
  applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });

test('Telepathic {P} Energy (POR 088 scan): one Basic {P} Pokémon goes onto the Bench', () => {
  const res = attachGame('search your deck for a Basic {P} Pokémon and put it onto your Bench.');
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.max, 1);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [50, 51]);
  const done = resolve(res, [50]);
  assert.equal(done.error, null);
  assert.deepEqual(done.state.players.p1.zones.bench.filter((c) => !c.attachedTo).map((c) => c.instanceId), [50]);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('an on-attach search reworded to the hand puts the card into the hand', () => {
  const res = attachGame('search your deck for a Basic {P} Pokémon, reveal it, and put it into your hand.');
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.max, 1);
  const done = resolve(res, [51]);
  assert.equal(done.error, null);
  assert.deepEqual(done.state.players.p1.zones.hand.map((c) => c.instanceId), [51]);
  assert.equal(done.state.players.p1.zones.bench.length, 0);
});

// Continent Tow: the user's scan (no corpus row) — "a Stadium", no "card", no reveal.
test('Ability "search your deck for a Stadium" filters the deck to Stadiums only', () => {
  const step = parseAbility(
    'Once during your turn, you may search your deck for a Stadium and put it into your hand. Then, shuffle your deck.'
  ).find((s) => s.type === 'searchAbility');
  assert.equal(step.what, 'Stadium');
  assert.equal(step.destination, 'hand');
  const trainer = (trainerType) => ({ name: trainerType, supertype: 'Trainer', type: 'Trainer', trainerType });
  assert.equal(matchesSearch(trainer('Stadium'), step.what), true);
  assert.equal(matchesSearch(trainer('Item'), step.what), false);
  assert.equal(matchesSearch(trainer('Supporter'), step.what), false);
  assert.equal(matchesSearch({ name: 'Ralts', supertype: 'Pokémon', type: 'Pokémon', hp: 60 }, step.what), false);
});
