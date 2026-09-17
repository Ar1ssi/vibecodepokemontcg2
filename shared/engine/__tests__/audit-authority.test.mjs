// Regression tests for the high-severity findings in server-authority-and-rules-engine-audit.md
// (B-1c, B-2, B-2b, B-2c, B-4, B-5, A-4, A-7) and medium ones (B-3, A-5, A-8). Each drives the reducer the way a socket
// command would; the rejection cases fail without their fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';

function mainPhaseState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

function energy(instanceId, attachedTo) {
  return createCard({ instanceId, name: 'Energy', supertype: 'Energy', type: 'Energy', attachedTo });
}

function withPrizes(state, playerId, count) {
  for (let i = 0; i < count; i++) {
    state.players[playerId].zones.prizes.push(createCard({ instanceId: 900 + i, name: `Prize ${i}` }));
  }
}

test('B-1c: takePrizesByIndex is rejected off-turn', () => {
  const state = mainPhaseState();
  withPrizes(state, 'p2', 6);
  state.players.p2.flags.prizesOwed = 1;
  const res = applyCommand(state, { type: 'takePrizesByIndex', payload: { indices: [0] }, playerId: 'p2' });
  assert.equal(res.error, "It's not your turn.");
});

test('B-1c: takePrizesByIndex without a Knockout entitlement cannot win the game', () => {
  const state = mainPhaseState();
  withPrizes(state, 'p1', 6);
  const res = applyCommand(state, {
    type: 'takePrizesByIndex',
    payload: { indices: [0, 1, 2, 3, 4, 5] },
    playerId: 'p1',
  });
  assert.equal(res.error, 'No Knockout has awarded you that many prize cards.');
  assert.equal(state.players.p1.zones.prizes.length, 6);
});

test('B-1c: takePrizesByIndex redeems exactly the awarded entitlement', () => {
  const state = mainPhaseState();
  withPrizes(state, 'p1', 6);
  state.players.p1.flags.prizesOwed = 1;
  const res = applyCommand(state, { type: 'takePrizesByIndex', payload: { indices: [3] }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 5);
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
});

test('B-1c: negative or duplicate prize indices are rejected', () => {
  for (const indices of [[-1], [0, 0]]) {
    const state = mainPhaseState();
    withPrizes(state, 'p1', 6);
    state.players.p1.flags.prizesOwed = 2;
    const res = applyCommand(state, { type: 'takePrizesByIndex', payload: { indices }, playerId: 'p1' });
    assert.ok(res.error, `indices ${JSON.stringify(indices)} should be rejected`);
    assert.equal(state.players.p1.zones.prizes.length, 6);
  }
});

test('B-2/B-2b/B-2c: damage and condition commands are rejected off-turn', () => {
  const commands = [
    { type: 'addDamageCounter', payload: { instanceId: 1, amount: 100 } },
    { type: 'updateDamageCounter', payload: { instanceId: 1, amount: 100 } },
    { type: 'removeDamageCounter', payload: { instanceId: 2, amount: 10 } },
    { type: 'addSpecialCondition', payload: { instanceId: 1, condition: 'Paralyzed' } },
    { type: 'updateSpecialCondition', payload: { instanceId: 1, condition: 'Paralyzed' } },
    { type: 'removeSpecialCondition', payload: { instanceId: 2 } },
  ];
  for (const command of commands) {
    const state = mainPhaseState();
    state.players.p1.zones.active.push(createCard({ instanceId: 1, name: 'Pikachu', hp: 60 }));
    state.players.p2.zones.active.push(
      createCard({ instanceId: 2, name: 'Eevee', hp: 60, damage: 30, specialCondition: 'Poisoned' })
    );
    const res = applyCommand(state, { ...command, playerId: 'p2' });
    assert.equal(res.error, "It's not your turn.", command.type);
  }
});

test('A-7: deck-order commands are rejected off-turn', () => {
  for (const type of ['shuffleIntoDeck', 'moveToDeckTop', 'switchWithDeckTop']) {
    const state = mainPhaseState();
    state.players.p2.zones.hand.push(createCard({ instanceId: 5, name: 'Potion' }));
    state.players.p2.zones.deck.push(createCard({ instanceId: 6, name: 'Pikachu' }));
    const res = applyCommand(state, { type, payload: { from: 'hand', index: 0 }, playerId: 'p2' });
    assert.equal(res.error, "It's not your turn.", type);
  }
});

function retreatState() {
  const state = mainPhaseState();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Snorlax', hp: 140, retreatCost: ['Colorless', 'Colorless', 'Colorless'] }),
    energy(11, 1),
    energy(12, 1),
    energy(13, 1)
  );
  state.players.p1.zones.bench.push(createCard({ instanceId: 2, name: 'Pikachu', hp: 60 }), energy(21, 2));
  return state;
}

