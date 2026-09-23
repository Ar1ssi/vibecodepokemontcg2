// A3 (design 036): extra Prize on Knock Out. "If your opponent's Pokémon is Knocked Out by
// damage from this attack, take N more Prize card(s)" pays when this attack's Knock Out
// matches the clause's rule-box filter; the next-turn wording leaves a `prizeBonus` marker
// that the following turn's Knock Out reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import {
  parsePrizeOnKo,
  prizeFilterMatches,
  prizeRuleBoxes,
} from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

// ── parser ──────────────────────────────────────────────────────────────────
test('parsePrizeOnKo: every printed wording, and the clauses that must not match', () => {
  const cases = [
    [
      "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card.",
      { count: 1 },
    ],
    [
      "If 1 of your opponent's Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards.",
      { count: 2 },
    ],
    [
      "If your opponent's Basic Pokémon is Knocked Out by damage from this attack, take 1 more Prize card.",
      { count: 1, filter: { ruleBox: 'basic' } },
    ],
    [
      "If your opponent's Pokémon-GX or Pokémon-EX is Knocked Out by damage from this attack, take 1 more Prize card.",
      { count: 1, filter: { ruleBox: 'gx-ex' } },
    ],
    [
      "If your opponent's Mega Evolution Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards.",
      { count: 2, filter: { ruleBox: 'mega' } },
    ],
    ["If the Defending Pokémon is Knocked Out by this attack, take 1 more Prize card.", { count: 1 }],
    // Beast Game-GX: the base clause parses; the extra-Energy "instead" upgrade is not this clause.
    [
      "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card. If this Pokémon has at least 7 extra Energy attached to it (in addition to this attack's cost), take 3 more Prize cards instead.",
      { count: 1 },
    ],
  ];
  for (const [text, expected] of cases) assert.deepEqual(parsePrizeOnKo(text), expected, text);

  const nulls = [
    'During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards.',
    'If the Defending Pokémon is Knocked Out during your next turn, take 1 more Prize card.',
    'If you have more Prize cards remaining than your opponent, this attack does 90 more damage.',
    "For the rest of this game, your Pokémon's attacks do 30 more damage. If this Pokémon has at least 1 extra {W} Energy attached to it, when your opponent's Active Pokémon is Knocked Out by damage from those attacks, take 1 more Prize card.",
    '',
  ];
  for (const text of nulls) assert.equal(parsePrizeOnKo(text), null, text);
});

test('prizeRuleBoxes / prizeFilterMatches: labels match the wording families', () => {
  const card = (extra) => ({ supertype: 'Pokémon', stage: 'Basic', ...extra });
  assert.deepEqual(prizeRuleBoxes(card({ name: 'Pikachu' })), ['basic']);
  assert.deepEqual(prizeRuleBoxes(card({ name: 'Iron Hands ex', subtypes: ['ex'] })), [
    'basic',
    'gx-ex',
  ]);
  assert.deepEqual(prizeRuleBoxes(card({ name: 'Wartortle', stage: 'Stage 1' })), []);
  assert.deepEqual(prizeRuleBoxes(card({ name: 'M Venusaur-EX', stage: 'MEGA' })), [
    'gx-ex',
    'mega',
  ]);
  const exBasic = prizeRuleBoxes(card({ name: 'Iron Hands ex', subtypes: ['ex'] }));
  assert.equal(prizeFilterMatches({ ruleBox: 'basic' }, exBasic), true);
  assert.equal(prizeFilterMatches({ ruleBox: 'gx-ex' }, exBasic), true);
  assert.equal(
    prizeFilterMatches({ ruleBox: 'basic' }, prizeRuleBoxes(card({ name: 'Wartortle', stage: 'Stage 1' }))),
    false
  );
  assert.equal(prizeFilterMatches(undefined, []), true);
});

test('parseAttackSteps: both next-turn prize wordings become a prizeBonus marker', () => {
  const cases = [
    ['During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards.', 2],
    ['If the Defending Pokémon is Knocked Out during your next turn, take 1 more Prize card.', 1],
  ];
  for (const [text, count] of cases) {
    const { after } = parseAttackSteps(text, { selfName: 'Ribombee' });
    assert.deepEqual(
      after,
      [
        {
          type: 'atkAddMarker',
          target: 'opponentActive',
          window: 'yourNextTurn',
          marker: { kind: 'prizeBonus', count },
        },
      ],
      text
    );
  }
});

