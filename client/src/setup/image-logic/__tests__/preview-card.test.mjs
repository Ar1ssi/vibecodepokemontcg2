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

// The overlays are children of the zone <div>, absolutely positioned over the
// card, so the click never reaches the <img>. The card keeps the only
// reference to them, which is what resolves the click back.
const zoneWithCounter = (slot) => {
  const image = serverImage({ name: 'Garchomp', src: 'garchomp.png' }, 'opp');
  const zone = { querySelectorAll: (selector) => (selector === 'img' ? [image] : []) };
  const overlay = { parentElement: zone, closest: () => null };
  image[slot] = overlay;
  return { image, overlay };
};

for (const slot of ['damageCounter', 'specialCondition', 'abilityCounter']) {
  test(`a click on a card's ${slot} resolves to the card it marks`, () => {
    const { image, overlay } = zoneWithCounter(slot);
    assert.equal(resolvePreviewCard(null, overlay).image, image);
  });
}

test('a click on the stadium slot previews the card sitting in it', () => {
  const image = serverImage({ name: 'Cosmic Estate', src: 'estate.png' }, 'neutral');
  const stadium = { querySelectorAll: (selector) => (selector === 'img' ? [image] : []) };
  const plate = {
    parentElement: stadium,
    closest: (selector) => (selector.includes('#stadium') ? stadium : null),
  };
  assert.equal(resolvePreviewCard(null, plate).name, 'Cosmic Estate');
});

test('a click on decoration in a zone holding several cards is not guessed at', () => {
  const first = serverImage({ name: 'Sobble', src: 'sobble.png' }, 'opp');
  const second = serverImage({ name: 'Dracovish', src: 'dracovish.png' }, 'opp');
  const zone = { querySelectorAll: (selector) => (selector === 'img' ? [first, second] : []) };
  const plate = {
    parentElement: zone,
    closest: (selector) => (selector.includes('#bench') ? zone : null),
  };
  assert.equal(resolvePreviewCard(null, plate), null);
});

test('nothing to preview without a card or a target', () => {
  assert.equal(resolvePreviewCard(undefined, undefined), null);
  assert.equal(resolvePreviewCard(null, { closest: () => null }), null);
});
