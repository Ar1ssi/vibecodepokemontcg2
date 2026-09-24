// Design 036 A9: filtered / both-sides counter spread, doubled counters, Knock Out each
// Pokémon at or below an HP line, and "N damage to each of your opponent's Pokémon [that …]".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { eachPokemonDamage } from '../rules/damage-parser.mjs';

const steps = (text, selfName = 'Yveltal') => {
  const parsed = parseAttackSteps(text, { selfName });
  return [...parsed.before, ...parsed.after].map(({ attackName, ...step }) => step);
};

test('parser: filtered and both-sides counter wordings', () => {
  assert.deepEqual(steps("Put 2 damage counters on each of your opponent's Pokémon that has any damage counters on it."), [
    { type: 'atkCountersEachFiltered', count: 2, side: 'opponent', scope: 'all', filter: { damaged: true } },
  ]);
  assert.deepEqual(
    steps("Put 6 damage counters on each Pokémon that has an Ability (both yours and your opponent's)."),
    [{ type: 'atkCountersEachFiltered', count: 6, side: 'both', scope: 'all', filter: { hasAbility: true } }]
  );
  assert.deepEqual(steps("Put 1 damage counter on each Benched Pokémon (both yours and your opponent's)."), [
    { type: 'atkCountersEachFiltered', count: 1, side: 'both', scope: 'bench', filter: {} },
  ]);
  assert.deepEqual(steps('Put 2 damage counters on each Defending Pokémon.'), [
    { type: 'atkCountersEachFiltered', count: 2, side: 'opponent', scope: 'active', filter: {} },
  ]);
  assert.deepEqual(steps("Put 3 damage counters on each of your opponent's Pokémon that has a Pokémon Tool card attached to it."), [
    { type: 'atkCountersEachFiltered', count: 3, side: 'opponent', scope: 'all', filter: { hasTool: true } },
  ]);
  assert.deepEqual(steps("Double the number of damage counters on each of your opponent's Pokémon."), [
    { type: 'atkDoubleCountersEach' },
  ]);
  assert.deepEqual(steps("Knock Out each of your opponent's Pokémon that has 50 HP or less remaining."), [
    { type: 'atkKnockOutAll', maxRemainingHp: 50 },
  ]);
  // An unknown filter is not read.
  assert.deepEqual(steps("Put 1 damage counter on each of your opponent's Pokémon for each of your Maushold in play."), []);
  assert.deepEqual(
    steps('Put 1 damage counter on each Pokémon your opponent has in play of the type you chose.'),
    []
  );
});

test('eachPokemonDamage: filters, the Defending-Pokémon form, and what it leaves alone', () => {
  assert.deepEqual(
    eachPokemonDamage("This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance."),
    { amount: 60, activeOnly: false, filter: { ruleBox: ['ex'] } }
  );
  assert.deepEqual(eachPokemonDamage('Does 20 damage to each Defending Pokémon.'), { amount: 20, activeOnly: true, filter: {} });
  assert.equal(eachPokemonDamage('Flip a coin. If heads, this attack does 10 damage to each Defending Pokémon.'), null);
  assert.equal(
    eachPokemonDamage("Does 10 damage to each of your opponent's Pokémon for each Energy card attached to that Pokémon."),
    null
  );
  assert.equal(eachPokemonDamage("This attack does 20 damage to each of your opponent's Benched Pokémon."), null);
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });

function board({ text, types = ['Darkness'], opponent, own = [] }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 200, types, attacks: [{ name: 'Spread', cost: [], damage: '', text }] })
  );
  for (const props of own) state.players.p1.zones.bench.push(pokemon(props));
  const [active, ...bench] = opponent;
  state.players.p2.zones.active.push(pokemon(active));
  for (const props of bench) state.players.p2.zones.bench.push(pokemon(props));
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
const damageOf = (state, playerId, instanceId) => {
  const zones = state.players[playerId].zones;
  return [...zones.active, ...zones.bench].find((c) => c.instanceId === instanceId)?.damage ?? null;
};

test('Corrosive Winds: counters only on the Pokémon that already had damage', () => {
  const state = attack(
    board({
      text: "Put 2 damage counters on each of your opponent's Pokémon that has any damage counters on it.",
      opponent: [
        { instanceId: 20, name: 'Active', hp: 200 },
        { instanceId: 21, name: 'Hurt', hp: 200, damage: 30 },
        { instanceId: 22, name: 'Fresh', hp: 200 },
      ],
    })
  );
  assert.equal(damageOf(state, 'p2', 20), 0);
  assert.equal(damageOf(state, 'p2', 21), 50);
  assert.equal(damageOf(state, 'p2', 22), 0);
});

