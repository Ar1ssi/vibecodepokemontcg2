import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeSlideToHolo, foilLookupCard } from '../slide-holo-upgrade.mjs';

const SRC = 'https://assets.tcgdex.net/en/sv/sv03.5/151/high.webp';

const fakeImg = ({ connected = true } = {}) => {
  const img = {
    src: SRC,
    isConnected: connected,
    replacedWith: null,
    getAttribute: (name) => (name === 'src' ? SRC : null),
    replaceWith(node) {
      this.replacedWith = node;
    },
  };
  return img;
};

const deps = (overrides = {}) => ({
  loadCardData: async (card) => ({ ...card, rarity: 'Special Illustration Rare' }),
  loadManifest: async () => null,
  resolveEffect: (card) => (card.rarity ? 'special illustration rare' : null),
  build: (card, effect) => ({ kind: 'holo', effect, name: card.name }),
  ...overrides,
});

test('a card without loaded rarity is looked up and its plain scan swapped for the holo card', async () => {
  const img = fakeImg();
  const wrapper = await upgradeSlideToHolo({ name: 'Mew ex', set: 'sv03.5', number: '151' }, img, deps());
  assert.deepEqual(wrapper, { kind: 'holo', effect: 'special illustration rare', name: 'Mew ex' });
  assert.equal(img.replacedWith, wrapper);
});

test('the lookup works on a copy: the zone card is never mutated', async () => {
  const card = { name: 'Mew ex', image: { src: SRC } };
  await upgradeSlideToHolo(card, fakeImg(), deps());
  assert.equal(card.rarity, undefined);
  assert.deepEqual(foilLookupCard(card, SRC).image, { src: SRC });
});

test('a card with no foil keeps its plain scan', async () => {
  const img = fakeImg();
  const wrapper = await upgradeSlideToHolo({ name: 'Pikachu' }, img, deps({ resolveEffect: () => null }));
  assert.equal(wrapper, null);
  assert.equal(img.replacedWith, null);
});

test('a slide that left the page while the lookup ran is not touched', async () => {
  const img = fakeImg({ connected: false });
  assert.equal(await upgradeSlideToHolo({ name: 'Mew ex' }, img, deps()), null);
  assert.equal(img.replacedWith, null);
});

test('a failed card-data or manifest lookup keeps the plain scan', async () => {
  const img = fakeImg();
  const failing = deps({ loadManifest: async () => Promise.reject(new Error('offline')) });
  assert.equal(await upgradeSlideToHolo({ name: 'Mew ex' }, img, failing), null);
  assert.equal(img.replacedWith, null);
});

test('no card or no art: nothing to upgrade', async () => {
  assert.equal(await upgradeSlideToHolo(null, fakeImg(), deps()), null);
  assert.equal(await upgradeSlideToHolo({ name: 'Mew ex' }, { getAttribute: () => '' }, deps()), null);
});
