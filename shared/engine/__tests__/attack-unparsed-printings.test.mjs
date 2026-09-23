// The last design-031 printings the server did not run (design 033, I119): deck-reveal and
// shuffle-to-scale damage, hand-discard chosen-target damage, timed markers from older
// wordings, attack locks, hand swaps, and looking at the opponent's deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import {
  attackTargetClause,
  deckRevealScaling,
  discardEnergyScaling,
} from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type = 'Fire') =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
  });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(
  text,
  { name = 'Attacker', damage = '0', attackName = 'Test Attack', attacker = {}, setup = () => {}, seed = 5, rules = false } = {}
) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-i119', seed, rulesEnabled: rules });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const atk = mon(name, { hp: 300, attacks: [{ name: attackName, cost: [], damage, text }], ...attacker });
  state.players.p1.zones.active.push(atk);
  const defender = mon('Defender', { hp: 900 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker: atk, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b, attackIndex = 0) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, b.rng);
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
const find = (res, pid, zoneName, name) => zone(res, pid, zoneName).find((c) => c.name === name);
const damageOn = (res, pid, zoneName, name) => find(res, pid, zoneName, name)?.damage || 0;
const optionNames = (res) => res.state.pendingChoice.options.map((o) => o.name);

// ── slice 1: damage path ────────────────────────────────────────────────────

const MUD_FLOOD =
  'Reveal the top 4 cards of your deck. This attack does 40 more damage for each {W} Energy you find there. Shuffle the revealed cards back into your deck.';
const ROCKET_SPLASH =
  'Shuffle any amount of {W} Energy from your Pokémon into your deck. This attack does 60 damage for each card you shuffled into your deck in this way.';
const VOLTAGE_SHOOT =
  "Discard 2 {L} Energy cards from your hand and choose 1 of your opponent's Pokémon. This attack does 80 to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";

test('parsers: Mud Flood reveal, Rocket Splash shuffle, Voltage Shoot target and hand discard', () => {
  assert.deepEqual(deckRevealScaling(MUD_FLOOD), {
    count: 4,
    perUnit: 40,
    filter: { kind: 'energy', energyType: 'Water', basicOnly: false, name: null },
  });
  assert.equal(deckRevealScaling('Reveal the top 4 cards of your deck.'), null);
  assert.deepEqual(discardEnergyScaling(ROCKET_SPLASH), {
    max: Infinity,
    source: 'all',
    energyType: 'Water',
    basicOnly: false,
    destination: 'deck',
  });
  assert.deepEqual(attackTargetClause(VOLTAGE_SHOOT), { kind: 'damage', amount: 80, count: 1, scope: 'any' });
  assert.deepEqual(parseAttackSteps(VOLTAGE_SHOOT).before, [
    { type: 'atkDiscardHandEnergy', count: 2, energyType: 'L' },
  ]);
  // Conditional hand discards ("If you do, …") stay unread.
  assert.deepEqual(parseAttackSteps('Discard a {R} Energy card from your hand. If you do, draw 3 cards.').before, []);
});

test('Mud Flood: 40 more for each {W} Energy among the top 4, then the deck is shuffled', () => {
  const b = board(MUD_FLOOD, {
    name: 'Swampert-EX',
    damage: '40+',
    setup: ({ p1 }) => p1.zones.deck.unshift(energy('Water'), mon('filler'), energy('Water'), energy('Fire')),
  });
  const res = attack(b);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 120);
  const revealed = res.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(revealed.cards.length, 4);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
  assert.equal(zone(res, 'p1', 'deck').length + zone(res, 'p1', 'hand').length, 14);
});

test('Mud Flood: a short deck reveals what is there; an empty deck leaves the base', () => {
  const short = board(MUD_FLOOD, {
    damage: '40+',
    setup: ({ p1 }) => p1.zones.deck.splice(0, p1.zones.deck.length, energy('Water'), mon('filler')),
  });
  assert.equal(damageOn(attack(short), 'p2', 'active', 'Defender'), 80);
  const empty = board(MUD_FLOOD, { damage: '40+', setup: ({ p1 }) => p1.zones.deck.splice(0) });
  const res = attack(empty);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 40);
  assert.ok(!res.events.some((e) => e.type === 'cardsRevealed'));
});

