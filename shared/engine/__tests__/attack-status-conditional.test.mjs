// Design 036 A10: a status clause behind a printed board condition ("If your opponent's Active
// Pokémon is Confused, it is now Paralyzed") applies only when the condition holds, read before
// the attack's own damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackStatusBranches, statusesFromBranches } from '../rules/attack-status.mjs';
import { listConditions } from '../rules/special-conditions.mjs';

test('parser: condition branches, pronoun and both-Active subjects', () => {
  assert.deepEqual(
    parseAttackStatusBranches("If your opponent's Active Pokémon is Confused, it is now Paralyzed."),
    [
      {
        when: { condition: { kind: 'defenderStatus', status: 'Confused', negated: false } },
        target: 'defender',
        statuses: ['Paralyzed'],
      },
    ]
  );
  assert.deepEqual(
    parseAttackStatusBranches(
      'If this Pokémon has any damage counters on it, this attack does 50 more damage, and both Active Pokémon are now Confused.',
      { selfName: 'Pangoro' }
    ),
    [
      {
        when: { condition: { kind: 'attackerDamageCounters', op: 'gte', n: 1, negated: false } },
        target: 'both',
        statuses: ['Confused'],
      },
    ]
  );
  // An unread condition still applies nothing.
  assert.deepEqual(
    parseAttackStatusBranches("If you played a Supporter card this turn, your opponent's Active Pokémon is now Asleep."),
    []
  );
});

test('parser: extra coin wordings are read as gates', () => {
  const whenOf = (text) => parseAttackStatusBranches(text)[0]?.when;
  assert.deepEqual(whenOf("Flip 2 coins. If either coin is heads, your opponent's Active Pokémon is now Asleep."), {
    headsAtLeast: 1,
  });
  assert.deepEqual(whenOf("Flip 3 coins. If exactly 2 are heads, your opponent's Active Pokémon is now Burned."), {
    headsExactly: 2,
  });
  assert.deepEqual(whenOf("Flip 3 coins. If all 3 are heads, your opponent's Active Pokémon is now Paralyzed."), {
    allHeads: true,
  });
  assert.deepEqual(
    whenOf("Flip 2 coins. If you get at least 1 heads, your opponent's Active Pokémon is now Confused."),
    { headsAtLeast: 1 }
  );
});

test('statusesFromBranches: a condition branch needs conditionMet', () => {
  const branches = parseAttackStatusBranches("If your opponent's Active Pokémon is a Basic Pokémon, it is now Confused.");
  assert.deepEqual(statusesFromBranches(branches).defenderConditions, []);
  assert.deepEqual(statusesFromBranches(branches, { conditionMet: () => true }).defenderConditions, ['Confused']);
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });

function board({ text, damage = '', attacker = {}, defender = {} }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', cost: [], damage, text }], ...attacker })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 200, ...defender }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attack = (state) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(5));
  assert.ok(!res.error, res.error);
  return res.state;
};
const conditionsOf = (state, playerId) => listConditions(state.players[playerId].zones.active[0]);

const STRANGE_REACTION = "If your opponent's Active Pokémon is Confused, it is now Paralyzed.";

test('Strange Reaction paralyzes a Confused defender', () => {
  const state = attack(board({ text: STRANGE_REACTION, defender: { specialCondition: 'Confused' } }));
  assert.ok(conditionsOf(state, 'p2').includes('Paralyzed'));
});

test('Strange Reaction leaves a healthy defender alone', () => {
  const state = attack(board({ text: STRANGE_REACTION }));
  assert.deepEqual(conditionsOf(state, 'p2'), []);
});

const EARTH_POISON =
  "If your opponent's Active Pokémon already has any damage counters on it, your opponent's Active Pokémon is now Poisoned.";

test('Earth Poison reads damage counters from before its own damage', () => {
  const fresh = attack(board({ text: EARTH_POISON, damage: '30' }));
  assert.equal(fresh.players.p2.zones.active[0].damage, 30);
  assert.deepEqual(conditionsOf(fresh, 'p2'), [], 'its own damage does not count');

  const hurt = attack(board({ text: EARTH_POISON, damage: '30', defender: { damage: 10 } }));
  assert.ok(conditionsOf(hurt, 'p2').includes('Poisoned'));
});

test('Untamed Punch confuses both Active Pokémon only when the attacker is damaged', () => {
  const text =
    'If this Pokémon has any damage counters on it, this attack does 50 more damage, and both Active Pokémon are now Confused.';
  const damaged = attack(board({ text, attacker: { damage: 10 } }));
  assert.ok(conditionsOf(damaged, 'p1').includes('Confused'));
  assert.ok(conditionsOf(damaged, 'p2').includes('Confused'));

  const clean = attack(board({ text }));
  assert.deepEqual(conditionsOf(clean, 'p1'), []);
  assert.deepEqual(conditionsOf(clean, 'p2'), []);
});
