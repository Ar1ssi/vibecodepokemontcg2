// Design 035 slice 1 (I131): the prize-clause parser reads only the
// "take(s) N more/fewer Prize card" clause, never the text's first number.
// Card texts below are verbatim from the S279 trainer corpus
// (.agent/scratch/trainer-series-audit/trainers.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { applyCommand } from '../../reduce.mjs';

const { parsePrizeModify, applyPrizeModify } = await import(
  '../ability-executors.mjs'
);
const { toolPrizeCountAdjust } = await import('../tool-combat.mjs');
const {
  parseToolCondition,
  toolConditionMet,
  toolHpBonusFor,
  toolRetreatDeltaFor,
} = await import('../tool-conditions.mjs');
const {
  combinedToolHpBonus,
  combinedToolRetreatCost,
  combinedToolAttackBonus,
  combinedToolDamagePrevention,
  applyToolDamageReduction,
} = await import('../tool-combat.mjs');
const { parseHpBonus, applyHpBonus, parseRetreatCostModifier } = await import(
  '../ability-executors.mjs'
);
const { effectiveHp } = await import('../stadium-effects.mjs');

const tool = (name, text) => ({
  name,
  type: 'Trainer',
  trainerType: 'Tool',
  text,
});

// The 16 corpus rows whose parsed prize delta was non-zero before I131:
// 11 were wrong (first number in the text), 5 already read the clause.
const CORPUS_TABLE = [
  {
    name: 'Counter Gain',
    text: 'If you have more Prize cards remaining than your opponent, attacks used by the Pokémon this card is attached to cost {C} less.',
    delta: 0,
  },
  {
    name: 'Lillie’s Pearl',
    text: 'If the Lillie’s Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card.',
    delta: -1,
  },
  {
    name: 'Luxurious Cape',
    text: 'If the Pokémon this card is attached to doesn’t have a Rule Box, it gets +100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 more Prize card. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)',
    delta: 1,
  },
  {
    name: 'Defiance Vest',
    text: 'If you have more Prize cards remaining than your opponent, the Pokémon this card is attached to takes 40 less damage from attacks from your opponent’s Pokémon (after applying Weakness and Resistance).',
    delta: 0,
  },
  {
    name: 'Defiance Band',
    text: 'If you have more Prize cards remaining than your opponent, the attacks of the Pokémon this card is attached to do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).',
    delta: 0,
  },
  {
    name: 'Sky Seal Stone',
    text: 'VSTAR Power The Pokémon V this card is attached to can use the VSTAR Power on this card. Ability ⇢ Star Order During your turn, you may use this Ability. During this turn, if your opponent’s Active Pokémon VSTAR or Active Pokémon VMAX is Knocked Out by damage from an attack from your Basic Pokémon V, take 1 more Prize card. (You can’t use more than 1 VSTAR Power in a game.)',
    delta: 1,
  },
  {
    name: 'Ribbon Badge',
    text: 'If the Pokémon V this card is attached to has “Sylveon” in its name and is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card.',
    delta: -1,
  },
  {
    name: 'Hero’s Medal',
    text: 'The Pokémon VMAX this card is attached to gets -100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card. You can’t attach this card to a Pokémon VMAX that has 100 HP or less remaining.',
    delta: -1,
  },
  {
    name: 'Island Challenge Amulet',
    text: 'The Pokémon-GX or Pokémon-EX this card is attached to gets -100 HP, and when it is Knocked Out by damage from an opponent’s attack, that player takes 1 fewer Prize card.',
    delta: -1,
  },
  {
    name: 'Beastite',
    text: 'The attacks of the Ultra Beast this card is attached to do 10 more damage to your opponent’s Active Pokémon for each Prize card you have taken (before applying Weakness and Resistance).',
    delta: 0,
  },
  {
    name: 'Karate Belt',
    text: 'If you have more Prize cards remaining than your opponent, the attacks of the Pokémon this card is attached to cost {F} less.',
    delta: 0,
  },
  {
    name: 'Beast Bringer',
    text: 'If you have exactly 6 Prize cards remaining, and if your opponent’s Active Pokémon-GX or Pokémon-EX is Knocked Out by damage from an attack of the Ultra Beast this card is attached to, take 1 more Prize card.',
    delta: 1,
  },
  {
    name: 'Life Dew',
    text: 'If the Pokémon this card is attached to is Knocked Out, your opponent takes 1 fewer Prize card.',
    delta: -1,
  },
  {
    name: 'Expert Belt',
    text: 'The Pokémon this card is attached to gets +20 HP and that Pokémon’s attacks do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance). When the Pokémon this card is attached to is Knocked Out, your opponent takes 1 more Prize card.',
    delta: 1,
  },
  {
    name: 'Solid Rage',
    text: 'Attach Solid Rage to 1 of your Evolved Pokémon (excluding Pokémon-ex) that doesn’t already have a Pokémon Tool attached to it. If the Pokémon Solid Rage is attached to is a Basic Pokémon or Pokémon-ex, discard Solid Rage. If you have more Prize cards left than your opponent, the Pokémon that Solid Rage is attached to does 20 more damage to the Active Pokémon (before applying Weakness and Resistance).',
    // The old first-number read returned +1 (from "to 1 of your Evolved
    // Pokémon"); the printed card has no prize clause, so 0 is correct.
    delta: 0,
  },
];

