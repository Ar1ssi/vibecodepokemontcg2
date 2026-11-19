import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { overlayAttacker, tapRoute } from '../card-focus-routing.mjs';

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

// Log public:1 2026-11-19: on p2's turn, p1 tapped their own Active Landorus and picked Rock Tumble;
// the overlay attacked as the turn player ('opp'), which relayed a requestAction that made p2's
// client attack with its own Landorus.
describe('overlayAttacker (who an AttackOverlay attack acts for)', () => {
  it('two-player: on the opponent turn, tapping your own attack does not attack for them', () => {
    assert.equal(overlayAttacker({ owner: 'self', turnPlayer: 'opp', isTwoPlayer: true }), null);
  });

  it('two-player: on your turn, you attack', () => {
    assert.equal(overlayAttacker({ owner: 'self', turnPlayer: 'self', isTwoPlayer: true }), 'self');
  });

  it('one-player and solo rooms play both sides, so the turn player attacks', () => {
    assert.equal(overlayAttacker({ owner: 'self', turnPlayer: 'opp', isTwoPlayer: false }), 'opp');
    assert.equal(overlayAttacker({ owner: 'self', turnPlayer: 'opp', isTwoPlayer: true, solo: true }), 'opp');
  });

  it('no turn player yet falls back to the owner', () => {
    assert.equal(overlayAttacker({ owner: 'self', turnPlayer: null, isTwoPlayer: true }), 'self');
  });
});
