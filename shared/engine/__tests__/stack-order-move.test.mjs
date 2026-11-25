import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { createRng } from '../rng.mjs';

// Source: the user's 2026-11-25 log (Munchlax → Snorlax → Snorlax VMAX stack, promoted from the
// Bench): the Active zone came out as [Energy, VMAX, Snorlax, Munchlax], so the Basic sat on top.

const mon = (props) => createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, types: ['Colorless'], ...props });

function stackGame() {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: false });
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  state.players.p1.zones.bench.push(
    mon({ instanceId: 18, name: 'Munchlax' }),
    mon({ instanceId: 22, name: 'Snorlax', stage: 'Stage 1', attachedTo: 18 }),
    mon({ instanceId: 24, name: 'Snorlax VMAX', stage: 'VMAX', attachedTo: 18 }),
    createCard({ instanceId: 53, name: 'Double Colorless Energy', type: 'Energy', attachedTo: 18 })
  );
  state.players.p1.zones.active.push(mon({ instanceId: 1, name: 'Lugia' }));
  state.players.p2.zones.active.push(mon({ instanceId: 2, name: 'Dragapult' }));
  return state;
}

const order = (zone) => zone.map((c) => c.instanceId);

test('retreat keeps a stack in root, Evolution, Energy order in both directions', () => {
  const state = stackGame();
  state.players.p1.zones.active.push(createCard({ instanceId: 5, name: 'Jet Energy', type: 'Energy', attachedTo: 1 }));
  state.players.p1.zones.active[0].retreatCost = [];
  const res = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: 18 } }, createRng(1));
  assert.equal(res.error ?? null, null);
  assert.deepEqual(order(res.state.players.p1.zones.active), [18, 22, 24, 53]);
  assert.deepEqual(order(res.state.players.p1.zones.bench), [1, 5]);
});

test('promotion after a Knock Out keeps the stack in order', () => {
  const state = stackGame();
  state.players.p1.zones.active.length = 0;
  const res = applyCommand(state, { type: 'promote', playerId: 'p1', payload: { instanceId: 18 } }, createRng(1));
  assert.equal(res.error ?? null, null);
  assert.deepEqual(order(res.state.players.p1.zones.active), [18, 22, 24, 53]);
});