// Imperative "take N more Prize cards" clauses belong to the player who took the
// Knock Out; every other clause names the victim's opponent ("that player takes").
const ATTACKER_SIDE = new Set([
  'Sky Seal Stone',
  'Beast Bringer',
  'Anthea & Concordia',
  'Briar',
  'Greedy Dice',
]);
const expectedSide = (name, delta) =>
  !delta ? null : ATTACKER_SIDE.has(name) ? 'attacker' : 'victim';

test('parsePrizeModify: corpus prize rows (I131) carry the clause side (I138)', () => {
  for (const { name, text, delta } of CORPUS_TABLE) {
    assert.deepEqual(
      parsePrizeModify(tool(name, text)),
      { delta, side: expectedSide(name, delta) },
      `${name} should parse delta ${delta}`
    );
  }
});

test('parsePrizeModify: clause-only, other wordings stay neutral', () => {
  const cases = [
    {
      name: 'Anthea & Concordia',
      text: 'During this turn, if your opponent’s Active Pokémon is Knocked Out by damage from an attack used by your N’s Pokémon, take 3 more Prize cards.',
      delta: 3,
    },
    {
      name: 'Briar',
      text: 'During this turn, if your opponent’s Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take 1 more Prize card.',
      delta: 1,
    },
    {
      name: 'Greedy Dice',
      text: 'Flip a coin. If heads, take 1 more Prize card.',
      delta: 1,
    },
    {
      name: 'Black Market Prism Star',
      text: 'When a {D} Pokémon (yours or your opponent’s) that has any {D} Energy attached to it is Knocked Out by damage from an opponent’s attack, that player takes 1 fewer Prize card.',
      delta: -1,
    },
    {
      name: 'Karen’s Conviction',
      text: 'During this turn, your Single Strike Pokémon’s attacks do 20 more damage to your opponent’s Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance).',
      delta: 0,
    },
    {
      name: 'Lillie’s Poké Doll',
      text: 'If this card is Knocked Out, your opponent can’t take a Prize card.',
      delta: 0,
    },
    {
      name: 'Missing Clover',
      text: 'If you played 4 cards, take a Prize card.',
      delta: 0,
    },
    {
      name: 'Rotom Dex',
      text: 'After counting your Prize cards, shuffle them into your deck. Then, take that many cards from the top of your deck and put them face down as your Prize cards.',
      delta: 0,
    },
    {
      name: 'Lt. Surge’s Bargain',
      text: 'Ask your opponent if each player may take a Prize card. If yes, each player takes a Prize card.',
      delta: 0,
    },
  ];
  for (const { name, text, delta } of cases) {
    assert.deepEqual(
      parsePrizeModify(tool(name, text)),
      { delta, side: expectedSide(name, delta) },
      `${name} should parse delta ${delta}`
    );
  }
});

test('parsePrizeModify: neutral on empty/malformed text (edge cases 1, 2; design 038 row 1)', () => {
  const neutral = { delta: 0, side: null };
  assert.deepEqual(parsePrizeModify(null), neutral);
  assert.deepEqual(parsePrizeModify({}), neutral);
  assert.deepEqual(parsePrizeModify({ text: '' }), neutral);
  assert.deepEqual(parsePrizeModify({ text: 'Draw 3 cards.' }), neutral);
  assert.deepEqual(parsePrizeModify({ text: 'Take a Prize card.' }), neutral);
  assert.deepEqual(
    parsePrizeModify({ text: 'Your opponent takes that many Prize cards.' }),
    neutral
  );
  assert.deepEqual(
    parsePrizeModify({ text: 'Take 0 more Prize cards.' }),
    neutral
  );
});

test('parsePrizeModify: a clause with no subject the gate knows stays neutral (I138)', () => {
  // "Each player takes 1 more Prize card" names neither side; guessing would put the
  // delta on the wrong player's Knock Out.
  assert.deepEqual(
    parsePrizeModify({ text: 'Each player takes 1 more Prize card.' }),
    { delta: 0, side: null }
  );
});

test('applyPrizeModify: floors at 0 (edge case 14)', () => {
  assert.equal(applyPrizeModify(2, -1), 1);
  assert.equal(applyPrizeModify(1, -5), 0);
  assert.equal(applyPrizeModify(0, -1), 0);
});