test('B-4: retreat paying fewer Energy than the Retreat Cost is rejected', () => {
  const state = retreatState();
  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 2, discardEnergyIds: [11] },
    playerId: 'p1',
  });
  assert.equal(res.error, 'Not enough energy to retreat (costs 3).');
});

test('B-4: retreat paying the full Retreat Cost with chosen Energy succeeds', () => {
  const state = retreatState();
  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 2, discardEnergyIds: [11, 12, 13] },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.discard.length, 3);
});

test('B-4: the same Energy listed twice does not count twice', () => {
  const state = retreatState();
  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 2, discardEnergyIds: [11, 11, 11] },
    playerId: 'p1',
  });
  assert.ok(res.error);
});

test('B-5: retreat cannot promote an attached Energy card', () => {
  const state = retreatState();
  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: 21, discardEnergyIds: [11, 12, 13] },
    playerId: 'p1',
  });
  assert.ok(res.error);
  assert.equal(state.players.p1.zones.active[0].instanceId, 1);
});

test('B-5: promote cannot move an attached Energy card to the Active Spot', () => {
  const state = mainPhaseState();
  state.players.p1.zones.bench.push(createCard({ instanceId: 2, name: 'Pikachu', hp: 60 }), energy(21, 2));
  const res = applyCommand(state, { type: 'promote', payload: { instanceId: 21 }, playerId: 'p1' });
  assert.ok(res.error);
});

test('A-4: printed damage strings such as "30+" produce a number, not NaN', () => {
  const attacker = { types: ['Fire'] };
  const defender = { weakness: { type: 'Fire', value: 2 } };
  assert.equal(computeAttackDamage(attacker, defender, { damage: '30+' }).total, 60);
  assert.equal(computeAttackDamage(attacker, {}, { damage: '10' }).total, 10);
  assert.equal(computeAttackDamage(attacker, {}, { damage: '' }).total, 0);
});

test('A-5: Weakness and Resistance apply to every type of a dual-typed attacker', () => {
  const attacker = { types: ['Water', 'Lightning'] };
  assert.equal(computeAttackDamage(attacker, { weakness: { type: 'Lightning', value: 2 } }, { damage: '30' }).total, 60);
  assert.equal(computeAttackDamage(attacker, { resistance: { type: 'Lightning', value: -30 } }, { damage: '30' }).total, 0);
});

test('A-8: a negative reveal index is rejected and reveals nothing', () => {
  const state = mainPhaseState();
  state.players.p1.zones.hand.push(createCard({ instanceId: 5, name: 'Potion' }));
  const res = applyCommand(state, { type: 'revealShortcut', payload: { zoneId: 'hand', index: -1 }, playerId: 'p1' });
  assert.ok(res.error);
  assert.equal(state.players.p1.zones.hand[0].revealed, false);
});

// B-3 needs no code change: promote requires an empty Active Spot, which off-turn only
// happens after a Knockout — exactly when the rules require a promotion.
test('B-3: off-turn promote is refused while the Active Spot is occupied, allowed after a Knockout', () => {
  const occupied = mainPhaseState();
  occupied.players.p2.zones.active.push(createCard({ instanceId: 1, name: 'Eevee', hp: 60 }));
  occupied.players.p2.zones.bench.push(createCard({ instanceId: 2, name: 'Pikachu', hp: 60 }));
  const rejected = applyCommand(occupied, { type: 'promote', payload: { instanceId: 2 }, playerId: 'p2' });
  assert.equal(rejected.error, 'Active position is already occupied.');

  const knockedOut = mainPhaseState();
  knockedOut.players.p2.zones.bench.push(createCard({ instanceId: 2, name: 'Pikachu', hp: 60 }));
  const allowed = applyCommand(knockedOut, { type: 'promote', payload: { instanceId: 2 }, playerId: 'p2' });
  assert.equal(allowed.error, null);
});