function rocketSplashBoard() {
  return board(ROCKET_SPLASH, {
    name: 'Blastoise-GX',
    damage: '60×',
    setup: ({ p1, attacker }) => {
      const bench = mon('Benched Buddy');
      p1.zones.bench.push(bench);
      for (const [host, e] of [[attacker, energy('Water')], [bench, energy('Water')], [attacker, energy('Fire')]]) {
        e.attachedTo = host.instanceId;
        (host === attacker ? p1.zones.active : p1.zones.bench).push(e);
      }
    },
  });
}

test('Rocket Splash: the chosen {W} Energy from any of your Pokémon go into the deck, 60 each', () => {
  const b = rocketSplashBoard();
  const asked = attack(b);
  assert.match(asked.state.pendingChoice.prompt, /shuffle into your deck/);
  assert.deepEqual(optionNames(asked), ['Basic Water Energy', 'Basic Water Energy']);
  const res = choose(asked, asked.state.pendingChoice.options.map((o) => o.instanceId), b.rng);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 120);
  assert.equal(zone(res, 'p1', 'deck').filter((c) => c.name === 'Basic Water Energy').length, 2);
  assert.equal(zone(res, 'p1', 'discard').length, 0);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('Rocket Splash: shuffling no Energy does no damage and moves nothing', () => {
  const b = rocketSplashBoard();
  const res = choose(attack(b), [], b.rng);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 0);
  assert.equal(zone(res, 'p1', 'active').filter((c) => c.name === 'Basic Water Energy').length, 1);
});

function voltageBoard(handEnergy, rules = false) {
  return board(VOLTAGE_SHOOT, {
    name: 'Raichu LV.X',
    attackName: 'Voltage Shoot',
    attacker: { types: ['Lightning'] },
    rules,
    setup: ({ p1, p2 }) => {
      p1.zones.hand.push(...handEnergy());
      p2.zones.bench.push(mon('Benched Target', { hp: 300 }));
    },
  });
}

test('Voltage Shoot: discards 2 {L} Energy cards from the hand, then 80 to the chosen Pokémon', () => {
  const b = voltageBoard(() => [energy('Lightning'), energy('Lightning'), energy('Lightning'), energy('Fire')]);
  const pickDiscard = attack(b);
  assert.deepEqual(optionNames(pickDiscard), ['Basic Lightning Energy', 'Basic Lightning Energy', 'Basic Lightning Energy']);
  const ids = pickDiscard.state.pendingChoice.options.slice(0, 2).map((o) => o.instanceId);
  const pickTarget = choose(pickDiscard, ids, b.rng);
  assert.equal(zone(pickTarget, 'p1', 'discard').length, 2);
  assert.match(pickTarget.state.pendingChoice.prompt, /Choose 1 of your opponent's Pokémon/);
  const target = pickTarget.state.pendingChoice.options.find((o) => o.name === 'Benched Target');
  const res = choose(pickTarget, [target.instanceId], b.rng);
  assert.equal(damageOn(res, 'p2', 'bench', 'Benched Target'), 80);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 0);
  assert.deepEqual(zone(res, 'p1', 'hand').map((c) => c.name).sort(), ['Basic Fire Energy', 'Basic Lightning Energy']);
});

test('Voltage Shoot: refused with fewer than 2 {L} Energy cards in hand', () => {
  const b = voltageBoard(() => [energy('Lightning'), energy('Fire')], true);
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.match(String(res.error), /Energy card\(s\) in your hand/);
});

// ── slice 2: timed markers from older wordings ──────────────────────────────

const MACH_WIND = "During your next turn, Vespiquen's Retreat Cost is 0.";
const EXTRA_COMET_PUNCH = 'During your next turn, Extra Comet Punch does 30 damage plus 30 more damage.';
const PSYCHIC_DEFENSE =
  "During your opponent's next turn, prevent all effects of an attack, and any damage done to Deoxys by attacks is reduced by 20 (after applying Weakness and Resistance).";
const IRON_CLAD_ROLL =
  "After doing damage, you may discard all Future Booster Energy Capsules from this Pokémon. If you do, during your opponent's next turn, this Pokémon takes 150 less damage from attacks (after applying Weakness and Resistance).";
const DESERT_GEYSER =
  "If your opponent has a Stadium in play, discard it. If you discarded a Stadium in this way, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";