test('toolPrizeCountAdjust: corpus repro cards on a KO (base 2)', () => {
  const mon = {
    name: 'Snorlax',
    hp: 100,
    retreatCost: 4,
    image: { name: 'host' },
  };
  const vmax = { ...mon, name: 'Snorlax VMAX', subtypes: ['VMAX'] };
  const gx = { ...mon, name: 'Snorlax-GX', subtypes: ['GX'] };
  const attached = (card, holder) => ({
    ...card,
    image: { relative: holder.image },
  });
  // Slice 4 gates these on the printed conditions; the holder is the card
  // each Tool was printed for. Beast Bringer's clause is attacker-side
  // (the Ultra Beast's own attack), so through the victim path it is gated
  // out — its real consumer is the on-KO hook (slice 9).
  const cases = [
    { name: 'Hero’s Medal', delta: -1, holder: vmax, expected: 1 },
    { name: 'Island Challenge Amulet', delta: -1, holder: gx, expected: 1 },
    { name: 'Luxurious Cape', delta: 1, holder: mon, expected: 3 },
    { name: 'Defiance Vest', delta: 0, holder: mon, expected: 2 },
    { name: 'Defiance Band', delta: 0, holder: mon, expected: 2 },
    { name: 'Counter Gain', delta: 0, holder: mon, expected: 2 },
    { name: 'Karate Belt', delta: 0, holder: mon, expected: 2 },
    { name: 'Beastite', delta: 0, holder: mon, expected: 2 },
    { name: 'Beast Bringer', delta: 1, holder: mon, expected: 2 },
    { name: 'Expert Belt', delta: 1, holder: mon, expected: 3 },
    { name: 'Life Dew', delta: -1, holder: mon, expected: 1 },
  ];
  for (const { name, delta, holder, expected } of cases) {
    const row = CORPUS_TABLE.find((c) => c.name === name);
    assert.equal(row.delta, delta, `${name} table delta`);
    const zone = [holder, attached(row, holder)];
    assert.equal(
      toolPrizeCountAdjust(holder, zone, 2),
      expected,
      `${name} KO prize count`
    );
  }
  assert.equal(toolPrizeCountAdjust(null, [], 2), 2);
});

test('toolPrizeCountAdjust: prize delta floors at 0 (edge case 3)', () => {
  const mon = { name: 'Snorlax', hp: 100, image: { name: 'host' } };
  const pearl = {
    ...tool('Lillie’s Pearl', 'that player takes 1 fewer Prize card.'),
    image: { relative: mon.image },
  };
  assert.equal(toolPrizeCountAdjust(mon, [mon, pearl], 0), 0);
  assert.equal(toolPrizeCountAdjust(mon, [mon, pearl], 1), 0);
});

// ── KO integration through handleKnockout ────────────────────────────────
// The audit's repros ran `playTrainer`/KO end-to-end; these drive a real
// attack so `toolPrizeCountAdjust` is exercised from reduce.mjs.

function koState({ prizeCount = 3 } = {}) {
  const state = createGameState({
    players: {
      p1: {
        username: 'Ash',
        zones: {
          prizes: Array.from({ length: prizeCount }, (_, i) =>
            createCard({ instanceId: 100 + i, name: `Prize ${i + 1}` })
          ),
        },
      },
      p2: {
        username: 'Gary',
        zones: {
          bench: [createCard({ instanceId: 50, name: 'Benched Pidgey', hp: 50 })],
          deck: [createCard({ instanceId: 99, name: 'Deck' })],
        },
      },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

function pickPrizes(res, playerId) {
  const choice = res.state.pendingChoice;
  assert.equal(choice?.player, playerId);
  const selection = choice.options
    .slice(0, choice.min)
    .map((o) => o.instanceId);
  return applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection },
    playerId,
  });
}

test('KO: Hero’s Medal on a VMAX reduces the prize count to 2 (was 0)', () => {
  const state = koState({ prizeCount: 3 });
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mewtwo',
      attacks: [{ name: 'Psystrike', cost: [], damage: 400 }],
    })
  );
  const vmax = createCard({
    instanceId: 2,
    name: 'Eternatus VMAX',
    subtypes: ['VMAX'],
    hp: 340,
  });
  const medal = createCard({
    instanceId: 3,
    name: 'Hero’s Medal',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    attachedTo: 2,
    text: 'The Pokémon VMAX this card is attached to gets -100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card.',
  });
  state.players.p2.zones.active.push(vmax, medal);

  const attackRes = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attackRes.error, null);
  const koEvent = attackRes.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(koEvent?.prizeCount, 2, 'VMAX base 3 - 1 = 2 prizes');

  const paid = pickPrizes(attackRes, 'p1');
  assert.equal(paid.state.players.p1.zones.hand.length, 2);
  assert.equal(paid.state.players.p1.zones.prizes.length, 1);
});

test('KO: Luxurious Cape adds +1 prize on a non-Rule-Box holder', () => {
  const state = koState({ prizeCount: 3 });
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mewtwo',
      attacks: [{ name: 'Psystrike', cost: [], damage: 250 }],
    })
  );
  const plain = createCard({
    instanceId: 2,
    name: 'Comfey',
    subtypes: ['Basic'],
    hp: 70,
  });
  const cape = createCard({
    instanceId: 3,
    name: 'Luxurious Cape',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    attachedTo: 2,
    text: 'If the Pokémon this card is attached to doesn’t have a Rule Box, it gets +100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 more Prize card. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)',
  });
  state.players.p2.zones.active.push(plain, cape);

  const attackRes = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attackRes.error, null);
  const koEvent = attackRes.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(koEvent?.prizeCount, 2, 'basic base 1 + 1 = 2 prizes');
});

test('KO: prize award never exceeds the prize zone (edge case 3)', () => {
  const state = koState({ prizeCount: 1 });
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mewtwo',
      attacks: [{ name: 'Psystrike', cost: [], damage: 250 }],
    })
  );
  const plain = createCard({
    instanceId: 2,
    name: 'Comfey',
    subtypes: ['Basic'],
    hp: 70,
  });
  const cape = createCard({
    instanceId: 3,
    name: 'Luxurious Cape',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    attachedTo: 2,
    text: 'If the Pokémon this card is attached to doesn’t have a Rule Box, it gets +100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 more Prize card. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)',
  });
  state.players.p2.zones.active.push(plain, cape);

  const attackRes = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attackRes.error, null);
  // 2 prizes owed but only 1 exists: it is collected directly and wins.
  assert.equal(attackRes.state.players.p1.zones.prizes.length, 0);
  assert.equal(attackRes.state.players.p1.zones.hand.length, 1);
  assert.equal(attackRes.state.winner, 'p1');
});

