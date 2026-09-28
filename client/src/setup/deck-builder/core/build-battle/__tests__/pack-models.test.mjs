import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { loadBoxData } from '../box-data.mjs';
import { openPack } from '../pack-opening.mjs';
import {
  BOOSTED_RATE_PROFILE,
  PACK_MODELS,
  RARITY_CLASSES,
  cardClass,
  isSecretCard,
  resolvePackModel,
} from '../pack-models.mjs';

const PACKS = 4000;

// A synthetic set: `counts` rows per rarity (main set, numbered 1..official), `secret` rows above
// the official count, `tg` Trainer Gallery rows (localId TG01…).
function syntheticSet({ counts = {}, secret = {}, tg = {}, official = null }) {
  const cards = [];
  let number = 0;
  const add = (rarity, localId, extra = {}) =>
    cards.push({ id: `x-${localId}`, name: `${rarity} ${localId}`, supertype: 'Pokémon', localId, rarity, ...extra });
  for (const [rarity, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) add(rarity, String((number += 1)));
  }
  const setInfo = { id: 'x', official: official ?? number };
  for (const [rarity, count] of Object.entries(secret)) {
    for (let index = 0; index < count; index += 1) add(rarity, String((number += 1)));
  }
  let tgNumber = 0;
  for (const [rarity, count] of Object.entries(tg)) {
    for (let index = 0; index < count; index += 1) {
      tgNumber += 1;
      add(rarity, `TG${String(tgNumber).padStart(2, '0')}`, { subset: 'tg' });
    }
  }
  return { cards, setInfo };
}