test('parsers: older timed wordings become markers', () => {
  const steps = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(steps(MACH_WIND, 'Vespiquen'), [
    { type: 'atkAddMarker', target: 'self', window: 'yourNextTurn', marker: { kind: 'freeRetreat' } },
  ]);
  assert.deepEqual(steps(EXTRA_COMET_PUNCH, 'Metang'), [
    {
      type: 'atkAddMarker',
      target: 'self',
      window: 'yourNextTurn',
      marker: { kind: 'nextTurnBonus', amount: 30, attackName: 'extra comet punch' },
    },
  ]);
  assert.deepEqual(steps(PSYCHIC_DEFENSE, 'Deoxys Defense Forme'), [
    {
      type: 'atkAddMarker',
      target: 'self',
      window: 'opponentNextTurn',
      marker: { kind: 'incomingReduce', amount: 20, afterWR: true, filter: null },
    },
  ]);
  assert.deepEqual(steps(IRON_CLAD_ROLL, 'Iron Treads ex'), [
    {
      type: 'atkDiscardSelfTool',
      toolName: 'future booster energy capsule',
      optional: true,
      then: {
        type: 'atkAddMarker',
        target: 'self',
        window: 'opponentNextTurn',
        marker: { kind: 'incomingReduce', amount: 150, afterWR: true, filter: null },
      },
    },
  ]);
  assert.deepEqual(steps(DESERT_GEYSER, 'Flygon'), [
    {
      type: 'atkDiscardStadium',
      owner: 'opponent',
      then: {
        type: 'atkAddMarker',
        target: 'self',
        window: 'opponentNextTurn',
        marker: { kind: 'incomingPrevent', filter: null },
      },
    },
  ]);
  // "This attack does … plus …" is the attack's own damage, not a later-turn bonus.
  assert.deepEqual(steps('During your next turn, this attack does 30 damage plus 30 more damage.'), []);
});

const run = (state, playerId, type, payload = {}) => {
  const res = applyCommand(state, { type, playerId, payload }, createRng(5));
  assert.equal(res.error, null);
  return res;
};

/** p1 attacks with `text` on turn 3; p2's Striker hits back for `strike` on turn 4. */
function markerDuel(text, { name = 'Attacker', damage = '10', strike = '100', setup = () => {} } = {}) {
  return board(text, {
    name,
    damage,
    attackName: 'Marked Attack',
    setup: (ctx) => {
      ctx.p2.zones.active.splice(0);
      ctx.p2.zones.active.push(mon('Striker', { hp: 900, attacks: [{ name: 'Strike', cost: [], damage: strike, text: '' }] }));
      ctx.p1.zones.bench.push(mon('Bench Buddy'));
      setup(ctx);
    },
  });
}

const activeNamed = (state, name) => state.players.p1.zones.active.find((c) => c.name === name);

test('Mach Wind: the Retreat Cost is 0 during your next turn only', () => {
  const setup = ({ p1, attacker }) => {
    attacker.retreatCost = ['Colorless', 'Colorless'];
    for (let i = 0; i < 2; i++) {
      const e = energy('Grass');
      e.attachedTo = attacker.instanceId;
      p1.zones.active.push(e);
    }
  };
  const afterAttack = attack(markerDuel(MACH_WIND, { name: 'Vespiquen', setup }));
  const myTurn = run(afterAttack.state, 'p2', 'pass').state;
  assert.equal(myTurn.turn.number, 5);
  const retreatPayload = { benchInstanceId: myTurn.players.p1.zones.bench.find((c) => c.name === 'Bench Buddy').instanceId };
  const free = run(structuredClone(myTurn), 'p1', 'retreat', retreatPayload).state;
  assert.equal(free.players.p1.zones.discard.length, 0, 'no Energy paid');
  const later = structuredClone(myTurn);
  later.turn.number = 7;
  const paid = run(later, 'p1', 'retreat', retreatPayload).state;
  assert.equal(paid.players.p1.zones.discard.length, 2, 'the window has closed');
});

test('Extra Comet Punch (Metang): 30 more damage when used during your next turn', () => {
  const b = markerDuel(EXTRA_COMET_PUNCH, { name: 'Metang', damage: '30' });
  b.attacker.attacks[0].name = 'Extra Comet Punch';
  const first = attack(b);
  assert.equal(first.state.players.p2.zones.active[0].damage, 30);
  const myTurn = run(first.state, 'p2', 'pass').state;
  const second = run(myTurn, 'p1', 'attack', { attackIndex: 0 }).state;
  assert.equal(second.players.p2.zones.active[0].damage, 30 + 60);
});

