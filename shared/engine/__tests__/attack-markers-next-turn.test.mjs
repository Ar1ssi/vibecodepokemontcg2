// Design 036 A7/A8a: timed markers that raise incoming damage, change Weakness, or raise the
// marked Pokémon's attack and Retreat costs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';

const markerSteps = (text, selfName = 'Talonflame') =>
  [...parseAttackSteps(text, { selfName }).after]
    .filter((step) => step.type === 'atkAddMarker')
    .map(({ attackName, ...step }) => step);

test('parser: "takes N more damage" / "is increased by N" read as incomingBonus markers', () => {
  assert.deepEqual(markerSteps("During your opponent's next turn, this Pokémon takes 30 more damage from attacks."), [
    {
      type: 'atkAddMarker',
      target: 'self',
      window: 'opponentNextTurn',
      marker: { kind: 'incomingBonus', amount: 30, afterWR: true },
    },
  ]);
  assert.deepEqual(
    markerSteps(
      "During your opponent's next turn, any damage done to this Pokémon by attacks is increased by 30 (after applying Weakness and Resistance)."
    ).map((s) => s.marker),
    [{ kind: 'incomingBonus', amount: 30, afterWR: true }]
  );
  assert.deepEqual(
    markerSteps("During your next turn, the Defending Pokémon takes 40 more damage from attacks (before applying Weakness and Resistance).", 'Jangmo-o'),
    [
      {
        type: 'atkAddMarker',
        target: 'opponentActive',
        window: 'yourNextTurn',
        marker: { kind: 'incomingBonus', amount: 40, afterWR: false },
      },
    ]
  );
});

test('parser: Weakness override, both window placements', () => {
  const expected = [
    {
      type: 'atkAddMarker',
      target: 'opponentActive',
      window: 'throughYourNextTurn',
      marker: { kind: 'weaknessOverride', type: 'psychic' },
    },
  ];
  assert.deepEqual(
    markerSteps("Your opponent's Active Pokémon's Weakness is now {P} until the end of your next turn.", 'Oranguru'),
    expected
  );
  assert.deepEqual(
    markerSteps("Until the end of your next turn, your opponent's Active Pokémon's Weakness is now {P}.", 'Oranguru'),
    expected
  );
});

test('parser: attack-cost and Retreat Cost increases, one sentence can set both', () => {
  assert.deepEqual(
    markerSteps(
      "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more, and its Retreat Cost is {C}{C} more.",
      'Mawile'
    ),
    [
      {
        type: 'atkAddMarker',
        target: 'opponentActive',
        window: 'opponentNextTurn',
        marker: { kind: 'attackCostIncrease', count: 1 },
        alsoMarkers: [{ kind: 'retreatDelta', amount: 2 }],
      },
    ]
  );
  assert.deepEqual(
    markerSteps("During your opponent's next turn, the Defending Pokémon's attacks cost {C}{C} more.", 'Flapple').map(
      (s) => s.marker
    ),
    [{ kind: 'attackCostIncrease', count: 2 }]
  );
  assert.deepEqual(
    markerSteps("During your opponent's next turn, the Defending Pokémon's Retreat Cost is {C} more.", 'Grimer').map(
      (s) => s.marker
    ),
    [{ kind: 'retreatDelta', amount: 1 }]
  );
});

// ── damage ───────────────────────────────────────────────────────────────────

const attacker = { instanceId: 10, types: ['Lightning'] };

test('computeAttackDamage: incomingBonus adds after or before Weakness, never to a 0-damage attack', () => {
  const weak = { instanceId: 20, weakness: { type: 'Lightning', value: 2 } };
  const after = [{ kind: 'incomingBonus', amount: 30, afterWR: true }];
  const before = [{ kind: 'incomingBonus', amount: 30, afterWR: false }];
  assert.equal(computeAttackDamage(attacker, weak, { damage: '60' }, { defenderMarkers: after }).total, 150);
  assert.equal(computeAttackDamage(attacker, weak, { damage: '60' }, { defenderMarkers: before }).total, 180);
  assert.equal(computeAttackDamage(attacker, weak, { damage: '' }, { defenderMarkers: after }).total, 0);
  assert.equal(computeAttackDamage(attacker, weak, { damage: '' }, { defenderMarkers: before }).total, 0);
});

