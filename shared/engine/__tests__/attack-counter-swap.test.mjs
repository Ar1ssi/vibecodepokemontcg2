// Blacephalon (Cosmic Eclipse 104/236, custom set customhb) Mind Blown: "You may put 5 damage
// counters on this Pokémon. If you do, put 12 damage counters on your opponent's Pokémon in any
// way you like. Otherwise, put 5 …" — text from client/src/assets/custom-sets/customhb/set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { optionalCostBonusClause } from '../rules/optional-cost-bonus.mjs';

const MIND_BLOWN = {
  name: 'Mind Blown',
  damage: '',
  cost: [],
  text: "You may put 5 damage counters on this Pokémon. If you do, put 12 damage counters on your opponent's Pokémon in any way you like. Otherwise, put 5 damage counters on your opponent's Pokémon in any way you like.",
};

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });

function board() {
  nextId = 1;
  const state = createGameState({ gameId: 'counter-swap', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon('Blacephalon', { attacks: [MIND_BLOWN] });
  const defender = mon('Defender', { hp: 300 });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  return { state, attacker, defender };
}

const run = (state, command) => applyCommand(state, command, createRng(3));
const attack = (state) => run(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } });
const choose = (res, selection) =>
  run(res.state, {
    type: 'resolveChoice',
    playerId: 'p1',
    payload: { choiceId: res.state.pendingChoice.choiceId, selection },
  });
const damageOn = (state, owner, card) => {
  const zones = state.players[owner].zones;
  return [...zones.active, ...zones.bench].find((c) => c.instanceId === card.instanceId)?.damage || 0;
};

test('Mind Blown parses as a yes/no self-counter cost with a 12/5 spread', () => {
  const clause = optionalCostBonusClause(MIND_BLOWN.text, 'Blacephalon');
  assert.deepEqual(clause.cost, { kind: 'selfCounters', exactly: 5 });
  assert.deepEqual(clause.counterSwap, { paid: 12, unpaid: 5 });
});

test('Mind Blown: the attacker is asked before any counter lands', () => {
  const { state, attacker, defender } = board();
  const offered = attack(state);
  assert.equal(offered.error, null);
  assert.ok(offered.state.pendingChoice, 'the self-counter cost is offered');
  assert.equal(damageOn(offered.state, 'p1', attacker), 0);
  assert.equal(damageOn(offered.state, 'p2', defender), 0);
});

test('Mind Blown: yes puts 5 counters on Blacephalon and 12 on the opponent', () => {
  const { state, attacker, defender } = board();
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOn(paid.state, 'p1', attacker), 50);
  assert.equal(damageOn(paid.state, 'p2', defender), 120);
});

test('Mind Blown: no puts 5 counters on the opponent and none on Blacephalon', () => {
  const { state, attacker, defender } = board();
  const declined = choose(attack(state), [2]);
  assert.equal(declined.error, null);
  assert.equal(damageOn(declined.state, 'p1', attacker), 0);
  assert.equal(damageOn(declined.state, 'p2', defender), 50);
});

test('Mind Blown with a Benched target: yes asks for 12 placements, no asks for 5', () => {
  for (const [answer, total] of [[1, 12], [2, 5]]) {
    const { state, defender } = board();
    const bench = mon('Bench', { hp: 300 });
    state.players.p2.zones.bench.push(bench);
    let step = choose(attack(state), [answer]);
    let placed = 0;
    while (step.state.pendingChoice) {
      step = choose(step, [placed % 2 ? bench.instanceId : defender.instanceId]);
      assert.equal(step.error, null);
      placed++;
      assert.ok(placed <= 20, 'spread must end');
    }
    assert.equal(placed, total);
    assert.equal(
      damageOn(step.state, 'p2', defender) + damageOn(step.state, 'p2', bench),
      total * 10
    );
  }
});