test('Psychic Defense: damage to Deoxys Defense Forme is 20 less on the next turn', () => {
  const b = markerDuel(PSYCHIC_DEFENSE, { name: 'Deoxys Defense Forme', damage: '0' });
  const hit = run(attack(b).state, 'p2', 'attack', { attackIndex: 0 }).state;
  assert.equal(activeNamed(hit, 'Deoxys Defense Forme').damage, 80);
});

function capsuleSetup({ p1, attacker }) {
  p1.zones.active.push(
    createCard({
      instanceId: 95,
      name: 'Future Booster Energy Capsule',
      supertype: 'Trainer',
      subtypes: ['Pokémon Tool'],
      type: 'Trainer',
      attachedTo: attacker.instanceId,
    })
  );
}

test('Iron-Clad Roll: discarding the Capsule gives 150 less damage next turn; declining gives nothing', () => {
  const opts = { name: 'Iron Treads ex', strike: '200', setup: capsuleSetup };
  const b = markerDuel(IRON_CLAD_ROLL, opts);
  const asked = attack(b);
  assert.match(asked.state.pendingChoice.prompt, /Discard Future Booster Energy Capsule/);
  const yes = choose(asked, [asked.state.pendingChoice.options.find((o) => o.name === 'Yes').instanceId], b.rng);
  assert.ok(yes.state.players.p1.zones.discard.some((c) => c.name === 'Future Booster Energy Capsule'));
  const hit = run(yes.state, 'p2', 'attack', { attackIndex: 0 }).state;
  assert.equal(activeNamed(hit, 'Iron Treads ex').damage, 50);

  const b2 = markerDuel(IRON_CLAD_ROLL, opts);
  const asked2 = attack(b2);
  const no = choose(asked2, [asked2.state.pendingChoice.options.find((o) => o.name === 'No').instanceId], b2.rng);
  assert.ok(activeNamed(no.state, 'Future Booster Energy Capsule'));
  const hit2 = run(no.state, 'p2', 'attack', { attackIndex: 0 }).state;
  assert.equal(activeNamed(hit2, 'Iron Treads ex').damage, 200);
});

test('Iron-Clad Roll: no Capsule attached means no question and no marker', () => {
  const res = attack(markerDuel(IRON_CLAD_ROLL, { name: 'Iron Treads ex' }));
  assert.equal(res.state.pendingChoice, null);
  assert.ok(!res.events.some((e) => e.type === 'attackMarkerAdded'));
});

const stadiumOf = (ownerId) =>
  createCard({ instanceId: 96, name: 'Some Stadium', supertype: 'Trainer', subtypes: ['Stadium'], type: 'Trainer', ownerId });

test("Desert Geyser: discards the opponent's Stadium and prevents next turn's damage", () => {
  const b = markerDuel(DESERT_GEYSER, { name: 'Flygon', setup: ({ state }) => (state.stadium = stadiumOf('p2')) });
  const res = attack(b);
  assert.equal(res.state.stadium, null);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Some Stadium'));
  const hit = run(res.state, 'p2', 'attack', { attackIndex: 0 }).state;
  assert.equal(activeNamed(hit, 'Flygon').damage || 0, 0);
});

test('Desert Geyser: your own Stadium or no Stadium leaves the board alone and earns no marker', () => {
  for (const setup of [({ state }) => (state.stadium = stadiumOf('p1')), () => {}]) {
    const res = attack(markerDuel(DESERT_GEYSER, { name: 'Flygon', setup }));
    assert.ok(!res.events.some((e) => e.type === 'attackMarkerAdded'));
    const hit = run(res.state, 'p2', 'attack', { attackIndex: 0 }).state;
    assert.equal(activeNamed(hit, 'Flygon').damage, 100);
  }
});

// ── slice 3: attack locks, hand swaps, the opponent's deck ──────────────────

const ENCORE =
  "Choose 1 of the Defending Pokémon's attacks. That Pokémon can use only that attack during your opponent's next turn.";
const AMNESIA =
  "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn.";
const UNOWN_T =
  "Look at your opponent's hand and choose 1 card, then have your opponent shuffle that card into his or her deck. Then, show your opponent your hand and he or she chooses 1 card. Shuffle that card into your deck.";
