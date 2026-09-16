import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePreviewCard } from '../preview-card.mjs';

// What apply-view.js builds for a server-rendered card: an <img> stand-in
// with the view's card data stamped on it as `.card`.
const serverImage = (card, user = 'opp') => ({ card, user });

test('a legacy card with an image is previewed as-is', () => {
  const legacy = { name: 'Pikachu', image: {} };
  assert.equal(resolvePreviewCard(legacy, serverImage({ name: 'Other' })), legacy);
});

test('a server-rendered card is previewed from its stamped data', () => {
  const image = serverImage({ name: 'Groudon', src: 'groudon.png' }, 'opp');
  const card = resolvePreviewCard(undefined, image);
  assert.equal(card.name, 'Groudon');
  assert.equal(card.image, image);
  assert.equal(card.user, 'opp');
});

test('a click on a holo layer resolves to the wrapped card image', () => {
  const image = serverImage({ name: 'Kyogre', src: 'kyogre.png' }, 'self');
  const wrapper = { querySelector: (selector) => (selector === 'img' ? image : null) };
  const holoLayer = { closest: (selector) => (selector === '.mat-holo' ? wrapper : null) };
  assert.equal(resolvePreviewCard(null, holoLayer).image, image);
});

test('a face-down server card is not previewed', () => {
  assert.equal(resolvePreviewCard(undefined, serverImage({})), null);
});

test('nothing to preview without a card or a target', () => {
  assert.equal(resolvePreviewCard(undefined, undefined), null);
  assert.equal(resolvePreviewCard(null, { closest: () => null }), null);
});
