// Design 039 (I168): residual copy-attack wordings — old "copies that attack" prints,
// opponent discard, Dark-name / Tera filters, and the coin-gated old Bench wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const withAttacks = (name, attacks, extra = {}) =>
  mon(name, { attacks: attacks.map((a) => ({ cost: [], damage: '', text: '', ...a })), ...extra });

/** p1's Active uses a copy attack with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Copier', setup = () => {}, seed = 5, defenderAttacks = [], defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-copy-residuals', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 12; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Copy Move', cost: [], damage: '', text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = withAttacks('Defender', defenderAttacks, { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b, seed) {
  const rng = seed === undefined ? b.rng : createRng(seed);
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, rng);
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

const CLEFABLE_METRONOME =
  "Choose 1 of the Defending Pokémon's attacks. Metronome copies that attack except for its Energy cost. (You must still do anything else in order to use that attack.) Clefable performs that attack.";
const MEW_STAR_MIMICRY =
  "Choose an attack on 1 of your opponent's Pokémon in play. Mimicry copies that attack. This attack does nothing if Mew Star doesn't have the Energy necessary to use that attack. (You must still do anything else required for that attack.) Mew Star performs that attack.";
const MEW_RE_CREATION =
  "Choose an attack on 1 of your opponent's Pokémon in his or her discard pile. Re-creation copies that attack except for its Energy cost. (You must still do anything else required for that attack.) Mew performs that attack.";
const SMEARGLE_TRACE =
  "Flip a coin. If heads, choose an attack on 1 of your opponent's Benched Pokémon. Trace copies that attack except for its Energy cost. (You must still do anything else required for that attack.) Smeargle performs that attack.";
const DARK_HYPNO_DARK_LINK =
  "Flip a coin. If heads, choose an attack on 1 of your Pokémon in play that has Dark in its name (excluding this one). Dark Link copies that attack except for its Energy cost. (You must still do anything else required for that attack.) (No matter what type that Pokémon is, Dark Hypno's type is still {P}{D}.) Dark Hypno performs that attack.";
const TERA_MIMICRY = "Choose 1 of your opponent's Active Tera Pokémon's attacks and use it as this attack.";
const THIEVUL_SKILL_THIEF =
  "If you have no cards in your hand, choose an attack from 1 of your opponent's Pokémon in play and use it as this attack.";
const NIHILEGO_NIGHTCAP =
  "You can use this attack only if your opponent has exactly 2 Prize cards remaining. Choose 1 of your opponent's Pokémon's attacks and use it as this attack.";
const INCINEROAR_SECRET_ATTACK =
  "Choose an attack from 1 of this Pokémon's previous Evolutions and use it as this attack.";
const CHARIZARD_RECALL =
  "Choose 1 of this Pokémon's attacks from its previous Evolutions and use it as this attack.";
const SLOWKING_SEEK_INSPIRATION =
  "Discard the top card of your deck, and if that card is a Pokémon that doesn't have a Rule Box, choose 1 of its attacks and use it as this attack. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)";
const MIMIKYU_COPYCAT =
  "If your opponent's Pokémon used an attack that isn't a GX attack during their last turn, use it as this attack.";
const SUDOWOODO_WATCH_AND_LEARN =
  "If your opponent's Pokémon used an attack during his or her last turn, use it as this attack.";

/** Runs p2's previous-turn attack, then returns the state at p1's next turn. */
function afterOpponentAttack(copierText, { name, opponentAttack } = {}) {
  const b = board(copierText, { name, defenderAttacks: [opponentAttack] });
  b.state.turn = { player: 'p2', number: 2, phase: 'main' };
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return { ...b, state: res.state };
}

