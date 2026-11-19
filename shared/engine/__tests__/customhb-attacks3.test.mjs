// Homebrew set customhb (client/src/assets/custom-sets/customhb/set.json): third batch of attack
// texts the engine ran partly or not at all (cards 300–690 and hand-typed wordings). Each test
// names the card by its HB number; the text is the set.json effect, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { inPlayView } from '../reduce/shared.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });
const energy = (type, attachedTo = null, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
    ...extra,
  });

/**
 * p1 attacks with `text` (attack index 0). Each side has two Benched Pokémon, a hand of four and
 * a deck of ten Items. `attacks` replaces the attacker's attack list.
 */
function board(text, { name = 'Attacker', damage = '', attacks, setup = () => {}, attackerExtra = {}, defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb3', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
    for (let i = 0; i < 4; i++) state.players[id].zones.hand.push(trainer(`${id} hand ${i}`, 'Item'));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: attacks || [{ name: 'Probe', cost: [], damage, text }], ...attackerExtra });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  for (let i = 0; i < 2; i++) state.players.p2.zones.bench.push(mon(`OppBench${i}`));
  for (let i = 0; i < 2; i++) state.players.p1.zones.bench.push(mon(`OwnBench${i}`));
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}

const attack = (state, { seed = 3, index = 0, player = 'p1' } = {}) =>
  applyCommand(state, { type: 'attack', playerId: player, payload: { attackIndex: index } }, createRng(seed));
const pass = (state, player) => applyCommand(state, { type: 'pass', playerId: player, payload: {} }, createRng(3));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(4)
  );
/** Answers every choice with the first `min` options (at least one). */
function resolveAll(res, pick = (pc) => pc.options.slice(0, Math.max(pc.min ?? 1, 1)).map((o) => o.instanceId)) {
  let n = 0;
  while (res && !res.error && res.state.pendingChoice && n++ < 30) res = choose(res, pick(res.state.pendingChoice));
  return res;
}
const zone = (state, pid, name) => state.players[pid].zones[name];
const root = (state, pid, zoneId, name) => zone(state, pid, zoneId).find((c) => !c.attachedTo && (!name || c.name === name));
const attachedTo = (state, pid, host) =>
  [...zone(state, pid, 'active'), ...zone(state, pid, 'bench')].filter((c) => c.attachedTo === host.instanceId);
const names = (cards) => cards.map((c) => c.name);
const pickNamed = (name) => (pc) => [pc.options.find((o) => o.name === name).instanceId];
const coinsOf = (res) => (res.events || []).find((e) => e.type === 'attackCoinFlipped');

/** Runs `text` once per seed and groups the result of `read(state)` by heads count. */
function bySeed(text, opts, read, seeds = 24) {
  const out = new Map();
  for (let seed = 1; seed <= seeds; seed++) {
    const { state } = board(text, opts);
    const res = resolveAll(attack(state, { seed }));
    assert.equal(res.error, null);
    const heads = coinsOf(res)?.headsCount ?? null;
    if (!out.has(heads)) out.set(heads, new Set());
    out.get(heads).add(read(res.state));
  }
  return out;
}

// ── Bench and self damage wordings ────────────────────────────────────────────────────────────

test('HB 460 Tauros Breaching Bull: "also deals 20 damage" hits 1 of the opponent\'s Benched Pokémon', () => {
  const { state } = board("This attack also deals 20 damage to 1 of your opponent's Benched Pokémon.", { damage: '50' });
  const res = resolveAll(attack(state), pickNamed('OppBench1'));
  assert.equal(root(res.state, 'p2', 'active').damage, 50);
  assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [0, 20]);
});

test('HB 425 Ting-Lu ex Earthquake puts 2 damage counters on each of 2 chosen opposing Benched Pokémon', () => {
  const { state } = board("Put 2 damage counters on 2 of your opponent's Benched Pokémon.", {
    damage: '110',
    setup: (s) => s.players.p2.zones.bench.push(mon('OppBench2')),
  });
  const res = resolveAll(attack(state), (pc) => [pc.options[0].instanceId, pc.options[2].instanceId]);
  assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [20, 0, 20]);
});

test('HB 146 Aggron Seismic Rift also does 30 to itself and each of its own Benched Pokémon, not the opponent\'s Bench', () => {
  const { state } = board(
    "This attack also does 30 damage to each of your Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    { damage: '180' }
  );
  const res = resolveAll(attack(state));
  assert.equal(res.state.pendingChoice, null);
  assert.equal(root(res.state, 'p1', 'active').damage, 30);
  assert.deepEqual(zone(res.state, 'p1', 'bench').map((c) => c.damage), [30, 30]);
  assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [0, 0]);
});

