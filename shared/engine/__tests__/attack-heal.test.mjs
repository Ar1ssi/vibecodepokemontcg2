// Design 036 A6: heal wordings — remove-all, counted ("remove N damage counters"), chosen /
// multi-target / per-heads and cure forms, read as atkHealCounted / atkHealEach steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { addCondition, listConditions } from '../rules/special-conditions.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });

// 0.1 → heads, 0.9 → tails, consumed in order; shuffles are the identity.
const coins = (...faces) => {
  const queue = faces.map((face) => (face === 'heads' ? 0.1 : 0.9));
  return { next: () => (queue.length ? queue.shift() : 0.5), shuffle: (items) => items };
};

const steps = (text, selfName = 'Snorlax') => {
  const parsed = parseAttackSteps(text, { selfName });
  return [...parsed.before, ...parsed.after].map(({ attackName, ...step }) => step);
};

function board({ text, name = 'Snorlax', damage = 0, attackerDamage = 80, bench = [], conditions }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const attacker = pokemon({
    instanceId: 1,
    name,
    hp: 200,
    damage: attackerDamage,
    attacks: [{ name: 'Heal Attack', cost: [], damage, text }],
  });
  for (const condition of conditions || []) addCondition(attacker, condition);
  state.players.p1.zones.active.push(attacker);
  for (const [i, benchDamage] of bench.entries()) {
    state.players.p1.zones.bench.push(pokemon({ instanceId: 10 + i, name: `Bench ${i}`, hp: 120, damage: benchDamage }));
  }
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 300, damage: 50 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 60 }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      // A deck so the turn hand-off draw does not end the game by deck-out.
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state, rng) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
const choose = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const damageOf = (state, playerId, instanceId) => {
  const zones = state.players[playerId].zones;
  return [...zones.active, ...zones.bench].find((c) => c.instanceId === instanceId)?.damage || 0;
};

test('parser: remove-all, counted, cure and chosen heal wordings', () => {
  assert.deepEqual(steps('Remove all damage counters from Snorlax. Snorlax can\'t use Layabout during your next turn.')[0], {
    type: 'atkHealCounted',
    all: true,
    target: 'self',
  });
  assert.deepEqual(steps('Remove all Special Conditions and 3 damage counters from Slowbro.', 'Slowbro'), [
    { type: 'atkHealCounted', count: 3, target: 'self', cure: true },
  ]);
  assert.deepEqual(steps('Discard a {W} Energy attached to Corsola and remove all damage counters from Corsola.', 'Corsola'), [
    { type: 'atkHealCounted', all: true, target: 'self' },
  ]);
  assert.deepEqual(steps('Heal 30 damage from 1 of your Benched Pokémon.'), [
    { type: 'atkHealCounted', count: 3, target: 'chosen', scope: 'bench' },
  ]);
  assert.deepEqual(steps('Heal all damage from 2 of your Benched Pokémon.'), [
    { type: 'atkHealCounted', all: true, target: 'chosen', scope: 'bench', targets: 2 },
  ]);
  assert.deepEqual(steps('Flip 3 coins. Remove a number of damage counters equal to the number of heads from your Pokémon in any way you like.'), [
    { type: 'atkHealCounted', count: 1, perHeads: true, target: 'distribute', scope: 'all' },
  ]);
  assert.deepEqual(steps('Before doing damage, remove 1 damage counter from the Defending Pokémon.'), [
    { type: 'atkHealCounted', count: 1, target: 'opponentActive' },
  ]);
  assert.deepEqual(steps('Heal 20 damage from each of your Pokémon that has any Energy attached to it.'), [
    { type: 'atkHealEach', count: 2, scope: 'all', hasEnergy: true },
  ]);
});

test('parser: a coin-gated "does N more damage and heal" keeps the coin gate', () => {
  assert.deepEqual(steps('Flip a coin. If heads, this attack does 20 more damage and heal 20 damage from this Pokémon.'), [
    { type: 'atkHealCounted', count: 2, target: 'self', gate: 'heads' },
  ]);
});

