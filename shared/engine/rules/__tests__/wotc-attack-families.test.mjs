// I227: WotC attack families that parsed to no steps (audit 062 Appendix A–B).
// Card text: out/pkmn-wotc-cards.json (pkmncards rows cited per case). Where a modern printing
// says the same thing, the WotC parse must deep-equal the modern parse (D202).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackSteps } from '../attack-steps.mjs';
import { parseNextTurnLock } from '../attack-effects.mjs';
import { parseAttackDamage } from '../damage-parser.mjs';
import { computeAttackDamage } from '../attack-engine.mjs';
import { ATTACK_YES, ATTACK_NO } from '../../effects/attack-steps.mjs';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { applyCommand } from '../../reduce.mjs';

const steps = (text, selfName) => {
  const { before, after } = parseAttackSteps(text, { selfName });
  return [...before, ...after];
};
const marker = (target, window, m, extra = {}) => [{ type: 'atkAddMarker', target, window, marker: m, ...extra }];

const sameAsModern = (wotc, wotcSelf, modern, modernSelf = 'Zed') => {
  const old = steps(wotc, wotcSelf);
  assert.ok(old.length > 0, `no steps: ${wotc}`);
  assert.deepEqual(old, steps(modern, modernSelf));
};

/** p1 Active `mine` against p2 Active `theirs`, 6 Prizes and 6 deck cards each. */
function duelBoard(mine, theirs, { p1Bench = [], p2Bench = [] } = {}) {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const pokemon = (props) =>
    createCard({ supertype: 'Pokémon', type: 'Pokémon', types: ['Colorless'], enteredPlayTurn: 1, ...props });
  state.players.p1.zones.active.push(pokemon(mine));
  state.players.p2.zones.active.push(pokemon(theirs));
  for (const props of p1Bench) state.players.p1.zones.bench.push(pokemon(props));
  for (const props of p2Bench) state.players.p2.zones.bench.push(pokemon(props));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

/** `playerId` uses `attackIndex` on turn `turnNumber` with fresh turn flags. */
function attackOnTurn(state, playerId, turnNumber, attackIndex, seed = 1) {
  state.turn = { player: playerId, number: turnNumber, phase: 'main' };
  state.players[playerId].flags = {};
  const result = applyCommand(state, { type: 'attack', payload: { attackIndex }, playerId }, createRng(seed));
  assert.ok(!result.error, result.error);
  return result;
}

const damageOn = (state, playerId, instanceId) =>
  [...state.players[playerId].zones.active, ...state.players[playerId].zones.bench].find((c) => c.instanceId === instanceId)
    ?.damage || 0;

// ── exact modern equivalents ────────────────────────────────────────────────────────────────

// Lt. Surge's Electabuzz [Gym Heroes 6] Charge ≡ Morpeko V-UNION [Sword & Shield Promos SWSH290]
// Union Gain; Lt. Surge's Pikachu [Gym Heroes 81] Charge ≡ Shadow Rider Calyrex V [Sword & Shield
// Promos SWSH131] Cloak in Shadows.
test('Charge ≡ attach from the discard pile to this Pokémon', () => {
  sameAsModern(
    "Take up to 2 {L} Energy cards from your discard pile and attach them to Lt. Surge's Electabuzz.",
    "Lt. Surge's Electabuzz",
    'Attach up to 2 {L} Energy cards from your discard pile to this Pokémon.'
  );
  sameAsModern(
    "Take 1 {L} Energy card from your discard pile and attach it to Lt. Surge's Pikachu.",
    "Lt. Surge's Pikachu",
    'Attach a {L} Energy card from your discard pile to this Pokémon.'
  );
});

// Xatu [Neo Genesis 52] Prophecy ≡ Absol ex [Obsidian Flames 214] Future Sight.
test('Xatu Prophecy ≡ Future Sight', () => {
  sameAsModern(
    "Look at the top 3 cards of either player's deck and rearrange them as you like.",
    'Xatu',
    "Look at the top 3 cards of either player's deck and put them back in any order."
  );
});

// Sabrina's Kadabra [Gym Challenge 58] Life Drain ≡ Shedinja [Vivid Voltage 066] Life Squeeze
// behind the printed coin.
test('Life Drain ≡ heads-gated Life Squeeze', () => {
  sameAsModern(
    'Flip a coin. If heads, put a number of damage counters on the Defending Pokémon so that its remaining HP are 10.',
    "Sabrina's Kadabra",
    "Flip a coin. If heads, put damage counters on your opponent's Active Pokémon until its remaining HP is 10."
  );
});

// Togepi [Neo Destiny 56] Charm ≡ Absol-EX [XY Promos XY62] wording (20 there, 10 here).
test('Togepi Charm ≡ "any damage done by attacks from the Defending Pokémon is reduced"', () => {
  sameAsModern(
    "If the Defending Pokémon attacks during your opponent's next turn, any damage it does is reduced by 10 (before applying Weakness and Resistance).",
    'Togepi',
    "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by 10 (before applying Weakness and Resistance)."
  );
});

// Hypno [Fossil 8] Prophecy: "up to 3" — the player picks how many to look at.
const HYPNO_PROPHECY = "Look at up to 3 cards from the top of either player's deck and rearrange them as you like.";

test('Hypno Prophecy → atkLookDeckReorder up to 3, either deck', () => {
  assert.deepEqual(steps(HYPNO_PROPHECY, 'Hypno'), [{ type: 'atkLookDeckReorder', count: 3, side: 'either', upTo: true }]);
});

const resolve = (result, selection) => {
  const choice = result.state.pendingChoice;
  assert.ok(choice, 'expected a pending choice');
  const next = applyCommand(result.state, { type: 'resolveChoice', playerId: choice.player, payload: { choiceId: choice.choiceId, selection } }, createRng(1));
  assert.ok(!next.error, next.error);
  return next;
};

test('runtime: Hypno Prophecy looks at the 2 cards chosen and reorders only those', () => {
  const hypno = { instanceId: 1, name: 'Hypno', hp: 90, attacks: [{ name: 'Prophecy', cost: [], damage: '', text: HYPNO_PROPHECY }] };
  const used = attackOnTurn(duelBoard(hypno, FOE), 'p1', 2, 0);
  const sideAsked = used.state.pendingChoice.options.map((o) => o.instanceId);
  assert.deepEqual(sideAsked, [ATTACK_YES, ATTACK_NO]);
  const countAsked = resolve(used, [ATTACK_NO]);
  assert.deepEqual(countAsked.state.pendingChoice.options.map((o) => o.instanceId), [0, 1, 2, 3]);
  const orderAsked = resolve(countAsked, [2]);
  assert.deepEqual(orderAsked.state.pendingChoice.options.map((o) => o.instanceId), [2050, 2051]);
  const done = resolve(orderAsked, [2051]);
  // The new top card (2051) is the one p2 draws as its turn starts.
  assert.ok(done.state.players.p2.zones.hand.some((c) => c.instanceId === 2051));
  assert.deepEqual(done.state.players.p2.zones.deck.slice(0, 2).map((c) => c.instanceId), [2050, 2052]);
});

// ── Focus Energy ────────────────────────────────────────────────────────────────────────────

// Lt. Surge's Rattata [Gym Heroes 82] / [Gym Challenge 85]: "Lt." is not a sentence end, so the
// possessive name reads like the "this Pokémon's" wording.
test("Lt. Surge's Rattata Focus Energy → nextTurnBaseDamage doubled", () => {
  sameAsModern(
    "During your next turn, Lt. Surge's Rattata's Gnaw attack's base damage is doubled.",
    "Lt. Surge's Rattata",
    "During your next turn, this Pokémon's Gnaw attack's base damage is doubled."
  );
  assert.deepEqual(
    steps("During your next turn, Lt. Surge's Rattata's Quick Attack's base damage is doubled.", "Lt. Surge's Rattata"),
    marker('self', 'yourNextTurn', { kind: 'nextTurnBaseDamage', attackName: 'quick', doubled: true })
  );
});

// Lt. Surge's Raticate [Gym Challenge 53] Focus Energy / Double-edge.
const RATICATE_FOCUS =
  "During your next turn, Lt. Surge's Raticate's Double-edge attack's damage (base damage and damage to itself) is doubled.";
const RATICATE_DOUBLE_EDGE = "Lt. Surge's Raticate does 20 damage to itself.";

test("Lt. Surge's Raticate Focus Energy → doubled base and recoil", () => {
  assert.deepEqual(
    steps(RATICATE_FOCUS, "Lt. Surge's Raticate"),
    marker('self', 'yourNextTurn', {
      kind: 'nextTurnBaseDamage',
      attackName: 'double-edge',
      doubled: true,
      selfDamageDoubled: true,
    })
  );
});

test("runtime: Lt. Surge's Raticate Double-edge after Focus Energy does 80, and 40 to itself", () => {
  const raticate = {
    instanceId: 1,
    name: "Lt. Surge's Raticate",
    hp: 100,
    attacks: [
      { name: 'Focus Energy', cost: [], damage: '', text: RATICATE_FOCUS },
      { name: 'Double-edge', cost: [], damage: '40', text: RATICATE_DOUBLE_EDGE },
    ],
  };
  const foe = { instanceId: 20, name: 'Foe', hp: 200, attacks: [{ name: 'Wait', cost: [], damage: '', text: '' }] };
  const focused = attackOnTurn(duelBoard(raticate, foe), 'p1', 2, 0);
  const waited = attackOnTurn(focused.state, 'p2', 3, 0);
  const hit = attackOnTurn(waited.state, 'p1', 4, 1).state;
  assert.equal(damageOn(hit, 'p2', 20), 80);
  assert.equal(damageOn(hit, 'p1', 1), 40);
  const plain = attackOnTurn(duelBoard(raticate, foe), 'p1', 2, 1).state;
  assert.equal(damageOn(plain, 'p2', 20), 40);
  assert.equal(damageOn(plain, 'p1', 1), 20);
});

// ── Scary Face ──────────────────────────────────────────────────────────────────────────────

// Spinarak [Neo Genesis 75] Scary Face.
const SCARY_FACE =
  "Flip a coin. If heads, until the end of your opponent's next turn, the Defending Pokémon can't attack or retreat.";

test('Scary Face → attack and retreat lock on heads only', () => {
  const attack = { name: 'Scary Face', text: SCARY_FACE };
  assert.deepEqual(parseNextTurnLock(attack, { coin: 'heads' }), {
    selfCannotAttack: false,
    selfCannotUseAttack: null,
    oppCannotRetreat: true,
    oppCannotAttack: true,
  });
  assert.equal(parseNextTurnLock(attack, { coin: 'tails' }), null);
});

/** First seed in 1..60 whose single coin for `playerId`'s attack shows `face`. */
function attackWithCoin(state, playerId, turnNumber, attackIndex, face) {
  for (let seed = 1; seed <= 60; seed += 1) {
    const result = attackOnTurn(structuredClone(state), playerId, turnNumber, attackIndex, seed);
    if (result.events.find((e) => e.type === 'attackCoinFlipped')?.coin === face) return result;
  }
  assert.fail(`no ${face} seed in 1..60`);
}

test('runtime: Scary Face heads stops the Defending Pokémon attacking and retreating next turn', () => {
  const spinarak = { instanceId: 1, name: 'Spinarak', hp: 40, attacks: [{ name: 'Scary Face', cost: [], damage: '', text: SCARY_FACE }] };
  const foe = { instanceId: 20, name: 'Foe', hp: 100, retreatCost: [], attacks: [{ name: 'Hit', cost: [], damage: '10', text: '' }] };
  const heads = attackWithCoin(duelBoard(spinarak, foe, { p2Bench: [{ instanceId: 21, name: 'Spare', hp: 60 }] }), 'p1', 2, 0, 'heads');
  const next = heads.state;
  next.turn = { player: 'p2', number: 3, phase: 'main' };
  next.players.p2.flags = {};
  assert.ok(applyCommand(structuredClone(next), { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, createRng(1)).error);
  assert.ok(applyCommand(structuredClone(next), { type: 'retreat', payload: { benchInstanceId: 21 }, playerId: 'p2' }, createRng(1)).error);
});

// ── half the Defending Pokémon's remaining HP ───────────────────────────────────────────────

const SUPER_FANG = // Raticate [Base Set 40] Super Fang : ?
  "Does damage to the Defending Pokémon equal to half the Defending Pokémon's remaining HP (rounded up to the nearest 10).";
const FALSE_SWIPE = // Scizor [Neo Discovery 10] False Swipe : ?
  "Does damage equal to half the Defending Pokémon's remaining HP (rounded down to the nearest 10).";

test('Super Fang / False Swipe damage: half the remaining HP, rounded as printed', () => {
  const remaining70 = { defenderRemainingHp: 70 };
  assert.equal(parseAttackDamage({ damage: '?', text: SUPER_FANG }, { name: 'Raticate' }, {}, remaining70).total, 40);
  assert.equal(parseAttackDamage({ damage: '?', text: FALSE_SWIPE }, { name: 'Scizor' }, {}, remaining70).total, 30);
  assert.equal(parseAttackDamage({ damage: '?', text: FALSE_SWIPE }, { name: 'Scizor' }, {}, { defenderRemainingHp: 10 }).total, 0);
  const unknown = parseAttackDamage({ damage: '?', text: SUPER_FANG }, { name: 'Raticate' }, {}, {});
  assert.equal(unknown.total, 0);
  assert.match(unknown.notes.join(' '), /resolve the printed/);
});

test('runtime: Super Fang on a 90-HP Pokémon with 20 damage does 40; False Swipe does 30', () => {
  const foe = { ...FOE, hp: 90, damage: 20 };
  const raticate = { instanceId: 1, name: 'Raticate', hp: 60, attacks: [{ name: 'Super Fang', cost: [], damage: '?', text: SUPER_FANG }] };
  assert.equal(damageOn(attackOnTurn(duelBoard(raticate, foe), 'p1', 2, 0).state, 'p2', 20), 60);
  const scizor = { instanceId: 1, name: 'Scizor', hp: 80, attacks: [{ name: 'False Swipe', cost: [], damage: '?', text: FALSE_SWIPE }] };
  assert.equal(damageOn(attackOnTurn(duelBoard(scizor, foe), 'p1', 2, 0).state, 'p2', 20), 50);
});

// ── Snivel / Growl ──────────────────────────────────────────────────────────────────────────

const SNIVEL = // Cubone [Jungle 50] Snivel
  "If the Defending Pokémon attacks Cubone during your opponent's next turn, any damage done by the attack is reduced by 20 (after applying Weakness and Resistance). (Benching either Pokémon ends this effect.)";
const GROWL = // Chikorita [Neo Genesis 54] Growl
  "If the Defending Pokémon attacks Chikorita during your opponent's next turn, any damage done to Chikorita is reduced by 10 (before applying Weakness and Resistance). (Benching or evolving either Pokémon ends this effect.)";

test('Snivel / Growl → presence-scoped outgoingReduce on the Defending Pokémon', () => {
  assert.deepEqual(
    steps(SNIVEL, 'Cubone'),
    marker('opponentActive', 'opponentNextTurn', { kind: 'outgoingReduce', amount: 20, afterWR: true, whileSourceActive: true })
  );
  assert.deepEqual(
    steps(GROWL, 'Chikorita'),
    marker('opponentActive', 'opponentNextTurn', {
      kind: 'outgoingReduce',
      amount: 10,
      afterWR: false,
      whileSourceActive: true,
      toSource: true,
    })
  );
});

test("Growl's reduction reaches only the Pokémon that set it", () => {
  const growl = { kind: 'outgoingReduce', amount: 10, afterWR: false, toSource: true, sourceId: 1 };
  const attacker = { instanceId: 20, name: 'Foe', types: ['Colorless'] };
  const hit = (defenderId) =>
    computeAttackDamage(attacker, { instanceId: defenderId, name: 'Target', hp: 100, types: ['Grass'] }, { name: 'Hit', damage: '40' }, {
      attackerMarkers: [growl],
    }).total;
  assert.equal(hit(1), 30);
  assert.equal(hit(2), 40);
});

test('runtime: Snivel and Growl cut the next attack on them, not after they leave the Active Spot', () => {
  const foe = { ...FOE, attacks: [{ name: 'Hit', cost: [], damage: '40', text: '' }] };
  const cubone = { instanceId: 1, name: 'Cubone', hp: 70, attacks: [{ name: 'Snivel', cost: [], damage: '', text: SNIVEL }] };
  const snivelled = attackOnTurn(duelBoard(cubone, foe, { p1Bench: [MY_SPARE] }), 'p1', 2, 0).state;
  assert.equal(damageOn(attackOnTurn(structuredClone(snivelled), 'p2', 3, 0).state, 'p1', 1), 20);
  assert.equal(damageOn(attackOnTurn(benchP1Active(snivelled), 'p2', 3, 0).state, 'p1', 2), 40);
  const chikorita = { instanceId: 1, name: 'Chikorita', hp: 50, attacks: [{ name: 'Growl', cost: [], damage: '', text: GROWL }] };
  const growled = attackOnTurn(duelBoard(chikorita, foe), 'p1', 2, 0).state;
  assert.equal(damageOn(attackOnTurn(growled, 'p2', 3, 0).state, 'p1', 1), 30);
});

// ── Pulse Guard / Deflector ─────────────────────────────────────────────────────────────────

const PULSE_GUARD = // Light Jolteon [Neo Destiny 48] Pulse Guard
  "During your opponent's next turn, whenever 30 or more damage is done to Light Jolteon (after applying Weakness and Resistance), prevent that damage. (Any other effects of attacks still happen.)";
const DEFLECTOR = // Chikorita [Neo Genesis 53] Deflector (Erika's Exeggcute [Gym Heroes 43] prints the same)
  "During your opponent's next turn, whenever Chikorita takes damage, divide that damage in half (rounded down to the nearest 10). (Any other effects still happen.)";

test('Pulse Guard → incomingPrevent minDamage 30; Deflector → incomingHalve', () => {
  assert.deepEqual(
    steps(PULSE_GUARD, 'Light Jolteon'),
    marker('self', 'opponentNextTurn', { kind: 'incomingPrevent', filter: null, minDamage: 30 })
  );
  const halve = marker('self', 'opponentNextTurn', { kind: 'incomingHalve' });
  assert.deepEqual(steps(DEFLECTOR, 'Chikorita'), halve);
  assert.deepEqual(steps(DEFLECTOR.replace('Chikorita', "Erika's Exeggcute"), "Erika's Exeggcute"), halve);
});

/** Damage `mine` takes from a `hit`-damage attack on the turn after it used attack 0. */
function hitAfterGuard(mine, hit) {
  const foe = { ...FOE, attacks: [{ name: 'Hit', cost: [], damage: String(hit), text: '' }] };
  const guarded = attackOnTurn(duelBoard(mine, foe), 'p1', 2, 0).state;
  return damageOn(attackOnTurn(guarded, 'p2', 3, 0).state, 'p1', mine.instanceId);
}

test('runtime: Pulse Guard stops a 40 hit but not a 20; Deflector halves 50 to 20', () => {
  const jolteon = { instanceId: 1, name: 'Light Jolteon', hp: 70, attacks: [{ name: 'Pulse Guard', cost: [], damage: '', text: PULSE_GUARD }] };
  assert.equal(hitAfterGuard(jolteon, 40), 0);
  assert.equal(hitAfterGuard(jolteon, 20), 20);
  const chikorita = { instanceId: 1, name: 'Chikorita', hp: 100, attacks: [{ name: 'Deflector', cost: [], damage: '', text: DEFLECTOR }] };
  assert.equal(hitAfterGuard(chikorita, 50), 20);
  assert.equal(hitAfterGuard(chikorita, 40), 20);
});

// ── Fidget / Vanish ─────────────────────────────────────────────────────────────────────────

const FIDGET = 'Shuffle your deck.'; // Brock's Mankey [Gym Heroes 68] Fidget
const VANISH = 'Shuffle Abra into your deck. (Discard all cards attached to Abra.)'; // Abra [Team Rocket 49] Vanish

test('Fidget → own deck shuffle only as the whole effect; Vanish → shuffle self, discard attached', () => {
  assert.deepEqual(steps(FIDGET, "Brock's Mankey"), [{ type: 'atkShuffleOwnDeck' }]);
  // The same sentence after a search is that search's own shuffle (Banette [Pitch Black 034] Puppet Pull).
  assert.deepEqual(steps('You may search your deck for a card and put it into your hand. Then, shuffle your deck.', 'Banette'), []);
  assert.deepEqual(steps(VANISH, 'Abra'), [{ type: 'atkPutSelf', to: 'deck', attached: 'discard' }]);
});

test('runtime: Fidget shuffles the attacker’s deck', () => {
  const mankey = { instanceId: 1, name: "Brock's Mankey", hp: 40, attacks: [{ name: 'Fidget', cost: [], damage: '', text: FIDGET }] };
  const { events } = attackOnTurn(duelBoard(mankey, FOE), 'p1', 2, 0);
  assert.ok(events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('runtime: Vanish shuffles Abra into the deck and discards its Energy', () => {
  const abra = { instanceId: 1, name: 'Abra', hp: 30, attacks: [{ name: 'Vanish', cost: [], damage: '', text: VANISH }] };
  const board = duelBoard(abra, FOE, { p1Bench: [MY_SPARE] });
  board.players.p1.zones.active.push(createCard({ instanceId: 5, name: 'Psychic Energy', supertype: 'Energy', type: 'Energy', attachedTo: 1 }));
  const after = attackOnTurn(board, 'p1', 2, 0).state.players.p1.zones;
  assert.ok(after.deck.some((c) => c.instanceId === 1));
  assert.ok(after.discard.some((c) => c.instanceId === 5));
  assert.ok(![...after.active, ...after.bench].some((c) => c.instanceId === 1 || c.instanceId === 5));
});

// ── Terrorize ───────────────────────────────────────────────────────────────────────────────

const TERRORIZE = // Stantler [Neo Revelation 38] Terrorize
  "If the Defending Pokémon is a Basic Pokémon, choose 1 of its attacks. That Pokémon can't use that attack during your opponent's next turn.";

test('Terrorize → Amnesia lock gated on a Basic Defending Pokémon', () => {
  assert.deepEqual(steps(TERRORIZE, 'Stantler'), [{ type: 'atkLockAttack', mode: 'except', basicOnly: true }]);
});

test('runtime: Terrorize locks the chosen attack of a Basic, and nothing of a Stage 1', () => {
  const stantler = { instanceId: 1, name: 'Stantler', hp: 70, attacks: [{ name: 'Terrorize', cost: [], damage: '', text: TERRORIZE }] };
  const twoAttacks = [
    { name: 'Hit', cost: [], damage: '10', text: '' },
    { name: 'Bash', cost: [], damage: '20', text: '' },
  ];
  const asked = attackOnTurn(duelBoard(stantler, { ...FOE, stage: 'Basic', attacks: twoAttacks }), 'p1', 2, 0);
  const locked = resolve(asked, [1]).state;
  assert.match(tryOn(locked, 'p2', 3, ATTACK), /can't use Hit/);
  assert.equal(tryOn(locked, 'p2', 3, { type: 'attack', payload: { attackIndex: 1 } }), null);
  const evolved = attackOnTurn(duelBoard(stantler, { ...FOE, stage: 'Stage 1', evolvesFrom: 'Foe Jr', attacks: twoAttacks }), 'p1', 2, 0);
  assert.equal(evolved.state.pendingChoice, null);
  assert.equal(tryOn(evolved.state, 'p2', 3, ATTACK), null);
});

// ── presence-scoped and windowless locks ────────────────────────────────────────────────────

const TAIL_WAG = // Eevee [Jungle 51] Tail Wag
  "Flip a coin. If heads, the Defending Pokémon can't attack Eevee during your opponent's next turn. (Benching either Pokémon ends this effect.)";
const LEER = // Cyndaquil [Neo Genesis 56] Leer
  "Flip a coin. If heads, the Defending Pokémon can't attack Cyndaquil during your opponent's next turn. (Benching or evolving either Pokémon ends this effect.)";
const INTIMIDATE = // Giovanni's Nidoking [Gym Challenge 7] Intimidate
  "If the Defending Pokémon's maximum HP is 50 or less, it can't attack Giovanni's Nidoking during your opponent's next turn. (Benching or evolving either Pokémon ends this effect.)";
const MEAN_LOOK = // Murkrow [Neo Genesis 24] Mean Look
  "The Defending Pokémon can't retreat as long as Murkrow remains your Active Pokémon. (Benching or evolving either Pokémon ends this effect.)";
const SPIDER_WEB = // Ariados [Neo Genesis 27] Spider Web
  "Flip a coin. If heads, the Defending Pokémon can't retreat. (Benching or evolving that Pokémon ends this effect.)";
const FREEZE = // Piloswine [Neo Genesis 44] Freeze
  "Flip a coin. If heads, the Defending Pokémon can't attack. (Benching or evolving the Defending Pokémon ends this effect.)";

test('lock wordings → cantAttack / cantRetreat markers', () => {
  const cantAttackSelf = marker('opponentActive', 'opponentNextTurn', { kind: 'cantAttack', whileSourceActive: true }, { gate: 'heads' });
  assert.deepEqual(steps(TAIL_WAG, 'Eevee'), cantAttackSelf);
  assert.deepEqual(steps(LEER, 'Cyndaquil'), cantAttackSelf);
  // Rhyhorn [Jungle 61] / Totodile [Neo Genesis 81] Leer differ only by name.
  assert.deepEqual(steps(LEER.replace('Cyndaquil', 'Totodile'), 'Totodile'), cantAttackSelf);
  assert.deepEqual(
    steps(INTIMIDATE, "Giovanni's Nidoking"),
    marker('opponentActive', 'opponentNextTurn', { kind: 'cantAttack', whileSourceActive: true }, { defenderMaxHpAtMost: 50 })
  );
  assert.deepEqual(
    steps(MEAN_LOOK, 'Murkrow'),
    marker('opponentActive', 'whileActive', { kind: 'cantRetreat', whileSourceActive: true })
  );
  assert.deepEqual(steps(SPIDER_WEB, 'Ariados'), marker('opponentActive', 'whileActive', { kind: 'cantRetreat' }, { gate: 'heads' }));
  assert.deepEqual(steps(FREEZE, 'Piloswine'), marker('opponentActive', 'whileActive', { kind: 'cantAttack' }, { gate: 'heads' }));
});

const FOE = { instanceId: 20, name: 'Foe', hp: 100, retreatCost: [], attacks: [{ name: 'Hit', cost: [], damage: '10', text: '' }] };
const SPARE = { instanceId: 21, name: 'Spare', hp: 60 };
const MY_SPARE = { instanceId: 2, name: 'Backup', hp: 60 };

/** Error (or null) of `command` for `playerId` on turn `turnNumber`, leaving `state` untouched. */
function tryOn(state, playerId, turnNumber, command) {
  const copy = structuredClone(state);
  copy.turn = { player: playerId, number: turnNumber, phase: 'main' };
  copy.players[playerId].flags = {};
  return applyCommand(copy, { ...command, playerId }, createRng(1)).error || null;
}
const ATTACK = { type: 'attack', payload: { attackIndex: 0 } };
const RETREAT = { type: 'retreat', payload: { benchInstanceId: 21 } };

/** p1's Active and Bench trade places (the source of a presence-scoped lock leaves the Active Spot). */
function benchP1Active(state) {
  const copy = structuredClone(state);
  const { active, bench } = copy.players.p1.zones;
  copy.players.p1.zones.active = bench.splice(0, 1);
  bench.push(...active);
  return copy;
}

test('runtime: Leer heads stops the Defending Pokémon attacking only while Cyndaquil stays Active', () => {
  const cyndaquil = { instanceId: 1, name: 'Cyndaquil', hp: 50, attacks: [{ name: 'Leer', cost: [], damage: '', text: LEER }] };
  const board = duelBoard(cyndaquil, FOE, { p1Bench: [MY_SPARE], p2Bench: [SPARE] });
  const locked = attackWithCoin(board, 'p1', 2, 0, 'heads').state;
  assert.match(tryOn(locked, 'p2', 3, ATTACK), /can't attack/);
  assert.equal(tryOn(benchP1Active(locked), 'p2', 3, ATTACK), null);
  assert.equal(tryOn(locked, 'p2', 5, ATTACK), null);
  assert.equal(tryOn(attackWithCoin(board, 'p1', 2, 0, 'tails').state, 'p2', 3, ATTACK), null);
});

test('runtime: Intimidate locks a Defending Pokémon with 50 maximum HP, not one with 60', () => {
  const nidoking = { instanceId: 1, name: "Giovanni's Nidoking", hp: 90, attacks: [{ name: 'Intimidate', cost: [], damage: '', text: INTIMIDATE }] };
  const small = attackOnTurn(duelBoard(nidoking, { ...FOE, hp: 50 }), 'p1', 2, 0).state;
  assert.match(tryOn(small, 'p2', 3, ATTACK), /can't attack/);
  const big = attackOnTurn(duelBoard(nidoking, { ...FOE, hp: 60 }), 'p1', 2, 0).state;
  assert.equal(tryOn(big, 'p2', 3, ATTACK), null);
});

test('runtime: Mean Look stops retreat on every later turn while Murkrow stays Active', () => {
  const murkrow = { instanceId: 1, name: 'Murkrow', hp: 50, attacks: [{ name: 'Mean Look', cost: [], damage: '', text: MEAN_LOOK }] };
  const looked = attackOnTurn(duelBoard(murkrow, FOE, { p1Bench: [MY_SPARE], p2Bench: [SPARE] }), 'p1', 2, 0).state;
  assert.match(tryOn(looked, 'p2', 3, RETREAT), /can't retreat/);
  assert.match(tryOn(looked, 'p2', 5, RETREAT), /can't retreat/);
  assert.equal(tryOn(benchP1Active(looked), 'p2', 3, RETREAT), null);
});

test('runtime: Spider Web and Freeze heads last past the next turn', () => {
  const ariados = { instanceId: 1, name: 'Ariados', hp: 70, attacks: [{ name: 'Spider Web', cost: [], damage: '', text: SPIDER_WEB }] };
  const webbed = attackWithCoin(duelBoard(ariados, FOE, { p1Bench: [MY_SPARE], p2Bench: [SPARE] }), 'p1', 2, 0, 'heads').state;
  assert.match(tryOn(webbed, 'p2', 5, RETREAT), /can't retreat/);
  // Not presence-scoped: Ariados leaving the Active Spot does not end it.
  assert.match(tryOn(benchP1Active(webbed), 'p2', 3, RETREAT), /can't retreat/);
  const piloswine = { instanceId: 1, name: 'Piloswine', hp: 80, attacks: [{ name: 'Freeze', cost: [], damage: '10', text: FREEZE }] };
  const frozen = attackWithCoin(duelBoard(piloswine, FOE, { p2Bench: [SPARE] }), 'p1', 2, 0, 'heads').state;
  assert.match(tryOn(frozen, 'p2', 5, ATTACK), /can't attack/);
  // Benching the Defending Pokémon ends it.
  const retreated = applyCommand(
    { ...structuredClone(frozen), turn: { player: 'p2', number: 3, phase: 'main' } },
    { type: 'retreat', payload: { benchInstanceId: 21 }, playerId: 'p2' },
    createRng(1)
  );
  assert.ok(!retreated.error, retreated.error);
  const back = applyCommand(
    { ...retreated.state, turn: { player: 'p2', number: 5, phase: 'main' }, players: { ...retreated.state.players, p2: { ...retreated.state.players.p2, flags: {} } } },
    { type: 'retreat', payload: { benchInstanceId: 20 }, playerId: 'p2' },
    createRng(1)
  );
  assert.ok(!back.error, back.error);
  assert.equal(tryOn(back.state, 'p2', 5, ATTACK), null);
});