test('HB 183 Slurpuff Belly Drum also does 50 damage to itself', () => {
  const { state } = board('This attack also does 50 damage to this Pokémon', { damage: '100' });
  const res = resolveAll(attack(state));
  assert.equal(root(res.state, 'p1', 'active').damage, 50);
  assert.equal(root(res.state, 'p2', 'active').damage, 100);
});

test('HB 111 Articuno Blizzard ("your opponents Benched") hits only the opponent\'s Bench, all of it', () => {
  const { state } = board(
    "This attack does 30 damage to each of your opponents Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon).",
    { damage: '100' }
  );
  const res = resolveAll(attack(state));
  assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [30, 30]);
  assert.deepEqual(zone(res.state, 'p1', 'bench').map((c) => c.damage), [0, 0]);
});

test('HB 203 Swampert Surf and HB 230 Steelix Earthquake hit every Benched Pokémon on both sides', () => {
  for (const [text, amount] of [
    [
      "This attack also does 20 damage to each of your Benched Pokémon and each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      20,
    ],
    [
      "This attack also does 30 damage to each of your Benched Pokémon and your opponents Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      30,
    ],
  ]) {
    const { state } = board(text, { damage: '140' });
    const res = attack(state);
    assert.equal(res.state.pendingChoice, null, 'no target is chosen');
    assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [amount, amount]);
    assert.deepEqual(zone(res.state, 'p1', 'bench').map((c) => c.damage), [amount, amount]);
  }
});

test('HB 268 Alolan Golem Electromagnetic Catapult: 70 to the Defending Pokémon per heads, 70 to itself per tails', () => {
  const text =
    'Flip 4 coins. This Pokémon does 70 damage to the Defending Pokémon for each hads. This Pokémon does 70 damage to itself for each tails.';
  const seen = bySeed(text, { damage: '70×', attackerExtra: { hp: 400 } }, (s) =>
    `${root(s, 'p2', 'active').damage}/${root(s, 'p1', 'active').damage}`
  );
  for (const [heads, results] of seen) assert.deepEqual([...results], [`${heads * 70}/${(4 - heads) * 70}`]);
  assert.ok(seen.size >= 3);
});

// ── Next-turn locks in hand-typed wordings ────────────────────────────────────────────────────

const lockOf = (s) => {
  const d = root(s, 'p2', 'active');
  return `atk:${d.cannotAttackUntilTurn ?? '-'} ret:${d.cannotRetreatUntilTurn ?? '-'}`;
};

test('HB 622 Excadrill Rock Slide: heads, the opponent\'s Active Pokémon can\'t attack next turn', () => {
  const seen = bySeed("Flip a coin. If heads, the opponent's Active Pokémon cannot attack during their next turn.", { damage: '40' }, lockOf);
  assert.deepEqual([...seen.get(1)], ['atk:6 ret:-']);
  assert.deepEqual([...seen.get(0)], ['atk:- ret:-']);
});

test('HB 431 Tyranitar ex Rock Slide locks the attack only on 2 or more heads', () => {
  const seen = bySeed(
    "Flip 3 coins. If at least 2 of them are heads, your opponent's Active Pokémon cannot attack next turn.",
    { damage: '80' },
    lockOf,
    40
  );
  for (const [heads, results] of seen) assert.deepEqual([...results], [heads >= 2 ? 'atk:6 ret:-' : 'atk:- ret:-'], `${heads} heads`);
});

test("HB 423 Wo-Chien Entangling Whip: heads, the opponent's Active Pokémon can't retreat next turn", () => {
  const seen = bySeed("Flip a coin. If heads, your opponents Active Pokémon can't retreat next turn.", { damage: '90' }, lockOf);
  assert.deepEqual([...seen.get(1)], ['atk:- ret:6']);
  assert.deepEqual([...seen.get(0)], ['atk:- ret:-']);
});

test('HB 526 Melmetal ex Double Iron Bash locks the attack only when both coins are heads', () => {
  const seen = bySeed(
    "Flip 2 coins. This attack does 30 damage for each heads. If both are heads, your opponent's Active Pokémon can't attack during their next turn.",
    { damage: '30×' },
    lockOf,
    40
  );
  for (const [heads, results] of seen) assert.deepEqual([...results], [heads === 2 ? 'atk:6 ret:-' : 'atk:- ret:-']);
});

