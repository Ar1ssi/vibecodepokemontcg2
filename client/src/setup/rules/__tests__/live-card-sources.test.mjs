// Design 023 slice 5: the resolution helpers that make the glow glue read the
// same cards/nodes the server-authoritative renderer drew. Pure fixtures only —
// no DOM, no applyView.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { glowNodeFor, liveActiveCard, liveCardFor } from '../live-card-sources.mjs';

const pokemon = (over = {}) => ({ type: 'Pokémon', name: 'Squirtle', ...over });
const energy = (over = {}) => ({ type: 'Energy', name: 'Water Energy', ...over });

const deps = (authoritative, records = []) => ({
  authoritative,
  registry: new Map(records),
});

test('liveCardFor: legacy returns the card itself', () => {
  const card = pokemon({ instanceId: 1 });
  assert.equal(liveCardFor(card, deps(false)), card);
});

test('liveCardFor: authoritative prefers the registry copy, falls back without one', () => {
  const view = pokemon({ instanceId: 7 });
  const record = { card: { ...view, attachedCards: [], abilityUsed: true } };
  assert.equal(liveCardFor(view, deps(true, [[7, record]])), record.card);
  assert.equal(liveCardFor(view, deps(true)), view);
  assert.equal(liveCardFor(null, deps(true)), null);
});

test('liveActiveCard: legacy keeps the image.relative top of the stack', () => {
  const evoImg = { attached: false, relative: null };
  const baseImg = { attached: false, relative: evoImg };
  const cards = [
    pokemon({ name: 'Pikachu', image: baseImg }),
    pokemon({ name: 'Raichu', stage: 'Stage 1', image: evoImg }),
    energy({ image: { attached: true, relative: evoImg } }),
  ];
  assert.equal(liveActiveCard(cards, deps(false)).name, 'Raichu');
});

test('liveActiveCard: authoritative returns the top of the attachedTo stack, registry-backed', () => {
  const root = pokemon({ instanceId: 1, name: 'Squirtle', attachedTo: null });
  const evo = pokemon({ instanceId: 2, name: 'Wartortle', stage: 'Stage 1', attachedTo: 1 });
  const attachedEnergy = energy({ instanceId: 3, attachedTo: 1 });
  const record = { card: { ...evo, attachedCards: [attachedEnergy], abilityUsed: true } };
  const top = liveActiveCard([root, evo, attachedEnergy], deps(true, [[2, record]]));
  assert.equal(top, record.card);

  // Unevolved: the root itself (registry copy when it has one).
  const rootRecord = { card: { ...root, attachedCards: [attachedEnergy] } };
  assert.equal(
    liveActiveCard([root, attachedEnergy], deps(true, [[1, rootRecord]])),
    rootRecord.card
  );
  assert.equal(liveActiveCard([root, attachedEnergy], deps(true)).name, 'Squirtle');

  // No Pokémon root (face-down/redacted active, or empty): no active card.
  assert.equal(liveActiveCard([attachedEnergy], deps(true)), null);
  assert.equal(liveActiveCard([], deps(true)), null);
});

test('glowNodeFor: authoritative prefers the registry holo wrapper, then element', () => {
  const card = pokemon({ instanceId: 4 });
  const wrapper = { classList: {} };
  const element = { classList: {} };
  assert.equal(
    glowNodeFor(card, deps(true, [[4, { holoCard: { wrapper }, element }]])),
    wrapper
  );
  assert.equal(glowNodeFor(card, deps(true, [[4, { element }]])), element);
});

test('glowNodeFor: falls back to the legacy wrapper/image, null when neither', () => {
  const wrapper = { classList: {} };
  const image = { classList: {} };
  assert.equal(glowNodeFor({ wrapper, image }, deps(false)), wrapper);
  assert.equal(glowNodeFor({ image }, deps(false)), image);
  assert.equal(glowNodeFor({ instanceId: 9 }, deps(true)), null);
  assert.equal(glowNodeFor(null, deps(false)), null);
});