// ── reducer ─────────────────────────────────────────────────────────────────
let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Active attacks with `attacks`; `setup` shapes the board before the attack. */
function board({ attacks, attackerName = 'Attacker', defenderHp = 400, setup = () => {}, seed = 5 }) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-prize', seed, rulesEnabled: false });
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
  // One Benched Pokémon keeps the game alive after the Active Knock Out: wiping p2's board
  // would end the game and settle the prizes before the test can inspect the entitlement.
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

/** The reducer settles a Knock Out with a prize picker; take what it offers. */
function takePrizes(res) {
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'a prize picker is waiting');
  return run(
    res.state,
    {
      type: 'resolveChoice',
      payload: {
        choiceId: choice.choiceId,
        selection: choice.options.slice(0, choice.min).map((o) => o.instanceId),
      },
      playerId: choice.player,
    },
    null
  );
}

const GENERIC =
  "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card.";

test('Amp You Very Much (D1): the Knock Out pays base + printed extra Prize', () => {
  const b = board({
    attacks: [{ name: 'Amp You Very Much', cost: [], damage: '120', text: GENERIC }],
    attackerName: 'Iron Hands ex',
    defenderHp: 100,
  });
  const res = attack(b);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko?.prizeCount, 1, 'the Knock Out event keeps the base count');
  assert.equal(res.state.players.p1.flags.prizesOwed, 2, 'the clause grants one more');

  const settled = takePrizes(res);
  assert.equal(settled.state.players.p1.zones.prizes.length, 4);
  assert.equal(settled.state.players.p1.zones.hand.length, 2);
});

test('More Moon (D2): no Knock Out, no extra Prize', () => {
  const b = board({
    attacks: [{ name: 'More Moon', cost: [], damage: '50', text: GENERIC }],
    attackerName: 'Clefable',
    defenderHp: 100,
  });
  const res = attack(b);
  assert.equal(res.events.find((e) => e.type === 'pokemonKnockedOut'), undefined);
  assert.equal(res.state.players.p1.flags.prizesOwed, undefined);
  assert.equal(res.state.players.p1.zones.prizes.length, 6);
});

test('a Basic-only clause pays on a Basic Knock Out but not on a Stage 1 one', () => {
  const text =
    "If your opponent's Basic Pokémon is Knocked Out by damage from this attack, take 1 more Prize card.";
  const attacks = [{ name: 'Double Dip Fangs', cost: [], damage: '60', text }];

  const basic = board({ attacks, attackerName: 'Stoutland V', defenderHp: 60 });
  assert.equal(attack(basic).state.players.p1.flags.prizesOwed, 2);

  const stage1 = board({
    attacks,
    attackerName: 'Stoutland V',
    defenderHp: 60,
    setup: ({ defender }) => {
      defender.stage = 'Stage 1';
    },
  });
  const res = attack(stage1);
  assert.equal(res.events.find((e) => e.type === 'pokemonKnockedOut')?.prizeCount, 1);
  assert.equal(res.state.players.p1.flags.prizesOwed, 1, 'base prize only');
});

test('the Pokémon-GX/-EX clause pays for an ex Knock Out', () => {
  const b = board({
    attacks: [
      {
        name: 'Greedy Crush',
        cost: [],
        damage: '210',
        text: "If your opponent's Pokémon-GX or Pokémon-EX is Knocked Out by damage from this attack, take 1 more Prize card.",
      },
    ],
    attackerName: 'Mega Sableye & Tyranitar-GX',
    defenderHp: 200,
    setup: ({ defender }) => {
      defender.name = 'Iron Hands ex';
      defender.subtypes = ['ex'];
    },
  });
  const res = attack(b);
  assert.equal(res.state.players.p1.flags.prizesOwed, 3, '2 for the ex + 1 extra');
  const settled = takePrizes(res);
  assert.equal(settled.state.players.p1.zones.prizes.length, 3);
});