test('HB 005 Pinsir Vise Grip: both heads, the Defending Pokémon can\'t retreat', () => {
  const seen = bySeed('Flip 2 coins. If both are heads the Defending Pokémon cannot retreat', { damage: '50' }, lockOf, 40);
  for (const [heads, results] of seen) assert.deepEqual([...results], [heads === 2 ? 'atk:- ret:6' : 'atk:- ret:-']);
});

test("HB 569 Rayquaza V-Create (tails) and HB 558 Reshiram ex Blue Flare (\"cant\") lock this Pokémon's next turn", () => {
  const vCreate = bySeed(
    'Flip a coin. If heads, discard two Energy cards from this Pokémon. If tails, this Pokémon cannot attack next turn.',
    { damage: '150' },
    (s) => root(s, 'p1', 'active').cannotAttackUntilTurn ?? '-'
  );
  assert.deepEqual([...vCreate.get(0)], [7]);
  assert.deepEqual([...vCreate.get(1)], ['-']);
  const { state } = board("Your opponent's Active Pokémon is now Burned. This Pokémon cant attack during your next turn.", { damage: '150' });
  assert.equal(root(attack(state).state, 'p1', 'active').cannotAttackUntilTurn, 7);
});

test('HB 663 Gible Sand Attack ("tires to attak") makes the Defending Pokémon flip before it attacks', () => {
  const { state } = board(
    "If the Defending Pokémon tires to attak during your opponent's next turn, your opponent flips a coin. If tails, that attack does nothing."
  );
  const marks = root(attack(state).state, 'p2', 'active').attackMarkers || [];
  assert.ok(marks.some((m) => m.kind === 'attackFlipOrFail'));
});

// ── Conditions in hand-typed wordings ─────────────────────────────────────────────────────────

const activeDamage = (text, opts) => root(resolveAll(attack(board(text, opts).state)).state, 'p2', 'active').damage;

test('HB 116 Galarian Slowking Acid Spray poisons a {M} Pokémon only', () => {
  const text = 'If your opponents Active Pokémon is a {M} Type, they are now Poisoned.';
  const poisoned = (types) => root(attack(board(text, { damage: '90', defenderExtra: { types } }).state).state, 'p2', 'active').poisoned;
  assert.equal(poisoned(['Metal']), true);
  assert.ok(!poisoned(['Water']));
});

test('HB 536 Zygarde Thousand Arrows / HB 548 Groudon Rock Slide read "{C} type" as a {C} Pokémon', () => {
  const arrows = "If your opponent's Active Pokémon is a {C} type, this attack does 50 more damage.";
  assert.equal(activeDamage(arrows, { damage: '80+', defenderExtra: { types: ['Colorless'] } }), 130);
  assert.equal(activeDamage(arrows, { damage: '80+', defenderExtra: { types: ['Water'] } }), 80);
  const slide = "If your opponent's Active Pokémon is {C} type, this attack does 40 more damage.";
  assert.equal(activeDamage(slide, { damage: '80+', defenderExtra: { types: ['Colorless'] } }), 120);
});

test('HB 539 Tapu Lele Psyshock does 50 more only when the opponent\'s Active is weak to {P}', () => {
  const text = "If your opponent's Active Pokémon is weak to {P}, this attack does 50 more damage.";
  const weak = { types: ['Fighting'], weakness: { type: 'Psychic', value: 2 } };
  assert.equal(activeDamage(text, { damage: '90+', defenderExtra: weak }), 140);
  assert.equal(activeDamage(text, { damage: '90+' }), 90);
});

test('HB 526 Melmetal ex Fire Punch / Water Punch read "{M} or {G}" / "{R} or {F}" Energy', () => {
  const fire = "If your opponent's Active Pokémon has any {M} or {G} Energy attached, this attack does 40 more damage.";
  const withEnergy = (type) => (s, { defender }) => s.players.p2.zones.active.push(energy(type, defender.instanceId));
  assert.equal(activeDamage(fire, { damage: '90+', setup: withEnergy('Metal') }), 130);
  assert.equal(activeDamage(fire, { damage: '90+', setup: withEnergy('Grass') }), 130);
  assert.equal(activeDamage(fire, { damage: '90+', setup: withEnergy('Water') }), 90);
  const water = "If your opponent's Active Pokémon has any {R} or {F} Energy attached, this attack does 40 more damage.";
  assert.equal(activeDamage(water, { damage: '30', setup: withEnergy('Fighting') }), 70);
});

