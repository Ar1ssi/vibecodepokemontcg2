import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';

const energy = (instanceId, type, attachedTo) =>
  createCard({
    instanceId,
    id: `energy-${type}`,
    name: `${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    types: [type],
    energyType: type,
    attachedTo,
  });

function retreatState({ retreatCost = 1, energies = [], bench = null } = {}) {
  const active = createCard({ instanceId: 1, id: 'act', name: 'Snorlax', supertype: 'Pokémon', stage: 'Basic', retreatCost });
  const benched = bench || [createCard({ instanceId: 2, id: 'b1', name: 'Eevee', supertype: 'Pokémon', stage: 'Basic' })];
  const state = createGameState({
    id: 'retreat-energy',
    seed: 7,
    players: {
      p1: {
        id: 'p1',
        name: 'P1',
        zones: {
          active: [active, ...energies.map(([id, type]) => energy(id, type, 1))],
          bench: benched,
          hand: [],
          deck: [createCard({ instanceId: 90, id: 'd', name: 'Deck Card' })],
          discard: [],
          prizes: [createCard({ instanceId: 91, id: 'p', name: 'Prize' })],
        },
        flags: {},
      },
      p2: {
        id: 'p2',
        name: 'P2',
        zones: {
          active: [],
          bench: [],
          hand: [],
          deck: [createCard({ instanceId: 92, id: 'd2', name: 'Deck Card' })],
          discard: [],
          prizes: [createCard({ instanceId: 93, id: 'p2', name: 'Prize' })],
        },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

const resolve = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    playerId: 'p1',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
  });

const discardIds = (state) => state.players.p1.zones.discard.map((c) => c.instanceId).sort();

describe('retreat: the player chooses which Energy to discard', () => {
  it('asks when the attached Energy differs and exceeds the cost, then discards the pick', () => {
    const state = retreatState({ retreatCost: 1, energies: [[10, 'Water'], [11, 'Fire']] });
    const asked = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: {} });
    assert.equal(asked.error, null);
    assert.deepEqual(asked.state.pendingChoice.options.map((o) => o.instanceId).sort(), [10, 11]);

    const done = resolve(asked.state, [11]);
    assert.equal(done.error, null);
    assert.deepEqual(discardIds(done.state), [11]);
    assert.equal(done.state.players.p1.zones.active[0].instanceId, 2);
  });

  it('does not ask when every attached Energy is the same card', () => {
    const state = retreatState({ retreatCost: 1, energies: [[10, 'Water'], [11, 'Water']] });
    const res = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: {} });
    assert.equal(res.state.pendingChoice, null);
    assert.equal(discardIds(res.state).length, 1);
  });

  it('does not ask when the cost takes every attached Energy', () => {
    const state = retreatState({ retreatCost: 2, energies: [[10, 'Water'], [11, 'Fire']] });
    const res = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: {} });
    assert.equal(res.state.pendingChoice, null);
    assert.deepEqual(discardIds(res.state), [10, 11]);
  });

  it('then asks for the Benched Pokémon when there are 2+', () => {
    const bench = [
      createCard({ instanceId: 2, id: 'b1', name: 'Eevee', supertype: 'Pokémon', stage: 'Basic' }),
      createCard({ instanceId: 3, id: 'b2', name: 'Pikachu', supertype: 'Pokémon', stage: 'Basic' }),
    ];
    const state = retreatState({ retreatCost: 1, energies: [[10, 'Water'], [11, 'Fire']], bench });
    const asked = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: {} });
    const benchAsk = resolve(asked.state, [10]);
    assert.deepEqual(benchAsk.state.pendingChoice.options.map((o) => o.instanceId).sort(), [2, 3]);
    const done = resolve(benchAsk.state, [3]);
    assert.deepEqual(discardIds(done.state), [10]);
    assert.equal(done.state.players.p1.zones.active[0].instanceId, 3);
  });
});
