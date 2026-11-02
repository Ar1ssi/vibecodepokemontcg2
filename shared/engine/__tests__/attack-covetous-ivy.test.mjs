// Wo-Chien ex Covetous Ivy (corpus: Paldean Fates 240): "This attack does 60 damage to 1 of your
// opponent's Benched Pokémon for each Prize card your opponent has taken." Scaled by the
// chosen-target per-unit count (attack-damage.mjs chosenTargetPerUnitCount); 0 taken → no damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });

const COVETOUS_IVY = {
  name: 'Covetous Ivy',
  cost: [],
  damage: '',
  text: "This attack does 60 damage to 1 of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};

function board(opponentPrizesLeft) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Wo-Chien ex', hp: 230, types: ['Grass'], attacks: [COVETOUS_IVY] })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 300 }));
  const prizesLeft = { p1: 6, p2: opponentPrizesLeft };
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < prizesLeft[playerId]; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
    }
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

function benchDamageAfterAttack(opponentPrizesLeft) {
  const res = applyCommand(board(opponentPrizesLeft), { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.ok(!res.error, res.error);
  let state = res.state;
  if (state.pendingChoice) {
    const done = applyCommand(state, {
      type: 'resolveChoice',
      payload: { choiceId: state.pendingChoice.choiceId, selection: [21] },
      playerId: 'p1',
    });
    assert.ok(!done.error, done.error);
    state = done.state;
  }
  const opp = state.players.p2.zones;
  return {
    bench: opp.bench.find((c) => c.instanceId === 21)?.damage || 0,
    active: opp.active.find((c) => c.instanceId === 20)?.damage || 0,
  };
}

test('Covetous Ivy: opponent has taken 2 Prizes → 120 to the chosen Benched Pokémon', () => {
  assert.deepEqual(benchDamageAfterAttack(4), { bench: 120, active: 0 });
});

test('Covetous Ivy: opponent has taken no Prizes → no damage', () => {
  assert.deepEqual(benchDamageAfterAttack(6), { bench: 0, active: 0 });
});