test('HB 481 Gardevoir ex Swelling Pulse adds 40 when this Pokémon was healed during its owner\'s last turn', () => {
  const text = 'If this Pokémon was healed during your last turn, this attack does 40 more damage.';
  assert.equal(activeDamage(text, { damage: '90+', attackerExtra: { healedTurn: 3 } }), 130);
  assert.equal(activeDamage(text, { damage: '90+', attackerExtra: { healedTurn: 5, healedPreviousTurn: 3 } }), 130);
  assert.equal(activeDamage(text, { damage: '90+', attackerExtra: { healedTurn: 5 } }), 90);
  assert.equal(activeDamage(text, { damage: '90+' }), 90);
});

test('HB 672 Paldean Tauros Jet Headbutt discards a random opposing hand card only with {F} Energy attached', () => {
  const text = "If this Pokémon has any {F} Energy attached, discard a random card from your opponent's hand.";
  const run = (setup) => attack(board(text, { damage: '100', setup }).state).state;
  const fighting = run((s, { attacker }) => s.players.p1.zones.active.push(energy('Fighting', attacker.instanceId)));
  assert.equal(zone(fighting, 'p2', 'discard').length, 1);
  assert.equal(zone(run(() => {}), 'p2', 'discard').length, 0);
});

test('HB 448 Mega Mawile ex Gobble Down counts the Prize cards its player has taken', () => {
  const text = 'This attack does 40 damage for each Prize card you have taken.';
  assert.equal(activeDamage(text, { damage: '40×', setup: (s) => s.players.p1.zones.prizes.splice(0, 2) }), 80);
});

test('HB 101 Aegislash ex Royal Guard counts each named Pokémon in play on both sides', () => {
  const text =
    "This attack does 30 more damage for each Honedge in play, 40 more damage for each Doublade in play, and 60 more damage Aegislash in play (both yours and your opponent's).";
  const setup = (s) => {
    s.players.p1.zones.bench[0].name = 'Honedge';
    s.players.p2.zones.bench[0].name = 'Doublade';
    s.players.p2.zones.bench[1].name = 'Aegislash';
  };
  assert.equal(activeDamage(text, { damage: '40+', name: 'Aegislash ex', setup }), 40 + 30 + 40 + 60);
});

// ── Optional costs ────────────────────────────────────────────────────────────────────────────

