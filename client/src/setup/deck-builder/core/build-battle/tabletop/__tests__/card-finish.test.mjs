import test from 'node:test';
import assert from 'node:assert/strict';

import { hydrateSetCards } from '../../box-data.mjs';
import ME02_ROWS, { SET as ME02 } from '../../sets/me02.generated.mjs';
import { artWindowFor, cardFinish, promoFinish } from '../card-finish.mjs';

// Rows from the baked Phantasmal Flames set (TCGdex me02).
const cards = hydrateSetCards(ME02, ME02_ROWS);
const byId = (id) => cards.find((card) => card.id === id);

test('commons and uncommons in normal slots are plain prints', () => {
  assert.equal(cardFinish(byId('me02-001'), 'normal').foil, 'none'); // Oddish, Common
  assert.equal(cardFinish(byId('me02-007'), 'normal').foil, 'none'); // Ludicolo, Uncommon
});

test('a reverse slot foils everything but the SV-layout art box', () => {
  const finish = cardFinish(byId('me02-001'), 'reverse');
  assert.equal(finish.foil, 'reverse');
  assert.deepEqual(finish.window, [0.075, 0.1, 0.925, 0.525]);
});

test('an ME Rare is a holo print with the SV art-box pattern', () => {
  const finish = cardFinish(byId('me02-003'), 'normal'); // Vileplume, Rare
  assert.equal(finish.foil, 'holo');
  assert.equal(finish.pattern, 'starlight');
  assert.deepEqual(finish.window, [0.075, 0.1, 0.925, 0.525]);
});

test('hits foil the whole card, strongest on the Special Illustration Rare, gold on the Hyper Rare', () => {
  const doubleRare = cardFinish(byId('me02-004'), 'normal'); // Mega Heracross ex, Double rare
  const ultra = cardFinish(byId('me02-108'), 'normal');
  const illustration = cardFinish(byId('me02-095'), 'normal');
  const special = cardFinish(byId('me02-125'), 'normal'); // Mega Charizard X ex, SIR
  const hyper = cardFinish(byId('me02-130'), 'normal'); // Mega Hyper Rare
  assert.equal(doubleRare.foil, 'full');
  assert.equal(doubleRare.window, null);
  assert.equal(ultra.pattern, 'etched');
  assert.equal(illustration.foil, 'full');
  assert.ok(special.strength >= ultra.strength && ultra.strength > illustration.strength);
  assert.equal(hyper.foil, 'gold');
});

test('every me02 row in both slots maps to a known finish', () => {
  const foils = new Set(['none', 'holo', 'reverse', 'full', 'gold', 'rainbow']);
  for (const card of cards) {
    for (const slot of ['normal', 'reverse']) {
      const finish = cardFinish(card, slot);
      assert.ok(foils.has(finish.foil), `${card.id} ${slot}`);
      if (slot === 'reverse') assert.notEqual(finish.foil, 'none', `${card.id} reverse`);
    }
  }
});

test('a missing card has no finish; a promo without a rarity is a foil promo', () => {
  assert.equal(cardFinish(null).foil, 'none');
  const promo = promoFinish({ ...byId('me02-014'), rarity: undefined });
  assert.equal(promo.foil, 'holo');
});

test('Trainer art boxes sit lower than Pokémon ones on the same layout', () => {
  const trainer = cards.find((card) => card.supertype === 'Trainer');
  assert.ok(trainer, 'me02 has Trainers');
  assert.ok(artWindowFor(trainer)[1] > artWindowFor(byId('me02-001'))[1]);
  assert.deepEqual(artWindowFor({ image: 'https://example.com/x.png' }), [0.085, 0.105, 0.915, 0.51]);
});