test('Night Roam: a Knock Out on your own Bench gives your opponent the Prize', () => {
  const state = attack(
    board({
      text: "Put 1 damage counter on each Pokémon (both yours and your opponent's).",
      own: [{ instanceId: 10, name: 'Frail', hp: 50, damage: 40 }],
      opponent: [{ instanceId: 20, name: 'Active', hp: 200 }],
    })
  );
  assert.equal(damageOf(state, 'p2', 20), 10);
  assert.equal(damageOf(state, 'p1', 1), 10);
  assert.equal(damageOf(state, 'p1', 10), null, 'the Benched Pokémon is Knocked Out');
  assert.equal(state.players.p2.flags?.prizesOwed, 1, 'the opponent is owed the Prize');
  assert.equal(state.players.p1.flags?.prizesOwed, undefined);
});

test('Snow Coating doubles the counters on each of the opponent\'s Pokémon', () => {
  const state = attack(
    board({
      text: "Double the number of damage counters on each of your opponent's Pokémon.",
      opponent: [
        { instanceId: 20, name: 'Active', hp: 200, damage: 30 },
        { instanceId: 21, name: 'Bench', hp: 200, damage: 0 },
      ],
    })
  );
  assert.equal(damageOf(state, 'p2', 20), 60);
  assert.equal(damageOf(state, 'p2', 21), 0);
});

test('Soul Destroyer knocks out each Pokémon at 50 HP or less, and only those', () => {
  const state = attack(
    board({
      text: "Knock Out each of your opponent's Pokémon that has 50 HP or less remaining.",
      opponent: [
        { instanceId: 20, name: 'Active', hp: 200, damage: 100 },
        { instanceId: 21, name: 'Low', hp: 70, damage: 20 },
        { instanceId: 22, name: 'Healthy', hp: 120 },
      ],
    })
  );
  assert.equal(damageOf(state, 'p2', 20), 100);
  assert.equal(damageOf(state, 'p2', 21), null);
  assert.equal(damageOf(state, 'p2', 22), 0);
  assert.equal(state.players.p1.flags?.prizesOwed, 1);
});

test('Severe Squall hits each Pokémon ex without Weakness and leaves the rest alone', () => {
  const state = attack(
    board({
      types: ['Water'],
      text: "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
      opponent: [
        { instanceId: 20, name: 'Charizard ex', subtypes: ['Stage 2', 'ex'], hp: 330, weakness: { type: 'Water', value: 2 } },
        { instanceId: 21, name: 'Pidgey', hp: 60 },
        { instanceId: 22, name: 'Mew ex', subtypes: ['Basic', 'ex'], hp: 180 },
      ],
    })
  );
  assert.equal(state.pendingChoice, null);
  assert.equal(damageOf(state, 'p2', 20), 60);
  assert.equal(damageOf(state, 'p2', 21), 0);
  assert.equal(damageOf(state, 'p2', 22), 60);
});

test('Spiral Dive hits every opponent\'s Pokémon, the Active through Weakness', () => {
  const state = attack(
    board({
      types: ['Grass'],
      text: "Does 10 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      opponent: [
        { instanceId: 20, name: 'Active', hp: 200, weakness: { type: 'Grass', value: 2 } },
        { instanceId: 21, name: 'Bench A', hp: 60, weakness: { type: 'Grass', value: 2 } },
        { instanceId: 22, name: 'Bench B', hp: 60 },
      ],
    })
  );
  assert.equal(state.pendingChoice, null, 'no single-target prompt');
  assert.equal(damageOf(state, 'p2', 20), 20);
  assert.equal(damageOf(state, 'p2', 21), 10);
  assert.equal(damageOf(state, 'p2', 22), 10);
});

test('Double Tackle "each Defending Pokémon" is the Active only', () => {
  const state = attack(
    board({
      text: 'Does 20 damage to each Defending Pokémon.',
      opponent: [
        { instanceId: 20, name: 'Active', hp: 200 },
        { instanceId: 21, name: 'Bench', hp: 60 },
      ],
    })
  );
  assert.equal(damageOf(state, 'p2', 20), 20);
  assert.equal(damageOf(state, 'p2', 21), 0);
});
