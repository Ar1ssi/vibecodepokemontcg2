import test from 'node:test';
import assert from 'node:assert/strict';

import { getBuildBattleBox } from '../../build-battle/box-catalog.mjs';
import { loadSetData } from '../../build-battle/box-data.mjs';
import { boxSkin } from '../../build-battle/unboxing.mjs';
import { getEtb } from '../etb-catalog.mjs';
import {
  collectionHeadline,
  etbInsideLines,
  etbLook,
  inFlightLine,
  ownedBadge,
  ownedTileLabel,
  parseEtbQuery,
  shelfLine,
} from '../etb-view.mjs';

const etb = getEtb('phantasmal-flames-etb');

test('shelfLine lists what the box holds, the promo named from the baked row', () => {
  assert.equal(shelfLine(etb), '9 packs · Charcadet promo · 65 sleeves · 40 Energy · dice · coin');
  assert.equal(
    shelfLine(etb, {}),
    '9 packs · 65 sleeves · 40 Energy · dice · coin',
    'no promo row, no promo named'
  );
  const bare = { ...etb, packCount: 1, props: { ...etb.props, damageDice: 0, flipDie: 0, coin: 0 } };
  assert.equal(shelfLine(bare, {}), '1 pack · 65 sleeves · 40 Energy');
});

test('inFlightLine names the box being opened', () => {
  assert.equal(
    inFlightLine(etb),
    'Your Mega Evolution—Phantasmal Flames Elite Trainer Box is being opened'
  );
});

test('collectionHeadline counts cards, unique cards and boxes', () => {
  assert.equal(collectionHeadline({ cards: 91, unique: 42, products: 1 }), '91 cards · 42 unique · 1 box opened');
  assert.equal(collectionHeadline({ cards: 1, unique: 1, products: 2 }), '1 card · 1 unique · 2 boxes opened');
});

test('row 12: ownedBadge turns amber when the deck holds more than is owned', () => {
  assert.deepEqual(ownedBadge(3, 4), { text: '3 owned · 4 in deck', over: true });
  assert.deepEqual(ownedBadge(3, 3), { text: '3 owned · 3 in deck', over: false });
  assert.deepEqual(ownedBadge(2), { text: '2 owned', over: false });
  assert.deepEqual(ownedBadge(2, 0), { text: '2 owned', over: false });
});

test('row 19: parseEtbQuery prefills a known box and ignores an unknown one', () => {
  assert.deepEqual(parseEtbQuery('?etb=phantasmal-flames-etb&seed=42'), {
    etbKey: 'phantasmal-flames-etb',
    seed: 42,
  });
  assert.deepEqual(parseEtbQuery('?etb=phantasmal-flames-etb'), {
    etbKey: 'phantasmal-flames-etb',
    seed: null,
  });
  assert.deepEqual(parseEtbQuery('?etb=phantasmal-flames-etb&seed=-3').seed, null);
  assert.equal(parseEtbQuery('?etb=nope&seed=42'), null);
  assert.equal(parseEtbQuery('?seed=42'), null);
  assert.equal(parseEtbQuery(''), null);
  assert.equal(parseEtbQuery('?etb=toString'), null);
});

test('etbInsideLines lists the box contents from the catalog row', async () => {
  assert.deepEqual(etbInsideLines(etb, 'Phantasmal Flames'), [
    '9 Phantasmal Flames booster packs',
    '1 foil promo card featuring Charcadet',
    '65 card sleeves',
    '40 Pokémon TCG Energy cards',
    '6 damage-counter dice',
    '1 competition-legal coin-flip die',
    '1 plastic coin',
    '6 card dividers',
    'A code card for Pokémon TCG Live',
  ]);
  assert.ok(!etbInsideLines(etb, 'X', {}).some((line) => line.includes('promo')));
});

test('etbLook wears its set box wrappers, the ETB key art and ETB labels', async () => {
  const loaded = await loadSetData('me02');
  const look = etbLook(etb, loaded);
  const setBoxSkin = boxSkin({ box: getBuildBattleBox('phantasmal-flames'), ...loaded });
  assert.deepEqual(look.skin.packArts, setBoxSkin.packArts, 'the same booster wrappers as the B&B box');
  assert.equal(look.skin.palette, setBoxSkin.palette);
  assert.match(look.skin.keyArtUrl, /me02\/013\/high\.webp$/, 'Mega Charizard X ex, the box art');
  assert.equal(look.skin.faces, null);
  assert.equal(look.skin.render, null);
  assert.equal(look.labels.productTitle, 'Elite Trainer Box');
  assert.equal(look.labels.backLines[0], '9 Phantasmal Flames booster packs');
  assert.equal(look.setName, 'Phantasmal Flames');
  assert.equal(look.playLevel, false);
  assert.ok(look.seriesName);
});

test('ownedTileLabel names owned copies and stays empty for none', () => {
  assert.equal(ownedTileLabel(2), '×2 owned');
  assert.equal(ownedTileLabel(1), '×1 owned');
  for (const none of [0, undefined, null, -1, 1.5, '2']) assert.equal(ownedTileLabel(none), '', String(none));
});