test('the Mega Evolution clause pays for a Mega Knock Out', () => {
  const text =
    "If your opponent's Mega Evolution Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards.";
  const attacks = [{ name: 'Endgame', cost: [], damage: '70', text }];

  const mega = board({
    attacks,
    attackerName: 'Umbreon-EX',
    defenderHp: 70,
    setup: ({ defender }) => {
      defender.name = 'M Venusaur-EX';
      defender.stage = 'MEGA';
    },
  });
  assert.equal(attack(mega).state.players.p1.flags.prizesOwed, 4, '2 for the Mega + 2 extra');

  const basic = board({ attacks, attackerName: 'Umbreon-EX', defenderHp: 70 });
  const res = attack(basic);
  assert.equal(res.state.players.p1.flags.prizesOwed, 1, 'base prize only');
});

test("the clause pays only this attack's Knock Out, not a checkup Knock Out", () => {
  const b = board({
    attacks: [
      {
        name: 'Toxic Jab',
        cost: [],
        damage: '0',
        text: `Your opponent's Active Pokémon is now Poisoned. ${GENERIC}`,
      },
    ],
    defenderHp: 100,
    setup: ({ defender }) => {
      defender.damage = 90;
    },
  });
  const res = attack(b);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.ok(ko, 'the checkup Poison Knocks the defender Out');
  assert.equal(ko.prizeCount, 1, 'base prize only');
  assert.equal(res.state.players.p1.flags.prizesOwed, 1);
  assert.equal(res.events.find((e) => e.type === 'prizeEntitlementGranted'), undefined);
});

test('Critical Bite: a chosen-target Knock Out pays after the target picker resumes', () => {
  const text =
    "This attack does 30 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.) If 1 of your opponent's Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards.";
  const b = board({
    attacks: [{ name: 'Critical Bite', cost: [], damage: '0', text }],
    attackerName: 'Crobat',
    setup: ({ state }) => {
      state.players.p2.zones.bench.push(mon('Bench Target', { hp: 20 }));
    },
  });
  const suspended = attack(b);
  const choice = suspended.state.pendingChoice;
  assert.equal(choice?.source, 'attack', 'the attack waits for the target pick');
  assert.equal(suspended.state.players.p1.flags.prizesOwed, undefined, 'no Knock Out yet');

  const benchTarget = suspended.state.players.p2.zones.bench.find((c) => c.name === 'Bench Target');
  const resolved = run(
    suspended.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: choice.choiceId, selection: [benchTarget.instanceId] },
      playerId: 'p1',
    },
    b.rng
  );
  const ko = resolved.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko?.instanceId, benchTarget.instanceId);
  assert.equal(ko?.prizeCount, 1, 'base prize for the 20 HP Basic');
  assert.equal(resolved.state.players.p1.flags.prizesOwed, 3, 'base 1 + Critical Bite 2');
});

test('a main-damage Knock Out pays even when the target picker suspends the attack', () => {
  const b = board({
    attacks: [
      {
        name: 'Wide Strike',
        cost: [],
        damage: '400',
        text: `This attack does 30 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.) ${GENERIC}`,
      },
    ],
    setup: ({ state }) => {
      state.players.p2.zones.bench.push(mon('Bench Target', { hp: 20 }));
    },
  });
  const suspended = attack(b);
  assert.equal(suspended.state.players.p1.flags.prizesOwed, 2, 'the Active Knock Out is already paid');
  assert.ok(suspended.state.pendingChoice, 'the target picker is waiting');

  const target = suspended.state.players.p2.zones.bench.find((c) => c.name === 'Bench Target');
  const resolved = run(
    suspended.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: suspended.state.pendingChoice.choiceId, selection: [target.instanceId] },
      playerId: 'p1',
    },
    b.rng
  );
  assert.equal(resolved.state.players.p1.flags.prizesOwed, 4, 'both Knock Outs paid, none twice');
});

