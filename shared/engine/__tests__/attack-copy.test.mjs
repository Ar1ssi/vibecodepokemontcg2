// Copy attacks on the server (design 031, I118): the attacker chooses another Pokémon's
// attack and uses it as this attack, before any of that attack's coins are flipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseCopyAttack, copiedAttackFor } from '../rules/attack-copy.mjs';
import { ATTACK_YES } from '../effects/attack-steps.mjs';

const GENOME_HACKING = "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.";
const IMITTACK =
  "Choose 1 of the Defending Pokémon's attacks. If this Pokémon has the necessary Energy to use that attack, use it as this attack.";
const HAUGHTY_ORDER =
  "Reveal the top 10 cards of your opponent's deck. You may choose an attack from a Pokémon you find there and use it as this attack. Shuffle the revealed cards into your opponent's deck.";

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const withAttacks = (name, attacks, extra = {}) =>
  mon(name, { attacks: attacks.map((a) => ({ cost: [], damage: '', text: '', ...a })), ...extra });

/** p1's Active uses a copy attack with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Copier', setup = () => {}, seed = 5, defenderAttacks = [] } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-copy', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 12; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Copy Move', cost: [], damage: '', text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = withAttacks('Defender', defenderAttacks, { hp: 400 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

function choose(res, selection, rng) {
  const next = applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      playerId: res.state.pendingChoice.player,
      payload: { choiceId: res.state.pendingChoice.choiceId, selection },
    },
    rng
  );
  assert.equal(next.error, null);
  return next;
}

const zone = (res, pid, name) => res.state.players[pid].zones[name];
const optionNames = (res) => res.state.pendingChoice.options.map((o) => o.name);
const optionFor = (res, name) => res.state.pendingChoice.options.find((o) => o.name === name).instanceId;
const cardNamed = (res, pid, name) =>
  [...zone(res, pid, 'active'), ...zone(res, pid, 'bench')].find((c) => c.name === name);
const turnPassed = (res) => assert.equal(res.state.turn.player, 'p2', 'the attack ends the turn');

// ── parser ──────────────────────────────────────────────────────────────────

test('parseCopyAttack: every printed copy wording maps to its source', () => {
  const cases = [
    [GENOME_HACKING, { source: 'oppActive' }],
    ["Choose 1 of your opponent's Pokémon's attacks and use it as this attack.", { source: 'oppInPlay' }],
    [
      "Choose 1 of your Benched Fusion Strike Pokémon's attacks and use it as this attack.",
      { source: 'ownBench', group: 'fusion strike' },
    ],
    ["Choose 1 of your Benched N's Pokémon's attacks and use it as this attack.", { source: 'ownBench', group: "n's" }],
    [
      'Choose an attack from a {N} Pokémon in your discard pile and use it as this attack.',
      { source: 'ownDiscard', pokemonType: 'Dragon' },
    ],
    [HAUGHTY_ORDER, { source: 'oppDeckTop', count: 10, optional: true }],
    [IMITTACK, { source: 'oppActive', needsEnergy: true }],
    [
      "Choose 1 of the Defending Pokémon's attacks. Copy copies that attack. This attack does nothing if Ditto doesn't have the Energy necessary to use that attack. (You must still do anything else required for that attack.) Ditto performs that attack.",
      { source: 'oppActive', needsEnergy: true },
    ],
    [
      "Choose 1 of your opponent's Benched Pokémon's attacks. Rainbow Moves copies that attack except for its Energy cost. (You must still do anything else required for that attack.) (No matter what type that Pokémon is, Togetic's type is still {C}.) Togetic performs that attack.",
      { source: 'oppBench' },
    ],
  ];
  for (const [text, spec] of cases) assert.deepEqual(parseCopyAttack(text), spec, text);
});

test('parseCopyAttack: design 039 residual wordings', () => {
  const cases = [
    // Old "copies that attack except for its Energy cost" prints (Clefable/Clefairy/Clefable ex).
    [
      "Choose 1 of the Defending Pokémon's attacks. Metronome copies that attack except for its Energy cost. (You must still do anything else in order to use that attack.) Clefable performs that attack.",
      { source: 'oppActive' },
    ],
    [
      "Choose 1 of the Defending Pokémon's attacks. Metronome copies that attack except for its Energy costs and anything else required in order to use that attack, such as discarding Energy cards. (No matter what type the Defending Pokémon is, Clefairy's type is still Colorless.)",
      { source: 'oppActive' },
    ],
    // Mew Star Mimicry: in-play source with the energy gate.
    [
      "Choose an attack on 1 of your opponent's Pokémon in play. Mimicry copies that attack. This attack does nothing if Mew Star doesn't have the Energy necessary to use that attack. (You must still do anything else required for that attack.) Mew Star performs that attack.",
      { source: 'oppInPlay', needsEnergy: true },
    ],
    // Togetic Super Metronome: coin-gated in-play source.
    [
      "Flip a coin. If heads, choose an attack on 1 of your opponent's Pokémon. Super Metronome copies that attack except for its Energy cost. (You must still do anything else in order to use that attack.) (No matter what type the Defending Pokémon is, Togetic's type is still {C}.) Togetic performs that attack.",
      { source: 'oppInPlay', coinGate: 'heads' },
    ],
    // Mew Re-creation: the opponent's discard pile.
    [
      "Choose an attack on 1 of your opponent's Pokémon in his or her discard pile. Re-creation copies that attack except for its Energy cost. (You must still do anything else required for that attack.) Mew performs that attack.",
      { source: 'oppDiscard' },
    ],
    // Smeargle Trace: coin-gated old Bench wording.
    [
      "Flip a coin. If heads, choose an attack on 1 of your opponent's Benched Pokémon. Trace copies that attack except for its Energy cost. (You must still do anything else required for that attack.) Smeargle performs that attack.",
      { source: 'oppBench', coinGate: 'heads' },
    ],
    // Dark Hypno Dark Link: own Dark-name in play, excluding the user.
    [
      "Flip a coin. If heads, choose an attack on 1 of your Pokémon in play that has Dark in its name (excluding this one). Dark Link copies that attack except for its Energy cost. (You must still do anything else required for that attack.) (No matter what type that Pokémon is, Dark Hypno's type is still {P}{D}.) Dark Hypno performs that attack.",
      { source: 'ownInPlay', darkName: true, excludeSelf: true, coinGate: 'heads' },
    ],
    // Team Rocket's Mimikyu: only an Active Tera Pokémon.
    [
      "Choose 1 of your opponent's Active Tera Pokémon's attacks and use it as this attack.",
      { source: 'oppActive', tera: true },
    ],
    // Thievul's copy body (its condition is peeled by the condition parser).
    ["Choose an attack from 1 of your opponent's Pokémon in play and use it as this attack.", { source: 'oppInPlay' }],
    // Thievul: the inline empty-hand condition rides on the spec.
    [
      "If you have no cards in your hand, choose an attack from 1 of your opponent's Pokémon in play and use it as this attack.",
      { source: 'oppInPlay', condition: { kind: 'handCount', op: 'eq', n: 0, negated: false } },
    ],
    // Nihilego: the "use this attack only if" clause rides on the spec.
    [
      "You can use this attack only if your opponent has exactly 2 Prize cards remaining. Choose 1 of your opponent's Pokémon's attacks and use it as this attack.",
      { source: 'oppInPlay', condition: { kind: 'opponentPrizes', op: 'eq', n: 2, negated: false } },
    ],
    // Previous-Evolution copies (Incineroar, Charizard).
    [
      "Choose an attack from 1 of this Pokémon's previous Evolutions and use it as this attack.",
      { source: 'ownEvolutionStack' },
    ],
    [
      "Choose 1 of this Pokémon's attacks from its previous Evolutions and use it as this attack.",
      { source: 'ownEvolutionStack' },
    ],
    // Slowking: discard the deck top, copy it when it has no Rule Box.
    [
      "Discard the top card of your deck, and if that card is a Pokémon that doesn't have a Rule Box, choose 1 of its attacks and use it as this attack. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)",
      { source: 'ownDeckTop', count: 1, noRuleBox: true },
    ],
    // Last-turn copies (Mimikyu Copycat, Sudowoodo Watch and Learn).
    [
      "If your opponent's Pokémon used an attack that isn't a GX attack during their last turn, use it as this attack.",
      { source: 'oppLastAttack', excludeGx: true, auto: true },
    ],
    [
      "If your opponent's Pokémon used an attack during his or her last turn, use it as this attack.",
      { source: 'oppLastAttack', auto: true },
    ],
  ];
  for (const [text, spec] of cases) assert.deepEqual(parseCopyAttack(text), spec, text);
  // Misty's Psyduck ESP is a multi-branch coin attack: the copy parser must not claim it.
  assert.equal(
    parseCopyAttack(
      "Flip 3 coins. If exactly 1 is heads, draw a card. If exactly 2 are heads, this attack does 20 damage. If all 3 are heads, choose 1 of the Defending Pokémon's attacks. Misty's Psyduck copies that attack except for its Energy costs. (No matter what type the Defending Pokémon is, Misty's Psyduck's type is still {W}.)"
    ),
    null
  );
});

test('parseCopyAttack: Encore and non-copy texts are not copy attacks', () => {
  assert.equal(
    parseCopyAttack(
      "Choose 1 of the Defending Pokémon's attacks. That Pokémon can use only that attack during your opponent's next turn."
    ),
    null
  );
  assert.equal(parseCopyAttack('Flip a coin. If heads, this attack does 30 more damage.'), null);
  assert.equal(parseCopyAttack(''), null);
  assert.equal(parseCopyAttack(null), null);
});

test("copiedAttackFor: the source's name in the copied text reads as the copier", () => {
  const copied = copiedAttackFor(
    { name: 'Rush', damage: '50', text: 'Mew does 10 damage to itself.' },
    { sourceName: 'Mew', copierName: 'Ditto' }
  );
  assert.equal(copied.text, 'Ditto does 10 damage to itself.');
  assert.equal(copied.copiedFrom, 'Mew');
});

// ── execution ───────────────────────────────────────────────────────────────

test("attack: Genome Hacking uses the opponent Active's chosen attack", () => {
  const b = board(GENOME_HACKING, {
    defenderAttacks: [
      { name: 'Tackle', damage: '20' },
      { name: 'Big Hit', damage: '120', cost: ['Fire', 'Fire', 'Fire'] },
    ],
  });
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.player, 'p1');
  assert.deepEqual(optionNames(res1), ['Defender: Tackle', 'Defender: Big Hit']);
  const res2 = choose(res1, [optionFor(res1, 'Defender: Big Hit')], b.rng);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage, 120);
  const copied = res2.events.find((e) => e.type === 'attackCopied');
  assert.equal(copied.copiedName, 'Big Hit');
  assert.equal(copied.attackName, 'Copy Move');
  turnPassed(res2);
});

test('attack: other copy attacks are never offered', () => {
  const b = board(GENOME_HACKING, {
    defenderAttacks: [{ name: 'Mirror', text: GENOME_HACKING }, { name: 'Tackle', damage: '20' }],
  });
  assert.deepEqual(optionNames(attack(b)), ['Defender: Tackle']);
});

test('attack: a copy with nothing to copy does only its own text and ends the turn', () => {
  const res = attack(board(GENOME_HACKING));
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
  turnPassed(res);
});

test("attack: the copied attack's coins are flipped under its own name", () => {
  const b = board(GENOME_HACKING, {
    defenderAttacks: [{ name: 'Lucky Hit', damage: '50', text: 'Flip a coin. If tails, this attack does nothing.' }],
  });
  const res1 = attack(b);
  assert.equal(res1.events.some((e) => e.type === 'attackCoinFlipped'), false, 'no coins before the choice');
  const res2 = choose(res1, [1], b.rng);
  const flip = res2.events.find((e) => e.type === 'attackCoinFlipped');
  assert.equal(flip.attackName, 'Lucky Hit');
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage || 0, flip.coin === 'heads' ? 50 : 0);
});

test('attack: a Glimwood Tangle re-flip keeps the copied attack', () => {
  const b = board(GENOME_HACKING, {
    defenderAttacks: [{ name: 'Lucky Hit', damage: '50', text: 'Flip a coin. If tails, this attack does nothing.' }],
    setup: ({ state }) => {
      state.stadium = createCard({
        instanceId: 900,
        name: 'Glimwood Tangle',
        supertype: 'Trainer',
        subtypes: ['Stadium'],
        text: "Once during each player's turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again.",
      });
    },
  });
  const res1 = choose(attack(b), [1], b.rng);
  assert.equal(res1.state.pendingChoice.resumeToken.effectType, 'glimwood');
  const res2 = choose(res1, [2], b.rng);
  const reflip = res2.events.find((e) => e.type === 'attackCoinFlipped' && e.reflip);
  assert.equal(reflip.attackName, 'Lucky Hit');
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage || 0, reflip.coin === 'heads' ? 50 : 0);
  turnPassed(res2);
});

test("attack: a copied attack's before-damage prompt resumes into the copied damage", () => {
  const b = board(GENOME_HACKING, {
    defenderAttacks: [
      {
        name: 'Pull In',
        damage: '60',
        text: "Before doing damage, you may switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
      },
    ],
    setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A'), mon('Opp B')),
  });
  const res1 = attack(b);
  const res2 = choose(res1, [1], b.rng);
  const res3 = choose(res2, [ATTACK_YES], b.rng);
  const oppA = zone(res3, 'p2', 'bench').find((c) => c.name === 'Opp A');
  const res4 = choose(res3, [oppA.instanceId], b.rng);
  assert.equal(cardNamed(res4, 'p2', 'Opp A').damage, 60);
  assert.equal(cardNamed(res4, 'p2', 'Defender').damage || 0, 0);
  turnPassed(res4);
});

test('attack: Imittack offers only the attacks the copier has the Energy for', () => {
  const b = board(IMITTACK, {
    defenderAttacks: [
      { name: 'Free Hit', damage: '30' },
      { name: 'Fire Hit', damage: '90', cost: ['Fire'] },
    ],
  });
  assert.deepEqual(optionNames(attack(b)), ['Defender: Free Hit']);
});

test('attack: Imittack with no affordable attack does nothing', () => {
  const b = board(IMITTACK, { defenderAttacks: [{ name: 'Fire Hit', damage: '90', cost: ['Fire'] }] });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(cardNamed(res, 'p2', 'Defender').damage || 0, 0);
  turnPassed(res);
});

test('attack: Cross Fusion Strike offers only Benched Fusion Strike Pokémon', () => {
  const b = board("Choose 1 of your Benched Fusion Strike Pokémon's attacks and use it as this attack.", {
    setup: ({ p1 }) =>
      p1.zones.bench.push(
        withAttacks('Fusion Mon', [{ name: 'Fusion Hit', damage: '70' }], { subtypes: ['Basic', 'Fusion Strike'] }),
        withAttacks('Plain Mon', [{ name: 'Plain Hit', damage: '10' }])
      ),
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Fusion Mon: Fusion Hit']);
  assert.equal(cardNamed(choose(res1, [1], b.rng), 'p2', 'Defender').damage, 70);
});

test('attack: Apex Dragon copies from a Dragon Pokémon in the discard pile', () => {
  const b = board('Choose an attack from a {N} Pokémon in your discard pile and use it as this attack.', {
    setup: ({ p1 }) =>
      p1.zones.discard.push(
        withAttacks('Dragon Mon', [{ name: 'Dragon Claw', damage: '80' }], { types: ['Dragon'] }),
        withAttacks('Fire Mon', [{ name: 'Ember', damage: '40' }], { types: ['Fire'] })
      ),
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Dragon Mon: Dragon Claw']);
  assert.equal(cardNamed(choose(res1, [1], b.rng), 'p2', 'Defender').damage, 80);
});

test('attack: Haughty Order reveals 10, may copy, and shuffles the deck either way', () => {
  const setup = ({ p2 }) => {
    p2.zones.deck.splice(2, 0, withAttacks('Deck Mon', [{ name: 'Deck Hit', damage: '90' }]));
  };
  const b1 = board(HAUGHTY_ORDER, { setup });
  const res1 = attack(b1);
  assert.equal(res1.events.find((e) => e.type === 'cardsRevealed').cards.length, 10);
  assert.deepEqual(optionNames(res1), ['Deck Mon: Deck Hit', "Don't use an attack"]);
  const used = choose(res1, [1], b1.rng);
  assert.equal(cardNamed(used, 'p2', 'Defender').damage, 90);

  const b2 = board(HAUGHTY_ORDER, { setup });
  const res2 = attack(b2);
  const declined = choose(res2, [optionFor(res2, "Don't use an attack")], b2.rng);
  assert.equal(cardNamed(declined, 'p2', 'Defender').damage || 0, 0);
  assert.equal(declined.events.some((e) => e.type === 'attackCopied'), false);
  turnPassed(declined);
  // 13 cards, 1 drawn at the start of p2's turn; none left the deck to the copy.
  assert.equal(zone(declined, 'p2', 'deck').length + zone(declined, 'p2', 'hand').length, 13);
});