const MISCHIEVOUS_TENTACLES =
  "Look at the top card of your opponent's deck. You may have your opponent shuffle their deck.";
const FORTUNATE_EYE = "Look at the top 5 cards of your opponent's deck and put them back in any order.";

test('parsers: attack locks, Unown T and the opponent-deck looks', () => {
  const steps = (text) => parseAttackSteps(text).after;
  assert.deepEqual(steps(ENCORE), [{ type: 'atkLockAttack', mode: 'only' }]);
  assert.deepEqual(steps(AMNESIA), [{ type: 'atkLockAttack', mode: 'except' }]);
  assert.deepEqual(steps(UNOWN_T), [{ type: 'atkHandCardsToDecks' }]);
  assert.deepEqual(steps(MISCHIEVOUS_TENTACLES), [{ type: 'atkLookOppDeck', count: 1, offerShuffle: true }]);
  assert.deepEqual(steps(FORTUNATE_EYE), [{ type: 'atkLookOppDeck', count: 5, reorder: true }]);
});

const twoAttacks = [
  { name: 'Tackle', cost: [], damage: '10', text: '' },
  { name: 'Big Hit', cost: [], damage: '50', text: '' },
];

/** p1 locks p2's two-attack Striker; rules on so p2's next attack goes through the gate. */
function lockDuel(text, { attacks = twoAttacks } = {}) {
  return board(text, {
    name: 'Mime Jr.',
    rules: true,
    setup: ({ p2 }) => {
      p2.zones.active.splice(0);
      p2.zones.active.push(mon('Striker', { hp: 900, attacks }));
      p2.zones.bench.push(mon('Striker Bench'));
    },
  });
}

const tryAttack = (state, playerId, attackIndex) =>
  applyCommand(state, { type: 'attack', playerId, payload: { attackIndex } }, createRng(5));

test('Encore: the Defending Pokémon can use only the chosen attack next turn', () => {
  const b = lockDuel(ENCORE);
  const asked = attack(b);
  assert.deepEqual(optionNames(asked), ['Tackle', 'Big Hit']);
  const locked = choose(asked, [asked.state.pendingChoice.options.find((o) => o.name === 'Tackle').instanceId], b.rng);
  assert.equal(locked.state.turn.player, 'p2');
  assert.match(String(tryAttack(structuredClone(locked.state), 'p2', 1).error), /can use only Tackle/);
  assert.equal(tryAttack(structuredClone(locked.state), 'p2', 0).error, null);
});