test('KO: Defiance Vest no longer zeroes the prize count (was -40)', () => {
  const state = koState({ prizeCount: 3 });
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Mewtwo',
      attacks: [{ name: 'Psystrike', cost: [], damage: 250 }],
    })
  );
  const plain = createCard({
    instanceId: 2,
    name: 'Comfey',
    subtypes: ['Basic'],
    hp: 70,
  });
  const vest = createCard({
    instanceId: 3,
    name: 'Defiance Vest',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    attachedTo: 2,
    text: 'If you have more Prize cards remaining than your opponent, the Pokémon this card is attached to takes 40 less damage from attacks from your opponent’s Pokémon (after applying Weakness and Resistance).',
  });
  state.players.p2.zones.active.push(plain, vest);

  const attackRes = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(attackRes.error, null);
  const koEvent = attackRes.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(koEvent?.prizeCount, 1, 'basic base 1, no prize clause');
});

// ── Slice 3 (I133a): gated HP / retreat tool modifiers ───────────────────
// Card texts verbatim from the S279 corpus; expectations from spot5.mjs.

let toolId = 700;
const mkMon = (props = {}) => ({
  instanceId: toolId++,
  name: 'Plain Holder',
  supertype: 'Pokémon',
  type: 'Pokémon',
  stage: 'Basic',
  subtypes: ['Basic'],
  types: ['Colorless'],
  hp: 150,
  ...props,
});
const mkTool = (card, holder) => ({
  instanceId: toolId++,
  type: 'Trainer',
  trainerType: 'Tool',
  subtypes: ['Pokémon Tool'],
  ...card,
  attachedTo: holder.instanceId,
});
const withTool = (holder, card) => [holder, mkTool(card, holder)];

const TOOL_TEXTS = {
  cynthia:
    'The Cynthia’s Pokémon this card is attached to gets +70 HP.',
  bravery: 'The Basic Pokémon this card is attached to gets +50 HP.',
  capeToughness:
    'The Basic Pokémon this card is attached to gets +50 HP, except Pokémon-GX.',
  ancient:
    'The Ancient Pokémon this card is attached to gets +60 HP, recovers from all Special Conditions, and can’t be affected by any Special Conditions.',
  luxurious:
    'If the Pokémon this card is attached to doesn’t have a Rule Box, it gets +100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 more Prize card. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)',
  rusted: 'The Zamazenta V this card is attached to gets +70 HP.',
  buff: 'If the Pokémon this card is attached to has a Retreat Cost of exactly 4, it gets +50 HP.',
  dumbbells: 'The Stage 1 Pokémon this card is attached to gets +40 HP.',
  furyBelt:
    'The Basic Pokémon this card is attached to gets +40 HP and its attacks do 10 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).',
  heavyBoots:
    'If the Retreat Cost of the Pokémon this card is attached to is 3 or more, that Pokémon gets +20 HP and can’t be Confused. (If that Pokémon is currently Confused, remove that Special Condition.)',
  heroMedal:
    'The Pokémon VMAX this card is attached to gets -100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card. You can’t attach this card to a Pokémon VMAX that has 100 HP or less remaining.',
  amulet:
    'The Pokémon-GX or Pokémon-EX this card is attached to gets -100 HP, and when it is Knocked Out by damage from an opponent’s attack, that player takes 1 fewer Prize card.',
  bigBalloon:
    'The Stage 2 Pokémon this card is attached to has no Retreat Cost.',
  snowLeaf:
    'If the Pokémon V this card is attached to has “Leafeon” or “Glaceon” in its name, it has no Retreat Cost and no Weakness.',
  airBalloon:
    'The Retreat Cost of the Pokémon this card is attached to is {C}{C} less.',
  heroCape: 'The Pokémon this card is attached to gets +100 HP.',
};

test('parseToolCondition: corpus HP/retreat conditions (I133a)', () => {
  const cases = [
    ['Cynthia’s Power Weight', TOOL_TEXTS.cynthia, { holderNames: ["cynthia's"] }],
    ['Bravery Charm', TOOL_TEXTS.bravery, { holderStage: 'Basic' }],
    [
      'Cape of Toughness',
      TOOL_TEXTS.capeToughness,
      { holderStage: 'Basic', holderExcludeSubtypes: ['gx'] },
    ],
    ['Ancient Booster', TOOL_TEXTS.ancient, { holderSubtypes: ['ancient'] }],
    ['Luxurious Cape', TOOL_TEXTS.luxurious, { holderNoRuleBox: true }],
    ['Rusted Shield', TOOL_TEXTS.rusted, { holderNames: ['zamazenta v'] }],
    ['Buff Padding', TOOL_TEXTS.buff, { holderRetreatExactly: 4 }],
    ['Bodybuilding Dumbbells', TOOL_TEXTS.dumbbells, { holderStage: 'Stage 1' }],
    ['Heavy Boots', TOOL_TEXTS.heavyBoots, { holderRetreatAtLeast: 3 }],
    ['Hero’s Medal', TOOL_TEXTS.heroMedal, { holderSubtypes: ['vmax'] }],
    ['Island Challenge Amulet', TOOL_TEXTS.amulet, { holderSubtypes: ['gx', 'ex'] }],
    ['Big Air Balloon', TOOL_TEXTS.bigBalloon, { holderStage: 'Stage 2' }],
    [
      'Snow Leaf Badge',
      TOOL_TEXTS.snowLeaf,
      { holderSubtypes: ['v'], holderNames: ['leafeon', 'glaceon'] },
    ],
  ];
  for (const [name, text, expected] of cases) {
    assert.deepEqual(
      parseToolCondition(tool(name, text)),
      expected,
      `${name} condition`
    );
  }
  assert.equal(
    parseToolCondition(tool('Air Balloon', TOOL_TEXTS.airBalloon)),
    null,
    'unconditional retreat tool'
  );
  assert.equal(parseToolCondition(tool('Empty', '')), null);
});

