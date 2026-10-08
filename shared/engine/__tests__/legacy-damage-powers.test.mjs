// Design 062 tranche 2 (I229): WotC Pokémon Powers that change attack damage after Weakness and
// Resistance. Power texts are inlined from out/pkmn-wotc-cards.json (pkmncards rows cited).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseLegacyDamageModifier, applyLegacyDamageModifier } from '../rules/legacy-power-wording.mjs';
import { cardAbilityText, parseDamagePrevention, parseDamageReduction } from '../rules/ability-executors.mjs';
import { abilityDamagePrevention } from '../rules/ability-combat.mjs';

// Mr. Mime [Jungle 6] Invisible Wall
const INVISIBLE_WALL =
  "Whenever an attack (including your own) does 30 or more damage to Mr. Mime (after applying Weakness and Resistance), prevent that damage. (Any other effects of attacks still happen.) This power can't be used if Mr. Mime is Asleep, Confused, or Paralyzed.";
// Kabuto [Fossil 50] Kabuto Armor
const KABUTO_ARMOR =
  'Whenever an attack (even your own) does damage to Kabuto (after applying Weakness and Resistance), that attack does half the damage to Kabuto (rounded down to the nearest 10). (Any other effects of attacks still happen.) This power stops working while Kabuto is Asleep, Confused, or Paralyzed.';
// Kabuto [Legendary Collection 48] Kabuto Armor
const KABUTO_ARMOR_LC =
  'Whenever an attack (even your own) does damage to Kabuto (after applying Weakness and Resistance), that attack does only half the damage to Kabuto (rounded down to the nearest 10). (Any other effects of attacks still happen.) This power stops working while Kabuto is affected by a Special Condition.';
// Shuckle [Neo Revelation 51] Hard Shell
const HARD_SHELL =
  'Whenever an attack (including your own) does 40 or less damage to Shuckle (after applying Weakness and Resistance), reduce that damage to 10. (Any other effects of attacks still happen.) This power stops working while Shuckle is Asleep, Confused, or Paralyzed.';
// Erika's Dratini [Gym Heroes 42] Strange Barrier
const STRANGE_BARRIER =
  "Whenever an attack by a Basic Pokémon (including your own) does 20 or more damage to Erika's Dratini (after applying Weakness and Resistance), reduce that damage to 10. (Any other effects of attacks still happen.) This power stops working while Erika's Dratini is Asleep, Confused, or Paralyzed.";
// Erika's Ivysaur [Gym Challenge 41] Relaxing Scent
const RELAXING_SCENT =
  "As long as Erika's Ivysaur is your Active Pokémon, whenever an attack (even your own) does damage to any Pokémon (after applying Weakness and Resistance), that attack only does half the damage to that Pokémon (rounded up to the nearest 10). (Any other effects of attacks still happen.) This power stops working while Erika's Ivysaur is Asleep, Confused, or Paralyzed.";
// Unown D [Neo Discovery 47] [Darkness]
const UNOWN_D =
  'Whenever a {D} Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1 Unown D in play. (This power works even if Unown D is Asleep, Confused, or Paralyzed.)';
// Unown N [Neo Discovery 50] [Normal]
const UNOWN_N =
  'Whenever a {C} Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1 Unown N in play. (This power works even if Unown N is Asleep, Confused, or Paralyzed.)';
// Misty's Cloyster [Gym Heroes 29] Shell Armor
const SHELL_ARMOR =
  "You may reduce all damage done by attacks to Misty's Cloyster by 10 (after applying Weakness and Resistance). (Any other effects of attacks still happen). This power can't be used if Misty's Cloyster is Asleep, Confused, or Paralyzed.";
// Muk [Fossil 13] Toxic Gas
const TOXIC_GAS =
  'Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is Asleep, Confused, or Paralyzed.';

const power = (name, text) => ({ name, type: 'Pokémon Power', text });
const pokemon = (extra) => createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });
const holderText = (name, text) => cardAbilityText({ name, abilities: [{ text }] });

