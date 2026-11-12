// Blacephalon (Cosmic Eclipse 104/236, custom set customhb HB 087) Mind Blown, both texts the card
// has carried: the counter swap — "You may put 5 damage counters on this Pokémon. If you do, put
// 12 damage counters on your opponent's Pokémon in any way you like. Otherwise, put 5 …" — and the
// Bench spread — "You may put 5 damage counters on this Pokémon. If you do, this attack does 30
// damage to each of your opponent's Benched Pokémon." (100 damage, 90 HP; set.json customhb-087,
// the user's cardback edit of sm12-104 and its screenshot).
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

const MIND_BLOWN_SPREAD = {
  name: 'Mind Blown',
  damage: '100',
  cost: [],
  text: "You may put 5 damage counters on this Pokémon. If you do, this attack does 30 damage to each of your opponent's Benched Pokémon.",
};

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });

function board(attack = MIND_BLOWN, { attackerExtra = {}, benched = 0, rulesEnabled = false } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'counter-swap', seed: 3, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon('Blacephalon', { attacks: [attack], ...attackerExtra });
  const defender = mon('Defender', { hp: 300 });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  const bench = Array.from({ length: benched }, (_, i) => mon(`Bench ${i}`, { hp: 300 }));
  state.players.p2.zones.bench.push(...bench);
  return { state, attacker, defender, bench };
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

// ── HB 087 Mind Blown, Bench spread text ─────────────────────────────────────────────────────

const spreadBoard = (options = {}) =>
  board(MIND_BLOWN_SPREAD, { ...options, attackerExtra: { hp: 90, ...options.attackerExtra } });

test('HB 087 Mind Blown parses as a yes/no self-counter cost that unlocks a 30-damage Bench spread', () => {
  const clause = optionalCostBonusClause(MIND_BLOWN_SPREAD.text, 'Blacephalon');
  assert.deepEqual(clause.cost, { kind: 'selfCounters', exactly: 5 });
  assert.deepEqual(clause.benchSpread, { amount: 30 });
  assert.equal(clause.counterSwap, undefined);
  assert.equal(clause.bonus, 0, 'the cost adds no damage to the Active');
});

test('HB 087 Mind Blown: the attacker is asked before any damage lands', () => {
  const { state, attacker, defender, bench } = spreadBoard({ benched: 2 });
  const offered = attack(state);
  assert.equal(offered.error, null);
  assert.match(offered.state.pendingChoice.prompt, /put 5 damage counters on this Pokémon to do 30 damage/);
  assert.equal(damageOn(offered.state, 'p1', attacker), 0);
  assert.equal(damageOn(offered.state, 'p2', defender), 0);
  assert.deepEqual(bench.map((b) => damageOn(offered.state, 'p2', b)), [0, 0]);
});

test('HB 087 Mind Blown: yes puts 5 counters on Blacephalon, 100 on the Active and 30 on each Benched Pokémon', () => {
  const { state, attacker, defender, bench } = spreadBoard({ benched: 2 });
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(paid.state.pendingChoice, null);
  assert.equal(damageOn(paid.state, 'p1', attacker), 50);
  assert.equal(damageOn(paid.state, 'p2', defender), 100);
  assert.deepEqual(bench.map((b) => damageOn(paid.state, 'p2', b)), [30, 30]);
});

test('HB 087 Mind Blown: no does 100 to the Active and nothing to the Bench or to Blacephalon', () => {
  const { state, attacker, defender, bench } = spreadBoard({ benched: 2 });
  const declined = choose(attack(state), [2]);
  assert.equal(declined.error, null);
  assert.equal(damageOn(declined.state, 'p1', attacker), 0);
  assert.equal(damageOn(declined.state, 'p2', defender), 100);
  assert.deepEqual(bench.map((b) => damageOn(declined.state, 'p2', b)), [0, 0]);
});

test('HB 087 Mind Blown: yes with an empty Bench still pays the counters and hits the Active', () => {
  const { state, attacker, defender } = spreadBoard();
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOn(paid.state, 'p1', attacker), 50);
  assert.equal(damageOn(paid.state, 'p2', defender), 100);
  assert.ok(paid.events.some((e) => e.type === 'attackBenchFizzled'), 'the empty Bench is announced');
});

test('HB 087 Mind Blown: counters that bring Blacephalon to its 90 HP Knock it Out', () => {
  const { state, attacker, defender, bench } = spreadBoard({
    benched: 1,
    rulesEnabled: true,
    attackerExtra: { damage: 40 },
  });
  state.players.p1.zones.bench.push(mon('Own Bench', { hp: 100 }));
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOn(paid.state, 'p2', defender), 100);
  assert.equal(damageOn(paid.state, 'p2', bench[0]), 30);
  assert.ok(
    paid.state.players.p1.zones.discard.some((c) => c.instanceId === attacker.instanceId),
    'Blacephalon is in its owner\'s discard pile'
  );
});
