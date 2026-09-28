import test from 'node:test';
import assert from 'node:assert/strict';

import { getEtb } from '../etb-catalog.mjs';
import {
  collectionHeadline,
  inFlightLine,
  ownedBadge,
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
