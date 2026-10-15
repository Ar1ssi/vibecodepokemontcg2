import test from 'node:test';
import assert from 'node:assert/strict';

import { getBuildBattleBox } from '../../box-catalog.mjs';
import {
  BOX_MIN_HEIGHT,
  CARD,
  PACK,
  boxDimensions,
  contentsFor,
  deckThickness,
  packExtrasFor,
  packThickness,
} from '../physical.mjs';

test('a card is 63 × 88 mm and 0.31 mm thick (folio.fyi card guide)', () => {
  assert.equal(CARD.width, 63);
  assert.equal(CARD.height, 88);
  assert.equal(CARD.thickness, 0.31);
});

test('a pack keeps the vendored wrapper aspect and fits a booster top-loader (70 × 121)', () => {
  assert.equal(PACK.width, 66);
  assert.ok(Math.abs(PACK.height / PACK.width - 1426 / 780) < 0.001);
  assert.ok(PACK.width <= 70 && PACK.height <= 121);
});

test('the default box holds an upright pack and keeps the 052 proportions', () => {
  const box = boxDimensions();
  assert.equal(box.height, BOX_MIN_HEIGHT);
  assert.ok(box.height - 2 * box.board >= PACK.height + 4, 'pack headroom');
  assert.ok(box.width - 2 * box.board >= PACK.width + 16, 'pack side room');
  assert.ok(Math.abs(box.height / box.width - 1.45) < 0.02);
  assert.ok(Math.abs(box.depth / box.width - 0.65) < 0.01);
  assert.ok(box.lidFront > box.height / 2 && box.lidFront < box.height);
  assert.ok(box.lidBack > 0 && box.lidBack < box.height / 2);
});

test('a box too slim for a pack is widened, bad proportions fall back to the defaults', () => {
  assert.ok(boxDimensions({ width: 1, height: 3, depth: 0.5 }).width >= PACK.width + 18);
  assert.deepEqual(boxDimensions({ height: -1, depth: Number.NaN }), boxDimensions());
  assert.deepEqual(boxDimensions(null), boxDimensions());
});

test('deck thickness counts cards and ignores junk', () => {
  assert.equal(deckThickness(40), 12.4);
  assert.equal(deckThickness(23), 7.13);
  assert.equal(deckThickness(0), 0);
  assert.equal(deckThickness(-5), 0);
  assert.equal(deckThickness(Number.NaN), 0);
  assert.equal(packThickness(12), 3.86);
});

test('contents follow the box kind and era (catalog rows)', () => {
  const me = contentsFor(getBuildBattleBox('phantasmal-flames'));
  assert.deepEqual(me, { deck: { kind: 'deck', count: 40 }, packs: 4, codeCard: 'live', leaflet: 'tips' });
  const sv = contentsFor(getBuildBattleBox('temporal-forces'));
  assert.equal(sv.deck.count, 40);
  assert.equal(sv.codeCard, 'live');
  const swsh = contentsFor(getBuildBattleBox('sword-shield'));
  assert.deepEqual(swsh.deck, { kind: 'evolution-pack', count: 23 });
  assert.equal(swsh.codeCard, 'online');
  const kit = contentsFor(getBuildBattleBox('sun-moon'));
  assert.equal(kit.leaflet, 'guide');
  assert.deepEqual(contentsFor(null).deck, { kind: 'deck', count: 40 });
});

test('packs carry a Basic Energy from Sword & Shield on, and always a code card', () => {
  assert.deepEqual(packExtrasFor('me'), ['code', 'energy']);
  assert.deepEqual(packExtrasFor('sv'), ['code', 'energy']);
  assert.deepEqual(packExtrasFor('swsh'), ['code', 'energy']);
  assert.deepEqual(packExtrasFor('sm'), ['code']);
  assert.deepEqual(packExtrasFor('xy'), ['code']);
  assert.deepEqual(packExtrasFor(undefined), ['code']);
});
