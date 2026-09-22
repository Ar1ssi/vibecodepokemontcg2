import test from 'node:test';
import assert from 'node:assert/strict';
import { printedRarity } from '../card-classify.mjs';
import { resolveHoloEffect } from '../../../../client/src/setup/deck-builder/core/holo.mjs';

test('WotC holo-only "Rare" becomes Holo Rare (Base Set Alakazam)', () => {
  const detail = { rarity: 'Rare', variants: { holo: true, normal: false } };
  assert.equal(printedRarity(detail), 'Holo Rare');
  assert.equal(resolveHoloEffect({ name: 'Alakazam', rarity: printedRarity(detail) }), 'rare holo');
});

test('"Rare" with both holo and non-holo prints is shown as holo', () => {
  assert.equal(printedRarity({ rarity: 'Rare', variants: { holo: true, normal: true } }), 'Holo Rare');
});

test('non-holo Rare and other rarities pass through unchanged', () => {
  assert.equal(printedRarity({ rarity: 'Rare', variants: { holo: false, normal: true } }), 'Rare');
  assert.equal(printedRarity({ rarity: 'Rare' }), 'Rare');
  assert.equal(printedRarity({ rarity: 'Common', variants: { holo: true } }), 'Common');
  assert.equal(printedRarity({ rarity: 'Double rare', variants: { holo: true } }), 'Double rare');
});

test('missing detail or rarity returns an empty string', () => {
  assert.equal(printedRarity(), '');
  assert.equal(printedRarity(null), '');
  assert.equal(printedRarity({}), '');
});
