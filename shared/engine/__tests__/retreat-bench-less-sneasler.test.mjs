// Hisuian Sneasler (Astral Radiance 093, out/pkmn-pokemon-cards.json) "Carry and Climb":
// "As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is {C}{C} less."
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { computeEffectiveRetreatCost } from '../reduce/retreat.mjs';
import { rulesState } from '../rules/rules-state.mjs';
import { getEffectiveRetreatCost, canRetreat } from '../rules/retreat.mjs';

function setup(benchHolder) {
  const state = createGameState({
    id: 'sneasler',
    seed: 1,
    players: {
      p1: { id: 'p1', name: 'P1', zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] }, flags: {} },
      p2: { id: 'p2', name: 'P2', zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] }, flags: {} },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  const active = createCard({ instanceId: 1, id: 'snorlax', name: 'Snorlax', stage: 'Basic', retreatCost: 4 });
  state.players.p1.zones.active = [active];
  state.players.p1.zones.bench = [benchHolder];
  return { state, active };
}

const sneasler = () =>
  createCard({
    instanceId: 2,
    id: 'asr-093',
    name: 'Hisuian Sneasler',
    stage: 'Basic',
    retreatCost: 1,
    ability: {
      name: 'Carry and Climb',
      text: "As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is {C}{C} less.",
    },
  });

// Shape from the exported game log (customhb-837): plural `abilities`, "Stage1", array retreatCost.
const sneaslerStack = () => {
  const root = createCard({ instanceId: 2, id: 'customhb-836', name: 'Hisuian Sneasel', stage: 'Basic', retreatCost: ['Colorless'] });
  const top = createCard({
    instanceId: 3,
    id: 'customhb-837',
    name: 'Hisuian Sneasler',
    stage: 'Stage1',
    evolvesFrom: 'Hisuian Sneasel',
    retreatCost: ['Colorless'],
    attachedTo: root.instanceId,
    abilities: [{ name: 'Carry and Climb', type: 'Ability', text: "As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is {C}{C} less." }],
  });
  return [root, top];
};

describe('Hisuian Sneasler Carry and Climb', () => {
  it('lowers the Active Pokémon retreat cost by 2 while Benched', () => {
    const { state, active } = setup(sneasler());
    assert.equal(computeEffectiveRetreatCost(state, active, 'p1'), 2);
  });

  it('applies when the Benched Sneasler is an evolved stack with the plural abilities shape', () => {
    const [root, top] = sneaslerStack();
    const { state, active } = setup(root);
    state.players.p1.zones.bench = [root, top];
    assert.equal(computeEffectiveRetreatCost(state, active, 'p1'), 2);
  });

  // The client gate (inspector Retreat tile, drag-to-retreat) prices a retreat with
  // rules/retreat.mjs; it must read the Benched holder like the server does.
  it('client path: the Benched Sneasler lowers the Active retreat cost and canRetreat', () => {
    rulesState.enabled = true;
    rulesState.turnPlayer = 'self';
    rulesState.flags.self.attackerAttacked = false;
    rulesState.flags.self.retreatedThisTurn = false;
    const active = createCard({ instanceId: 1, name: 'Snorlax', stage: 'Basic', retreatCost: 2 });
    const bench = sneaslerStack();
    assert.equal(getEffectiveRetreatCost(active, 'self', [active], bench), 0);
    assert.equal(getEffectiveRetreatCost(active, 'self', [active]), 2);
    assert.equal(canRetreat('self', active, [], [active], bench).allowed, true);
    assert.equal(canRetreat('self', active, [], [active]).allowed, false);
  });
});
