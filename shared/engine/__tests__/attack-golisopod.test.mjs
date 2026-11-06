// Golisopod ex / Mega Golisopod ex (custom set customhb, client/src/assets/custom-sets/customhb/set.json):
//  - Emergency Exit: "During your opponent's turn, if this Pokémon is attacked, switch this Pokémon
//    with 1 of your Benched Pokémon."
//  - First Impression: "You can use this attack only if this Pokémon moved into your Active Spot this turn."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackUseGate } from '../rules/attack-conditions.mjs';

const EXIT = "During your opponent's turn, if this Pokémon is attacked, switch this Pokémon with 1 of your Benched Pokémon.";
const FIRST_IMPRESSION = 'You can use this attack only if this Pokémon moved into your Active Spot this turn.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });

function board({ attackerText = '', attackerExtra = {}, defenderExtra = {}, benchCount = 2 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'golisopod', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon('Attacker', {
    attacks: [{ name: 'Hit', cost: [], damage: '10', text: attackerText }],
    ...attackerExtra,
  });
  const defender = mon('Golisopod ex', {
    stage: 'Stage 1',
    abilities: [{ name: 'Emergency Exit', type: 'Ability', text: EXIT }],
    ...defenderExtra,
  });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  const bench = Array.from({ length: benchCount }, (_, i) => mon(`Bench ${i}`));
  state.players.p2.zones.bench.push(...bench);
  return { state, attacker, defender, bench };
}

const run = (state, player, command) => applyCommand(state, { ...command, playerId: player }, createRng(3));
const attack = (state) => run(state, 'p1', { type: 'attack', payload: { attackIndex: 0 } });
const activeId = (state, owner) => state.players[owner].zones.active.find((c) => !c.attachedTo)?.instanceId;

test('Emergency Exit: with several Benched Pokémon the owner picks the replacement', () => {
  const { state, defender, bench } = board();
  const res = attack(state);
  assert.equal(res.error, null);
  const pending = res.state.pendingChoice;
  assert.ok(pending, 'the attacked Pokémon owner is asked');
  assert.equal(pending.player, 'p2');
  assert.equal(res.state.turn.player, 'p1', 'the turn has not ended yet');
  const picked = run(res.state, 'p2', {
    type: 'resolveChoice',
    payload: { choiceId: pending.choiceId, selection: [bench[1].instanceId] },
  });
  assert.equal(picked.error, null);
  assert.equal(activeId(picked.state, 'p2'), bench[1].instanceId);
  assert.ok(picked.state.players.p2.zones.bench.some((c) => c.instanceId === defender.instanceId));
  assert.equal(picked.state.turn.player, 'p2', 'the attack then ends the turn');
});

test('Emergency Exit: a single Benched Pokémon switches in without a prompt', () => {
  const { state, defender, bench } = board({ benchCount: 1 });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
  assert.equal(activeId(res.state, 'p2'), bench[0].instanceId);
  assert.ok(res.state.players.p2.zones.bench.some((c) => c.instanceId === defender.instanceId));
  assert.equal(res.state.turn.player, 'p2');
});

test('Emergency Exit: no Bench, no switch', () => {
  const { state, defender } = board({ benchCount: 0 });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(activeId(res.state, 'p2'), defender.instanceId);
});

test('Emergency Exit: a Knocked Out holder does not switch', () => {
  const { state, defender } = board({ defenderExtra: { hp: 10 } });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(!res.state.players.p2.zones.bench.some((c) => c.instanceId === defender.instanceId));
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.instanceId === defender.instanceId));
});

test('Emergency Exit: another Pokémon without the Ability stays Active', () => {
  const { state, defender } = board({ defenderExtra: { name: 'Plain', abilities: [] } });
  const res = attack(state);
  assert.equal(activeId(res.state, 'p2'), defender.instanceId);
});

test('First Impression: the use gate reads "moved into your Active Spot this turn"', () => {
  const gate = parseAttackUseGate(FIRST_IMPRESSION, { selfName: 'Mega Golisopod ex' });
  assert.equal(gate?.kind, 'movedToActiveThisTurn');
  assert.equal(gate?.negated, false);
});

test('First Impression: fizzles unless the attacker moved into the Active Spot this turn', () => {
  const stay = board({ attackerText: FIRST_IMPRESSION });
  const blocked = attack(stay.state);
  assert.ok(blocked.events.some((e) => e.type === 'attackConditionFailed'));
  assert.equal(blocked.events.find((e) => e.type === 'attackExecuted'), undefined);

  const moved = board({ attackerText: FIRST_IMPRESSION, attackerExtra: { movedToActiveTurn: 5 } });
  const hit = attack(moved.state);
  assert.ok(!hit.events.some((e) => e.type === 'attackConditionFailed'));
  assert.equal(hit.events.find((e) => e.type === 'attackExecuted')?.damage, 10);
});

test('Swing and Skedaddle: discards an Energy, then switches the attacker with a Benched Pokémon', () => {
  const { state, attacker } = board({
    attackerText: 'Discard an Energy from this Pokémon. If you do, switch it with 1 of your Benched Pokémon.',
    defenderExtra: { abilities: [] },
  });
  const energy = createCard({ instanceId: 900, name: 'Basic Water Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Water'] });
  energy.attachedTo = attacker.instanceId;
  state.players.p1.zones.active.push(energy);
  const ownBench = mon('Own Bench');
  state.players.p1.zones.bench.push(ownBench);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === energy.instanceId), 'Energy discarded');
  assert.equal(activeId(res.state, 'p1'), ownBench.instanceId, 'attacker switched to the Bench');
});

test('Swing and Skedaddle: with no Energy to discard, "if you do" fails and the attacker stays Active', () => {
  const { state, attacker } = board({
    attackerText: 'Discard an Energy from this Pokémon. If you do, switch it with 1 of your Benched Pokémon.',
    defenderExtra: { abilities: [] },
  });
  state.players.p1.zones.bench.push(mon('Own Bench'));
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(activeId(res.state, 'p1'), attacker.instanceId);
});
