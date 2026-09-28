import test from 'node:test';
import assert from 'node:assert/strict';

import { BASIC_ENERGY_LABELS, ME_PACK_MODEL, packModelFor } from '../../build-battle/box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS, ETB_PROMOS } from '../../build-battle/build-battle.generated.mjs';
import { getCoins } from '../../coins.mjs';
import { getSleeves } from '../../sleeves.mjs';
import { ELITE_TRAINER_BOXES, availableEtbs, getEtb } from '../etb-catalog.mjs';

test('packModelFor returns the me02 model and null for a set with none', () => {
  assert.equal(packModelFor('me02'), ME_PACK_MODEL);
  assert.equal(packModelFor('sv01'), null);
  assert.equal(packModelFor('toString'), null, 'prototype keys are not sets');
  assert.equal(packModelFor(undefined), null);
});

test('getEtb finds the Phantasmal Flames ETB by key', () => {
  assert.equal(getEtb('phantasmal-flames-etb').setId, 'me02');
  assert.equal(getEtb('nope'), null);
  assert.equal(getEtb(undefined), null);
});

test('row 7: availableEtbs lists only rows whose set is baked and has a pack model', () => {
  assert.deepEqual(availableEtbs().map((etb) => etb.key), ['phantasmal-flames-etb']);
  assert.deepEqual(availableEtbs({}), [], 'nothing baked, nothing on the shelf');
  assert.deepEqual(availableEtbs({ me02: [] }), []);
  for (const etb of ELITE_TRAINER_BOXES) {
    assert.ok(packModelFor(etb.setId), `${etb.key}: its set has a pack model`);
  }
});

test('row 8: every shipped row names ids its catalogs hold', () => {
  const sleeveIds = new Set(getSleeves().map((sleeve) => sleeve.id));
  const coinIds = new Set(getCoins().map((coin) => coin.id));
  for (const etb of ELITE_TRAINER_BOXES) {
    assert.ok(sleeveIds.has(etb.sleeveId), `${etb.key}: sleeve ${etb.sleeveId}`);
    assert.ok(coinIds.has(etb.coinId), `${etb.key}: coin ${etb.coinId}`);
    assert.match(etb.promoId, /^mep-\d{3}$/);
    assert.equal(ETB_PROMOS[etb.key]?.id, etb.promoId, `${etb.key}: baked promo`);
    const setIds = new Set((BUILD_BATTLE_SET_CARDS[etb.setId] || []).map((card) => card.id));
    assert.ok(setIds.has(etb.keyArtCardId), `${etb.key}: key art ${etb.keyArtCardId}`);
  }
});

test('the Phantasmal Flames ETB holds 9 packs, 65 sleeves, 40 Basic Energy and its props', () => {
  const etb = getEtb('phantasmal-flames-etb');
  assert.equal(etb.packCount, 9);
  assert.equal(etb.promoId, 'mep-022', 'Charcadet MEP 022 (Bulbapedia, PokeBeach set guide)');
  assert.equal(etb.sleeveCount, 65);
  assert.equal(etb.energy.reduce((sum, [, count]) => sum + count, 0), 40);
  for (const [label] of etb.energy) assert.ok(BASIC_ENERGY_LABELS.includes(label), label);
  assert.deepEqual(etb.props, { damageDice: 6, flipDie: 1, coin: 1, dividers: 6, guide: 1, codeCard: 1 });
  const keyArt = BUILD_BATTLE_SET_CARDS.me02.find((card) => card.id === etb.keyArtCardId);
  assert.equal(keyArt.name, 'Mega Charizard X ex', 'the box art (baked me02-013)');
});
