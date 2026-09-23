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
