import test from 'node:test';
import assert from 'node:assert/strict';

import { cardKeyOf, kindOf } from '../card-key.mjs';
import { cardText, normalizeCardText, tagsForText } from '../card-tags.mjs';

test('cardKeyOf: reprints of a Trainer share one key', () => {
  // Iono: TCGdex sv02-185 (Paldea Evolved) and sv04.5-080 (Paldean Fates) both name "Iono".
  const pal = { category: 'Trainer', name: 'Iono', id: 'sv02-185' };
  const paf = { category: 'Trainer', name: 'Iono', id: 'sv04.5-080' };
  assert.equal(cardKeyOf(pal), 't:iono');
  assert.equal(cardKeyOf(pal), cardKeyOf(paf));
});

test('cardKeyOf: Pokémon key on name + attacks + abilities, so same-name cards with other attacks differ', () => {
  const a = { category: 'Pokemon', name: 'Pikachu ex', attacks: [{ name: 'Thunder' }], abilities: [] };
  const b = { category: 'Pokemon', name: 'Pikachu ex', attacks: [{ name: 'Topaz Bolt' }], abilities: [{ name: 'Resolute Heart' }] };
  const reprintOfA = { ...a, id: 'other-print' };
  assert.equal(cardKeyOf(a), 'p:pikachu ex|thunder|');
  assert.equal(cardKeyOf(b), 'p:pikachu ex|topaz bolt|resolute heart');
  assert.equal(cardKeyOf(reprintOfA), cardKeyOf(a));
});

test('cardKeyOf: attack order does not matter; Energy gets its own prefix', () => {
  const one = { category: 'Pokemon', name: 'Dragapult ex', attacks: [{ name: 'Phantom Dive' }, { name: 'Jet Headbutt' }] };
  const two = { category: 'Pokemon', name: 'Dragapult ex', attacks: [{ name: 'Jet Headbutt' }, { name: 'Phantom Dive' }] };
  assert.equal(cardKeyOf(one), cardKeyOf(two));
  assert.equal(cardKeyOf({ category: 'Energy', name: 'Fire Energy' }), 'e:fire energy');
  assert.equal(kindOf({ category: 'Energy' }), 'energy');
  assert.equal(kindOf({}), 'trainer');
});

// Card texts below are copied from out/pkmn-trainer-cards.json / out/pkmn-pokemon-cards.json rows.
const CORPUS = {
  // Buddy-Buddy Poffin, Temporal Forces 144
  poffin: 'Search your deck for up to 2 Basic Pokémon with 70 HP or less and put them onto your Bench. Then, shuffle your deck.',
  // Ultra Ball, Dark Explorers 102
  ultraBall:
    'Discard 2 cards from your hand. (If you can’t discard 2 cards, you can’t play this card.) Search your deck for a Pokémon, reveal it, and put it into your hand. Shuffle your deck afterward.',
  // Earthen Vessel, Paradox Rift 163
  earthenVessel:
    'You can use this card only if you discard another card from your hand. Search your deck for up to 2 Basic Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Iono, Paldea Evolved 185
  iono: 'Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining Prize cards.',
  // Counter Catcher, Crimson Invasion 91
  counterCatcher:
    'You can play this card only if you have more Prize cards remaining than your opponent. Switch 1 of your opponent’s Benched Pokémon with their Active Pokémon.',
  // Crushing Hammer, Emerging Powers 92
  crushingHammer: 'Flip a coin. If heads, discard an Energy attached to 1 of your opponent’s Pokémon.',
  // Night Stretcher, Shrouded Fable 061
  nightStretcher: 'Put a Pokémon or a Basic Energy card from your discard pile into your hand.',
  // Switch, Base Set 95
  switchBase: 'Switch 1 of your own Benched Pokémon with your Active Pokémon.',
  // Mega Dragonite ex, Ascended Heroes 152 (Sky Transport)
  skyTransport: 'Once during your turn, you may use this Ability. Switch your Active Pokémon with 1 of your Benched Pokémon.',
  // Baxcalibur, Scarlet & Violet Promos 019 (Super Cold)
  superCold: 'As often as you like during your turn, you may attach a Basic {W} Energy card from your hand to 1 of your Pokémon.',
  // Dudunsparce, Temporal Forces 129 (Run Away Draw)
  runAwayDraw:
    'Once during your turn, you may draw 3 cards. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck.',
  // Rare Candy, Sandstorm 88
  rareCandy:
    'Choose 1 of your Basic Pokémon in play. If you have a Stage 1 or Stage 2 card that evolves from that Pokémon in your hand, put that card on the Basic Pokémon. (This counts as evolving that Pokémon.)',
  // Crispin, Stellar Crown 133
  crispin:
    'Search your deck for up to 2 Basic Energy cards of different types, reveal them, and put 1 of them into your hand. Attach the other to 1 of your Pokémon. Then, shuffle your deck.',
  // Meowth ex, Perfect Order 062 (Last-Ditch Catch)
  lastDitchCatch:
    'Once during your turn, when you play this Pokémon from your hand onto your Bench, you may use this Ability. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck.',
  // Secret Box, Twilight Masquerade 163
  secretBox:
    'You can use this card only if you discard 3 other cards from your hand. Search your deck for an Item card, a Pokémon Tool card, a Supporter card, and a Stadium card, reveal them, and put them into your hand. Then, shuffle your deck.',
  // Abra, Skyridge 46 (Psychoflow)
  psychoflow: 'As long as there is a {P} Energy card attached to Abra, its Retreat Cost is 0.',
  // Dragapult ex, Twilight Masquerade 130 (Phantom Dive)
  phantomDive: "Put 6 damage counters on your opponent's Benched Pokémon in any way you like.",
};