test('toolConditionMet: null descriptor is always true (edge case 4)', () => {
  const basic = mkMon();
  assert.equal(toolConditionMet(null, {}), true);
  assert.equal(toolConditionMet(undefined, {}), true);
  assert.equal(
    toolConditionMet({ holderStage: 'Basic' }, { holder: basic }),
    true
  );
  assert.equal(toolConditionMet({ holderStage: 'Basic' }, {}), false);
  assert.equal(
    toolConditionMet({ holderStage: 'Stage 2' }, { holder: basic }),
    false
  );
});

test('combinedToolHpBonus: spot5 HP matrix (I133a)', () => {
  const hp = (holder, text, name = 'Tool') =>
    combinedToolHpBonus(holder, withTool(holder, tool(name, text)));

  const plain = mkMon();
  assert.equal(hp(plain, TOOL_TEXTS.cynthia, 'Cynthia’s Power Weight'), 0);
  assert.equal(hp(plain, TOOL_TEXTS.heroCape, 'Hero’s Cape'), 100);
  const cynthia = mkMon({ name: 'Cynthia’s Garchomp' });
  assert.equal(hp(cynthia, TOOL_TEXTS.cynthia, 'Cynthia’s Power Weight'), 70);
  assert.equal(hp(plain, TOOL_TEXTS.bravery, 'Bravery Charm'), 50);

  const stage2 = mkMon({ name: 'Stage 2 Body', stage: 'Stage 2', subtypes: ['Stage 2'] });
  assert.equal(hp(stage2, TOOL_TEXTS.bravery, 'Bravery Charm'), 0);
  assert.equal(hp(plain, TOOL_TEXTS.capeToughness, 'Cape of Toughness'), 50);
  const gx = mkMon({ name: 'Body GX', subtypes: ['Basic', 'GX'], hp: 180 });
  assert.equal(hp(gx, TOOL_TEXTS.capeToughness, 'Cape of Toughness'), 0);

  const ancient = mkMon({ name: 'Regirock', subtypes: ['Basic', 'Ancient'] });
  assert.equal(hp(ancient, TOOL_TEXTS.ancient, 'Ancient Booster'), 60);
  assert.equal(hp(plain, TOOL_TEXTS.ancient, 'Ancient Booster'), 0);
  assert.equal(hp(plain, TOOL_TEXTS.luxurious, 'Luxurious Cape'), 100);
  const ex = mkMon({ name: 'Body ex', subtypes: ['Basic', 'ex'], hp: 200 });
  assert.equal(hp(ex, TOOL_TEXTS.luxurious, 'Luxurious Cape'), 0);

  const v = mkMon({ name: 'Body V', subtypes: ['Basic', 'V'], hp: 200 });
  assert.equal(hp(v, TOOL_TEXTS.rusted, 'Rusted Shield'), 0);
  const zamazenta = mkMon({ name: 'Zamazenta V', subtypes: ['Basic', 'V'], hp: 220 });
  assert.equal(hp(zamazenta, TOOL_TEXTS.rusted, 'Rusted Shield'), 70);

  const retreat4 = mkMon({ name: 'Retreat 4', retreatCost: 4 });
  assert.equal(hp(retreat4, TOOL_TEXTS.buff, 'Buff Padding'), 50);
  const retreat2 = mkMon({ name: 'Retreat 2', retreatCost: 2 });
  assert.equal(hp(retreat2, TOOL_TEXTS.buff, 'Buff Padding'), 0);

  const stage1 = mkMon({ name: 'Stage 1 Body', stage: 'Stage 1', subtypes: ['Stage 1'] });
  assert.equal(hp(stage1, TOOL_TEXTS.dumbbells, 'Bodybuilding Dumbbells'), 40);
  assert.equal(hp(plain, TOOL_TEXTS.dumbbells, 'Bodybuilding Dumbbells'), 0);
  assert.equal(hp(plain, TOOL_TEXTS.furyBelt, 'Fighting Fury Belt'), 40);
});