test('HB 454 Regigigas ex Creation (no final period) draws 2 per Energy discarded and keeps its damage', () => {
  const { state } = board(
    'You may discard any number of Energy cards attached to this Pokémon when you use this attack. If you do, draw 2 cards for each card you discarded in this way',
    { damage: '130', setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Fire', attacker.instanceId), energy('Water', attacker.instanceId)) }
  );
  const offered = attack(state);
  assert.ok(offered.state.pendingChoice);
  const res = choose(offered, offered.state.pendingChoice.options.map((o) => o.instanceId));
  assert.equal(zone(res.state, 'p1', 'discard').length, 2);
  assert.equal(zone(res.state, 'p1', 'hand').length, 4 + 4);
  assert.equal(root(res.state, 'p2', 'active').damage, 130);
});

test('HB 497 Garchomp ex Surf does 30 to each opposing Pokémon per Energy discarded', () => {
  const { state } = board(
    "Discard as many Energy attached to this Pokémon as you like. For each Energy you discard, this attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    { setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Water', attacker.instanceId), energy('Water', attacker.instanceId)) }
  );
  const offered = attack(state);
  const res = choose(offered, offered.state.pendingChoice.options.map((o) => o.instanceId));
  assert.equal(root(res.state, 'p2', 'active').damage, 60);
  assert.deepEqual(zone(res.state, 'p2', 'bench').map((c) => c.damage), [60, 60]);
  const none = choose(attack(board(
    "Discard as many Energy attached to this Pokémon as you like. For each Energy you discard, this attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    { setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Water', attacker.instanceId)) }
  ).state), []);
  assert.deepEqual(zone(none.state, 'p2', 'bench').map((c) => c.damage), [0, 0]);
});

test('HB 644 Genesect ex Rapid Blaster ("Metal Energy") does 20 more per Energy discarded', () => {
  const { state } = board(
    'Discard as many Metal Energy attached to this Pokémon as you like. This attack does 20 more damage for each Energy card discarded in this way.',
    { damage: '100+', setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Metal', attacker.instanceId), energy('Metal', attacker.instanceId)) }
  );
  const offered = attack(state);
  const res = choose(offered, offered.state.pendingChoice.options.map((o) => o.instanceId));
  assert.equal(root(res.state, 'p2', 'active').damage, 140);
});

test('HB 056 Kommo-o Scaly Uppercut and HB 100 Aegislash Smart Strike: discard a Tool for 50 more', () => {
  for (const [text, base] of [
    ['You may discard a Pokémon Tool card from this Pokémon. If you do, this attack does 50 more damage.', '90+'],
    ['Before doing damage, you may discard a Pokémon Tool attached to this Pokémon. If you do, this attack does 50 more damage.', '120'],
  ]) {
    const setup = (s, { attacker }) => s.players.p1.zones.active.push(trainer('Some Tool', 'Pokémon Tool', { attachedTo: attacker.instanceId }));
    const offered = attack(board(text, { damage: base, setup }).state);
    const paid = choose(offered, [offered.state.pendingChoice.options[0].instanceId]);
    assert.equal(root(paid.state, 'p2', 'active').damage, parseInt(base, 10) + 50);
    assert.deepEqual(names(zone(paid.state, 'p1', 'discard')), ['Some Tool']);
    const declined = choose(attack(board(text, { damage: base, setup }).state), []);
    assert.equal(root(declined.state, 'p2', 'active').damage, parseInt(base, 10));
  }
});

test('HB 550 Dialga Chrono Burst: shuffle all its Energy into the deck for 50 more', () => {
  const text = 'You may shuffle all Energy attached to this Pokémon into your deck and have this attack do 50 more damage.';
  const setup = (s, { attacker }) => s.players.p1.zones.active.push(energy('Metal', attacker.instanceId), energy('Metal', attacker.instanceId));
  const offered = attack(board(text, { damage: '80+', setup }).state);
  const yes = offered.state.pendingChoice.options[0].instanceId;
  const res = choose(offered, [yes]);
  assert.equal(root(res.state, 'p2', 'active').damage, 130);
  assert.equal(attachedTo(res.state, 'p1', root(res.state, 'p1', 'active')).length, 0);
  assert.equal(zone(res.state, 'p1', 'deck').length, 12);
});

test('HB 101 Aegislash ex Royal Command discards the chosen Benched Pokémon, 40 more each', () => {
  const text =
    'You may discard any number of your Benched Pokémon. This attack does 40 more damage for each Benched Pokémon you discarded this way.';
  const offered = attack(board(text, { damage: '120+' }).state);
  const one = choose(offered, [offered.state.pendingChoice.options[0].instanceId]);
  assert.equal(root(one.state, 'p2', 'active').damage, 160);
  assert.deepEqual(names(zone(one.state, 'p1', 'discard')), ['OwnBench0']);
  assert.deepEqual(names(zone(one.state, 'p1', 'bench')), ['OwnBench1']);
  const none = choose(attack(board(text, { damage: '120+' }).state), []);
  assert.equal(root(none.state, 'p2', 'active').damage, 120);
});

// ── Deck, hand and discard ────────────────────────────────────────────────────────────────────

test('HB 464 Rattata Search Trash and HB 570 Dialga ex Rewind shuffle discard cards into the deck', () => {
  const discard = (s) => s.players.p1.zones.discard.push(trainer('D1', 'Item'), trainer('D2', 'Item'), trainer('D3', 'Item'), trainer('D4', 'Item'));
  const trash = resolveAll(attack(board('Shuffle the top 3 cards from your discard pile into your deck.', { setup: discard }).state));
  assert.equal(zone(trash.state, 'p1', 'discard').length, 1);
  assert.equal(zone(trash.state, 'p1', 'deck').length, 13);
  const offered = attack(board('Shuffle up to 2 cards from your discard pile back into your deck.', { damage: '100', setup: discard }).state);
  assert.equal(offered.state.pendingChoice.max, 2);
  const rewind = choose(offered, offered.state.pendingChoice.options.slice(0, 2).map((o) => o.instanceId));
  assert.equal(zone(rewind.state, 'p1', 'discard').length, 2);
});

test('HB 267 Alolan Graveler Electric Punch also discards the top card of its own deck', () => {
  const offered = attack(
    board('You may discard the top card of your opponents deck. If you do, discard the top card of your own deck.', { damage: '50' }).state
  );
  const res = choose(offered, [offered.state.pendingChoice.options.find((o) => o.name === 'Yes').instanceId]);
  assert.equal(zone(res.state, 'p2', 'discard').length, 1);
  assert.equal(zone(res.state, 'p1', 'discard').length, 1);
});

test('HB 258 Magnemite Polarity discards 1 card from hand, then draws 2', () => {
  const res = resolveAll(attack(board('Choose 1 card from your hand to discard. Draw 2 cards.').state));
  assert.equal(zone(res.state, 'p1', 'discard').length, 1);
  assert.equal(zone(res.state, 'p1', 'hand').length, 4 - 1 + 2);
});

test('HB 631 Whimsicott Sneaky Pocket: discard a card; if you do, the opponent discards one', () => {
  const res = resolveAll(
    attack(board('Put a card from your hand in the discard pile. If you do, your opponent discards a card from their hand.').state)
  );
  assert.equal(zone(res.state, 'p1', 'discard').length, 1);
  assert.equal(zone(res.state, 'p2', 'discard').length, 1);
});

test("HB 063 Tyranitar Tyrant's Roar and HB 568 Ultra Necrozma Ultra Charge attach an Energy and a Tool", () => {
  for (const text of [
    'Search your deck for a Basic Energy card and a Pokémon Tool card, and attach them to this Pokémon.',
    'Search your deck for a Pokémon Tool and an Energy card and attach them to this Pokémon.',
  ]) {
    const { state } = board(text, { setup: (s) => s.players.p1.zones.deck.push(energy('Fighting'), trainer('Deck Tool', 'Pokémon Tool')) });
    const res = resolveAll(attack(state));
    const on = names(attachedTo(res.state, 'p1', root(res.state, 'p1', 'active'))).sort();
    assert.deepEqual(on, ['Basic Fighting Energy', 'Deck Tool']);
  }
});

test('HB 522 Joltik Jolting Charge discards a deck card for each Energy it attached', () => {
  const { state } = board(
    'Search your deck for up to 2 Basic {G} Energy cards and up to 2 Basic {L} Energy cards and attach them to your Pokémon in any way you like. Then, shuffle your deck. For each Energy card attached, discard a card from the top of your deck.',
    { setup: (s) => s.players.p1.zones.deck.push(energy('Grass'), energy('Lightning')) }
  );
  const res = resolveAll(attack(state));
  assert.equal(zone(res.state, 'p1', 'discard').length, 2);
  // 10 + 2 Energy, 2 attached, 2 discarded.
  assert.equal(zone(res.state, 'p1', 'deck').length, 8);
});

test('HB 438 Mega Skarmory ex Sonic Ripper shuffles all its Energy into the deck and snipes for 200', () => {
  const { state } = board(
    "Shuffle all Energy attached to this Pokémon into your deck, and this attack does 200 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    { setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Metal', attacker.instanceId)) }
  );
  const res = resolveAll(attack(state), pickNamed('OppBench0'));
  assert.equal(root(res.state, 'p2', 'bench', 'OppBench0').damage, 200);
  assert.equal(attachedTo(res.state, 'p1', root(res.state, 'p1', 'active')).length, 0);
  assert.equal(zone(res.state, 'p1', 'deck').length, 11);
});

test('HB 265 Tapu Koko Summon Lightning offers {L} Pokémon and Basic Energy, up to 2', () => {
  const { state } = board(
    'Search your deck for any combination of up to 2 {L} Pokémon and Basic Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.',
    { setup: (s) => s.players.p1.zones.deck.push(mon('Deck Pika', { types: ['Lightning'] }), mon('Deck Fire', { types: ['Fire'] }), energy('Fire')) }
  );
  const offered = attack(state);
  assert.equal(offered.state.pendingChoice.max, 2);
  assert.deepEqual(names(offered.state.pendingChoice.options).sort(), ['Basic Fire Energy', 'Deck Pika']);
  const res = choose(offered, offered.state.pendingChoice.options.map((o) => o.instanceId));
  assert.equal(zone(res.state, 'p1', 'hand').length, 6);
});

test('HB 553 Origin Forme Palkia ex Disruption: each player shuffles 2 hand cards in, then draws 2', () => {
  const offered = attack(board('Each player shuffles 2 cards from their hand into their deck. Then, each player draws 2 cards.').state);
  assert.equal(offered.state.pendingChoice.player, 'p1');
  const mine = ['p1 hand 0', 'p1 hand 1'].map((n) => offered.state.pendingChoice.options.find((o) => o.name === n).instanceId);
  const theirsAsked = choose(offered, mine);
  assert.equal(theirsAsked.state.pendingChoice.player, 'p2');
  const res = choose(theirsAsked, theirsAsked.state.pendingChoice.options.slice(0, 2).map((o) => o.instanceId));
  assert.ok(!names(zone(res.state, 'p1', 'hand')).includes('p1 hand 0'));
  assert.equal(zone(res.state, 'p1', 'hand').length, 4);
  // The opponent: 4 − 2 + 2, then its turn-start draw.
  assert.equal(zone(res.state, 'p2', 'hand').length, 5);
});

// ── Switches and moves ────────────────────────────────────────────────────────────────────────

test('HB 553 Origin Forme Palkia ex Spacial Rend moves the old Active\'s attached cards to the new Active', () => {
  const { state } = board(
    "Switch your opponent's Active Pokémon with one of their Benched Pokémon. Move all cards attached from that Pokémon to the new Active Pokémon.",
    { setup: (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId), trainer('OppTool', 'Pokémon Tool', { attachedTo: defender.instanceId })) }
  );
  const res = resolveAll(attack(state), pickNamed('OppBench0'));
  const active = root(res.state, 'p2', 'active');
  assert.equal(active.name, 'OppBench0');
  assert.deepEqual(names(attachedTo(res.state, 'p2', active)).sort(), ['Basic Fire Energy', 'OppTool']);
  assert.equal(attachedTo(res.state, 'p2', root(res.state, 'p2', 'bench', 'Defender')).length, 0);
});

test('HB 072 Clefable Baton Pass moves its attached cards to the new Active Pokémon', () => {
  const { state } = board(
    'Switch this Pokémon with 1 of your Benched Pokémon. Transfer all attached cards from this Pokémon to the new Active Pokémon.',
    { setup: (s, { attacker }) => s.players.p1.zones.active.push(energy('Fairy', attacker.instanceId)) }
  );
  const res = resolveAll(attack(state), pickNamed('OwnBench0'));
  const active = root(res.state, 'p1', 'active');
  assert.equal(active.name, 'OwnBench0');
  assert.deepEqual(names(attachedTo(res.state, 'p1', active)), ['Basic Fairy Energy']);
});

const TELEKINESIS =
  "This attack does 50 damage to 1 of your opponent's Pokémon. Move an Energy from that Pokémon to another of their Pokémon. This attack's damage isn't affected by Weakness or Resistance.";

test('HB 541 Gardevoir Telekinesis: 50 to the chosen Pokémon, no Weakness, then one of its Energy moves', () => {
  const { state } = board(TELEKINESIS, {
    defenderExtra: { weakness: { type: 'Colorless', value: 2 } },
    setup: (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId)),
  });
  const res = resolveAll(attack(state), (pc) => [
    (pc.options.find((o) => o.name === 'Defender') || pc.options.find((o) => o.name === 'OppBench1') || pc.options[0]).instanceId,
  ]);
  assert.equal(root(res.state, 'p2', 'active').damage, 50);
  assert.deepEqual(names(attachedTo(res.state, 'p2', root(res.state, 'p2', 'bench', 'OppBench1'))), ['Basic Fire Energy']);
});

