// A Pokémon moved to the Bench by a Special Energy switch recovers from all Special Conditions
// and the switch is announced with cardSwitched, like every other Active/Bench switch.
// Jet Energy, Surging Sparks 252 (out/pkmn-special-energy-cards.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { addCondition, listConditions } from '../rules/special-conditions.mjs';

const JET_ENERGY =
  'As long as this card is attached to a Pokémon, it provides {C} Energy. When you attach this card from your hand to 1 of your Benched Pokémon, switch that Pokémon with your Active Pokémon.';

const pokemon = (props) => createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...props });

test('Jet Energy switch clears the outgoing Active’s conditions and emits cardSwitched', () => {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[pid].zones.prizes.push(createCard({ instanceId: (pid === 'p1' ? 900 : 950) + i, name: `Prize ${i}` }));
    }
  }
  const active = pokemon({ instanceId: 1, name: 'Pikachu', types: ['Lightning'] });
  addCondition(active, 'Paralyzed');
  addCondition(active, 'Poisoned');
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: 'Raichu', types: ['Lightning'] }));
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 2, name: 'Jet Energy', supertype: 'Energy', subtypes: ['Special Energy'], text: JET_ENERGY })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 3 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  const benched = res.state.players.p1.zones.bench.find((c) => c.instanceId === 1);
  assert.ok(benched, 'Pikachu was switched to the Bench');
  assert.deepEqual(listConditions(benched), []);
  assert.ok(res.events.some((e) => e.type === 'cardSwitched' && e.playerId === 'p1' && e.activeId === 1 && e.benchId === 3));
});