test('combinedToolHpBonus: Heavy Boots gates on the printed Retreat Cost (I133/A4)', () => {
  const boots = tool('Heavy Boots', TOOL_TEXTS.heavyBoots);
  assert.deepEqual(parseRetreatCostModifier(boots), { delta: 0 });
  const retreat3 = mkMon({ name: 'Retreat 3', retreatCost: 3 });
  const retreat2 = mkMon({ name: 'Retreat 2', retreatCost: 2 });
  assert.equal(combinedToolHpBonus(retreat3, withTool(retreat3, boots)), 20);
  assert.equal(combinedToolHpBonus(retreat2, withTool(retreat2, boots)), 0);
  assert.equal(combinedToolRetreatCost(3, retreat3, withTool(retreat3, boots)), 3);
});

test('combinedToolRetreatCost: spot5 retreat matrix (I133a)', () => {
  const retreat = (holder, text, name = 'Tool') =>
    combinedToolRetreatCost(2, holder, withTool(holder, tool(name, text)));

  const basic = mkMon();
  assert.equal(retreat(basic, TOOL_TEXTS.bigBalloon, 'Big Air Balloon'), 2);
  const stage2 = mkMon({ name: 'Stage 2 Body', stage: 'Stage 2', subtypes: ['Stage 2'] });
  assert.equal(retreat(stage2, TOOL_TEXTS.bigBalloon, 'Big Air Balloon'), 0);
  assert.equal(retreat(basic, TOOL_TEXTS.airBalloon, 'Air Balloon'), 0);

  const v = mkMon({ name: 'Body V', subtypes: ['Basic', 'V'], hp: 200 });
  assert.equal(retreat(v, TOOL_TEXTS.snowLeaf, 'Snow Leaf Badge'), 2);
  const leafeon = mkMon({ name: 'Leafeon V', subtypes: ['Basic', 'V'], hp: 200 });
  assert.equal(retreat(leafeon, TOOL_TEXTS.snowLeaf, 'Snow Leaf Badge'), 0);
});

test('Rescue Board: conditional no-cost applies -1 normally, 0 at 30 HP left (I133)', () => {
  const board = tool(
    'Rescue Board',
    'The Retreat Cost of the Pokémon this card is attached to is {C} less. If that Pokémon’s remaining HP is 30 or less, it has no Retreat Cost.'
  );
  assert.deepEqual(parseRetreatCostModifier(board), { delta: -1 });
  const full = mkMon({ name: 'Full HP', hp: 100, retreatCost: 2 });
  assert.equal(combinedToolRetreatCost(2, full, withTool(full, board)), 1);
  const low = mkMon({ name: 'Low HP', hp: 100, damage: 80, retreatCost: 2 });
  assert.equal(combinedToolRetreatCost(2, low, withTool(low, board)), 0);
});

test('parseHpBonus: -100 HP tools parse and floor at 1 HP (I133a)', () => {
  assert.deepEqual(
    parseHpBonus(tool('Hero’s Medal', TOOL_TEXTS.heroMedal)),
    { bonus: -100 }
  );
  assert.deepEqual(
    parseHpBonus(tool('Island Challenge Amulet', TOOL_TEXTS.amulet)),
    { bonus: -100 }
  );
  assert.equal(applyHpBonus(50, -100), 1);
  assert.equal(applyHpBonus(340, -100), 240);
});

test('effectiveHp: tool HP routes through the condition layer (I133a)', () => {
  const plain = mkMon();
  const charm = tool('Bravery Charm', TOOL_TEXTS.bravery);
  assert.equal(effectiveHp(150, 'self', plain, withTool(plain, charm)), 200);
  const stage2 = mkMon({ name: 'Stage 2 Body', stage: 'Stage 2', subtypes: ['Stage 2'] });
  assert.equal(
    effectiveHp(150, 'self', stage2, withTool(stage2, charm)),
    150,
    'Bravery Charm does nothing on a Stage 2'
  );
  const cape = tool('Hero’s Cape', TOOL_TEXTS.heroCape);
  assert.equal(effectiveHp(150, 'self', plain, withTool(plain, cape)), 250);

  const vmax = mkMon({ name: 'Eternatus VMAX', subtypes: ['VMAX'], hp: 340 });
  const medal = tool('Hero’s Medal', TOOL_TEXTS.heroMedal);
  assert.equal(effectiveHp(340, 'self', vmax, withTool(vmax, medal)), 240);

  const cynthiaWeight = tool('Cynthia’s Power Weight', TOOL_TEXTS.cynthia);
  assert.equal(
    effectiveHp(150, 'self', plain, withTool(plain, cynthiaWeight)),
    150,
    'condition fails on a non-Cynthia holder'
  );
});

test('effectiveHp: a Stadium that negates Tools short-circuits before conditions (edge case 5)', () => {
  const plain = mkMon();
  const charm = tool('Bravery Charm', TOOL_TEXTS.bravery);
  const jammingTower = {
    name: 'Jamming Tower',
    type: 'Trainer',
    trainerType: 'Stadium',
    text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
  };
  assert.equal(effectiveHp(150, 'self', plain, withTool(plain, charm)), 200);
  assert.equal(
    effectiveHp(150, 'self', plain, withTool(plain, charm), jammingTower),
    150
  );
  assert.equal(
    combinedToolHpBonus(plain, withTool(plain, charm), { blockTools: true }),
    0
  );
  assert.equal(
    combinedToolRetreatCost(2, plain, withTool(plain, tool('Air Balloon', TOOL_TEXTS.airBalloon)), {
      blockTools: true,
    }),
    2
  );
});

