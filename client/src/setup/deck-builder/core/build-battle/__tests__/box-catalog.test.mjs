import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_ENERGY_LABELS,
  BUILD_BATTLE_BOXES,
  getBuildBattleBox,
} from '../box-catalog.mjs';
import {
  BUILD_BATTLE_DECKS,
  BUILD_BATTLE_SET_CARDS,
  ETB_PROMOS,
} from '../build-battle.generated.mjs';
import { findPokemonBySlug } from '../../deck-sprites.mjs';
import { GENERATED_STARTER_DECKS } from '../../starter-decks.generated.mjs';

const box = getBuildBattleBox('phantasmal-flames');
const setCards = BUILD_BATTLE_SET_CARDS.me02;
const decks = BUILD_BATTLE_DECKS['phantasmal-flames'];

test('getBuildBattleBox returns null for an unknown key', () => {
  assert.equal(getBuildBattleBox('nope'), null);
  assert.equal(getBuildBattleBox(undefined), null);
  assert.equal(BUILD_BATTLE_BOXES.length, 1);
});

test('me02 bakes all 130 cards with the TCGdex rarity tally', () => {
  assert.equal(setCards.length, 130);
  const tally = {};
  for (const card of setCards) tally[card.rarity] = (tally[card.rarity] || 0) + 1;
  assert.deepEqual(tally, {
    Common: 43,
    Uncommon: 31,
    Rare: 10,
    'Double rare': 10,
    'Ultra Rare': 17,
    'Illustration rare': 13,
    'Special illustration rare': 5,
    'Mega Hyper Rare': 1,
  });
  assert.equal(new Set(setCards.map((card) => card.id)).size, 130);
  const localIds = setCards.map((card) => card.localId);
  assert.deepEqual(
    localIds,
    [...localIds].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  );
});

test('every set card and deck row carries id, image and supertype', () => {
  const rows = [...setCards, ...Object.values(decks).flat()];
  for (const row of rows) {
    assert.ok(row.id, JSON.stringify(row));
    assert.match(row.image, /^https:\/\//, row.id);
    assert.ok(['Pokémon', 'Trainer', 'Energy'].includes(row.supertype), row.id);
    assert.ok(Array.isArray(row.types), row.id);
  }
});

test('the generated decks are exactly the catalog decks, 40 cards each', () => {
  assert.deepEqual(Object.keys(decks).sort(), box.decks.map((deck) => deck.key).sort());
  for (const [key, rows] of Object.entries(decks)) {
    assert.equal(rows.reduce((n, row) => n + row.qty, 0), 40, key);
  }
});

test('each deck holds its promo once and its catalog Basic Energy', () => {
  for (const deck of box.decks) {
    const rows = decks[deck.key];
    const promo = rows.filter((row) => row.id === deck.promoId);
    assert.equal(promo.length, 1, deck.key);
    assert.equal(promo[0].qty, 1, deck.key);
    assert.ok(BASIC_ENERGY_LABELS.includes(deck.energy), deck.key);
    assert.ok(rows.some((row) => row.name === deck.energy), deck.key);
  }
  assert.deepEqual(
    box.decks.map((deck) => deck.promoId),
    ['mep-014', 'mep-015', 'mep-016', 'mep-017']
  );
});

// Source: Bulbapedia "Phantasmal Flames Build & Battle Box (TCG)" decklist tables.
test('the Toxtricity deck matches the printed list', () => {
  const byId = Object.fromEntries(decks.toxtricity.map((row) => [row.id, row.qty]));
  assert.deepEqual(byId, {
    'mep-017': 1,
    'me02-068': 1,
    'me02-067': 2,
    'me02-066': 3,
    'me02-065': 2,
    'me02-064': 3,
    'me02-063': 2,
    'me02-090': 3,
    'me01-119': 3,
    'sv09-146': 2,
    'sv08-175': 2,
    'me01-125': 2,
    'sv10-164': 1,
    'me01-130': 1,
    'sve-007': 12,
  });
});

test('the Ceruledge deck matches the printed list', () => {
  const byId = Object.fromEntries(decks.ceruledge.map((row) => [row.id, row.qty]));
  assert.deepEqual(byId, {
    'mep-014': 1,
    'me02-020': 3,
    'me02-019': 4,
    'me02-014': 1,
    'me02-089': 3,
    'sv10.5w-084': 3,
    'me01-119': 2,
    'sv10.5w-082': 4,
    'me01-131': 2,
    'me01-130': 1,
    'sve-002': 16,
  });
});

// TCGdex mep-022 "Charcadet" (rarity "Promo"): the Phantasmal Flames ETB promo (design 055).
test('the Phantasmal Flames ETB promo is baked as one Charcadet MEP 022', () => {
  assert.deepEqual(Object.keys(ETB_PROMOS), ['phantasmal-flames-etb']);
  const promo = ETB_PROMOS['phantasmal-flames-etb'];
  assert.equal(promo.id, 'mep-022');
  assert.equal(promo.name, 'Charcadet');
  assert.equal(promo.supertype, 'Pokémon');
  assert.equal(promo.rarity, 'Promo');
  assert.equal(promo.qty, 1);
  assert.match(promo.image, /^https:\/\//);
  assert.match(promo.images.small, /^https:\/\//);
});

test('every box deck sprite slug exists in the sprite catalog', () => {
  for (const deck of box.decks) {
    assert.equal(deck.sprites.length, 2, deck.key);
    for (const slug of deck.sprites) assert.ok(findPokemonBySlug(slug), `${deck.key}: ${slug}`);
  }
});

test('starter decks carry the intended trainers, not their neighbouring ids', () => {
  const names = new Set(Object.values(GENERATED_STARTER_DECKS).flat().map((row) => row.name));
  for (const wrong of [
    'Forest of Vitality',
    'Dizzying Valley',
    'Sacred Charm',
    'Pokégear 3.0',
    "Lt. Surge's Bargain",
    'Raifort',
    'Fennel',
    'Potion',
    'Silvally',
  ]) {
    assert.ok(!names.has(wrong), wrong);
  }
  for (const intended of [
    'Fighting Gong',
    'Firebreather',
    'Academy at Night',
    'Hilda',
    'Gravity Mountain',
    "Lana's Aid",
    'Energy Retrieval',
    'Precious Trolley',
    'Dangerous Laser',
  ]) {
    assert.ok(names.has(intended), intended);
  }
});