test('attack: an old "copies that attack" wording ignores the printed Energy cost', () => {
  const b = board(CLEFABLE_METRONOME, {
    name: 'Clefable',
    defenderAttacks: [
      { name: 'Free Hit', damage: '30' },
      { name: 'Fire Hit', damage: '120', cost: ['Fire', 'Fire', 'Fire'] },
    ],
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Defender: Free Hit', 'Defender: Fire Hit']);
  const res2 = choose(res1, [optionFor(res1, 'Defender: Fire Hit')], b.rng);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage, 120);
});

test('attack: Mew Star Mimicry offers only the attacks the copier can pay for', () => {
  const b = board(MEW_STAR_MIMICRY, {
    name: 'Mew Star',
    defenderAttacks: [
      { name: 'Free Hit', damage: '30' },
      { name: 'Fire Hit', damage: '90', cost: ['Fire'] },
    ],
  });
  assert.deepEqual(optionNames(attack(b)), ['Defender: Free Hit']);
});

test("attack: Mew Re-creation copies from the opponent's discard pile", () => {
  const b = board(MEW_RE_CREATION, {
    name: 'Mew',
    setup: ({ p2 }) => p2.zones.discard.push(withAttacks('Discard Mon', [{ name: 'Lost Hit', damage: '70' }])),
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Discard Mon: Lost Hit']);
  const res2 = choose(res1, [1], b.rng);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage, 70);
});

test('attack: Smeargle Trace flips first — heads offers the opponent Bench, tails ends the turn', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 16 && outcomes.size < 2; seed += 1) {
    const b = board(SMEARGLE_TRACE, {
      name: 'Smeargle',
      seed,
      setup: ({ p2 }) => p2.zones.bench.push(withAttacks('Bench Mon', [{ name: 'Bench Hit', damage: '50' }])),
    });
    const res = attack(b, seed);
    if (res.state.pendingChoice) {
      outcomes.add('heads');
      assert.deepEqual(optionNames(res), ['Bench Mon: Bench Hit']);
      assert.equal(res.state.turn.player, 'p1', 'heads keeps the turn pending');
    } else {
      outcomes.add('tails');
      assert.equal(res.state.turn.player, 'p2', 'tails ends the turn');
      assert.ok(res.events.some((e) => e.type === 'attackCoinFlipped' && e.coin === 'tails'));
    }
  }
  assert.deepEqual([...outcomes].sort(), ['heads', 'tails']);
});

test('attack: Dark Hypno offers only another Dark-name Pokémon in play', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 16 && outcomes.size < 2; seed += 1) {
    const b = board(DARK_HYPNO_DARK_LINK, {
      name: 'Dark Hypno',
      seed,
      setup: ({ attacker, p1 }) => {
        // A second, ordinary attack on the copier proves excludeSelf skips the user.
        attacker.attacks.push({ name: 'Self Hit', cost: [], damage: '10', text: '' });
        p1.zones.bench.push(
          withAttacks('Dark Ursaring', [{ name: 'Dark Hit', damage: '60' }]),
          withAttacks('Plain Mon', [{ name: 'Plain Hit', damage: '10' }])
        );
      },
    });
    const res = attack(b, seed);
    if (res.state.pendingChoice) {
      outcomes.add('heads');
      assert.deepEqual(optionNames(res), ['Dark Ursaring: Dark Hit']);
    } else {
      outcomes.add('tails');
      assert.equal(res.state.turn.player, 'p2');
    }
  }
  assert.deepEqual([...outcomes].sort(), ['heads', 'tails']);
});

test('attack: Thievul Skill Thief copies only with an empty hand', () => {
  const empty = board(THIEVUL_SKILL_THIEF, {
    name: 'Thievul',
    defenderAttacks: [{ name: 'Tackle', damage: '40' }],
  });
  const res1 = attack(empty);
  assert.deepEqual(optionNames(res1), ['Defender: Tackle']);

  const full = board(THIEVUL_SKILL_THIEF, {
    name: 'Thievul',
    setup: ({ p1 }) => p1.zones.hand.push(mon('Held Card')),
    defenderAttacks: [{ name: 'Tackle', damage: '40' }],
  });
  const res2 = attack(full);
  assert.equal(res2.state.pendingChoice, null);
  assert.equal(res2.events.some((e) => e.type === 'attackCopyNothing'), false);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage || 0, 0);
  assert.equal(res2.state.turn.player, 'p2');
});