test('a Knock Out pays when an after-step pauses the attack', () => {
  const b = board({
    attacks: [{ name: 'Lethal Draw', cost: [], damage: '400', text: `${GENERIC} Draw up to 2 cards.` }],
    defenderHp: 100,
  });
  const suspended = attack(b);
  assert.equal(suspended.state.players.p1.flags.prizesOwed, 2, 'paid before the pause');
  assert.ok(suspended.state.pendingChoice, 'the draw choice is waiting');

  const resolved = run(
    suspended.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: suspended.state.pendingChoice.choiceId, selection: [1] },
      playerId: 'p1',
    },
    b.rng
  );
  assert.equal(resolved.state.players.p1.flags.prizesOwed, 2, 'no double payment on resume');
});

test('the printed extra Prize pays once per Knock Out, and is floored at the Prize zone', () => {
  const spread = board({
    attacks: [
      {
        name: 'Toxic Cloud',
        cost: [],
        damage: '0',
        text: `Put 3 damage counters on each of your opponent's Benched Pokémon. ${GENERIC}`,
      },
    ],
    setup: ({ state }) => {
      state.players.p2.zones.bench.push(mon('Weak Bench A', { hp: 20 }), mon('Weak Bench B', { hp: 20 }));
    },
  });
  const spreadRes = attack(spread);
  assert.equal(
    spreadRes.events.filter((e) => e.type === 'pokemonKnockedOut').length,
    2,
    'both Benched Pokémon are Knocked Out'
  );
  assert.equal(spreadRes.state.players.p1.flags.prizesOwed, 4, 'base 1 + extra 1 per victim');

  const floored = board({
    attacks: [
      {
        name: 'Critical Cloud',
        cost: [],
        damage: '0',
        text: `Put 3 damage counters on each of your opponent's Benched Pokémon. If 1 of your opponent's Pokémon is Knocked Out by damage from this attack, take 2 more Prize cards.`,
      },
    ],
    setup: ({ state, p1 }) => {
      state.players.p2.zones.bench.push(mon('Weak Bench A', { hp: 20 }), mon('Weak Bench B', { hp: 20 }));
      p1.zones.prizes.splice(0, 3); // three Prize cards left
    },
  });
  const flooredRes = attack(floored);
  const granted = flooredRes.events.find((e) => e.type === 'prizeEntitlementGranted');
  assert.equal(granted?.count, 3, 'two victims x 2 extra, floored at the three remaining Prizes');
  assert.equal(
    flooredRes.events.find((e) => e.type === 'prizesTaken')?.count,
    3,
    'the surplus entitlement is dropped, not stranded'
  );
  assert.equal(flooredRes.state.players.p1.zones.prizes.length, 0);
  assert.equal(flooredRes.state.players.p1.zones.hand.length, 3);
  assert.equal(flooredRes.state.turn.phase, 'ended', 'taking every remaining Prize wins');
});

test('Plentiful Pollen: the next-turn marker pays on the following turn', () => {
  const b = board({
    attacks: [
      {
        name: 'Plentiful Pollen',
        cost: [],
        damage: '30',
        text: 'During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards.',
      },
      { name: 'Follow Up', cost: [], damage: '120', text: '' },
    ],
    attackerName: 'Ribombee',
    defenderHp: 100,
  });
  const first = attack(b);
  assert.equal(first.state.players.p1.flags.prizesOwed, undefined, 'no immediate clause');
  assert.deepEqual(
    first.state.players.p2.zones.active[0].attackMarkers.map((m) => [
      m.kind,
      m.count,
      m.fromTurn,
      m.untilTurn,
    ]),
    [['prizeBonus', 2, 5, 5]]
  );

  // p2 passes; p1's next turn (number 5) is the window the marker pays in.
  const passed = run(first.state, { type: 'pass', playerId: 'p2' }, b.rng);
  assert.equal(passed.state.turn.number, 5);
  const ko = run(
    passed.state,
    { type: 'attack', playerId: 'p1', payload: { attackIndex: 1 } },
    b.rng
  );
  assert.equal(ko.events.find((e) => e.type === 'pokemonKnockedOut')?.prizeCount, 3, 'base 1 + marker 2');
  assert.equal(ko.state.players.p1.flags.prizesOwed, 3);
});

