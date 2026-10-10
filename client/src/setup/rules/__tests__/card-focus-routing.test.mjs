import test from 'node:test';
import assert from 'node:assert/strict';

const { shouldOpenCardFocus } = await import('../card-focus-routing.mjs');

const POKEMON = {
  name: 'Arcanine ex',
  type: 'Fire',
  hp: 280,
  image: {},
  attacks: [{ name: 'Raging Claws', cost: ['Fire'], damage: '30' }],
};

test('own Active Pokémon opens the focus', () => {
  assert.equal(
    shouldOpenCardFocus({ zoneId: 'active', cardUser: 'self', card: POKEMON }),
    true
  );
});

test('Bench, hand and Stadium keep their old paths', () => {
  for (const zoneId of ['bench', 'hand', 'stadium', 'discard', 'prizes']) {
    assert.equal(
      shouldOpenCardFocus({ zoneId, cardUser: 'self', card: POKEMON }),
      false,
      zoneId
    );
  }
});

test("the opponent's Active does not open it", () => {
  assert.equal(
    shouldOpenCardFocus({ zoneId: 'active', cardUser: 'opp', card: POKEMON }),
    false
  );
});

test('no card, or a card with no element to fly from, does not open it', () => {
  assert.equal(
    shouldOpenCardFocus({ zoneId: 'active', cardUser: 'self', card: null }),
    false
  );
  assert.equal(
    shouldOpenCardFocus({
      zoneId: 'active',
      cardUser: 'self',
      card: { ...POKEMON, image: undefined },
    }),
    false
  );
  assert.equal(shouldOpenCardFocus(), false);
});

test('an attached Energy token in the Active zone is not a Pokémon focus', () => {
  const energy = { name: 'Fire Energy', type: 'Energy', image: {} };
  assert.equal(
    shouldOpenCardFocus({ zoneId: 'active', cardUser: 'self', card: energy }),
    false
  );
});

test('a face-down or unresolved card (no HP) does not open it', () => {
  assert.equal(
    shouldOpenCardFocus({
      zoneId: 'active',
      cardUser: 'self',
      card: { image: {} },
    }),
    false
  );
});
