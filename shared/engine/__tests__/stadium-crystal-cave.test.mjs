// Crystal Cave (customhb-052 / Evolving Skies 144, out/pkmn-trainer-cards.json):
// "Once during each player’s turn, that player may heal 30 damage from each of their {M} Pokémon and {N} Pokémon."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { createRng } from '../rng.mjs';

const TEXT =
  'Once during each player’s turn, that player may heal 30 damage from each of their {M} Pokémon and {N} Pokémon.';

let nextId = 100;
const mon = (name, types, props = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', hp: 100, stage: 'Basic', types, ...props });

function useCave(setup) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p2.zones.active.push(mon('Riolu', ['Fighting']));
  state.stadium = createCard({ instanceId: 9, name: 'Crystal Cave', type: 'Trainer', trainerType: 'Stadium', text: TEXT });
  const refs = setup(state.players.p1.zones);
  const res = applyCommand(state, { type: 'stadium-effect', playerId: 'p1', payload: {} }, createRng(1));
  assert.equal(res.error, null);
  return { res, refs };
}

test('heals {M} and {N} Pokémon, skips others', () => {
  const { res } = useCave((zones) => {
    zones.active.push(mon('Beldum', ['Metal'], { damage: 40 }));
    zones.bench.push(mon('Axew', ['Dragon'], { damage: 40 }), mon('Pikachu', ['Lightning'], { damage: 40 }));
  });
  const { active, bench } = res.state.players.p1.zones;
  assert.deepEqual(
    [...active, ...bench].map((c) => [c.name, c.damage]),
    [['Beldum', 10], ['Axew', 10], ['Pikachu', 40]]
  );
});

test('an evolved Pokémon counts as the type of its top card', () => {
  const { res, refs } = useCave((zones) => {
    const base = mon('Eevee', ['Colorless'], { enteredPlayTurn: 1, damage: 50 });
    const evolution = mon('Metang', ['Metal'], { stage: 'Stage 1', evolvesFrom: 'Eevee', attachedTo: base.instanceId });
    zones.active.push(base, evolution);
    return { base };
  });
  const root = res.state.players.p1.zones.active.find((c) => c.instanceId === refs.base.instanceId);
  assert.equal(root.damage, 20);
});
