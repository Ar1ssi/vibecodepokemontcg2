import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tapRoute } from '../card-focus-routing.mjs';

// Design 074 A1: a tap on an in-play Pokémon routes as TCG Live's PlayerCardOwner.OnCardClicked.
// Fixture shapes only — no card text is asserted.
const POKEMON = {
  name: 'Arcanine ex',
  type: 'Fire',
  hp: 280,
  image: {},
  attacks: [{ name: 'Raging Claws', cost: ['Fire'], damage: '30' }],
};

describe('tapRoute (PlayerCardOwner.OnCardClicked)', () => {
  it('own Active opens the overlay (ActiveController.CanShowActionSelection is true)', () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: POKEMON }), 'overlay');
  });

  it('own Bench opens the overlay only with a usable action, else the stack view', () => {
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'self', card: POKEMON, hasUsableAction: true }), 'overlay');
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'self', card: POKEMON }), 'stack');
  });

  it("the opponent's Active and Bench open the stack view", () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'opp', card: POKEMON }), 'stack');
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'opp', card: POKEMON, hasUsableAction: true }), 'stack');
  });

  it('hand, Stadium, discard and prizes keep their own paths', () => {
    for (const zoneId of ['hand', 'stadium', 'discard', 'prizes']) {
      assert.equal(tapRoute({ zoneId, cardUser: 'self', card: POKEMON }), null, zoneId);
    }
  });

  it('no card, or a card with no element to fly from, does not route', () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: null }), null);
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: { ...POKEMON, image: undefined } }), null);
    assert.equal(tapRoute(), null);
  });

  it('an attached Energy token in the zone, or a face-down card, is not a Pokémon', () => {
    assert.equal(tapRoute({ zoneId: 'active', cardUser: 'self', card: { name: 'Fire Energy', type: 'Energy', image: {} } }), null);
    assert.equal(tapRoute({ zoneId: 'bench', cardUser: 'opp', card: { image: {} } }), null);
  });
});
