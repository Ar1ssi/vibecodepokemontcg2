// A4 (design 036): conditional-KO wordings. The Active is Knocked Out when its printed
// condition holds (Basic / Special Energy / remaining HP), "Both Active Pokémon are Knocked
// Out" marks both sides, the least-HP wordings pick among every Pokémon in play except the
// attacker, and Radiant Hunt filters by rule box. Beedrill's "only if" use condition gates
// the whole attack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { parseAttackCondition, attackConditionMet } from '../rules/attack-conditions.mjs';

// ── parser ──────────────────────────────────────────────────────────────────
test('parseAttackSteps: A4 conditional-KO wordings become Knock Out steps', () => {
  const after = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(
    after("If your opponent's Active Pokémon is a Basic Pokémon, it is Knocked Out."),
    [{ type: 'atkKnockOut', condition: 'basic' }]
  );
  assert.deepEqual(
    after("If your opponent's Active Pokémon has any Special Energy attached, it is Knocked Out."),
    [{ type: 'atkKnockOut', condition: 'specialEnergy' }]
  );
  assert.deepEqual(
    after("If your opponent's Active Pokémon has 100 HP or less remaining, it is Knocked Out."),
    [{ type: 'atkKnockOut', condition: 'maxRemainingHp', maxRemainingHp: 100 }]
  );
  assert.deepEqual(after('Both Active Pokémon are Knocked Out.'), [
    { type: 'atkKnockOut', scope: 'both' },
  ]);
  assert.deepEqual(
    after(
      "Choose a Pokémon in play (yours or your opponent's) that has the least HP remaining, except for this Pokémon, and it is Knocked Out.",
      'Inteleon'
    ),
    [{ type: 'atkKnockOutChoose', leastHp: true }]
  );
  assert.deepEqual(
    after(
      'The Pokémon that has the least HP remaining, except for this Pokémon, is Knocked Out. (If multiple Pokémon are tied, choose one.)',
      'Greninja'
    ),
    [{ type: 'atkKnockOutChoose', leastHp: true }]
  );
  assert.deepEqual(
    after(
      "Choose 1 Pokémon (yours or your opponent's) with the fewest remaining HP (excluding Gardevoir) and that Pokémon is now Knocked Out.",
      'Gardevoir LV.X'
    ),
    [{ type: 'atkKnockOutChoose', leastHp: true }]
  );
  assert.deepEqual(after("Knock Out 1 of your opponent's Radiant Pokémon."), [
    { type: 'atkKnockOutChoose', ruleBox: 'radiant' },
  ]);
});

test('parseAttackCondition: "You can use this attack only if…" gates the attack', () => {
  const cond = parseAttackCondition(
    'You can use this attack only if this Pokémon has any damage counters on it. Both Active Pokémon are Knocked Out.',
    { selfName: 'Beedrill' }
  );
  assert.deepEqual(cond, { kind: 'attackerDamageCounters', op: 'gte', n: 1, negated: false });
  assert.equal(attackConditionMet(cond, { attackerDamage: 0 }), false);
  assert.equal(attackConditionMet(cond, { attackerDamage: 10 }), true);
});

// ── reducer ─────────────────────────────────────────────────────────────────
let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const energy = (type, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    ...extra,
  });
const specialEnergy = (extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: 'Special Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    type: 'Energy',
    ...extra,
  });
const trainer = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Active attacks with `attacks`; `setup` shapes the board before the attack. */
function board({ attacks, attackerName = 'Attacker', defenderHp = 300, setup = () => {}, seed = 5 }) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-cond-ko', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(trainer(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(attackerName, { hp: 300, attacks });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: defenderHp });
  state.players.p2.zones.active.push(defender);
  // One Benched Pokémon keeps the game alive after a Knock Out (a wipe would end it).
  state.players.p2.zones.bench.push(mon('Bench', { hp: 300 }));
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function run(state, command, rng) {
  const res = applyCommand(state, command, rng);
  assert.equal(res.error, null);
  return res;
}

const attack = (b, attackIndex = 0) =>
  run(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, b.rng);

const inDiscard = (res, playerId, instanceId) =>
  res.state.players[playerId].zones.discard.some((c) => c.instanceId === instanceId);

test('Axe Blast: the Basic-only Knock Out fires on a Basic and is skipped on a Stage 1', () => {
  const text = "If your opponent's Active Pokémon is a Basic Pokémon, it is Knocked Out.";
  const attacks = [{ name: 'Axe Blast', cost: [], damage: '0', text }];

  const basic = board({ attacks, attackerName: 'Haxorus' });
  const ko = attack(basic);
  assert.ok(inDiscard(ko, 'p2', basic.defender.instanceId), 'the Basic Active is Knocked Out');
  assert.equal(ko.state.players.p1.flags.prizesOwed, 1);

  const evolved = board({
    attacks,
    attackerName: 'Haxorus',
    setup: ({ defender }) => {
      defender.stage = 'Stage 1';
    },
  });
  const noKo = attack(evolved);
  assert.ok(!inDiscard(noKo, 'p2', evolved.defender.instanceId), 'an evolved Active survives');
  assert.equal(noKo.state.players.p1.flags.prizesOwed, undefined);
});