test('computeAttackDamage: weaknessOverride swaps the type and keeps the amount', () => {
  const defender = { instanceId: 20, weakness: { type: 'Fighting', value: 2 } };
  const markers = [{ kind: 'weaknessOverride', type: 'lightning' }];
  assert.equal(computeAttackDamage(attacker, defender, { damage: '60' }).total, 60);
  assert.equal(computeAttackDamage(attacker, defender, { damage: '60' }, { defenderMarkers: markers }).total, 120);
  const fighter = { instanceId: 11, types: ['Fighting'] };
  assert.equal(computeAttackDamage(fighter, defender, { damage: '60' }, { defenderMarkers: markers }).total, 60);
  const noWeakness = { instanceId: 20 };
  assert.equal(computeAttackDamage(attacker, noWeakness, { damage: '60' }, { defenderMarkers: markers }).total, 60);
});

// ── costs on the marked player's turn ────────────────────────────────────────

const energy = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Basic Grass Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types: ['Grass'], attachedTo });

function board({ attackerText }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mawile',
      supertype: 'Pokémon',
      type: 'Pokémon',
      hp: 100,
      attacks: [{ name: 'Hold', cost: [], damage: '10', text: attackerText }],
    })
  );
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 20,
      name: 'Defender',
      supertype: 'Pokémon',
      type: 'Pokémon',
      hp: 200,
      retreatCost: ['Colorless'],
      attacks: [{ name: 'Tackle', cost: ['Colorless'], damage: '20', text: '' }],
    }),
    energy(30, 20),
    energy(31, 20)
  );
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 21, name: 'Bench Mon', supertype: 'Pokémon', type: 'Pokémon', hp: 60 })
  );
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

function attackThenPass(text) {
  const res = applyCommand(
    board({ attackerText: text }),
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    createRng(5)
  );
  assert.ok(!res.error, res.error);
  assert.equal(res.state.turn.player, 'p2');
  return res.state;
}

test('Mawile: the Defending Pokémon pays {C} more to attack and {C}{C} more to retreat', () => {
  const state = attackThenPass(
    "During your opponent's next turn, attacks used by the Defending Pokémon cost {C} more, and its Retreat Cost is {C}{C} more."
  );
  const defender = state.players.p2.zones.active.find((c) => c.instanceId === 20);
  assert.deepEqual(
    defender.attackMarkers.map((m) => m.kind),
    ['attackCostIncrease', 'retreatDelta']
  );
  assert.equal(
    validateLegality(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }).allowed,
    true,
    'two Energy pay {C} + {C}'
  );
  const retreat = validateLegality(state, {
    type: 'retreat',
    payload: { benchInstanceId: 21, discardEnergyIds: [30, 31] },
    playerId: 'p2',
  });
  assert.equal(retreat.allowed, false, 'Retreat Cost 1 + 2 is more than two Energy');
  const unmarked = structuredClone(state);
  delete unmarked.players.p2.zones.active.find((c) => c.instanceId === 20).attackMarkers;
  const plainRetreat = validateLegality(unmarked, {
    type: 'retreat',
    payload: { benchInstanceId: 21, discardEnergyIds: [30] },
    playerId: 'p2',
  });
  assert.equal(plainRetreat.allowed, true, plainRetreat.reason);

  // One Energy left: the attack's {C} plus the marker's {C} is no longer payable.
  state.players.p2.zones.active = state.players.p2.zones.active.filter((c) => c.instanceId !== 31);
  const attack = validateLegality(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
  assert.equal(attack.allowed, false);
});

test('Flapple: a raised attack cost taxes a free attack too', () => {
  const state = attackThenPass("During your opponent's next turn, the Defending Pokémon's attacks cost {C}{C}{C} more.");
  const defender = state.players.p2.zones.active.find((c) => c.instanceId === 20);
  defender.attacks = [{ name: 'Free Hit', cost: [], damage: '10', text: '' }];
  const res = validateLegality(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
  assert.equal(res.allowed, false);
});