test('toolHpBonusFor / toolRetreatDeltaFor: gated single-tool helpers', () => {
  const plain = mkMon();
  const charm = tool('Bravery Charm', TOOL_TEXTS.bravery);
  assert.equal(toolHpBonusFor(charm, { holder: plain }), 50);
  const stage2 = mkMon({ name: 'Stage 2 Body', stage: 'Stage 2', subtypes: ['Stage 2'] });
  assert.equal(toolHpBonusFor(charm, { holder: stage2 }), 0);
  const stage2Balloon = tool('Big Air Balloon', TOOL_TEXTS.bigBalloon);
  assert.equal(toolRetreatDeltaFor(stage2Balloon, { holder: stage2 }), -Infinity);
  assert.equal(toolRetreatDeltaFor(stage2Balloon, { holder: plain }), 0);
});

// ── Slice 4 (I133b): gated bonus / prevention / reduction / prize ────────

test('Hop’s Choice Band checks the holder, not the defender (A3)', () => {
  const band = tool(
    'Hop’s Choice Band',
    'Attacks used by the Hop’s Pokémon this card is attached to cost {C} less and do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).'
  );
  const plain = mkMon({ name: 'Plain Holder' });
  const hop = mkMon({ name: 'Hop’s Pikachu' });
  const hopDefender = mkMon({ name: 'Hop’s Cramorant' });
  const plainDefender = mkMon({ name: 'Plain Defender' });
  const bonus = (holder, defender, opts = {}) =>
    combinedToolAttackBonus(holder, withTool(holder, band), defender, opts);
  assert.equal(bonus(plain, hopDefender), 0, 'plain holder never gets it');
  assert.equal(bonus(hop, plainDefender), 30, 'Hop’s holder gets it');
  assert.equal(bonus(hop, hopDefender), 30);
});

test('Hunting Gloves gates on the defender type and Active spot (A5)', () => {
  const gloves = tool(
    'Hunting Gloves',
    'The attacks of the Pokémon this card is attached to do 30 more damage to your opponent’s Active {N} Pokémon (before applying Weakness and Resistance).'
  );
  const holder = mkMon({ name: 'Holder' });
  const water = mkMon({ name: 'Water Defender', types: ['Water'] });
  const dragon = mkMon({ name: 'Dragon Defender', types: ['Dragon'] });
  assert.equal(combinedToolAttackBonus(holder, withTool(holder, gloves), water), 0);
  assert.equal(combinedToolAttackBonus(holder, withTool(holder, gloves), dragon), 30);
  assert.equal(
    combinedToolAttackBonus(holder, withTool(holder, gloves), dragon, {
      defenderIsActive: false,
    }),
    0,
    'a benched defender is not the Active {N} Pokémon'
  );
});

test('Maximum Belt and Defiance Band gate on defender ex / trailing prizes (A5)', () => {
  const holder = mkMon({ name: 'Holder' });
  const plain = mkMon({ name: 'Plain Defender' });
  const ex = mkMon({ name: 'Body ex', subtypes: ['Basic', 'ex'] });
  const belt = tool(
    'Maximum Belt',
    'Attacks used by the Pokémon this card is attached to do 50 more damage to your opponent’s Active Pokémon ex (before applying Weakness and Resistance).'
  );
  assert.equal(combinedToolAttackBonus(holder, withTool(holder, belt), plain), 0);
  assert.equal(combinedToolAttackBonus(holder, withTool(holder, belt), ex), 50);

  const band = tool(
    'Defiance Band',
    'If you have more Prize cards remaining than your opponent, the attacks of the Pokémon this card is attached to do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).'
  );
  assert.equal(combinedToolAttackBonus(holder, withTool(holder, band), plain), 0);
  assert.equal(
    combinedToolAttackBonus(holder, withTool(holder, band), plain, {
      attackerTrailingPrizes: true,
    }),
    30
  );
});

test('Full Face Guard gates on the holder having no Abilities (A5)', () => {
  const guard = tool(
    'Full Face Guard',
    'If the Pokémon this card is attached to has no Abilities, it takes 20 less damage from attacks from your opponent’s Pokémon (after applying Weakness and Resistance).'
  );
  const attacker = mkMon({ name: 'Attacker' });
  const plain = mkMon({ name: 'No Ability' });
  const withAbility = mkMon({
    name: 'Has Ability',
    ability: { name: 'Test', text: 'Draw a card.' },
  });
  assert.equal(
    applyToolDamageReduction(100, plain, withTool(plain, guard), attacker),
    80
  );
  assert.equal(
    applyToolDamageReduction(
      100,
      withAbility,
      withTool(withAbility, guard),
      attacker
    ),
    100
  );
});

test('Defiance Vest reduction is gated on trailing prizes (A5)', () => {
  const vest = tool(
    'Defiance Vest',
    'If you have more Prize cards remaining than your opponent, the Pokémon this card is attached to takes 40 less damage from attacks from your opponent’s Pokémon (after applying Weakness and Resistance).'
  );
  const defender = mkMon({ name: 'Defender' });
  const attacker = mkMon({ name: 'Attacker' });
  assert.equal(
    applyToolDamageReduction(100, defender, withTool(defender, vest), attacker),
    100
  );
  assert.equal(
    applyToolDamageReduction(100, defender, withTool(defender, vest), attacker, {
      flags: { trailingPrizes: true },
    }),
    60
  );
});