test('Bring Down the Axe: the Special-Energy Knock Out needs a Special Energy attached', () => {
  const text =
    "If your opponent's Active Pokémon has any Special Energy attached, it is Knocked Out.";
  const attacks = [{ name: 'Bring Down the Axe', cost: [], damage: '0', text }];

  const withSpecial = board({
    attacks,
    attackerName: 'Haxorus',
    setup: ({ p2, defender }) => {
      p2.zones.active.push(specialEnergy({ attachedTo: defender.instanceId }));
    },
  });
  assert.ok(inDiscard(attack(withSpecial), 'p2', withSpecial.defender.instanceId));

  const basicOnly = board({
    attacks,
    attackerName: 'Haxorus',
    setup: ({ p2, defender }) => {
      p2.zones.active.push(energy('Water', { attachedTo: defender.instanceId }));
    },
  });
  const noKo = attack(basicOnly);
  assert.ok(!inDiscard(noKo, 'p2', basicOnly.defender.instanceId), 'Basic Energy does not count');
  assert.equal(noKo.state.players.p1.flags.prizesOwed, undefined);
});

test('Reaping Claw: the Knock Out fires at 100 HP or less remaining, not above it', () => {
  const text = "If your opponent's Active Pokémon has 100 HP or less remaining, it is Knocked Out.";
  const attacks = [{ name: 'Reaping Claw', cost: [], damage: '0', text }];

  const atThreshold = board({
    attacks,
    attackerName: 'Armaldo',
    defenderHp: 120,
    setup: ({ defender }) => {
      defender.damage = 20;
    },
  });
  assert.ok(inDiscard(attack(atThreshold), 'p2', atThreshold.defender.instanceId));

  const above = board({
    attacks,
    attackerName: 'Armaldo',
    defenderHp: 120,
    setup: ({ defender }) => {
      defender.damage = 10;
    },
  });
  const noKo = attack(above);
  assert.ok(!inDiscard(noKo, 'p2', above.defender.instanceId), '110 remaining HP survives');
  assert.equal(noKo.state.players.p1.flags.prizesOwed, undefined);
});

test('Destined Fight: both Active Pokémon are Knocked Out and both players take a Prize', () => {
  const b = board({
    attacks: [{ name: 'Destined Fight', cost: [], damage: '0', text: 'Both Active Pokémon are Knocked Out.' }],
    attackerName: 'Annihilape',
    setup: ({ p1 }) => {
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
    },
  });
  const res = attack(b);
  assert.ok(inDiscard(res, 'p2', b.defender.instanceId), "the opponent's Active is Knocked Out");
  assert.ok(inDiscard(res, 'p1', b.attacker.instanceId), 'the attacker itself is Knocked Out');
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);
  assert.equal(res.state.players.p2.flags.prizesOwed, 1);
});

test('Destined Fight: simultaneous Knock Outs settle as one tiebreak, not the second KO winner', () => {
  const attacks = [
    { name: 'Destined Fight', cost: [], damage: '0', text: 'Both Active Pokémon are Knocked Out.' },
  ];

  // Both players take their last Prize on the same attack: sudden death, no winner.
  const lastPrizes = board({
    attacks,
    attackerName: 'Annihilape',
    setup: ({ p1, p2 }) => {
      p1.zones.prizes.splice(0, 5);
      p2.zones.prizes.splice(0, 5);
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
    },
  });
  const tied = attack(lastPrizes);
  assert.equal(tied.state.turn.phase, 'tiebreak');
  assert.equal(tied.state.winner, null);
  assert.ok(tied.events.some((e) => e.type === 'tiebreakStarted'));
  assert.equal(tied.state.players.p1.flags.prizesOwed, 1);
  assert.equal(tied.state.players.p2.flags.prizesOwed, 1);

  // Both boards wiped: the two no-Pokémon wins are simultaneous too.
  const doubleWipe = board({
    attacks,
    attackerName: 'Annihilape',
    setup: ({ p1, p2 }) => {
      p2.zones.bench.length = 0;
    },
  });
  const wiped = attack(doubleWipe);
  assert.equal(wiped.state.turn.phase, 'tiebreak');
  assert.ok(wiped.events.some((e) => e.type === 'tiebreakStarted'));

  // Only the opponent's board wiped: the attacker wins outright.
  const opponentOnly = board({
    attacks,
    attackerName: 'Annihilape',
    setup: ({ p1, p2 }) => {
      p2.zones.bench.length = 0;
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
    },
  });
  const won = attack(opponentOnly);
  assert.equal(won.state.turn.phase, 'ended');
  assert.equal(won.state.winner, 'p1');
});

