import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPayAttackCost } from '../../../../../shared/engine/rules/attack-engine.mjs';
import { resolveAttackContext } from '../../../../../shared/engine/rules/resolve-attack-context.mjs';
import { abilityNameLimitKeyFor } from '../../../../../shared/engine/rules/ability-executors.mjs';
import {
  attachedEnergiesFor,
  attachedCardsFor,
  stampEnergyTypes,
  stadiumCardFor,
  abilityUsedFor,
} from '../attack-preview-sources.mjs';

test('attached Energy: legacy zone array wins when it holds the card', () => {
  const image = {};
  const card = { name: 'Pikachu', image };
  const fire = { type: 'Energy', name: 'Fire Energy', image: { relative: image } };
  const tool = { type: 'Trainer', name: 'Belt', image: { relative: image } };
  const other = { type: 'Energy', name: 'Water Energy', image: { relative: {} } };

  assert.deepEqual(attachedEnergiesFor(card, [card, fire, tool, other]), [fire]);
});

test('attached Energy: server-rendered card falls back to its stamped attachedCards', () => {
  const lightning = { instanceId: 11, type: 'Energy', name: 'Basic Lightning Energy' };
  const belt = { instanceId: 12, type: 'Trainer', name: 'Choice Belt' };
  const card = { instanceId: 10, name: 'Pikachu', image: {}, attachedCards: [lightning, belt] };

  assert.deepEqual(attachedEnergiesFor(card, []), [lightning]);
  assert.deepEqual(attachedEnergiesFor({ name: 'Mew', image: {} }, []), []);
  assert.deepEqual(attachedEnergiesFor(null, []), []);
});

test('stadium: legacy rules stadium first, then the authoritative view', () => {
  const legacy = { name: 'Artazon' };
  const server = { name: 'Area Zero' };

  assert.equal(stadiumCardFor({ user: 'self', card: legacy }, [server]), legacy);
  assert.equal(stadiumCardFor(null, [server]), server);
  assert.equal(stadiumCardFor(null, []), null);
  assert.equal(stadiumCardFor(undefined, undefined), null);
});

test('ability used: legacy flag, stamped card flag, or server flags by instanceId/name', () => {
  const card = { instanceId: 7, name: 'Mew' };

  assert.equal(abilityUsedFor(card, true), true);
  assert.equal(abilityUsedFor({ ...card, abilityUsed: true }, false), true);
  assert.equal(abilityUsedFor(card, false, { 7: true }), true);
  assert.equal(abilityUsedFor(card, false, { Mew: true }), true);
  assert.equal(abilityUsedFor(card, false, { 8: true }), false);
  assert.equal(abilityUsedFor(card, false), false);
});

test('ability used: a twin Pidgeot ex reads spent once the other used Quick Search (shared name limit)', () => {
  const text =
    "Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck. You can't use more than 1 Quick Search Ability each turn.";
  const twin = { instanceId: 21, name: 'Pidgeot ex', abilities: [{ name: 'Quick Search', text }] };
  const sharedKey = abilityNameLimitKeyFor(twin);

  assert.equal(abilityUsedFor(twin, false, { 20: true }), false, 'only its own flag or the shared one counts');
  assert.equal(abilityUsedFor(twin, false, { 20: true, [sharedKey]: true }), true);
  const plain = { instanceId: 22, name: 'Kirlia', abilities: [{ name: 'Refinement', text: 'Draw 2 cards.' }] };
  assert.equal(abilityUsedFor(plain, false, { [sharedKey]: true }), false, 'other Abilities are unaffected');
});

test('stamp energy types: untyped basic Energy still prices from its name before card data loads', () => {
  const mon = { image: 'img-1', attachedCards: [{ type: 'Energy', name: 'Water Energy' }] };
  assert.deepEqual(
    stampEnergyTypes(mon).map((d) => d.type),
    ['Water']
  );
});

// Exported log, customhb 757 Mega Absol Z ex: {P}{P}{C} with 3 Basic Darkness Energy and Mega Signal (customhb 491)
// attached read "unusable" because the preview priced Energy without the Tool in its attached cards.
const megaSignalBoard = () => {
  const dark = (id) => ({ instanceId: id, type: 'Energy', supertype: 'Energy', subtypes: ['Basic'], name: 'Basic Darkness Energy' });
  const signal = {
    instanceId: 5,
    type: 'Trainer',
    supertype: 'Trainer',
    subtypes: ['Pokémon Tool'],
    trainerType: 'Tool',
    name: 'Mega Signal',
    text: "If a Basic Energy attached to the Mega Evolution Pokémon ex this card is attached to is 1 of that Pokémon's types, it provides both of that Pokémon's types of Energy, but provides only 1 Energy at a time.",
  };
  const absolZ = {
    instanceId: 1,
    name: 'Mega Absol Z ex',
    types: ['Psychic', 'Darkness'],
    attachedCards: [dark(2), dark(3), dark(4), signal],
  };
  return absolZ;
};
const BLOOD_RED_FEAR = ['Psychic', 'Psychic', 'Colorless'];

test('attached cards: Tools come with the Energy', () => {
  const card = megaSignalBoard();
  assert.deepEqual(attachedCardsFor(card, []), card.attachedCards);
  assert.equal(attachedCardsFor(null, []).length, 0);
});

test('stamp energy types: Mega Signal on the host lets Darkness Energy pay {P}{P}{C}', () => {
  assert.equal(canPayAttackCost(stampEnergyTypes(megaSignalBoard()), BLOOD_RED_FEAR), true);
  const noSignal = megaSignalBoard();
  noSignal.attachedCards = noSignal.attachedCards.slice(0, 3);
  assert.equal(canPayAttackCost(stampEnergyTypes(noSignal), BLOOD_RED_FEAR), false);
});

test('resolveAttackContext: Mega Signal on the host lets Darkness Energy pay {P}{P}{C}', async () => {
  const card = megaSignalBoard();
  const { energyTypes } = await resolveAttackContext({
    activeCard: card,
    attachedEnergyCards: attachedEnergiesFor(card, []),
    ensureCardData: async () => {},
    stadiumCard: null,
    abilityUsed: () => false,
  });
  assert.equal(canPayAttackCost(energyTypes, BLOOD_RED_FEAR), true);
});