test('parseAttackDamage: "remove N damage counters" is N × 10 damage', () => {
  assert.equal(parseAttackDamage({ damage: 0, text: 'Remove 2 damage counters from Vaporeon.' }, {}).heal, 20);
  assert.equal(parseAttackDamage({ damage: 0, text: 'Heal 30 damage from this Pokémon.' }, {}).heal, 30);
});

test('Layabout removes every damage counter from the attacker', () => {
  const res = attack(
    board({ text: 'Remove all damage counters from Snorlax. Snorlax can\'t use Layabout during your next turn.' })
  );
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 'p1', 1), 0);
});

test('Spiral Drain "remove 2 damage counters" heals 20, not 2', () => {
  const res = attack(board({ text: 'Remove 2 damage counters from Snorlax.', damage: 20, attackerDamage: 50 }));
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 'p1', 1), 30);
});

test('Full-Belly Refresh removes 3 counters and every Special Condition', () => {
  const res = attack(
    board({
      name: 'Slowbro',
      text: 'Remove all Special Conditions and 3 damage counters from Slowbro.',
      attackerDamage: 50,
      conditions: ['Poisoned'],
    })
  );
  assert.ok(!res.error, res.error);
  const slowbro = res.state.players.p1.zones.active.find((c) => c.instanceId === 1);
  assert.equal(slowbro.damage, 20);
  assert.deepEqual(listConditions(slowbro), []);
});

test('Sweet Scent heals the chosen Pokémon only, never the attacker by default', () => {
  const pending = attack(
    board({ text: 'Remove 3 damage counters from 1 of your Pokémon.', attackerDamage: 20, bench: [50, 0] })
  );
  assert.ok(!pending.error, pending.error);
  const ids = pending.state.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 10], 'only damaged Pokémon are offered');
  const res = choose(pending.state, [10]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 'p1', 10), 20);
  assert.equal(damageOf(res.state, 'p1', 1), 20, 'the attacker keeps its damage');
});

test('Healing Trial heals the attacker on heads and the Defending Pokémon on tails', () => {
  const text =
    'Flip a coin. If heads, remove 3 damage counters from Chansey. If tails, remove 3 damage counters from the Defending Pokémon.';
  const heads = attack(board({ name: 'Chansey', text, attackerDamage: 50 }), coins('heads'));
  assert.ok(!heads.error, heads.error);
  assert.equal(damageOf(heads.state, 'p1', 1), 20);
  assert.equal(damageOf(heads.state, 'p2', 20), 50);

  const tails = attack(board({ name: 'Chansey', text, attackerDamage: 50 }), coins('tails'));
  assert.equal(damageOf(tails.state, 'p1', 1), 50);
  assert.equal(damageOf(tails.state, 'p2', 20), 20);
});

test('Magic Heal spreads one counter per heads across the chosen Pokémon', () => {
  const text =
    'Flip 3 coins. Remove a number of damage counters equal to the number of heads from your Pokémon in any way you like.';
  let res = attack(board({ name: 'Mr. Mime E4', text, attackerDamage: 30, bench: [40] }), coins('heads', 'heads', 'tails'));
  assert.ok(!res.error, res.error);
  res = choose(res.state, [10]);
  assert.ok(!res.error, res.error);
  res = choose(res.state, [1]);
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 'p1', 10), 30);
  assert.equal(damageOf(res.state, 'p1', 1), 20);
});

test('"Heal all damage from 2 of your Benched Pokémon" heals both when only two are damaged', () => {
  const res = attack(board({ text: 'Heal all damage from 2 of your Benched Pokémon.', bench: [40, 60, 0] }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 'p1', 10), 0);
  assert.equal(damageOf(res.state, 'p1', 11), 0);
  assert.equal(damageOf(res.state, 'p1', 1), 80, 'the Active is not a Benched Pokémon');
});

test('"Heal 20 damage from each of your Pokémon that has any Energy attached" skips bare Pokémon', () => {
  const state = board({ text: 'Heal 20 damage from each of your Pokémon that has any Energy attached to it.', bench: [40] });
  state.players.p1.zones.active.push(
    createCard({ instanceId: 5, name: 'Basic Grass Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types: ['Grass'], attachedTo: 1 })
  );
  const res = attack(state);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 'p1', 1), 60);
  assert.equal(damageOf(res.state, 'p1', 10), 40);
});
