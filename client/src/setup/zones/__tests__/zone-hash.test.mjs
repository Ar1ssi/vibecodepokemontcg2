import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashCardList, hashBoardSnapshot } from '../zone-hash.mjs';

// Regression test for the sync-check blind spot: damage counters, special
// conditions, and ability-used markers live only on card.image (a DOM
// node), never on the Card data object. hashCardList used to fingerprint
// identity only (syncInstance/name/number/set), so two boards holding the
// same Pokémon at different HP or with different status conditions hashed
// identical — the periodic syncCheck would report "in sync" even though
// the boards had actually diverged.

function makeCard({ name = 'Pikachu', number = '25', set = 'base1', damage, condition, abilityUsed } = {}) {
  return {
    name,
    number,
    set,
    syncInstance: 1,
    image: {
      damageCounter: damage !== undefined ? { textContent: String(damage) } : null,
      specialCondition: condition !== undefined ? { textContent: condition } : null,
      abilityCounter: abilityUsed ? {} : null,
    },
  };
}

test('hashCardList changes when a damage counter is added', () => {
  const before = hashCardList([makeCard()]);
  const after = hashCardList([makeCard({ damage: 30 })]);
  assert.notEqual(before, after);
});

test('hashCardList changes when the damage amount changes', () => {
  const thirty = hashCardList([makeCard({ damage: 30 })]);
  const sixty = hashCardList([makeCard({ damage: 60 })]);
  assert.notEqual(thirty, sixty);
});

test('hashCardList changes when a special condition is applied', () => {
  const healthy = hashCardList([makeCard()]);
  const poisoned = hashCardList([makeCard({ condition: 'PSN' })]);
  assert.notEqual(healthy, poisoned);
});

test('hashCardList changes when an ability-used marker is toggled', () => {
  const unused = hashCardList([makeCard()]);
  const used = hashCardList([makeCard({ abilityUsed: true })]);
  assert.notEqual(unused, used);
});

test('hashCardList is stable for identical counter/status state', () => {
  const a = hashCardList([makeCard({ damage: 30, condition: 'PSN', abilityUsed: true })]);
  const b = hashCardList([makeCard({ damage: 30, condition: 'PSN', abilityUsed: true })]);
  assert.equal(a, b);
});

test('hashBoardSnapshot catches a single divergent Pokémon buried in a full board', () => {
  const selfZones = {
    active: { array: [makeCard({ damage: 30 })] },
    bench: { array: [makeCard({ name: 'Eevee', number: '133' })] },
  };
  const oppView = {
    active: { array: [makeCard({ damage: 60 })] }, // opponent's client thinks it's 60, not 30
    bench: { array: [makeCard({ name: 'Eevee', number: '133' })] },
  };
  assert.notEqual(hashBoardSnapshot(selfZones), hashBoardSnapshot(oppView));
});