test('tagsForText tags corpus texts by goal', () => {
  assert.deepEqual(tagsForText(CORPUS.poffin), ['setup']);
  assert.deepEqual(tagsForText(CORPUS.ultraBall), ['setup']);
  assert.deepEqual(tagsForText(CORPUS.earthenVessel), ['draw']);
  assert.deepEqual(tagsForText(CORPUS.crispin), ['draw', 'acceleration']);
  assert.deepEqual(tagsForText(CORPUS.lastDitchCatch), ['draw']);
  assert.deepEqual(tagsForText(CORPUS.secretBox), ['draw']);
  assert.deepEqual(tagsForText(CORPUS.psychoflow), ['mobility']);
  assert.deepEqual(tagsForText(CORPUS.iono), ['draw', 'disruption']);
  assert.deepEqual(tagsForText(CORPUS.counterCatcher), ['disruption']);
  assert.deepEqual(tagsForText(CORPUS.crushingHammer), ['disruption']);
  assert.deepEqual(tagsForText(CORPUS.nightStretcher), ['recovery']);
  assert.deepEqual(tagsForText(CORPUS.switchBase), ['mobility']);
  assert.deepEqual(tagsForText(CORPUS.skyTransport), ['mobility']);
  assert.deepEqual(tagsForText(CORPUS.superCold), ['acceleration']);
  assert.deepEqual(tagsForText(CORPUS.runAwayDraw), ['draw']);
  assert.deepEqual(tagsForText(CORPUS.rareCandy), ['setup']);
  assert.deepEqual(tagsForText(CORPUS.phantomDive), []);
  assert.deepEqual(tagsForText(''), []);
});

test('cardText joins abilities, attack effects and the Trainer effect; normalizeCardText flattens quotes', () => {
  const card = {
    abilities: [{ effect: 'A.' }],
    attacks: [{ effect: 'B.' }, { name: 'No effect' }],
    effect: 'C.',
  };
  assert.equal(cardText(card), 'A.\nB.\nC.');
  assert.equal(normalizeCardText('Opponent’s  Pokémon'), "opponent's pokemon");
});

test('every baked tag is a goal the Suggest tab offers', async () => {
  const { TAG_IDS } = await import('../card-tags.mjs');
  const { GOAL_IDS, BUDGET_GOAL } = await import('../../../client/src/setup/deck-builder/core/deck-suggest/goals.mjs');
  assert.deepEqual([...TAG_IDS, BUDGET_GOAL].sort(), [...GOAL_IDS].sort());
});