test('a prizeBonus marker pays for a checkup Knock Out inside its window', () => {
  const b = board({
    attacks: [
      {
        name: 'Plentiful Pollen',
        cost: [],
        damage: '30',
        text: 'During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards.',
      },
      {
        name: 'Toxic Touch',
        cost: [],
        damage: '0',
        text: "Your opponent's Active Pokémon is now Poisoned.",
      },
    ],
    attackerName: 'Ribombee',
    defenderHp: 100,
  });
  const first = attack(b); // marker + 30 damage, turn 3 → p2's turn 4
  const passed = run(first.state, { type: 'pass', playerId: 'p2' }, b.rng); // → p1's turn 5
  assert.equal(passed.state.turn.number, 5);
  passed.state.players.p2.zones.active[0].damage = 90; // one Poison tick from lethal

  // The turn-5 attack only Poisons; the Checkup at the end of that turn Knocks Out.
  const ko = run(passed.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 1 } }, b.rng);
  const koEvent = ko.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.ok(koEvent, 'the Checkup Poison Knocks the defender Out');
  assert.equal(koEvent.prizeCount, 3, 'base 1 + marker 2');
  assert.equal(ko.state.players.p1.flags.prizesOwed, 3);
});

test('a prizeBonus marker does not pay after the marked Pokémon leaves the Active Spot', () => {
  const b = board({
    attacks: [
      {
        name: 'Plentiful Pollen',
        cost: [],
        damage: '30',
        text: 'During your next turn, if the Defending Pokémon is Knocked Out, take 2 more Prize cards.',
      },
      {
        name: 'Snipe',
        cost: [],
        damage: '0',
        text: "This attack does 80 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
    attackerName: 'Ribombee',
    defenderHp: 100,
    setup: ({ defender }) => {
      defender.attacks = [
        {
          name: 'Switch Out',
          cost: [],
          damage: '0',
          text: 'Switch this Pokémon with 1 of your Benched Pokémon.',
        },
      ];
    },
  });
  const first = attack(b); // marker lands on p2's Active, turn 3 → 4
  const markedId = first.state.players.p2.zones.active[0].instanceId;

  // p2 switches the marked Pokémon to the Bench on its own turn.
  const switched = run(
    first.state,
    { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } },
    b.rng
  );
  assert.equal(switched.state.turn.number, 5);
  assert.ok(switched.state.players.p2.zones.bench.some((c) => c.instanceId === markedId));

  // p1 Knocks the marked Pokémon Out on the Bench inside the marker window.
  const suspended = run(
    switched.state,
    { type: 'attack', playerId: 'p1', payload: { attackIndex: 1 } },
    b.rng
  );
  const choice = suspended.state.pendingChoice;
  assert.equal(choice?.source, 'attack', 'the snipe waits for the target pick');
  const ko = run(
    suspended.state,
    {
      type: 'resolveChoice',
      payload: { choiceId: choice.choiceId, selection: [markedId] },
      playerId: 'p1',
    },
    b.rng
  );
  const koEvent = ko.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(koEvent?.instanceId, markedId);
  assert.equal(koEvent?.prizeCount, 1, 'no marker bonus off the Active Spot');
  assert.equal(ko.state.players.p1.flags.prizesOwed, 1);
});

test('a prizeBonus marker stops counting after the next turn', () => {
  const b = board({
    attacks: [
      {
        name: 'Shadow Flicker',
        cost: [],
        damage: '10',
        text: 'If the Defending Pokémon is Knocked Out during your next turn, take 1 more Prize card.',
      },
      { name: 'Follow Up', cost: [], damage: '120', text: '' },
    ],
    attackerName: 'Marshadow',
    defenderHp: 100,
  });
  let res = attack(b); // turn 3 → p2's turn 4
  res = run(res.state, { type: 'pass', playerId: 'p2' }, b.rng); // → p1's turn 5 (window)
  res = run(res.state, { type: 'pass', playerId: 'p1' }, b.rng); // → p2's turn 6
  res = run(res.state, { type: 'pass', playerId: 'p2' }, b.rng); // → p1's turn 7 (expired)
  assert.equal(res.state.turn.number, 7);

  const ko = run(res.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 1 } }, b.rng);
  assert.equal(ko.events.find((e) => e.type === 'pokemonKnockedOut')?.prizeCount, 1, 'the window has passed');
  assert.equal(ko.state.players.p1.flags.prizesOwed, 1);
});