function setupGame() {
  const state = createGameState({ gameId: 'legacy-damage', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

// p1's attacker hits p2's Active `defender` once; returns the damage on each side afterwards.
function hit(defender, { damage = '50', attacker = {}, text = '', p1Bench = [], p2Bench = [] } = {}) {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', types: ['Colorless'], attacks: [{ name: 'Hit', cost: [], damage, text }], ...attacker })
  );
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(...p2Bench);
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  return {
    defender: res.state.players.p2.zones.active[0]?.damage || 0,
    attacker: res.state.players.p1.zones.active[0]?.damage || 0,
    p2Bench: res.state.players.p2.zones.bench.map((c) => c.damage || 0),
    events: res.events,
  };
}

// ── parse ─────────────────────────────────────────────────────────────────

test('legacy damage: each wording parses to its modifier and leaves the flat readers alone', () => {
  const cases = [
    ['Mr. Mime', INVISIBLE_WALL, { kind: 'preventAtLeast', min: 30, subject: 'mr. mime', scope: 'self' }],
    ['Kabuto', KABUTO_ARMOR, { kind: 'halve', round: 'down', subject: 'kabuto', scope: 'self' }],
    ['Kabuto', KABUTO_ARMOR_LC, { kind: 'halve', round: 'down', subject: 'kabuto', scope: 'self' }],
    ['Shuckle', HARD_SHELL, { kind: 'reduceTo', max: 40, to: 10, subject: 'shuckle', scope: 'self' }],
    [
      "Erika's Dratini",
      STRANGE_BARRIER,
      { kind: 'reduceTo', min: 20, to: 10, attackerBasic: true, subject: "erika's dratini", scope: 'self' },
    ],
    [
      "Erika's Ivysaur",
      RELAXING_SCENT,
      { kind: 'halve', round: 'up', subject: "erika's ivysaur", scope: 'any', holderActive: true },
    ],
    ['Unown D', UNOWN_D, { kind: 'reduceBy', amount: 30, attackerType: 'd', subject: 'unown d', scope: 'team', unique: true }],
  ];
  for (const [name, text, spec] of cases) {
    assert.deepEqual(parseLegacyDamageModifier(holderText(name, text)), spec, name);
    const card = { name, abilities: [{ text }] };
    assert.deepEqual(parseDamagePrevention(card), { preventAll: false, reduce: 0, reduceHp: 0 }, name);
    assert.equal(parseDamageReduction(card).reduce, 0, name);
  }
  assert.equal(parseLegacyDamageModifier(''), null);
  assert.equal(parseLegacyDamageModifier('this pokémon takes 30 less damage from attacks.'), null);
});

test('legacy damage: modifier arithmetic (rounding, thresholds, 0 untouched)', () => {
  assert.equal(applyLegacyDamageModifier(30, { kind: 'halve', round: 'down' }), 10);
  assert.equal(applyLegacyDamageModifier(30, { kind: 'halve', round: 'up' }), 20);
  assert.equal(applyLegacyDamageModifier(10, { kind: 'halve', round: 'down' }), 0);
  assert.equal(applyLegacyDamageModifier(40, { kind: 'reduceTo', max: 40, to: 10 }), 10);
  assert.equal(applyLegacyDamageModifier(50, { kind: 'reduceTo', max: 40, to: 10 }), 50);
  assert.equal(applyLegacyDamageModifier(0, { kind: 'preventAtLeast', min: 30 }), 0);
  assert.equal(applyLegacyDamageModifier(20, { kind: 'reduceBy', amount: 30 }), 0);
});

// ── runtime: the Defending Pokémon ────────────────────────────────────────

test('legacy damage: Invisible Wall prevents 30 or more, lets 20 through, and is off while Asleep', () => {
  const mime = () => pokemon({ instanceId: 10, name: 'Mr. Mime', abilities: [power('Invisible Wall', INVISIBLE_WALL)] });
  assert.equal(hit(mime(), { damage: '30' }).defender, 0);
  assert.equal(hit(mime(), { damage: '20' }).defender, 20);
  const asleep = mime();
  asleep.specialCondition = 'Asleep';
  assert.equal(hit(asleep, { damage: '30' }).defender, 30);
});

test('legacy damage: Invisible Wall is ignored under Toxic Gas', () => {
  const mime = pokemon({ instanceId: 10, name: 'Mr. Mime', abilities: [power('Invisible Wall', INVISIBLE_WALL)] });
  const muk = pokemon({ instanceId: 11, name: 'Muk', abilities: [power('Toxic Gas', TOXIC_GAS)] });
  assert.equal(hit(mime, { damage: '30', p1Bench: [muk] }).defender, 30);
});

test('legacy damage: Kabuto Armor halves rounded down, both printings', () => {
  for (const text of [KABUTO_ARMOR, KABUTO_ARMOR_LC]) {
    const kabuto = pokemon({ instanceId: 10, name: 'Kabuto', abilities: [power('Kabuto Armor', text)] });
    assert.equal(hit(kabuto, { damage: '50' }).defender, 20);
  }
});

test('legacy damage: Hard Shell reduces 40 or less to 10 and leaves 50', () => {
  const shuckle = () => pokemon({ instanceId: 10, name: 'Shuckle', abilities: [power('Hard Shell', HARD_SHELL)] });
  assert.equal(hit(shuckle(), { damage: '40' }).defender, 10);
  assert.equal(hit(shuckle(), { damage: '50' }).defender, 50);
});

test('legacy damage: Strange Barrier caps a Basic attacker at 10 but not an Evolution', () => {
  const dratini = () =>
    pokemon({ instanceId: 10, name: "Erika's Dratini", abilities: [power('Strange Barrier', STRANGE_BARRIER)] });
  assert.equal(hit(dratini(), { damage: '40' }).defender, 10);
  assert.equal(hit(dratini(), { damage: '40', attacker: { stage: 'Stage 1' } }).defender, 40);
});

test('legacy damage: Relaxing Scent halves damage to any Pokémon while Erika\'s Ivysaur is Active', () => {
  const ivysaur = (instanceId) =>
    pokemon({ instanceId, name: "Erika's Ivysaur", stage: 'Stage 1', abilities: [power('Relaxing Scent', RELAXING_SCENT)] });
  // On the defending side: the Defending Pokémon is the holder itself.
  assert.equal(hit(ivysaur(10), { damage: '50' }).defender, 30);
  // On the attacking side: the opponent's Active is "any Pokémon" too.
  const attackerSide = setupGame();
  attackerSide.players.p1.zones.active.push(ivysaur(1));
  attackerSide.players.p1.zones.active[0].attacks = [{ name: 'Hit', cost: [], damage: '50' }];
  attackerSide.players.p2.zones.active.push(pokemon({ instanceId: 10, name: 'Opp' }));
  const res = applyCommand(attackerSide, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.state.players.p2.zones.active[0].damage, 30);
  // Benched, it does nothing.
  assert.equal(hit(pokemon({ instanceId: 10, name: 'Opp' }), { damage: '50', p2Bench: [ivysaur(11)] }).defender, 50);
});

test('legacy damage: Unown D reduces a {D} attacker by 30, stops with 2 Unown D in play', () => {
  const unownD = (instanceId) => pokemon({ instanceId, name: 'Unown D', abilities: [power('[Darkness]', UNOWN_D)] });
  const opp = () => pokemon({ instanceId: 10, name: 'Opp' });
  const dark = { types: ['Darkness'] };
  assert.equal(hit(opp(), { damage: '50', attacker: dark, p2Bench: [unownD(11)] }).defender, 20);
  assert.equal(hit(opp(), { damage: '50', p2Bench: [unownD(11)] }).defender, 50, 'not a {D} attacker');
  assert.equal(hit(opp(), { damage: '50', attacker: dark, p2Bench: [unownD(11), unownD(12)] }).defender, 50);
  // Unown N names {C}: the probe attacker above is Colorless.
  const unownN = pokemon({ instanceId: 13, name: 'Unown N', abilities: [power('[Normal]', UNOWN_N)] });
  assert.equal(hit(opp(), { damage: '50', p2Bench: [unownN] }).defender, 20);
  // The attacker's side is not "your Pokémon".
  assert.equal(hit(opp(), { damage: '50', attacker: dark, p1Bench: [unownD(14)] }).defender, 50);
});

// ── runtime: Bench damage and recoil ─────────────────────────────────────

test('legacy damage: a Benched Kabuto halves spread damage; Invisible Wall stops a 30 snipe', () => {
  const kabuto = pokemon({ instanceId: 11, name: 'Kabuto', abilities: [power('Kabuto Armor', KABUTO_ARMOR)] });
  const mime = pokemon({ instanceId: 12, name: 'Mr. Mime', abilities: [power('Invisible Wall', INVISIBLE_WALL)] });
  const result = hit(pokemon({ instanceId: 10, name: 'Opp' }), {
    damage: '',
    text: "This attack does 30 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
    p2Bench: [kabuto, mime],
  });
  assert.deepEqual(result.p2Bench, [10, 0]);
});

test("legacy damage: Relaxing Scent halves the attacker's own recoil", () => {
  const ivysaur = pokemon({
    instanceId: 1,
    name: "Erika's Ivysaur",
    stage: 'Stage 1',
    abilities: [power('Relaxing Scent', RELAXING_SCENT)],
  });
  const state = setupGame();
  ivysaur.attacks = [{ name: 'Take Down', cost: [], damage: '40', text: "Erika's Ivysaur does 30 damage to itself." }];
  state.players.p1.zones.active.push(ivysaur);
  state.players.p2.zones.active.push(pokemon({ instanceId: 10, name: 'Opp' }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 20);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});

// ── Shell Armor (consumed before): its "to Misty's Cloyster" is the holder only ─────────────

test("legacy damage: Shell Armor reduces Misty's Cloyster's damage, not its teammates'", () => {
  const cloyster = pokemon({ instanceId: 10, name: "Misty's Cloyster", abilities: [power('Shell Armor', SHELL_ARMOR)] });
  const teammate = pokemon({ instanceId: 11, name: 'Teammate' });
  const ctx = { sideCards: [cloyster, teammate], sideActive: [cloyster], sideBench: [teammate] };
  const attacker = pokemon({ instanceId: 1, name: 'Attacker' });
  assert.equal(abilityDamagePrevention(cloyster, attacker, ctx).reduceHp, 10);
  assert.equal(abilityDamagePrevention(teammate, attacker, ctx).reduceHp, 0);
  assert.equal(hit(cloyster, { damage: '30' }).defender, 20);
});

// ── one modifier per hit, and attacks that ignore Pokémon Powers ─────────────────────────────

// pkmn-wotc-cards: Pichu [Neo Genesis 12] Zzzap
const ZZZAP = "Does 20 damage to each Pokémon in play that has a Pokémon Power. Don't apply Weakness and Resistance.";
// pkmn-pokemon-cards: Kingdra-GX [Dragon Majesty 18] Maelstrom-GX
const MAELSTROM_GX =
  "This attack does 40 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.) (You can't use more than 1 GX attack in a game.)";
// pkmn-wotc-cards: Umbreon [Neo Discovery 13] Feint Attack
const FEINT_ATTACK =
  "Choose 1 of your opponent's Pokémon. This attack does 30 damage to that Pokémon. This attack's damage isn't affected by Weakness, Resistance, Pokémon Powers, or any other effects on the Defending Pokémon.";
// TCGdex base1-80
const DEFENDER =
  "Attach Defender to 1 of your Pokémon. At the end of your opponent's next turn, discard Defender. Damage done to that Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).";

const kabutoAt = (instanceId) => pokemon({ instanceId, name: 'Kabuto', abilities: [power('Kabuto Armor', KABUTO_ARMOR)] });

test('legacy damage: Zzzap on an Active Kabuto is halved once (20 → 10)', () => {
  assert.equal(hit(kabutoAt(10), { damage: '', text: ZZZAP }).defender, 10);
});

test('legacy damage: Maelstrom-GX on an Active Kabuto is halved once (40 → 20)', () => {
  assert.equal(hit(kabutoAt(10), { damage: '', text: MAELSTROM_GX }).defender, 20);
});

// p1 uses Feint Attack and picks `targetId` among p2's Pokémon; returns p2's damage by instanceId.
function feintAttack({ active, activeAttached = [], bench = [], targetId }) {
  const state = setupGame();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Umbreon',
      types: ['Darkness'],
      attacks: [{ name: 'Feint Attack', cost: [], damage: '', text: FEINT_ATTACK }],
    })
  );
  state.players.p2.zones.active.push(active, ...activeAttached);
  state.players.p2.zones.bench.push(...bench);
  const offered = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(offered.error, null);
  // A lone candidate is hit without a prompt.
  const res = offered.state.pendingChoice
    ? applyCommand(offered.state, {
        type: 'resolveChoice',
        payload: { choiceId: offered.state.pendingChoice.choiceId, selection: [targetId] },
        playerId: 'p1',
      })
    : offered;
  assert.equal(res.error, null);
  const p2 = res.state.players.p2.zones;
  return Object.fromEntries([...p2.active, ...p2.bench].map((c) => [c.instanceId, c.damage || 0]));
}

test('legacy damage: Feint Attack ignores Kabuto Armor on the Active and on the Bench', () => {
  assert.equal(feintAttack({ active: kabutoAt(10), targetId: 10 })[10], 30);
  const opp = pokemon({ instanceId: 10, name: 'Opp' });
  assert.equal(feintAttack({ active: opp, bench: [kabutoAt(11)], targetId: 11 })[11], 30);
});

test('legacy damage: Feint Attack ignores Defender on a Benched or Active Pokémon', () => {
  const defenderOn = (attachedTo) => createCard({ instanceId: 12, name: 'Defender', type: 'Trainer', text: DEFENDER, attachedTo });
  const benched = pokemon({ instanceId: 11, name: 'Opp Bench' });
  const opp = pokemon({ instanceId: 10, name: 'Opp' });
  assert.equal(feintAttack({ active: opp, bench: [benched, defenderOn(11)], targetId: 11 })[11], 30);
  const lone = pokemon({ instanceId: 10, name: 'Opp' });
  assert.equal(feintAttack({ active: lone, activeAttached: [defenderOn(10)], targetId: 10 })[10], 30);
});
