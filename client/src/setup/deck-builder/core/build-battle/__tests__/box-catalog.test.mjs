import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_ENERGY_LABELS,
  BOX_KINDS,
  BUILD_BATTLE_BOXES,
  BUILD_BATTLE_ERAS,
  BUILD_BATTLE_ERA_NAMES,
  DEFAULT_BOX_KEY,
  boxesForEra,
  getBuildBattleBox,
} from '../box-catalog.mjs';
import { loadBoxData, setIdOfCardId } from '../box-data.mjs';
import { EVOLUTION_PACK_SIZE, evolutionPairingProblems } from '../pack-opening.mjs';
import { CARD_CLASSES, PACK_MODELS, RARITY_CLASSES } from '../pack-models.mjs';
import { findPokemonBySlug } from '../../deck-sprites.mjs';
import { GENERATED_STARTER_DECKS } from '../../starter-decks.generated.mjs';

const loadedBoxes = await Promise.all(BUILD_BATTLE_BOXES.map((box) => loadBoxData(box.key)));
const deckTotal = (rows) => rows.reduce((sum, row) => sum + row.qty, 0);

test('the catalog: unique keys, known eras and kinds, four decks, a pack model of the box era', () => {
  assert.equal(getBuildBattleBox('nope'), null);
  assert.equal(getBuildBattleBox(undefined), null);
  assert.equal(getBuildBattleBox(DEFAULT_BOX_KEY)?.setId, 'me02');
  assert.equal(new Set(BUILD_BATTLE_BOXES.map((box) => box.key)).size, BUILD_BATTLE_BOXES.length);
  for (const box of BUILD_BATTLE_BOXES) {
    assert.ok(BUILD_BATTLE_ERA_NAMES[box.era], box.key);
    assert.ok(BOX_KINDS.includes(box.kind), box.key);
    assert.equal(PACK_MODELS[box.packModelKey]?.era, box.era, box.key);
    assert.equal(box.packCount, 4, box.key);
    assert.equal(box.energyCount, box.kind === 'evolution-deck' ? 17 : 0, box.key);
    assert.equal(box.decks.length, 4, box.key);
    assert.equal(new Set(box.decks.map((deck) => deck.key)).size, 4, box.key);
    assert.ok(box.name.startsWith(box.shortName), box.key);
    assert.match(box.sources.box, /^https:\/\/bulbapedia\.bulbagarden\.net\/wiki\/.+_\(TCG\)$/, box.key);
    assert.match(box.sources.packs, /^https:\/\//, box.key);
    assert.equal(box.skin.packArtCardIds.length, 4, box.key);
    assert.ok(BUILD_BATTLE_ERA_NAMES[box.skin.palette], box.key);
  }
});

test('the eras list every box once, in release order', () => {
  assert.deepEqual(
    BUILD_BATTLE_ERAS.map((era) => era.key),
    ['xy', 'sm', 'swsh', 'sv', 'me']
  );
  assert.deepEqual(
    BUILD_BATTLE_ERAS.flatMap((era) => era.boxKeys),
    BUILD_BATTLE_BOXES.map((box) => box.key)
  );
  for (const era of BUILD_BATTLE_ERAS) {
    assert.deepEqual(boxesForEra(era.key).map((box) => box.key), era.boxKeys);
  }
  assert.deepEqual(boxesForEra('nope'), []);
});

test('row 17: every promo is its own card, present once in the box data', () => {
  const promoIds = BUILD_BATTLE_BOXES.flatMap((box) => box.decks.map((deck) => deck.promoId));
  assert.equal(new Set(promoIds).size, promoIds.length);
  for (const { box, data } of loadedBoxes) {
    for (const deck of box.decks) {
      assert.ok(data.cardsById.has(deck.promoId), `${box.key}: ${deck.promoId}`);
      assert.equal(setIdOfCardId(deck.promoId), box.promoSetId, `${box.key}: ${deck.promoId}`);
      if (box.kind === 'fixed-decks') {
        const rows = data.decks[deck.key].filter((row) => row.id === deck.promoId);
        assert.deepEqual(rows.map((row) => row.qty), [1], `${box.key} ${deck.key}`);
      } else {
        assert.equal(data.promos[deck.key], deck.promoId, `${box.key} ${deck.key}`);
      }
    }
  }
});

test('fixed decks are exactly the catalog decks, 40 cards each, with their Basic Energy', () => {
  for (const { box, data } of loadedBoxes.filter(({ box }) => box.kind === 'fixed-decks')) {
    assert.deepEqual(Object.keys(data.decks).sort(), box.decks.map((deck) => deck.key).sort(), box.key);
    for (const deck of box.decks) {
      assert.equal(deckTotal(data.decks[deck.key]), 40, `${box.key} ${deck.key}`);
      assert.ok(BASIC_ENERGY_LABELS.includes(deck.energy), `${box.key} ${deck.key}`);
      assert.ok(data.decks[deck.key].some((row) => row.name === deck.energy), `${box.key} ${deck.key}`);
    }
  }
});

test('rows 4 + 16: every pairing of every Evolution box fills its pack and its Energy', () => {
  for (const { box, data } of loadedBoxes.filter(({ box }) => box.kind !== 'fixed-decks')) {
    assert.deepEqual(evolutionPairingProblems({ box, data }), [], box.key);
    assert.deepEqual(Object.keys(data.groups).sort(), box.decks.map((deck) => deck.key).sort(), box.key);
    for (const pool of data.trainers) {
      for (const card of pool.cards) {
        assert.ok(data.cardsById.has(card.id), `${box.key}: ${card.id}`);
        assert.ok(card.min >= 0 && card.max >= card.min && card.max <= 2, `${box.key}: ${card.id}`);
      }
    }
    if (box.kind === 'evolution-deck') {
      for (const deck of box.decks) {
        const needs = data.energyNeeds[deck.key] || [];
        for (const [label, weight] of needs) {
          assert.ok(BASIC_ENERGY_LABELS.includes(label) && weight > 0, `${box.key} ${deck.key}: ${label}`);
        }
        const heaviest = needs.reduce((best, entry) => (!best || entry[1] > best[1] ? entry : best), null);
        assert.equal(deck.energy, heaviest?.[0] ?? null, `${box.key} ${deck.key}: the catalog label is the heaviest need`);
      }
    } else {
      assert.deepEqual(data.energyNeeds, {}, box.key);
      assert.ok(box.decks.every((deck) => deck.energy === null), `${box.key}: an Evolution pack deals no Energy`);
    }
  }
  assert.equal(EVOLUTION_PACK_SIZE, 23);
});

test('row 27: pack cards are the box set (and its Trainer Gallery); group and pool rows may be older prints', () => {
  for (const { box, cards, setInfo } of loadedBoxes) {
    assert.equal(setInfo.id, box.setId, box.key);
    for (const card of cards) {
      const setId = setIdOfCardId(card.id);
      assert.ok(setId === box.setId || setInfo.subsets?.[setId], `${box.key}: ${card.id}`);
      assert.equal(Boolean(card.subset), setId !== box.setId, `${box.key}: ${card.id}`);
    }
  }
});

test('every set card and box card carries id, art, supertype and TCGdex fields', () => {
  for (const { box, cards, data } of loadedBoxes) {
    for (const row of [...cards, ...data.cardsById.values()]) {
      assert.ok(row.id && row.name, `${box.key}: ${JSON.stringify(row)}`);
      assert.match(row.image, /^https:\/\//, `${box.key}: ${row.id}`);
      assert.match(row.images.small, /^https:\/\//, `${box.key}: ${row.id}`);
      assert.ok(['Pokémon', 'Trainer', 'Energy'].includes(row.supertype), `${box.key}: ${row.id}`);
      assert.ok(Array.isArray(row.types), `${box.key}: ${row.id}`);
    }
    for (const card of cards) assert.ok(card.rarity, `${box.key}: ${card.id} has no rarity`);
  }
});

test("every era's class matchers name rarities its baked sets print", () => {
  const rarityPrinted = new Map();
  for (const { box, cards } of loadedBoxes) {
    for (const card of cards) rarityPrinted.set(`${box.era}|${card.subset || ''}|${card.rarity}`, true);
  }
  for (const era of new Set(BUILD_BATTLE_BOXES.map((box) => box.era))) {
    for (const name of CARD_CLASSES) {
      const matchers = RARITY_CLASSES[era][name] || [];
      if (!matchers.length) continue;
      const printed = matchers.filter((matcher) => rarityPrinted.has(`${era}|${matcher.subset || ''}|${matcher.rarity}`));
      assert.ok(printed.length, `${era} ${name}: none of ${matchers.map((matcher) => matcher.rarity).join(', ')}`);
    }
  }
});

test('row 19: every listed deck sprite slug exists in the sprite catalog', () => {
  for (const box of BUILD_BATTLE_BOXES) {
    for (const deck of box.decks) {
      assert.ok(deck.sprites.length <= (box.kind === 'fixed-decks' ? 2 : 1), `${box.key} ${deck.key}`);
      for (const slug of deck.sprites) assert.ok(findPokemonBySlug(slug), `${box.key} ${deck.key}: ${slug}`);
    }
  }
});

// Source: TCGdex set me02 (Phantasmal Flames), rarities as baked.
test('me02 bakes all 130 cards with the TCGdex rarity tally', () => {
  const { cards } = loadedBoxes.find(({ box }) => box.key === 'phantasmal-flames');
  assert.equal(cards.length, 130);
  const tally = {};
  for (const card of cards) tally[card.rarity] = (tally[card.rarity] || 0) + 1;
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
  assert.equal(new Set(cards.map((card) => card.id)).size, 130);
  const localIds = cards.map((card) => card.localId);
  assert.deepEqual(localIds, [...localIds].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
});

// Source: Bulbapedia "Phantasmal Flames Build & Battle Box (TCG)" decklist tables.
test('the Toxtricity deck matches the printed list', () => {
  const { data } = loadedBoxes.find(({ box }) => box.key === 'phantasmal-flames');
  const byId = Object.fromEntries(data.decks.toxtricity.map((row) => [row.id, row.qty]));
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
  const { data } = loadedBoxes.find(({ box }) => box.key === 'phantasmal-flames');
  const byId = Object.fromEntries(data.decks.ceruledge.map((row) => [row.id, row.qty]));
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

// The box-front rule per era (box-catalog.mjs defineBox): the Special Illustration Rare of the
// Pokémon on the set's first top-tier card, by TCGdex rarity.
const KEY_ART_TOP_RARITY = { sv: 'Hyper rare', me: 'Mega Hyper Rare' };

test('key art: the SIR of the Pokémon on the set\'s first top-tier card (SV Hyper rare, ME Mega Hyper Rare)', () => {
  for (const { box, cards } of loadedBoxes.filter(({ box }) => KEY_ART_TOP_RARITY[box.era])) {
    const top = cards.find((card) => card.rarity === KEY_ART_TOP_RARITY[box.era] && card.supertype === 'Pokémon');
    const keyArt = cards.find((card) => card.id === box.skin.keyArtCardId);
    assert.ok(top, `${box.key}: no top-tier Pokémon`);
    assert.equal(keyArt?.rarity, 'Special illustration rare', box.key);
    assert.equal(keyArt?.name, top.name, box.key);
  }
});