test('Amnesia: the chosen attack is the one the Defending Pokémon cannot use', () => {
  const b = lockDuel(AMNESIA);
  const asked = attack(b);
  const locked = choose(asked, [asked.state.pendingChoice.options.find((o) => o.name === 'Big Hit').instanceId], b.rng);
  assert.match(String(tryAttack(structuredClone(locked.state), 'p2', 1).error), /can't use Big Hit/);
  assert.equal(tryAttack(structuredClone(locked.state), 'p2', 0).error, null);
});

test('Encore: one attack locks without a question; no attacks locks nothing', () => {
  const one = attack(lockDuel(ENCORE, { attacks: [twoAttacks[0]] }));
  assert.equal(one.state.pendingChoice, null);
  assert.ok(one.events.some((e) => e.type === 'attackMarkerAdded' && e.kind === 'attackLock'));
  const none = attack(lockDuel(ENCORE, { attacks: [] }));
  assert.ok(!none.events.some((e) => e.type === 'attackMarkerAdded'));
});

test('Encore: the lock ends when the locked Pokémon retreats', () => {
  const b = lockDuel(ENCORE);
  const asked = attack(b);
  const locked = choose(asked, [asked.state.pendingChoice.options.find((o) => o.name === 'Tackle').instanceId], b.rng);
  const bench = locked.state.players.p2.zones.bench.find((c) => c.name === 'Striker Bench');
  const retreated = run(locked.state, 'p2', 'retreat', { benchInstanceId: bench.instanceId }).state;
  const striker = retreated.players.p2.zones.bench.find((c) => c.name === 'Striker');
  assert.equal(striker.attackMarkers, undefined);
});

test('Unown T: each player loses the hand card the other picks, shuffled into their own deck', () => {
  const b = board(UNOWN_T, {
    name: 'Unown T',
    setup: ({ p1, p2 }) => {
      p1.zones.hand.push(mon('My Card A'), mon('My Card B'));
      p2.zones.hand.push(mon('Their Card A'), mon('Their Card B'));
    },
  });
  const pickTheirs = attack(b);
  assert.equal(pickTheirs.state.pendingChoice.player, 'p1');
  assert.deepEqual(optionNames(pickTheirs), ['Their Card A', 'Their Card B']);
  const theirId = pickTheirs.state.pendingChoice.options[1].instanceId;
  const pickMine = choose(pickTheirs, [theirId], b.rng);
  assert.equal(pickMine.state.pendingChoice.player, 'p2');
  assert.deepEqual(optionNames(pickMine), ['My Card A', 'My Card B']);
  const myId = pickMine.state.pendingChoice.options[0].instanceId;
  const res = choose(pickMine, [myId], b.rng);
  assert.ok(zone(res, 'p2', 'deck').some((c) => c.instanceId === theirId));
  assert.ok(zone(res, 'p1', 'deck').some((c) => c.instanceId === myId));
  assert.ok(!zone(res, 'p1', 'hand').some((c) => c.instanceId === myId));
});

test('Unown T: an empty opponent hand skips straight to their pick from yours', () => {
  const b = board(UNOWN_T, { setup: ({ p1 }) => p1.zones.hand.push(mon('Only Card')) });
  const asked = attack(b);
  assert.equal(asked.state.pendingChoice.player, 'p2');
  const res = choose(asked, [asked.state.pendingChoice.options[0].instanceId], b.rng);
  assert.ok(zone(res, 'p1', 'deck').some((c) => c.name === 'Only Card'));
  const bothEmpty = attack(board(UNOWN_T));
  assert.equal(bothEmpty.state.pendingChoice, null);
});

test('Mischievous Tentacles: shows the top card; Yes shuffles, No keeps the order', () => {
  const b = board(MISCHIEVOUS_TENTACLES, { name: 'Inkay' });
  const asked = attack(b);
  assert.match(asked.state.pendingChoice.prompt, /top card of your opponent's deck is p2 deck 0/);
  const before = zone(asked, 'p2', 'deck').map((c) => c.instanceId);
  const kept = choose(structuredClone(asked), [asked.state.pendingChoice.options.find((o) => o.name === 'No').instanceId], b.rng);
  // p2 draws its top card as its turn starts.
  assert.deepEqual(zone(kept, 'p2', 'deck').map((c) => c.instanceId), before.slice(1));
  const shuffled = choose(asked, [asked.state.pendingChoice.options.find((o) => o.name === 'Yes').instanceId], b.rng);
  assert.ok(shuffled.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
});

test('Fortunate Eye: the top 5 go back in the picked order', () => {
  const b = board(FORTUNATE_EYE, { name: 'Gothorita' });
  let res = attack(b);
  const wanted = ['p2 deck 4', 'p2 deck 2', 'p2 deck 0', 'p2 deck 3'];
  for (const name of wanted) {
    assert.match(res.state.pendingChoice.prompt, /from the top of your opponent's deck/);
    res = choose(res, [res.state.pendingChoice.options.find((o) => o.name === name).instanceId], b.rng);
  }
  assert.equal(res.state.pendingChoice, null);
  // p2 draws the new top card as its turn starts.
  assert.ok(zone(res, 'p2', 'hand').some((c) => c.name === wanted[0]));
  assert.deepEqual(zone(res, 'p2', 'deck').slice(0, 4).map((c) => c.name), [...wanted.slice(1), 'p2 deck 1']);
});

test('Fortunate Eye: a 2-card deck needs one pick; an empty deck skips', () => {
  const short = board(FORTUNATE_EYE, { setup: ({ p2 }) => p2.zones.deck.splice(2) });
  const asked = attack(short);
  assert.equal(asked.state.pendingChoice.options.length, 2);
  const res = choose(asked, [asked.state.pendingChoice.options[1].instanceId], short.rng);
  assert.ok(zone(res, 'p2', 'hand').some((c) => c.name === 'p2 deck 1'), 'the picked card went on top');
  assert.deepEqual(zone(res, 'p2', 'deck').map((c) => c.name), ['p2 deck 0']);
  const empty = attack(board(FORTUNATE_EYE, { setup: ({ p2 }) => p2.zones.deck.splice(0) }));
  assert.equal(empty.state.pendingChoice, null);
});
