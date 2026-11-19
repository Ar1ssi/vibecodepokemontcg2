// Trainer executor: counter-move lock on every Trainer counter path, and the Active Spot
// switch paths agreeing on what the outgoing Active loses.
// Card text: out/pkmn-pokemon-cards.json "Patrat" (Chaos Rising 070, Watchful Eye);
// out/pkmn-trainer-cards.json "Damage Mover" (Shining Legends), "Lt. Surge" (Gym Heroes),
// "Spikemuth" (Darkness Ablaze), "Erika’s Invitation" (151).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';

function game() {
  const state = createGameState({ gameId: 'deslop2-switch', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

const mon = (id, name, extra = {}) =>
  createCard({ instanceId: id, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });

function run(state, step, events = []) {
  const res = executeSteps(state, {
    steps: [step],
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: createRng(3),
    events,
    sourceCard: createCard({ instanceId: 900, name: 'Test Trainer', supertype: 'Trainer' }),
  });
  return { res, events };
}

test('Damage Mover: Patrat Watchful Eye stops the Trainer counter move', () => {
  const state = game();
  const donor = mon(1, 'Donor', { damage: 30 });
  const receiver = mon(2, 'Receiver');
  state.players.p1.zones.active.push(donor);
  state.players.p1.zones.bench.push(receiver);
  state.players.p2.zones.active.push(
    mon(3, 'Patrat', {
      abilities: [
        {
          name: 'Watchful Eye',
          type: 'Ability',
          text: "Damage counters on each Pokémon (both yours and your opponent's) can't be moved to other Pokémon.",
        },
      ],
    })
  );
  const { res, events } = run(state, { type: 'moveDamageCounters', count: 3, from: 'own', to: 'own' });
  assert.equal(res.pendingChoice, null);
  assert.equal(donor.damage, 30);
  assert.equal(receiver.damage || 0, 0);
  assert.ok(events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'damage_counter_move_locked'));
});

test('Damage Mover: counters still move when no Patrat is in play', () => {
  const state = game();
  const donor = mon(1, 'Donor', { damage: 30 });
  const receiver = mon(2, 'Receiver');
  state.players.p1.zones.active.push(donor);
  state.players.p1.zones.bench.push(receiver);
  state.players.p2.zones.active.push(mon(3, 'Riolu'));
  run(state, { type: 'moveDamageCounters', count: 3, from: 'own', to: 'own' });
  assert.equal(donor.damage, 0);
  assert.equal(receiver.damage, 30);
});

test('Lt. Surge: the old Active recovers from conditions and attack effects on the Bench', () => {
  const state = game();
  const old = mon(1, 'Old Active', {
    specialCondition: 'Poisoned',
    cannotAttackUntilTurn: 5,
    attackMarkers: [{ kind: 'damageReduction', untilTurn: 5 }],
  });
  state.players.p1.zones.active.push(old);
  state.players.p1.zones.hand.push(mon(10, 'New Basic'));
  run(state, { type: 'putHandBasicAsActive' });
  assert.ok(state.players.p1.zones.bench.some((c) => c.instanceId === 1));
  assert.equal(old.specialCondition, null);
  assert.equal(old.cannotAttackUntilTurn, undefined);
  assert.equal(old.attackMarkers, undefined);
});

test('Lt. Surge: Spikemuth puts 2 damage counters on the Active that moved to the Bench', () => {
  const state = game();
  state.stadium = {
    ownerId: 'p2',
    card: createCard({
      instanceId: 800,
      name: 'Spikemuth',
      supertype: 'Trainer',
      trainerType: 'Stadium',
      text: 'Whenever a player’s Active Pokémon moves to the Bench during their turn, put 2 damage counters on that Pokémon.',
    }),
  };
  const old = mon(1, 'Old Active');
  state.players.p1.zones.active.push(old);
  state.players.p1.zones.hand.push(mon(10, 'New Basic'));
  const { events } = run(state, { type: 'putHandBasicAsActive' });
  assert.equal(old.damage, 20);
  assert.ok(events.some((e) => e.type === 'damageCountersPlaced' && e.instanceId === 1 && e.victimPlayerId === 'p1'));
});

test('Lt. Surge: Dust Island does not copy Poison (nothing was switched with a Benched Pokémon)', () => {
  const state = game();
  state.stadium = {
    ownerId: 'p2',
    card: createCard({
      instanceId: 801,
      name: 'Dust Island',
      supertype: 'Trainer',
      trainerType: 'Stadium',
      text: 'Whenever either player switches their Poisoned Active Pokémon with 1 of their Benched Pokémon with the effect of a Trainer card, the new Active Pokémon is now affected by that Special Condition.',
    }),
  };
  state.players.p1.zones.active.push(mon(1, 'Old Active', { specialCondition: 'Poisoned' }));
  const incoming = mon(10, 'New Basic');
  state.players.p1.zones.hand.push(incoming);
  run(state, { type: 'putHandBasicAsActive' });
  assert.notEqual(incoming.specialCondition, 'Poisoned');
});

test('Erika Invitation switch: the outgoing Active also sheds attack effects', () => {
  const state = game();
  const outgoing = mon(1, 'Opp Active', {
    cannotAttackUntilTurn: 6,
    cannotRetreatUntilTurn: 6,
    attackMarkers: [{ kind: 'damageReduction', untilTurn: 6 }],
  });
  state.players.p2.zones.active.push(outgoing);
  const benched = mon(2, 'Opp Bench');
  state.players.p2.zones.hand.push(benched);
  state.players.p1.zones.active.push(mon(5, 'Mine'));
  const step = { type: 'opponentHandToBenchBasic', switchActive: true };
  const { res: first } = run(state, step);
  executeSteps(state, {
    steps: [step],
    fromStepIndex: 0,
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: createRng(3),
    events: [],
    selection: [2],
    context: first.pendingChoice.resumeToken.context,
  });
  assert.ok(state.players.p2.zones.bench.some((c) => c.instanceId === 1));
  assert.equal(outgoing.cannotAttackUntilTurn, undefined);
  assert.equal(outgoing.cannotRetreatUntilTurn, undefined);
  assert.equal(outgoing.attackMarkers, undefined);
});

test('Digger (Team Rocket): the marked counters carry victim, attacker and damage like every other emitter', () => {
  const state = game();
  const mine = mon(1, 'Mine', { hp: 30 });
  state.players.p1.zones.active.push(mine);
  state.players.p2.zones.active.push(mon(2, 'Theirs'));
  const events = [];
  executeSteps(state, {
    steps: [{ type: 'alternatingFlipDamage', amount: 10 }],
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: { next: () => 0.9 },
    events,
    sourceCard: createCard({ instanceId: 900, name: 'Digger', supertype: 'Trainer' }),
  });
  assert.equal(mine.damage, 10);
  const placed = events.find((e) => e.type === 'damageCountersPlaced');
  assert.deepEqual(placed, {
    type: 'damageCountersPlaced',
    instanceId: 1,
    victimPlayerId: 'p1',
    attackerPlayerId: null,
    damage: 10,
  });
});

test('Cassius (XY): the Benched Pokémon promoted after the Active is shuffled away is stamped with this turn', () => {
  const state = game();
  const active = mon(1, 'Active');
  const bench = mon(2, 'Bench');
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(bench);
  state.players.p2.zones.active.push(mon(3, 'Theirs'));
  const step = { type: 'shufflePokemonIntoDeck' };
  const { res: first } = run(state, step);
  executeSteps(state, {
    steps: [step],
    fromStepIndex: 0,
    effectType: 'trainer',
    playerId: 'p1',
    activeRng: createRng(3),
    events: [],
    selection: [1],
    context: first.pendingChoice.resumeToken.context,
  });
  assert.equal(state.players.p1.zones.active[0].instanceId, 2);
  assert.equal(bench.movedToActiveTurn, 3);
});

test('Unown Farewell Letter (Ancient Origins): the discarded Pokémon leaves with no conditions or attack effects', () => {
  const state = game();
  state.players.p1.zones.active.push(mon(1, 'Active'));
  const unown = mon(2, 'Unown', {
    damage: 20,
    specialCondition: 'Poisoned',
    attackMarkers: [{ kind: 'damageReduction', untilTurn: 5 }],
    cannotAttackUntilTurn: 5,
  });
  state.players.p1.zones.bench.push(unown);
  state.players.p2.zones.active.push(mon(3, 'Theirs'));
  executeSteps(state, {
    steps: [{ type: 'selfLeavesAbility', to: 'discard' }],
    effectType: 'ability',
    playerId: 'p1',
    activeRng: createRng(3),
    events: [],
    sourceCard: unown,
  });
  assert.ok(state.players.p1.zones.discard.includes(unown));
  assert.equal(unown.damage, 0);
  assert.equal(unown.specialCondition, null);
  assert.equal(unown.attackMarkers, undefined);
  assert.equal(unown.cannotAttackUntilTurn, undefined);
});