test('attack: Nihilego Nightcap copies only at exactly 2 opposing Prizes', () => {
  const two = board(NIHILEGO_NIGHTCAP, {
    name: 'Nihilego',
    setup: ({ p2 }) => p2.zones.prizes.splice(2),
    defenderAttacks: [{ name: 'Tackle', damage: '40' }],
  });
  const res1 = attack(two);
  assert.deepEqual(optionNames(res1), ['Defender: Tackle']);

  const six = board(NIHILEGO_NIGHTCAP, {
    name: 'Nihilego',
    defenderAttacks: [{ name: 'Tackle', damage: '40' }],
  });
  const res2 = attack(six);
  assert.equal(res2.state.pendingChoice, null);
  assert.ok(res2.events.some((e) => e.type === 'attackConditionFailed'));
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage || 0, 0);
  assert.equal(res2.state.turn.player, 'p2');
});

test("attack: Team Rocket's Mimikyu offers only an Active Tera Pokémon", () => {
  const b = board(TERA_MIMICRY, {
    name: "Team Rocket's Mimikyu",
    defenderAttacks: [{ name: 'Tera Hit', damage: '80' }],
    defenderExtra: { subtypes: ['Tera'] },
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Defender: Tera Hit']);
  assert.equal(cardNamed(choose(res1, [1], b.rng), 'p2', 'Defender').damage, 80);

  const plain = board(TERA_MIMICRY, {
    name: "Team Rocket's Mimikyu",
    defenderAttacks: [{ name: 'Tera Hit', damage: '80' }],
  });
  const res2 = attack(plain);
  assert.equal(res2.state.pendingChoice, null);
  assert.ok(res2.events.some((e) => e.type === 'attackCopyNothing'));
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage || 0, 0);
});

test('attack: previous-Evolution copies offer the Basic and Stage 1 attacks', () => {
  const b = board(CHARIZARD_RECALL, {
    name: 'Charmander',
    setup: ({ p1, attacker }) => {
      attacker.attacks = [{ name: 'Scratch', cost: [], damage: '10', text: '' }];
      const stage1 = withAttacks('Charmeleon', [{ name: 'Flame Tail', damage: '50' }], {
        stage: 'Stage 1',
        evolvesFrom: 'Charmander',
      });
      const stage2 = mon('Charizard', {
        stage: 'Stage 2',
        evolvesFrom: 'Charmeleon',
        attacks: [{ name: 'Recall', cost: [], damage: '', text: CHARIZARD_RECALL }],
      });
      stage1.attachedTo = attacker.instanceId;
      stage2.attachedTo = attacker.instanceId;
      p1.zones.active.push(stage1, stage2);
    },
  });
  const res1 = attack(b);
  assert.deepEqual(optionNames(res1), ['Charmander: Scratch', 'Charmeleon: Flame Tail']);
  const res2 = choose(res1, [1], b.rng);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage, 10);
});

test('attack: previous-Evolution copies find nothing on an unevolved Pokémon', () => {
  const b = board(INCINEROAR_SECRET_ATTACK, { name: 'Incineroar' });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
});

test('attack: Slowking discards the deck top, copying it when it has no Rule Box', () => {
  const b = board(SLOWKING_SEEK_INSPIRATION, {
    name: 'Slowking',
    setup: ({ p1 }) => p1.zones.deck.unshift(withAttacks('Top Mon', [{ name: 'Top Hit', damage: '60' }])),
  });
  const res1 = attack(b);
  assert.ok(zone(res1, 'p1', 'discard').some((c) => c.name === 'Top Mon'), 'the top card is discarded');
  assert.ok(res1.events.some((e) => e.type === 'cardsDiscarded'));
  assert.deepEqual(optionNames(res1), ['Top Mon: Top Hit']);
  const res2 = choose(res1, [1], b.rng);
  assert.equal(cardNamed(res2, 'p2', 'Defender').damage, 60);
});