test('HB 541 Gardevoir Telekinesis moves nothing off a Pokémon its 50 damage Knocks Out', () => {
  const { state } = board(TELEKINESIS, {
    defenderExtra: { hp: 50 },
    setup: (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId)),
  });
  const res = resolveAll(attack(state), (pc) => [(pc.options.find((o) => o.name === 'Defender') || pc.options[0]).instanceId]);
  assert.deepEqual(names(zone(res.state, 'p2', 'discard')).sort(), ['Basic Fire Energy', 'Defender']);
});

test('HB 554 Giratina ex Alpha Rage: an opposing Pokémon hits another of theirs with its own type', () => {
  const { state } = board(
    "Choose 1 of your opponent's Pokémon. That Pokémon attacks 1 of your opponent's other Pokémon. This Pokémon can't attack during your next turn.",
    {
      defenderExtra: { weakness: { type: 'Fire', value: 2 } },
      setup: (s) => {
        Object.assign(s.players.p2.zones.bench[0], { types: ['Fire'], attacks: [{ name: 'Big Hit', cost: [], damage: '120', text: '' }] });
      },
    }
  );
  const res = resolveAll(attack(state), (pc) => [(pc.options.find((o) => o.name === 'OppBench0') || pc.options.find((o) => o.name === 'Defender')).instanceId]);
  assert.equal(root(res.state, 'p2', 'active').damage, 240, '120, doubled by the Fire Weakness');
  assert.equal(root(res.state, 'p1', 'active').cannotAttackUntilTurn, 7);
});

