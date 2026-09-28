// Design 049: a VSTAR Power attack spends the player's once-per-game VSTAR Power (App. 9), so
// a second VSTAR Power attack in the same game is rejected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { isVstarPowerAttack } from '../rules/damage-parser.mjs';

// Zacian VSTAR Sword Star (corpus Crown Zenith 096).
const SWORD_STAR = {
  name: 'Sword Star',
  cost: [],
  damage: '310',
  text: "This Pokémon also does 30 damage to itself. (You can't use more than 1 VSTAR Power in a game.)",
};

function zacianGame() {
  const state = createGameState({ gameId: 'vstar-attack', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) {
      state.players[id].zones.deck.push(createCard({ instanceId: 100 + i + (id === 'p1' ? 0 : 50), name: 'Filler' }));
    }
  }
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Zacian VSTAR',
      supertype: 'Pokémon',
      subtypes: ['VSTAR'],
      hp: 270,
      attacks: [{ name: 'Break Edge', cost: [], damage: '200', text: '' }, SWORD_STAR],
    })
  );
  state.players.p2.zones.active.push(createCard({ instanceId: 2, name: 'Wall', supertype: 'Pokémon', hp: 1000 }));
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

const attack = (state, attackIndex, rng) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, rng);

test('isVstarPowerAttack reads the corpus and TCGdex reminder wordings', () => {
  assert.equal(isVstarPowerAttack(SWORD_STAR), true);
  // TCGdex swsh11-131 Star Requiem.
  assert.equal(
    isVstarPowerAttack({ effect: "Your opponent's Active Pokémon is Knocked Out. (Can't use more than 1 VSTAR Power per game.)" }),
    true
  );
  assert.equal(isVstarPowerAttack({ text: 'Discard an Energy from this Pokémon.' }), false);
  assert.equal(isVstarPowerAttack(null), false);
});

test('a VSTAR Power attack spends VSTAR Power; the next one in the game is rejected', () => {
  const rng = createRng(7);
  const first = attack(zacianGame(), 1, rng);
  assert.equal(first.error, null);
  assert.equal(first.state.players.p1.oncePerGame.vstarUsed, true);
  assert.ok(first.events.some((e) => e.type === 'vstarUsed' && e.kind === 'vstar' && e.attackName === 'Sword Star'));

  const later = structuredClone(first.state);
  later.turn = { player: 'p1', number: 5, phase: 'main' };
  later.players.p1.flags = {};
  assert.equal(attack(later, 1, rng).error, 'VSTAR Power already used this game.');
  assert.equal(attack(later, 0, rng).error, null, 'a plain attack is still allowed');
});
