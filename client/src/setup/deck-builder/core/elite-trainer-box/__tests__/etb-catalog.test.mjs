import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_ENERGY_LABELS,
  BUILD_BATTLE_BOXES,
  getBuildBattleBox,
} from '../../build-battle/box-catalog.mjs';
import { loadSetData } from '../../build-battle/box-data.mjs';
import { PACK_MODELS } from '../../build-battle/pack-models.mjs';
import { getCoins } from '../../coins.mjs';
import { getSleeves } from '../../sleeves.mjs';
import { ELITE_TRAINER_BOXES, availableEtbs, etbPackSize, getEtb } from '../etb-catalog.mjs';
import { ETB_PROMOS } from '../etb-promos.generated.mjs';

const { cards: me02Cards } = await loadSetData('me02');

test('an ETB rolls the same pack model as the Build & Battle box of its set (design 054 owns the rates)', () => {
  for (const etb of ELITE_TRAINER_BOXES) {
    const box = BUILD_BATTLE_BOXES.find((row) => row.setId === etb.setId);
    assert.equal(etb.packModelKey, box.packModelKey, etb.key);
    assert.equal(etb.era, box.era, etb.key);
  }
  assert.equal(getEtb('phantasmal-flames-etb').packModelKey, getBuildBattleBox('phantasmal-flames').packModelKey);
  assert.equal(etbPackSize(getEtb('phantasmal-flames-etb')), 10);
  assert.equal(etbPackSize({ packModelKey: 'toString' }), 0, 'prototype keys are not models');
  assert.equal(etbPackSize(null), 0);
});

test('getEtb finds the Phantasmal Flames ETB by key', () => {
  assert.equal(getEtb('phantasmal-flames-etb').setId, 'me02');
  assert.equal(getEtb('nope'), null);
  assert.equal(getEtb(undefined), null);
});

test('row 7: availableEtbs lists only rows whose set is baked and has a pack model', () => {
  assert.deepEqual(availableEtbs().map((etb) => etb.key), ['phantasmal-flames-etb']);
  assert.deepEqual(availableEtbs([]), [], 'nothing baked, nothing on the shelf');
  assert.deepEqual(availableEtbs([{ setId: 'sv01' }]), []);
  assert.deepEqual(availableEtbs(BUILD_BATTLE_BOXES, {}), [], 'no pack model, nothing on the shelf');
  for (const etb of ELITE_TRAINER_BOXES) {
    assert.ok(Object.hasOwn(PACK_MODELS, etb.packModelKey), `${etb.key}: its pack model exists`);
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
  }
});

test('row 8: the key art of every shipped row is in its baked set', async () => {
  for (const etb of ELITE_TRAINER_BOXES) {
    const { cards } = await loadSetData(etb.setId);
    assert.ok(cards.some((card) => card.id === etb.keyArtCardId), `${etb.key}: key art ${etb.keyArtCardId}`);
  }
});

test('the promo row is the baked Charcadet MEP 022 (TCGdex mep-022, Limitless art)', () => {
  assert.deepEqual(Object.keys(ETB_PROMOS), ['phantasmal-flames-etb']);
  const promo = ETB_PROMOS['phantasmal-flames-etb'];
  assert.equal(promo.id, 'mep-022');
  assert.equal(promo.name, 'Charcadet');
  assert.equal(promo.supertype, 'Pokémon');
  assert.equal(promo.qty, 1);
  assert.match(promo.images.large, /^https:\/\//);
});

test('the Phantasmal Flames ETB holds 9 packs, 65 sleeves, 40 Basic Energy and its props', () => {
  const etb = getEtb('phantasmal-flames-etb');
  assert.equal(etb.packCount, 9);
  assert.equal(etb.promoId, 'mep-022', 'Charcadet MEP 022 (Bulbapedia, PokeBeach set guide)');
  assert.equal(etb.sleeveCount, 65);
  assert.equal(etb.energy.reduce((sum, [, count]) => sum + count, 0), 40);
  for (const [label] of etb.energy) assert.ok(BASIC_ENERGY_LABELS.includes(label), label);
  assert.deepEqual(etb.props, { damageDice: 6, flipDie: 1, coin: 1, dividers: 6, guide: 1, codeCard: 1 });
  const keyArt = me02Cards.find((card) => card.id === etb.keyArtCardId);
  assert.equal(keyArt.name, 'Mega Charizard X ex', 'the box art (baked me02-013)');
});
