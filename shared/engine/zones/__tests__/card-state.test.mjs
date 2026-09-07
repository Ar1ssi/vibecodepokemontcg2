import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCardDamage,
  setCardDamage,
  getCardSpecialCondition,
  setCardSpecialCondition,
  getCardAbilityUsed,
  setCardAbilityUsed,
  setCardAttachment,
  removeCardAttachment,
  resetCardState,
} from '../card-state.mjs';
import { hashCardList } from '../zone-hash.mjs';

test('getCardDamage and setCardDamage manipulate pure data state', () => {
  const card = { name: 'Pikachu' };
  assert.equal(getCardDamage(card), 0);

  setCardDamage(card, 50);
  assert.equal(getCardDamage(card), 50);
  assert.equal(card.damage, 50);

  setCardDamage(card, -10);
  assert.equal(getCardDamage(card), 0);
});

test('getCardSpecialCondition and setCardSpecialCondition manipulate pure state', () => {
  const card = { name: 'Charmander' };
  assert.equal(getCardSpecialCondition(card), null);

  setCardSpecialCondition(card, 'Burned');
  assert.equal(getCardSpecialCondition(card), 'Burned');
  assert.equal(card.specialCondition, 'Burned');

  setCardSpecialCondition(card, null);
  assert.equal(getCardSpecialCondition(card), null);
});

test('getCardAbilityUsed and setCardAbilityUsed manipulate pure state', () => {
  const card = { name: 'Arceus VSTAR' };
  assert.equal(getCardAbilityUsed(card), false);

  setCardAbilityUsed(card, true);
  assert.equal(getCardAbilityUsed(card), true);
  assert.equal(card.abilityUsed, true);

  setCardAbilityUsed(card, false);
  assert.equal(getCardAbilityUsed(card), false);
});

test('setCardAttachment and removeCardAttachment manage parent-child graph without DOM', () => {
  const parent = { name: 'Charizard', syncInstance: 10, attachedCards: [] };
  const energy = { name: 'Fire Energy', syncInstance: 11 };

  setCardAttachment(energy, parent);
  assert.equal(energy.attached, true);
  assert.equal(energy.parentCard, parent);
  assert.equal(energy.parentCardId, 10);
  assert.deepEqual(parent.attachedCards, [energy]);

  removeCardAttachment(energy);
  assert.equal(energy.attached, false);
  assert.equal(energy.parentCard, null);
  assert.deepEqual(parent.attachedCards, []);
});

test('hashCardList fingerprints pure state on cards without DOM elements', () => {
  const pureCardA = { name: 'Mewtwo', syncInstance: 1, damage: 30 };
  const pureCardB = { name: 'Mewtwo', syncInstance: 1, damage: 60 };
  assert.notEqual(hashCardList([pureCardA]), hashCardList([pureCardB]));

  const statusCardA = { name: 'Mewtwo', syncInstance: 1, specialCondition: 'Asleep' };
  const statusCardB = { name: 'Mewtwo', syncInstance: 1, specialCondition: 'Poisoned' };
  assert.notEqual(hashCardList([statusCardA]), hashCardList([statusCardB]));

  const abilityCardA = { name: 'Mewtwo', syncInstance: 1, abilityUsed: false };
  const abilityCardB = { name: 'Mewtwo', syncInstance: 1, abilityUsed: true };
  assert.notEqual(hashCardList([abilityCardA]), hashCardList([abilityCardB]));
});
