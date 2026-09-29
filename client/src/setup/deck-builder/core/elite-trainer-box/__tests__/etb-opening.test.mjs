import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { getBuildBattleBox, packModelFor } from '../../build-battle/box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS } from '../../build-battle/build-battle.generated.mjs';
import { openBox } from '../../build-battle/pack-opening.mjs';
import { getEtb } from '../etb-catalog.mjs';
import { etbContents, openEtb } from '../etb-opening.mjs';

const etb = getEtb('phantasmal-flames-etb');
const cards = BUILD_BATTLE_SET_CARDS.me02;
const packModel = packModelFor(etb.setId);
const open = (seed) => openEtb({ etb, cards, packModel, rng: createRng(seed) });

test('openEtb opens nine full packs of set cards, no id twice in a pack', () => {
  const { packs } = open(42);
  const setIds = new Set(cards.map((card) => card.id));
  assert.equal(packs.length, 9);
  for (const pack of packs) {
    assert.equal(pack.length, packModel.size);
    assert.equal(new Set(pack).size, pack.length);
    for (const id of pack) assert.ok(setIds.has(id), id);
  }
});

test('row 18: one seed is one box; another seed is another; openBox is unchanged', () => {
  assert.deepEqual(open(42), open(42));
  assert.notDeepEqual(open(42), open(43));
  const box = getBuildBattleBox('phantasmal-flames');
  const first = openBox({ box, cards, rng: createRng(42) });
  const again = openBox({ box, cards, rng: createRng(42) });
  assert.deepEqual(first, again);
  assert.notDeepEqual(first.packs[0], open(42).packs[0], 'no shared deck draw, so the streams differ');
});

test('row 7: a set with no pack model cannot be opened', () => {
  assert.throws(
    () => openEtb({ etb: { ...etb, setId: 'sv01' }, cards, packModel: null, rng: createRng(1) }),
    /no pack model for sv01/
  );
});

test('etbContents gathers the non-pack contents; the promo comes from the rows passed in', () => {
  const promo = { id: 'mep-022', name: 'Charcadet', qty: 1 };
  const contents = etbContents(etb, { 'phantasmal-flames-etb': promo });
  assert.equal(contents.promo, promo);
  assert.equal(contents.promoTier, 2, 'the Illustration Rare art plays the tier 2 flare');
  assert.equal(contents.sleeveId, etb.sleeveId);
  assert.equal(contents.coinId, etb.coinId);
  assert.deepEqual(contents.energy, etb.energy);
  assert.notEqual(contents.energy, etb.energy, 'a copy, so callers cannot edit the catalog');
  assert.deepEqual(contents.props, etb.props);
  assert.equal(etbContents(etb).promo, null);
  assert.equal(etbContents(etb).promoTier, 0, 'no promo row, no flare');
  assert.equal(etbContents(etb, null).promo, null);
});