test('Panic Mask prevents only against a 40-HP-or-less attacker (A5)', () => {
  const mask = tool(
    'Panic Mask',
    'Prevent all damage done to the Pokémon this card is attached to by attacks from your opponent’s Pokémon that have 40 HP or less remaining.'
  );
  const defender = mkMon({ name: 'Defender' });
  const big = mkMon({ name: 'Big Attacker', hp: 150 });
  const small = mkMon({ name: 'Small Attacker', hp: 40 });
  assert.equal(
    combinedToolDamagePrevention(defender, withTool(defender, mask), big)
      .preventAll,
    false
  );
  assert.equal(
    combinedToolDamagePrevention(defender, withTool(defender, mask), small)
      .preventAll,
    true
  );
  const damaged = mkMon({ name: 'Damaged Attacker', hp: 150, damage: 120 });
  assert.equal(
    combinedToolDamagePrevention(defender, withTool(defender, mask), damaged)
      .preventAll,
    true,
    'remaining HP is what counts'
  );
});

test('toolPrizeCountAdjust: prize modifiers gate on holder conditions (I133b)', () => {
  const host = { name: 'Snorlax', hp: 100, image: { name: 'host' } };
  const attach = (card, holder) => ({
    ...card,
    image: { relative: holder.image },
  });
  const cape = CORPUS_TABLE.find((c) => c.name === 'Luxurious Cape');
  const ex = { ...host, name: 'Body ex', subtypes: ['ex'] };
  assert.equal(toolPrizeCountAdjust(ex, [ex, attach(cape, ex)], 2), 2);

  const ribbon = tool(
    'Ribbon Badge',
    'If the Pokémon V this card is attached to has “Sylveon” in its name and is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 fewer Prize card.'
  );
  const v = { ...host, name: 'Body V', subtypes: ['V'] };
  assert.equal(toolPrizeCountAdjust(v, [v, attach(ribbon, v)], 2), 2);
  const sylveon = { ...host, name: 'Sylveon V', subtypes: ['V'] };
  assert.equal(
    toolPrizeCountAdjust(sylveon, [sylveon, attach(ribbon, sylveon)], 2),
    1
  );
});

test('Beast Bringer: exactly 6 prizes + Ultra Beast holder + GX/EX defender (I133b)', () => {
  const row = CORPUS_TABLE.find((c) => c.name === 'Beast Bringer');
  const cond = parseToolCondition(tool('Beast Bringer', row.text));
  assert.deepEqual(cond, {
    holderSubtypes: ['ultra beast'],
    exactlyPrizes: 6,
    defenderSubtypes: ['gx', 'ex'],
  });
  const ub = mkMon({ name: 'Buzzwole', subtypes: ['Basic', 'Ultra Beast'] });
  const gx = mkMon({ name: 'Body GX', subtypes: ['Basic', 'GX'] });
  const plain = mkMon({ name: 'Plain' });
  assert.equal(
    toolConditionMet(cond, {
      holder: ub,
      defender: gx,
      flags: { prizesRemaining: 6 },
    }),
    true
  );
  assert.equal(
    toolConditionMet(cond, {
      holder: ub,
      defender: gx,
      flags: { prizesRemaining: 5 },
    }),
    false
  );
  assert.equal(
    toolConditionMet(cond, {
      holder: plain,
      defender: gx,
      flags: { prizesRemaining: 6 },
    }),
    false
  );
  assert.equal(
    toolConditionMet(cond, {
      holder: ub,
      defender: plain,
      flags: { prizesRemaining: 6 },
    }),
    false
  );
});

test('parseToolCondition: slice 4 corpus conditions (I133b)', () => {
  assert.deepEqual(
    parseToolCondition(
      tool(
        'Rock Chestplate',
        'The {F} Pokémon this card is attached to takes 30 less damage from attacks from your opponent’s Pokémon (after applying Weakness and Resistance).'
      )
    ),
    { holderType: 'fighting' }
  );
  assert.deepEqual(
    parseToolCondition(
      tool(
        'Binding Mochi',
        'Attacks used by the Poisoned Pokémon this card is attached to do 40 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).'
      )
    ),
    { holderPoisoned: true }
  );
  assert.deepEqual(
    parseToolCondition(
      tool(
        'Team Rocket’s Hypnotizer',
        'If the Team Rocket’s Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Team Rocket’s Pokémon is Knocked Out), the Attacking Pokémon is now Asleep.'
      )
    ),
    { holderSubtypes: ["team rocket's"] }
  );
  assert.deepEqual(
    parseToolCondition(
      tool(
        'Thick Scale',
        'The {N} Pokémon this card is attached to takes 50 less damage from attacks from your opponent’s {G}, {R}, {W}, or {L} Pokémon (after applying Weakness and Resistance).'
      )
    ),
    {
      holderType: 'dragon',
      attackerTypes: ['grass', 'fire', 'water', 'lightning'],
    }
  );
  assert.deepEqual(
    parseToolCondition(
      tool(
        'Fairy Charm Ability',
        'Prevent all damage done to the {Y} Pokémon this card is attached to by attacks from your opponent’s Pokémon-GX and Pokémon-EX that have Abilities.'
      )
    ),
    {
      holderType: 'fairy',
      attackerAbility: true,
      attackerSubtypes: ['gx', 'ex'],
    }
  );
});
