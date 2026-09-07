import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  mintInstanceId,
  cloneCard,
  describeCard,
  isPokemon,
  isEnergy,
  isTrainer,
} from '../cards.mjs';

test('createCard initializes standard defaults', () => {
  const card = createCard({
    instanceId: 1,
    name: 'Pikachu',
    set: 'base1',
    number: '25',
    type: 'Lightning',
  });

  assert.equal(card.instanceId, 1);
  assert.equal(card.syncInstance, 1);
  assert.equal(card.name, 'Pikachu');
  assert.equal(card.set, 'base1');
  assert.equal(card.number, '25');
  assert.equal(card.damage, 0);
  assert.equal(card.specialCondition, null);
  assert.equal(card.abilityUsed, false);
  assert.equal(card.attachedTo, null);
  assert.equal(card.revealed, false);
  assert.deepEqual(card.subtypes, []);
  assert.deepEqual(card.attacks, []);
});

test('createCard strictly drops DOM image references (H2, Invariant 8)', () => {
  const dummyDomNode = { tagName: 'IMG', id: 'card-img-1' };
  const card = createCard({
    instanceId: 2,
    name: 'Charmander',
    image: dummyDomNode,
  });

  assert.equal(card.image, undefined);
  assert.equal('image' in card, false);
});

test('createCard preserves non-zero damage and special condition values', () => {
  const card = createCard({
    instanceId: 3,
    damage: 50,
    specialCondition: 'Burned',
    abilityUsed: true,
    attachedTo: 10,
  });

  assert.equal(card.damage, 50);
  assert.equal(card.specialCondition, 'Burned');
  assert.equal(card.abilityUsed, true);
  assert.equal(card.attachedTo, 10);
});

test('mintInstanceId monotonically increments state.nextInstanceId', () => {
  const state = { nextInstanceId: 0 };
  const id1 = mintInstanceId(state);
  const id2 = mintInstanceId(state);
  const id3 = mintInstanceId(state);

  assert.equal(id1, 1);
  assert.equal(id2, 2);
  assert.equal(id3, 3);
  assert.equal(state.nextInstanceId, 3);
});

test('mintInstanceId initializes missing nextInstanceId property', () => {
  const state = {};
  const id = mintInstanceId(state);
  assert.equal(id, 1);
  assert.equal(state.nextInstanceId, 1);
});

test('cloneCard creates deep copy of arrays without reference sharing', () => {
  const original = createCard({
    instanceId: 4,
    name: 'Squirtle',
    attacks: [{ name: 'Water Gun', damage: 30 }],
    subtypes: ['Basic'],
  });

  const cloned = cloneCard(original);
  assert.notEqual(cloned, original);
  assert.deepEqual(cloned, original);

  cloned.attacks[0].damage = 40;
  assert.equal(original.attacks[0].damage, 30);
});

test('describeCard returns readable formatted string', () => {
  const card = createCard({
    instanceId: 42,
    name: 'Pikipek',
    set: 'SUM',
    number: '106',
  });
  assert.equal(describeCard(card), 'Pikipek (SUM #106) [#42]');
  assert.equal(describeCard(null), 'Empty');
});

test('isPokemon, isEnergy, isTrainer predicates', () => {
  const mon = createCard({ supertype: 'Pokémon', name: 'Bulbasaur' });
  const energy = createCard({ supertype: 'Energy', name: 'Grass Energy' });
  const trainer = createCard({ supertype: 'Trainer', type: 'Item', name: 'Ultra Ball' });

  assert.equal(isPokemon(mon), true);
  assert.equal(isPokemon(energy), false);

  assert.equal(isEnergy(energy), true);
  assert.equal(isEnergy(mon), false);

  assert.equal(isTrainer(trainer), true);
  assert.equal(isTrainer(mon), false);
});