test('HB 222 Single Strike Urshifu Field Crush discards the opponent\'s Stadium', () => {
  const setup = (s) => {
    s.stadium = trainer('Some Stadium', 'Stadium', { playerId: 'p2' });
  };
  const res = resolveAll(attack(board('If your opponent has a Stadium in play, discard it.', { damage: '50', setup }).state));
  assert.equal(res.state.stadium, null);
});

test('HB 422 Ting-Lu Ground Crasher spreads 30 and discards the Stadium only while one is in play', () => {
  const text =
    "If a Stadium is in play, this attack also does 30 damage to each of your opponent's Benched Pokémon, and discard that Stadium. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const withStadium = attack(board(text, { damage: '30', setup: (s) => { s.stadium = trainer('Some Stadium', 'Stadium', { playerId: 'p2' }); } }).state);
  assert.deepEqual(zone(withStadium.state, 'p2', 'bench').map((c) => c.damage), [30, 30]);
  assert.equal(withStadium.state.stadium, null);
  const without = attack(board(text, { damage: '30' }).state);
  assert.deepEqual(zone(without.state, 'p2', 'bench').map((c) => c.damage), [0, 0]);
});

// ── Effects on later turns ────────────────────────────────────────────────────────────────────

const hitBack = { attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }] };

test("HB 500 Dragonite ex Fly: when the opponent attacks it, tails means it takes no damage", () => {
  const text =
    "During your opponent's next turn, if their Active Pokémon tries to attack, your opponent flips a coin. If tails, this Pokémon takes no damage.";
  const seen = new Map();
  for (let seed = 1; seed <= 16; seed++) {
    const first = attack(board(text, { damage: '100', defenderExtra: hitBack }).state);
    const res = attack(first.state, { seed, player: 'p2' });
    const coin = res.events.find((e) => e.type === 'attackMarkerCoinFlipped')?.coin;
    seen.set(coin, root(res.state, 'p1', 'active').damage);
  }
  assert.deepEqual(Object.fromEntries(seen), { heads: 60, tails: 0 });
});