// Share of packs holding at least one card of each class, over PACKS seeded packs.
function classRates({ cards, setInfo }, modelKey, era = PACK_MODELS[modelKey].era) {
  const packModel = resolvePackModel(modelKey, cards, setInfo);
  const tally = {};
  for (let seed = 0; seed < PACKS; seed += 1) {
    const pack = openPack({ cards, packModel, rng: createRng(seed) });
    assert.equal(pack.length, packModel.slots.reduce((sum, slot) => sum + slot.count, 0));
    for (const name of new Set(pack.map((card) => cardClass(card, era, setInfo)).filter(Boolean))) {
      tally[name] = (tally[name] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(tally).map(([name, count]) => [name, count / PACKS]));
}

const near = (rates, name, expected, tolerance) =>
  assert.ok(
    Math.abs((rates[name] || 0) - expected) <= tolerance,
    `${name}: ${(rates[name] || 0).toFixed(4)} vs ${expected} ± ${tolerance}`
  );

test('the boosted profile is the 30th Celebration per-pack chances', () => {
  assert.deepEqual(BOOSTED_RATE_PROFILE, {
    hit: 0.25,
    ultra: 0.08,
    illustration: 0.2,
    specialIllustration: 0.05,
    aceSpec: 0.05,
    top: 0.01,
  });
  assert.deepEqual(Object.keys(PACK_MODELS).sort(), ['me', 'sm', 'sv', 'sv-acespec', 'swsh', 'swsh-tg', 'xy']);
  for (const packModel of Object.values(PACK_MODELS)) {
    const size = packModel.slots.reduce((sum, slot) => sum + slot.count, 0);
    assert.equal(size, packModel.size, packModel.key);
    assert.ok(RARITY_CLASSES[packModel.era], packModel.key);
  }
});

test('row 10: me02 packs roll DR 25 %, UR 8 %, IR 20 %, SIR 5 %, MHR 1 %', async () => {
  const { cards, setInfo } = await loadBoxData('phantasmal-flames');
  const rates = classRates({ cards, setInfo }, 'me');
  near(rates, 'hit', 0.25, 0.02);
  near(rates, 'ultra', 0.08, 0.015);
  near(rates, 'illustration', 0.2, 0.02);
  near(rates, 'specialIllustration', 0.05, 0.01);
  near(rates, 'top', 0.01, 0.005);
});

test('row 10: me01 packs roll the same profile', async () => {
  const { cards, setInfo } = await loadBoxData('mega-evolution');
  const rates = classRates({ cards, setInfo }, 'me');
  near(rates, 'hit', 0.25, 0.02);
  near(rates, 'ultra', 0.08, 0.015);
  near(rates, 'illustration', 0.2, 0.02);
  near(rates, 'specialIllustration', 0.05, 0.01);
  near(rates, 'top', 0.01, 0.005);
});

test('row 10: sv and sv-acespec packs on a synthetic SV set', () => {
  const set = syntheticSet({
    counts: { Common: 60, Uncommon: 40, Rare: 20, 'Double rare': 12, 'ACE SPEC Rare': 6 },
    secret: { 'Illustration rare': 20, 'Ultra Rare': 16, 'Special illustration rare': 10, 'Hyper rare': 5 },
  });
  for (const modelKey of ['sv', 'sv-acespec']) {
    const rates = classRates(set, modelKey);
    near(rates, 'hit', 0.25, 0.02);
    near(rates, 'ultra', 0.08, 0.015);
    near(rates, 'illustration', 0.2, 0.02);
    near(rates, 'specialIllustration', 0.05, 0.01);
    near(rates, 'top', 0.01, 0.005);
    near(rates, 'aceSpec', modelKey === 'sv-acespec' ? 0.05 : 0, 0.01);
  }
});

test('row 10: swsh packs roll hit 25 %, UR 8 %, top 1 %; swsh-tg adds the Trainer Gallery at 25 %', () => {
  const set = syntheticSet({
    counts: { Common: 60, Uncommon: 50, Rare: 30, 'Holo Rare': 15, 'Holo Rare V': 15, 'Holo Rare VMAX': 5, 'Ultra Rare': 20 },
    secret: { 'Secret Rare': 15 },
    tg: { Rare: 12, 'Ultra Rare': 16, 'Secret Rare': 2 },
  });
  const plain = classRates(set, 'swsh');
  near(plain, 'hit', 0.25, 0.02);
  near(plain, 'ultra', 0.08, 0.015);
  near(plain, 'top', 0.01, 0.005);
  assert.equal(plain.illustration || 0, 0, 'no Trainer Gallery without the TG slot');
  const gallery = classRates(set, 'swsh-tg');
  near(gallery, 'illustration', 0.2, 0.02);
  near(gallery, 'specialIllustration', 0.05, 0.01);
  near(gallery, 'hit', 0.25, 0.02);
  near(gallery, 'top', 0.01, 0.005);
});

test('row 10: sm and xy packs roll the merged EX/GX class at 33 % and the top tier at 1 %', () => {
  const set = syntheticSet({
    counts: { Common: 45, Uncommon: 45, Rare: 40, 'Ultra Rare': 25 },
    secret: { 'Secret Rare': 17 },
  });
  for (const modelKey of ['sm', 'xy']) {
    const rates = classRates(set, modelKey);
    near(rates, 'hit', 0.33, 0.02);
    near(rates, 'top', 0.01, 0.005);
  }
});

test('row 9: a class the set does not print gives its weight to the slot filler only', () => {
  const noAceSpec = syntheticSet({
    counts: { Common: 60, Uncommon: 40, Rare: 20, 'Double rare': 12 },
    secret: { 'Illustration rare': 20, 'Ultra Rare': 16, 'Special illustration rare': 10, 'Hyper rare': 5 },
  });
  const resolved = resolvePackModel('sv-acespec', noAceSpec.cards, noAceSpec.setInfo);
  const weights = (slot) => Object.fromEntries(slot.rows.map((row) => [row.pool, row.weight]));
  assert.deepEqual(weights(resolved.slots[2]), { aceSpec: 0, reverse: 1 });
  assert.deepEqual(
    weights(resolved.slots[3]),
    weights(resolvePackModel('sv', noAceSpec.cards, noAceSpec.setInfo).slots[3]),
    'the art slot is untouched'
  );
  const rates = classRates(noAceSpec, 'sv-acespec');
  near(rates, 'hit', 0.25, 0.02);
  near(rates, 'top', 0.01, 0.005);

  const noSir = syntheticSet({
    counts: { Common: 50, Uncommon: 40, Rare: 12, 'Double rare': 10 },
    secret: { 'Illustration rare': 13, 'Ultra Rare': 17, 'Mega Hyper Rare': 1 },
  });
  const meResolved = resolvePackModel('me', noSir.cards, noSir.setInfo);
  const artSlot = weights(meResolved.slots[3]);
  assert.equal(artSlot.specialIllustration, 0);
  assert.equal(artSlot.illustration, 0.2);
  assert.ok(Math.abs(artSlot.reverse - 0.8) < 1e-9, String(artSlot.reverse));
});

test('row 21: a swsh-tg set without Trainer Gallery rows falls back to the reverse filler', () => {
  const set = syntheticSet({ counts: { Common: 60, Uncommon: 50, Rare: 30, 'Holo Rare V': 15, 'Ultra Rare': 20 } });
  const resolved = resolvePackModel('swsh-tg', set.cards, set.setInfo);
  const tgSlot = Object.fromEntries(resolved.slots[2].rows.map((row) => [row.pool, row.weight]));
  assert.deepEqual(tgSlot, { illustration: 0, specialIllustration: 0, reverse: 1 });
});

test('row 11: secrets are numbered above the official count; TG rows and missing counts are never secret', () => {
  const setInfo = { official: 181 };
  assert.equal(isSecretCard({ localId: '182' }, setInfo), true);
  assert.equal(isSecretCard({ localId: '181' }, setInfo), false);
  assert.equal(isSecretCard({ localId: '050' }, { official: 49 }), true);
  assert.equal(isSecretCard({ localId: 'TG30', subset: 'tg' }, setInfo), false);
  assert.equal(isSecretCard({ localId: '240' }, {}), false);
  assert.equal(isSecretCard({ localId: 'SM158' }, setInfo), false);
});

test('cardClass reads each era: merged XY/SM tiers, SWSH main set vs Trainer Gallery, SV and ME strings', () => {
  const official = { official: 100 };
  assert.equal(cardClass({ rarity: 'Ultra Rare', localId: '50' }, 'sm', official), 'hit');
  assert.equal(cardClass({ rarity: 'Ultra Rare', localId: '150' }, 'sm', official), 'top');
  assert.equal(cardClass({ rarity: 'Secret Rare', localId: '150' }, 'xy', official), 'top');
  assert.equal(cardClass({ rarity: 'Rare', localId: '5' }, 'sm', official), null);
  assert.equal(cardClass({ rarity: 'Holo Rare V', localId: '20' }, 'swsh', official), 'hit');
  assert.equal(cardClass({ rarity: 'Radiant Rare', localId: '20' }, 'swsh', official), 'hit');
  assert.equal(cardClass({ rarity: 'Ultra Rare', localId: '90' }, 'swsh', official), 'ultra');
  assert.equal(cardClass({ rarity: 'Holo Rare', localId: '9' }, 'swsh', official), null);
  assert.equal(cardClass({ rarity: 'Holo Rare', localId: 'TG01', subset: 'tg' }, 'swsh', official), 'illustration');
  assert.equal(cardClass({ rarity: 'Holo Rare V', localId: 'TG12', subset: 'tg' }, 'swsh', official), 'specialIllustration');
  assert.equal(cardClass({ rarity: 'Full Art Trainer', localId: 'TG25', subset: 'tg' }, 'swsh', official), 'specialIllustration');
  assert.equal(cardClass({ rarity: 'ACE SPEC Rare', localId: '140' }, 'sv', official), 'aceSpec');
  assert.equal(cardClass({ rarity: 'Hyper rare', localId: '260' }, 'sv', official), 'top');
  assert.equal(cardClass({ rarity: 'Mega Hyper Rare', localId: '130' }, 'me', official), 'top');
  assert.equal(cardClass({ rarity: 'Double rare', localId: '10' }, 'me', official), 'hit');
  assert.equal(cardClass(null, 'me', official), null);
  assert.equal(cardClass({ rarity: 'Double rare' }, 'nope', official), null);
});

test('Basic Energy and secret Commons never enter a pack', () => {
  const set = syntheticSet({ counts: { Common: 12, Uncommon: 6, Rare: 4, 'Ultra Rare': 2 } });
  const energy = { id: 'x-e', name: 'Grass Energy', supertype: 'Energy', localId: '164', rarity: 'Common' };
  const cards = [...set.cards, energy];
  const resolved = resolvePackModel('sm', cards, set.setInfo);
  for (const slot of resolved.slots) {
    for (const row of slot.rows) assert.ok(!row.ids.includes('x-e'), row.pool);
  }
  assert.ok(!resolved.allIds.includes('x-e'));
  for (let seed = 0; seed < 50; seed += 1) {
    const pack = openPack({ cards, packModel: resolved, rng: createRng(seed) });
    assert.ok(pack.every((card) => card.id !== 'x-e'));
  }
});

test('resolvePackModel refuses an unknown key', () => {
  assert.equal(resolvePackModel('nope', [], {}), null);
  assert.equal(resolvePackModel(undefined, [], {}), null);
});