test('Bring Down: the least-HP Pokémon in play is Knocked Out, excluding the attacker', () => {
  const text =
    "Choose a Pokémon in play (yours or your opponent's) that has the least HP remaining, except for this Pokémon, and it is Knocked Out.";
  const b = board({
    attacks: [{ name: 'Bring Down', cost: [], damage: '0', text }],
    attackerName: 'Inteleon',
    setup: ({ p1, p2 }) => {
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
      p2.zones.bench.push(mon('Weak Bench', { hp: 20 }));
    },
  });
  const res = attack(b);
  const weak = res.state.players.p2.zones.discard.find((c) => c.name === 'Weak Bench');
  assert.ok(weak, 'the 20 HP Benched Pokémon is Knocked Out');
  assert.ok(!inDiscard(res, 'p1', b.attacker.instanceId), 'the attacker is never the pick');
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);
});

test('Bring Down: a tie at the lowest HP asks which Pokémon to Knock Out', () => {
  const text =
    "Choose a Pokémon in play (yours or your opponent's) that has the least HP remaining, except for this Pokémon, and it is Knocked Out.";
  const b = board({
    attacks: [{ name: 'Bring Down', cost: [], damage: '0', text }],
    attackerName: 'Inteleon',
    setup: ({ p2 }) => {
      p2.zones.bench.push(mon('Weak A', { hp: 20 }), mon('Weak B', { hp: 20 }));
    },
  });
  const suspended = attack(b);
  const choice = suspended.state.pendingChoice;
  assert.ok(choice, 'the tie opens a picker');
  assert.deepEqual(
    choice.options.map((o) => o.name).sort(),
    ['Weak A', 'Weak B'],
    'only the tied lowest-HP Pokémon are offered'
  );
  const pick = choice.options.find((o) => o.name === 'Weak A');
  const resolved = run(
    suspended.state,
    { type: 'resolveChoice', payload: { choiceId: choice.choiceId, selection: [pick.instanceId] }, playerId: 'p1' },
    b.rng
  );
  assert.ok(inDiscard(resolved, 'p2', pick.instanceId));
});

test('Radiant Hunt: a Radiant Pokémon is Knocked Out, and nothing happens without one', () => {
  const attacks = [
    { name: 'Radiant Hunt', cost: [], damage: '0', text: "Knock Out 1 of your opponent's Radiant Pokémon." },
  ];
  const withRadiant = board({
    attacks,
    attackerName: 'Noivern',
    setup: ({ p2 }) => {
      p2.zones.bench.push(mon('Radiant Greninja', { hp: 130, subtypes: ['radiant'] }));
    },
  });
  const res = attack(withRadiant);
  assert.ok(
    res.state.players.p2.zones.discard.some((c) => c.name === 'Radiant Greninja'),
    'the Radiant Pokémon is Knocked Out'
  );
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);

  const none = board({ attacks, attackerName: 'Noivern' });
  const noKo = attack(none);
  assert.ok(noKo.events.some((e) => e.type === 'effectStepSkipped'));
  assert.equal(noKo.state.players.p1.flags.prizesOwed, undefined);
});

test('Destiny Stinger: the both-Active Knock Out is gated by the damage-counter use condition', () => {
  const text =
    'You can use this attack only if this Pokémon has any damage counters on it. Both Active Pokémon are Knocked Out.';
  const attacks = [{ name: 'Destiny Stinger', cost: [], damage: '0', text }];

  const blocked = board({
    attacks,
    attackerName: 'Beedrill',
    setup: ({ p1 }) => {
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
    },
  });
  const fizzled = attack(blocked);
  assert.ok(fizzled.events.some((e) => e.type === 'attackConditionFailed'));
  assert.ok(!inDiscard(fizzled, 'p2', blocked.defender.instanceId));
  assert.ok(!inDiscard(fizzled, 'p1', blocked.attacker.instanceId));

  const allowed = board({
    attacks,
    attackerName: 'Beedrill',
    setup: ({ p1, attacker }) => {
      attacker.damage = 10;
      p1.zones.bench.push(mon('Own Bench', { hp: 300 }));
    },
  });
  const res = attack(allowed);
  assert.ok(inDiscard(res, 'p2', allowed.defender.instanceId));
  assert.ok(inDiscard(res, 'p1', allowed.attacker.instanceId));
});