test('HB 468 Lillipup Play Nice: heads, it takes 10 less damage next turn', () => {
  const seen = new Map();
  for (let seed = 1; seed <= 16; seed++) {
    const first = attack(board("Flip a coin. If heads, this Pokémon takes 10 less damage during your opponent's next turn.", { damage: '10+', defenderExtra: hitBack }).state, { seed });
    const heads = coinsOf(first).headsCount;
    seen.set(heads, root(attack(first.state, { player: 'p2' }).state, 'p1', 'active').damage);
  }
  assert.deepEqual(Object.fromEntries(seen), { 0: 60, 1: 50 });
});

test('HB 453 Serperior Solar Coiling does 160 on its next turn', () => {
  const text = "During your opponent's next turn, this Pokémon takes 50 less damage from attacks. On your next turn, this attack does 160 damage.";
  const first = attack(board(text, { attacks: [{ name: 'Solar Coiling', cost: [], damage: '', text }], defenderExtra: hitBack }).state);
  assert.equal(root(first.state, 'p2', 'active').damage, 0);
  const back = attack(first.state, { player: 'p2' });
  assert.equal(root(back.state, 'p1', 'active').damage, 10);
  const again = attack(back.state);
  assert.equal(root(again.state, 'p2', 'active').damage, 160);
});

test('HB 267 Alolan Graveler Rolling Tackle does 20 more for each earlier use', () => {
  const text = 'This attack does 20 more damage each time it is used';
  const first = attack(board(text, { attacks: [{ name: 'Rolling Tackle', cost: [], damage: '20+', text }] }).state);
  assert.equal(root(first.state, 'p2', 'active').damage, 20);
  const second = attack(pass(first.state, 'p2').state);
  assert.equal(root(second.state, 'p2', 'active').damage, 20 + 40);
});

test('HB 520 Zeraora ex Plasma Fists makes the opponent\'s Active a {L} Pokémon during their next turn', () => {
  const res = attack(board("During your opponent's next turn, their Active Pokémon is treated as a {L} type.", { damage: '150', defenderExtra: { types: ['Water'] } }).state);
  assert.equal(res.state.turn.number, 6);
  assert.deepEqual(inPlayView(res.state, root(res.state, 'p2', 'active')).types, ['Lightning']);
  const later = pass(res.state, 'p2');
  assert.deepEqual(inPlayView(later.state, root(later.state, 'p2', 'active')).types, ['Water']);
});

test('HB 096 Corviknight Accelerate protects it next turn only after a Knock Out', () => {
  const text =
    "If your opponent's Pokémon is Knocked Out by damage from this attack, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
  const ko = resolveAll(
    attack(board(text, { damage: '50', defenderExtra: { hp: 50 }, setup: (s) => Object.assign(s.players.p2.zones.bench[0], hitBack) }).state)
  );
  assert.equal(root(attack(ko.state, { player: 'p2' }).state, 'p1', 'active').damage, 0);
  const noKo = attack(board(text, { damage: '50', defenderExtra: hitBack }).state);
  assert.equal(root(attack(noKo.state, { player: 'p2' }).state, 'p1', 'active').damage, 60);
});
