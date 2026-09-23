// Team-wide "no Retreat Cost" abilities printed on a Benched Pokémon must zero
// the Active Spot's cost (e.g. Latias ex "Skyliner"). Regression for the gap
// where only the active's own ability text was read.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { teamNoRetreatCostForActive } from '../rules/ability-executors.mjs';
import { rulesState } from '../rules/rules-state.mjs';
import { getEffectiveRetreatCost, canRetreat } from '../rules/retreat.mjs';

function makeState() {
  const state = createGameState({
    id: 'retreat-team-ability',
    seed: 42,
    players: {
      p1: {
        id: 'p1',
        name: 'P1',
        zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] },
        flags: { energyAttached: false, attackerAttacked: false, retreatedThisTurn: false },
      },
      p2: {
        id: 'p2',
        name: 'P2',
        zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

const ability = (name, text) => ({ name, text });

function latiasEx(instanceId) {
  return createCard({
    instanceId,
    id: 'latias-ex-ssp-76',
    name: 'Latias ex',
    stage: 'Basic',
    retreatCost: 2,
    ability: ability('Skyliner', 'Your Basic Pokémon in play have no Retreat Cost.'),
  });
}

describe('team-wide no Retreat Cost abilities', () => {
  it('helper: Basic-only grant applies to a Basic active, not an Evolution', () => {
    const holder = latiasEx(2);
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Charmeleon', stage: 'Stage 1', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: "Your Pokémon in play" grants to any active', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Eelektross',
      stage: 'Stage 2',
      ability: ability('Levitation Field', 'Your Pokémon in play have no Retreat Cost.'),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Charmeleon', stage: 'Stage 1', retreatCost: 2 }),
        [holder]
      ),
      true
    );
  });

  it('helper: name-specific grant matches only the named active', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Latias',
      stage: 'Basic',
      ability: ability('Flight Support', 'Your Latios in play have no Retreat Cost.'),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Latios', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: "except Pokémon-GX and Pokémon-EX" skips rule-box actives', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Dragonite',
      stage: 'Stage 2',
      ability: ability(
        'Dragon Lift',
        'Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX.'
      ),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu ex', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: ignores attached cards and non-holders', () => {
    const energy = createCard({ instanceId: 9, name: 'Basic Psychic Energy', attachedTo: 1 });
    const holder = latiasEx(2);
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [energy, holder]
      ),
      true
    );
  });

  it('server: a Benched Latias ex makes a Basic active retreat free', () => {
    const state = makeState();
    const active = createCard({ instanceId: 1, id: 'pikachu', name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
    const benchedLatias = latiasEx(2);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [benchedLatias, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
    assert.equal(res.state.players.p1.zones.active[0].instanceId, benchedEevee.instanceId);
    assert.equal(res.state.players.p1.flags.retreatedThisTurn, true);
  });

  it('server: Skyliner does not free an Evolution active', () => {
    const state = makeState();
    const root = createCard({ instanceId: 1, id: 'charmander', name: 'Charmander', stage: 'Basic', retreatCost: 1 });
    const evolution = createCard({
      instanceId: 4,
      id: 'charmeleon',
      name: 'Charmeleon',
      stage: 'Stage 1',
      retreatCost: 2,
      attachedTo: root.instanceId,
    });
    const benchedLatias = latiasEx(2);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [root, evolution];
    state.players.p1.zones.bench = [benchedLatias, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.match(res.error, /Not enough energy to retreat/);
  });

  it('server: a Benched Evolution holding the ability still grants it', () => {
    const state = makeState();
    const active = createCard({ instanceId: 1, id: 'pikachu', name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
    const root = createCard({ instanceId: 5, id: 'dratini', name: 'Dratini', stage: 'Basic' });
    const dragonite = createCard({
      instanceId: 6,
      id: 'dragonite',
      name: 'Dragonite',
      stage: 'Stage 2',
      attachedTo: root.instanceId,
      abilities: [
        {
          name: 'Dragon Lift',
          text: 'Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX.',
        },
      ],
    });
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [root, dragonite, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
  });

  it('server: an active Latias ex still retreats free (self ability)', () => {
    const state = makeState();
    const active = latiasEx(1);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
  });

  describe('client path', () => {
    beforeEach(() => {
      rulesState.enabled = true;
      rulesState.turnPlayer = 'self';
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;
    });

    it('getEffectiveRetreatCost reads the bench; canRetreat allows the free retreat', () => {
      const active = createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
      const bench = [latiasEx(2), createCard({ instanceId: 3, name: 'Eevee', stage: 'Basic' })];

      assert.equal(getEffectiveRetreatCost(active, 'self', [], bench), 0);
      assert.equal(getEffectiveRetreatCost(active, 'self', []), 2);
      assert.equal(canRetreat('self', active, [], [], bench).allowed, true);
      assert.equal(canRetreat('self', active, [], []).allowed, false);
    });
  });
});