test("attack: Mimikyu Copycat reuses the opponent's last-turn attack without a prompt", () => {
  const b = afterOpponentAttack(MIMIKYU_COPYCAT, {
    name: 'Mimikyu',
    opponentAttack: { name: 'Big Hit', damage: '70' },
  });
  assert.equal(b.state.turn.player, 'p1');
  assert.equal(b.state.turn.number, 3);
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null, 'the wording prints no choose');
  const copied = res.events.find((e) => e.type === 'attackCopied');
  assert.equal(copied.copiedName, 'Big Hit');
  assert.equal(cardNamed(res, 'p2', 'Defender').damage, 70);
  assert.equal(res.state.turn.player, 'p2');
  assert.equal(JSON.stringify(viewFor(res.state, 'p1')).includes('lastAttack'), false, 'no view leak');
});

test('attack: a last-turn copy ignores an attack that was itself a copy', () => {
  const b = afterOpponentAttack(MIMIKYU_COPYCAT, {
    name: 'Mimikyu',
    opponentAttack: {
      name: 'Genome Hacking',
      text: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.",
    },
  });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
  assert.equal(cardNamed(res, 'p2', 'Defender').damage || 0, 0);
});

test('attack: Mimikyu Copycat ignores a GX attack from last turn', () => {
  const b = afterOpponentAttack(MIMIKYU_COPYCAT, {
    name: 'Mimikyu',
    opponentAttack: { name: 'Big Hit GX', damage: '70' },
  });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
  assert.equal(cardNamed(res, 'p2', 'Defender').damage || 0, 0);
});

test('attack: Sudowoodo Watch and Learn reuses a GX attack too', () => {
  const b = afterOpponentAttack(SUDOWOODO_WATCH_AND_LEARN, {
    name: 'Sudowoodo',
    opponentAttack: { name: 'Big Hit GX', damage: '70' },
  });
  const res = attack(b);
  const copied = res.events.find((e) => e.type === 'attackCopied');
  assert.equal(copied.copiedName, 'Big Hit GX');
  assert.equal(cardNamed(res, 'p2', 'Defender').damage, 70);
});

test('attack: a last-turn copy does nothing when the opponent did not attack', () => {
  const b = board(SUDOWOODO_WATCH_AND_LEARN, {
    name: 'Sudowoodo',
    defenderAttacks: [{ name: 'Big Hit', damage: '70' }],
  });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
});

test('attack: Slowking with an empty deck discards nothing and copies nothing', () => {
  const b = board(SLOWKING_SEEK_INSPIRATION, {
    name: 'Slowking',
    setup: ({ p1 }) => {
      p1.zones.deck.length = 0;
    },
  });
  const res = attack(b);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.events.some((e) => e.type === 'cardsDiscarded'), false);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
  assert.equal(res.state.turn.player, 'p2');
});

test('attack: Slowking discards a Rule Box top card and copies nothing', () => {
  const b = board(SLOWKING_SEEK_INSPIRATION, {
    name: 'Slowking',
    setup: ({ p1 }) =>
      p1.zones.deck.unshift(
        mon('Top ex', {
          subtypes: ['ex'],
          attacks: [{ name: 'Ex Hit', cost: [], damage: '90', text: '' }],
        })
      ),
  });
  const res = attack(b);
  assert.ok(zone(res, 'p1', 'discard').some((c) => c.name === 'Top ex'));
  assert.equal(res.state.pendingChoice, null);
  assert.ok(res.events.some((e) => e.type === 'attackCopyNothing'));
  assert.equal(cardNamed(res, 'p2', 'Defender').damage || 0, 0);
});
