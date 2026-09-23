// Timed attack effects and damage immunity on the server (design 031; I118).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAttackMarker,
  clearAttackMarkers,
  liveAttackMarkers,
  markerUntilTurn,
  parseDamageImmunity,
  SELF_NAME,
} from '../rules/attack-markers.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const tool = (attachedTo, text) => ({
  instanceId: 90,
  name: 'Guard Tool',
  supertype: 'Trainer',
  subtypes: ['Pokémon Tool'],
  type: 'Trainer',
  attachedTo,
  text,
});

// ── parseDamageImmunity ──────────────────────────────────────────────────────

test('parseDamageImmunity: reads each immunity wording', () => {
  assert.equal(parseDamageImmunity('Discard 2 Energy from this Pokémon.'), null);
  assert.equal(parseDamageImmunity(''), null);
  assert.equal(parseDamageImmunity(undefined), null);
  assert.deepEqual(
    parseDamageImmunity(
      "This attack's damage isn't affected by Weakness, Resistance, or any effects on your opponent's Active Pokémon."
    ),
    { ignoreWeakness: true, ignoreResistance: true, ignoreDefenderEffects: true }
  );
  assert.deepEqual(parseDamageImmunity("This attack's damage isn't affected by Resistance."), {
    ignoreWeakness: false,
    ignoreResistance: true,
    ignoreDefenderEffects: false,
  });
  assert.deepEqual(
    parseDamageImmunity(
      "Don't apply Weakness and Resistance for this attack. (Any other effects that would happen after applying Weakness and Resistance still happen.)"
    ),
    { ignoreWeakness: true, ignoreResistance: true, ignoreDefenderEffects: false }
  );
  assert.deepEqual(
    parseDamageImmunity("This attack's damage isn’t affected by any effects on the Defending Pokemon."),
    { ignoreWeakness: false, ignoreResistance: false, ignoreDefenderEffects: true }
  );
});

test('parseDamageImmunity: the Benched-Pokémon reminder alone is not immunity', () => {
  assert.equal(
    parseDamageImmunity(
      "Does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"
    ),
    null
  );
});

// ── markers ──────────────────────────────────────────────────────────────────

test('markerUntilTurn: opponent turn +1, own next turn +2, while Active survives JSON', () => {
  assert.equal(markerUntilTurn('opponentNextTurn', 5), 6);
  assert.equal(markerUntilTurn('yourNextTurn', 5), 7);
  const whileActive = markerUntilTurn('whileActive', 5);
  assert.equal(JSON.parse(JSON.stringify({ whileActive })).whileActive, whileActive);
});

test('liveAttackMarkers: expires after its turn and after the Pokémon evolves', () => {
  const root = { instanceId: 1, name: 'Basic', supertype: 'Pokémon', stage: 'Basic' };
  addAttackMarker(root, { kind: 'noWeakness', untilTurn: 6, topId: 1 });
  addAttackMarker(root, { kind: 'other', untilTurn: 9 });
  addAttackMarker(root, null);
  assert.equal(root.attackMarkers.length, 2);

  assert.deepEqual(liveAttackMarkers(root, { turnNumber: 6, zoneCards: [root] }).map((m) => m.kind), ['noWeakness', 'other']);
  assert.deepEqual(liveAttackMarkers(root, { turnNumber: 7, zoneCards: [root] }).map((m) => m.kind), ['other']);

  const evolution = { instanceId: 2, name: 'Stage', supertype: 'Pokémon', stage: 'Stage 1', attachedTo: 1 };
  assert.deepEqual(
    liveAttackMarkers(root, { turnNumber: 6, zoneCards: [root, evolution] }).map((m) => m.kind),
    ['other'],
    'a marker placed on the Basic ends when it evolves'
  );

  clearAttackMarkers(root);
  assert.deepEqual(liveAttackMarkers(root, { turnNumber: 6 }), []);
  assert.deepEqual(liveAttackMarkers(null, { turnNumber: 6 }), []);
});

// ── computeAttackDamage options ──────────────────────────────────────────────

const attacker = { instanceId: 10, types: ['Lightning'] };
const weakDefender = { instanceId: 20, weakness: { type: 'Lightning', value: 2 } };
const resistantDefender = { instanceId: 20, resistance: { type: 'Lightning', value: -30 } };

test('computeAttackDamage: ignoreWeakness / ignoreResistance', () => {
  assert.equal(computeAttackDamage(attacker, weakDefender, { damage: '60' }).total, 120);
  assert.equal(computeAttackDamage(attacker, weakDefender, { damage: '60' }, { ignoreWeakness: true }).total, 60);
  assert.equal(computeAttackDamage(attacker, resistantDefender, { damage: '60' }).total, 30);
  assert.equal(
    computeAttackDamage(attacker, resistantDefender, { damage: '60' }, { ignoreResistance: true }).total,
    60
  );
});

test('computeAttackDamage: a noWeakness marker stops Weakness; ignoring defender effects skips it', () => {
  const markers = [{ kind: 'noWeakness', untilTurn: 6 }];
  assert.equal(computeAttackDamage(attacker, weakDefender, { damage: '60' }, { defenderMarkers: markers }).total, 60);
  assert.equal(
    computeAttackDamage(attacker, weakDefender, { damage: '60' }, { defenderMarkers: markers, ignoreDefenderEffects: true })
      .total,
    120
  );
});

test('computeAttackDamage: ignoreDefenderEffects skips the defender Tool reduction', () => {
  const defender = { instanceId: 20 };
  const zone = [defender, tool(20, 'The Pokémon this card is attached to takes 30 less damage from attacks.')];
  assert.equal(computeAttackDamage(attacker, defender, { damage: '60' }, { defenderZoneCards: zone }).total, 30);
  assert.equal(
    computeAttackDamage(attacker, defender, { damage: '60' }, { defenderZoneCards: zone, ignoreDefenderEffects: true })
      .total,
    60
  );
});

// ── template ─────────────────────────────────────────────────────────────────

test('parseAttackSteps: "has no Weakness during your opponent\'s next turn" adds a marker step', () => {
  for (const text of [
    "During your opponent's next turn, this Pokémon has no Weakness.",
    "Gardevoir has no Weakness during your opponent's next turn.",
  ]) {
    const { before, after: steps } = parseAttackSteps(text, { selfName: 'Gardevoir' });
    assert.equal(before.length, 0);
    assert.equal(steps.length, 1, text);
    assert.equal(steps[0].type, 'atkAddMarker');
    assert.equal(steps[0].window, 'opponentNextTurn');
    assert.deepEqual(steps[0].marker, { kind: 'noWeakness' });
  }
});

// ── through the reducer ──────────────────────────────────────────────────────

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const deckCard = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Gardevoir ({P}, weak to {D}) faces p2's {D} Attacker; `turn` says whose turn it is. */
function duel({ p1Attack = null, p2Damage = '60', turn = { player: 'p1', number: 3 }, setup = () => {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-markers', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(deckCard(`${id} deck ${i}`));
  }
  state.turn = { ...turn, phase: 'main' };
  const gardevoir = mon('Gardevoir', {
    types: ['Psychic'],
    weakness: { type: 'Darkness', value: 2 },
    attacks: p1Attack ? [{ name: 'Test Attack', cost: [], ...p1Attack }] : [],
  });
  const darkAttacker = mon('Dark Attacker', {
    types: ['Darkness'],
    attacks: [{ name: 'Bite', cost: [], damage: p2Damage, text: '' }],
  });
  state.players.p1.zones.active.push(gardevoir);
  state.players.p1.zones.bench.push(mon('Bench Buddy'));
  state.players.p2.zones.active.push(darkAttacker);
  state.players.p2.zones.bench.push(mon('Dark Bench'));
  const ctx = { state, gardevoir, darkAttacker };
  setup(ctx);
  return ctx;
}

function run(state, playerId, type, payload = {}) {
  const res = applyCommand(state, { type, playerId, payload }, createRng(5));
  assert.equal(res.error, null);
  return res.state;
}

const findCard = (state, pid, id) =>
  Object.values(state.players[pid].zones).flat().find((c) => c.instanceId === id);

test('attack: immunity to effects on the Defending Pokémon skips its Tool reduction', () => {
  const text = "This attack's damage isn't affected by any effects on your opponent's Active Pokémon.";
  const withTool = (ctx) => {
    ctx.state.players.p2.zones.active.push({
      ...tool(ctx.darkAttacker.instanceId, 'The Pokémon this card is attached to takes 30 less damage from attacks.'),
      instanceId: 99,
    });
  };
  const plain = duel({ p1Attack: { damage: '60', text: '' }, setup: withTool });
  const immune = duel({ p1Attack: { damage: '60', text }, setup: withTool });
  const plainDamage = findCard(run(plain.state, 'p1', 'attack', { attackIndex: 0 }), 'p2', plain.darkAttacker.instanceId).damage;
  const immuneDamage = findCard(run(immune.state, 'p1', 'attack', { attackIndex: 0 }), 'p2', immune.darkAttacker.instanceId).damage;
  assert.equal(immuneDamage, plainDamage * 2, 'the 30 reduction applies only without immunity');
});

test('attack: "no Weakness during your opponent\'s next turn" lasts exactly that turn', () => {
  const text = "During your opponent's next turn, this Pokémon has no Weakness.";
  const b = duel({ p1Attack: { damage: '10', text } });
  const afterAttack = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(afterAttack.turn.player, 'p2');
  assert.equal(afterAttack.turn.number, 4);
  assert.deepEqual(
    findCard(afterAttack, 'p1', b.gardevoir.instanceId).attackMarkers.map((m) => [m.kind, m.untilTurn]),
    [['noWeakness', 4]]
  );

  const hitNextTurn = run(structuredClone(afterAttack), 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hitNextTurn, 'p1', b.gardevoir.instanceId).damage, 60);

  const later = structuredClone(afterAttack);
  later.turn = { player: 'p2', number: 6, phase: 'main' };
  const hitLater = run(later, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hitLater, 'p1', b.gardevoir.instanceId).damage, 120);
});

test('attack markers: retreat and Knock Out clear them', () => {
  const marked = (ctx) => addAttackMarker(ctx.gardevoir, { kind: 'noWeakness', untilTurn: 99 });

  const b = duel({ setup: marked });
  const retreated = run(b.state, 'p1', 'retreat', { benchInstanceId: b.state.players.p1.zones.bench[0].instanceId });
  const benched = findCard(retreated, 'p1', b.gardevoir.instanceId);
  assert.ok(retreated.players.p1.zones.bench.includes(benched));
  assert.equal(benched.attackMarkers, undefined);

  const k = duel({
    turn: { player: 'p2', number: 4 },
    p2Damage: '300',
    setup: marked,
  });
  const knockedOut = run(k.state, 'p2', 'attack', { attackIndex: 0 });
  const discarded = knockedOut.players.p1.zones.discard.find((c) => c.instanceId === k.gardevoir.instanceId);
  assert.ok(discarded, 'Gardevoir is Knocked Out');
  assert.equal(discarded.attackMarkers, undefined);
});

// ── protection, outgoing reduction, next-turn bonus ─────────────────────────

const markerOf = (text, selfName) => {
  const { after } = parseAttackSteps(text, { selfName });
  assert.equal(after.length, 1, text);
  assert.equal(after[0].type, 'atkAddMarker', text);
  return after[0];
};

test('parseAttackSteps: printed protection, reduction and bonus wordings become marker steps', () => {
  const cases = [
    [
      'Lurantis ex',
      "During your opponent's next turn, this Pokémon takes 50 less damage from attacks (after applying Weakness and Resistance).",
      'self',
      'opponentNextTurn',
      { kind: 'incomingReduce', amount: 50, afterWR: true, filter: null },
    ],
    [
      'Mega Manectric ex',
      "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Basic Pokémon.",
      'self',
      'opponentNextTurn',
      { kind: 'incomingPrevent', filter: { any: ['basic'] } },
    ],
    [
      'Florges',
      "During your opponent's next turn, the Defending Pokémon's attacks do 30 less damage (before applying Weakness and Resistance).",
      'opponentActive',
      'opponentNextTurn',
      { kind: 'outgoingReduce', amount: 30, afterWR: false },
    ],
    [
      'Metapod',
      "During your opponent's next turn, if this Pokémon would be damaged by an attack, prevent that attack's damage done to this Pokémon if that damage is 60 or less.",
      'self',
      'opponentNextTurn',
      { kind: 'incomingPrevent', filter: null, maxDamage: 60 },
    ],
    [
      'Rampardos',
      'Any damage done to Rampardos by attacks is reduced by 20 (after applying Weakness and Resistance) until the end of your next turn.',
      'self',
      'throughYourNextTurn',
      { kind: 'incomingReduce', amount: 20, afterWR: true, filter: null },
    ],
    [
      'Deoxys',
      "During your opponent's next turn, any damage done to Deoxys by attacks in reduced by 30 (before applying Weakness and Resistance).",
      'self',
      'opponentNextTurn',
      { kind: 'incomingReduce', amount: 30, afterWR: false, filter: null },
    ],
    [
      'Meloetta ex',
      "During your next turn, this Pokémon's Echoed Voice attack does 80 more damage (before applying Weakness and Resistance).",
      'self',
      'yourNextTurn',
      { kind: 'nextTurnBonus', amount: 80, attackName: 'echoed voice' },
    ],
    [
      'Rampardos ex',
      "During your next turn, attacks used by this Pokémon do 150 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
      'self',
      'yourNextTurn',
      { kind: 'nextTurnBonus', amount: 150, attackName: null },
    ],
    [
      'Deoxys',
      "During your next turn, Deoxys's attacks do 40 more damage to the Defending Pokémon (before applying Weakness and Resistance).",
      'self',
      'yourNextTurn',
      { kind: 'nextTurnBonus', amount: 40, attackName: null },
    ],
  ];
  for (const [selfName, text, target, window, marker] of cases) {
    const step = markerOf(text, selfName);
    assert.equal(step.target, target, text);
    assert.equal(step.window, window, text);
    assert.deepEqual(step.marker, marker, text);
  }
});

test('parseAttackSteps: Ability filter with a self exception, and the side-wide Pokémon-EX guard', () => {
  const simisage = markerOf(
    "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Pokémon that have an Ability, except any Simisage.",
    'Simisage'
  );
  assert.deepEqual(simisage.marker.filter, { any: ['ability'], exceptName: SELF_NAME });

  const diancie = markerOf(
    "During your opponent's next turn, prevent all damage done to each of your Pokémon from your opponent's Pokémon-EX. (If this Pokémon is no longer your Active Pokémon, this effect ends.)",
    'M Diancie-EX'
  );
  assert.equal(diancie.marker.scope, 'side');
  assert.deepEqual(diancie.marker.filter, { any: ['EX'] });
});

test('parseAttackSteps: a bonus needs "your next turn"; a protection needs an opponent turn', () => {
  const stepsOf = (text) => parseAttackSteps(text, { selfName: 'X' }).after;
  assert.equal(stepsOf("During your opponent's next turn, this Pokémon's Bite attack does 80 more damage.").length, 0);
  assert.equal(stepsOf('During your next turn, this Pokémon takes 50 less damage from attacks.').length, 0);
});

test('computeAttackDamage: marker reductions honour their Weakness order', () => {
  const after = [{ kind: 'incomingReduce', amount: 50, afterWR: true, filter: null }];
  const before = [{ kind: 'incomingReduce', amount: 30, afterWR: false, filter: null }];
  const hit = (options) => computeAttackDamage(attacker, weakDefender, { damage: '60' }, options).total;
  assert.equal(hit({ defenderMarkers: after }), 70);
  assert.equal(hit({ defenderMarkers: before }), 60);
  assert.equal(hit({ defenderMarkers: after, ignoreDefenderEffects: true }), 120);

  const outgoing = [{ kind: 'outgoingReduce', amount: 30, afterWR: false }];
  assert.equal(hit({ attackerMarkers: outgoing }), 60);
  assert.equal(
    hit({ attackerMarkers: outgoing, ignoreDefenderEffects: true }),
    60,
    'an effect on the attacker is not an effect on the Defending Pokémon'
  );
});

test('computeAttackDamage: prevention markers check their filter and damage cap', () => {
  const basic = { ...attacker, name: 'Pikachu', stage: 'Basic', subtypes: ['Basic'] };
  const stage1 = { ...attacker, name: 'Raichu', stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Pikachu' };
  const hit = (att, markers, damage = '60') =>
    computeAttackDamage(att, weakDefender, { damage }, { defenderMarkers: markers });

  const basicOnly = [{ kind: 'incomingPrevent', filter: { any: ['basic'] } }];
  assert.equal(hit(basic, basicOnly).total, 0);
  assert.equal(hit(basic, basicOnly).prevented, true);
  assert.equal(hit(stage1, basicOnly).total, 120);

  const capped = [{ kind: 'incomingPrevent', filter: null, maxDamage: 60 }];
  assert.equal(hit(basic, capped, '30').total, 0, '30 ×2 = 60 is at the cap');
  assert.equal(hit(basic, capped, '40').total, 80, 'over the cap goes through in full');

  const exceptSelf = [{ kind: 'incomingPrevent', filter: { any: ['ability'], exceptName: 'simisage' } }];
  const withAbility = { ...basic, abilities: [{ name: 'Some Ability', text: 'x' }] };
  assert.equal(hit(withAbility, exceptSelf).total, 0);
  assert.equal(hit({ ...withAbility, name: 'Simisage' }, exceptSelf).total, 120);
  assert.equal(hit(basic, exceptSelf).total, 120, 'no Ability, no prevention');
});

test('computeAttackDamage: next-turn bonus adds before Weakness, only to damaging attacks', () => {
  const named = [{ kind: 'nextTurnBonus', amount: 80, attackName: 'echoed voice' }];
  const any = [{ kind: 'nextTurnBonus', amount: 40, attackName: null }];
  const hit = (attack, markers, opts = {}) =>
    computeAttackDamage(attacker, weakDefender, attack, { attackerMarkers: markers, ...opts }).total;
  assert.equal(hit({ name: 'Echoed Voice', damage: '20' }, named), 200);
  assert.equal(hit({ name: 'Other', damage: '20' }, named), 40);
  assert.equal(hit({ name: 'Other', damage: '20' }, any), 120);
  assert.equal(hit({ name: 'Other', damage: '' }, any), 0, 'no damage, nothing to add to');
  assert.equal(hit({ name: 'Other', damage: '20' }, any, { defenderIsActive: false }), 40);
});

test('attack: Leaf Guard reduces the next hit after Weakness, then expires', () => {
  const text =
    "During your opponent's next turn, this Pokémon takes 50 less damage from attacks (after applying Weakness and Resistance).";
  const b = duel({ p1Attack: { damage: '10', text } });
  const afterAttack = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  const hit = run(structuredClone(afterAttack), 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p1', b.gardevoir.instanceId).damage, 70, '60 ×2 − 50');

  const later = structuredClone(afterAttack);
  later.turn = { player: 'p2', number: 6, phase: 'main' };
  assert.equal(findCard(run(later, 'p2', 'attack', { attackIndex: 0 }), 'p1', b.gardevoir.instanceId).damage, 120);
});

test("attack: Moonblast weakens the opponent Active's next attack", () => {
  const text =
    "During your opponent's next turn, the Defending Pokémon's attacks do 30 less damage (before applying Weakness and Resistance).";
  const b = duel({ p1Attack: { damage: '10', text } });
  const afterAttack = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  assert.deepEqual(
    findCard(afterAttack, 'p2', b.darkAttacker.instanceId).attackMarkers.map((m) => m.kind),
    ['outgoingReduce']
  );
  const hit = run(afterAttack, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p1', b.gardevoir.instanceId).damage, 60, '(60 − 30) ×2');
});

test('attack: a next-turn bonus skips the attack that sets it and lands on the next own turn', () => {
  const text =
    "During your next turn, this Pokémon's Test Attack attack does 80 more damage (before applying Weakness and Resistance).";
  const b = duel({ p1Attack: { damage: '20', text } });
  const first = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(findCard(first, 'p2', b.darkAttacker.instanceId).damage, 20, 'no bonus on the setting attack');

  const second = structuredClone(first);
  second.turn = { player: 'p1', number: 5, phase: 'main' };
  const boosted = run(second, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(findCard(boosted, 'p2', b.darkAttacker.instanceId).damage, 20 + 100);
});

test("attack: an \"except any <self>\" filter stores the attacker's own name", () => {
  const text =
    "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Pokémon that have an Ability, except any Gardevoir.";
  const b = duel({ p1Attack: { damage: '10', text } });
  const afterAttack = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  const [marker] = findCard(afterAttack, 'p1', b.gardevoir.instanceId).attackMarkers;
  assert.equal(marker.filter.exceptName, 'gardevoir');
});

test('attack: a side-wide Pokémon-EX guard protects the Bench while its Pokémon is Active', () => {
  const spread = "This attack does 30 damage to each of your opponent's Benched Pokémon.";
  const guard = (ctx) => {
    addAttackMarker(ctx.gardevoir, {
      kind: 'incomingPrevent',
      scope: 'side',
      filter: { any: ['EX'] },
      untilTurn: 4,
      topId: ctx.gardevoir.instanceId,
    });
    ctx.darkAttacker.name = 'Dark Attacker-EX';
    ctx.darkAttacker.attacks[0].text = spread;
  };
  const b = duel({ turn: { player: 'p2', number: 4 }, setup: guard });
  const benchId = b.state.players.p1.zones.bench[0].instanceId;
  const hit = run(b.state, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p1', b.gardevoir.instanceId).damage || 0, 0);
  assert.equal(findCard(hit, 'p1', benchId).damage || 0, 0);

  const plain = duel({
    turn: { player: 'p2', number: 4 },
    setup: (ctx) => {
      ctx.darkAttacker.attacks[0].text = spread;
    },
  });
  const plainHit = run(plain.state, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(plainHit, 'p1', benchId).damage, 30, 'control: the spread lands without the guard');
});

// ── deferred Knock Out, retaliation, HP-cap counters ────────────────────────

const WORD_OF_RUIN = "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out.";
const RIGHT_BACK =
  "Discard all Energy attached to this Pokémon. During your opponent's next turn, if this Pokémon is damaged by an attack (even if this Pokémon is Knocked Out), put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon.";
const FIRE_WALL =
  "If an attack does damage to Rocket's Moltres during your opponent's next turn (even if Rocket's Moltres is Knocked Out), Rocket's Moltres attacks your opponent's Active Pokémon for 10 damage. (Apply Weakness and Resistance.)";

test('parseAttackSteps: deferred Knock Out and retaliation wordings become marker steps', () => {
  const ruin = markerOf(WORD_OF_RUIN, 'Galarian Slowking V');
  assert.equal(ruin.window, 'opponentNextTurn');
  assert.equal(ruin.target, 'opponentActive');
  assert.deepEqual(ruin.marker, { kind: 'deferredKnockOut' });

  const { after } = parseAttackSteps(RIGHT_BACK, { selfName: 'Wobbuffet BREAK' });
  const counters = after.find((s) => s.type === 'atkAddMarker');
  assert.ok(counters, 'the retaliation follows the Energy discard');
  assert.equal(counters.window, 'opponentNextTurn');
  assert.deepEqual(counters.marker, { kind: 'retaliate', mode: 'counters' });

  const wall = markerOf(FIRE_WALL, "Rocket's Moltres");
  assert.equal(wall.window, 'opponentNextTurn');
  assert.deepEqual(wall.marker, { kind: 'retaliate', mode: 'attack', amount: 10 });
});

test('parseAttackSteps: "until its remaining HP is N" becomes an HP-cap step', () => {
  const pick = parseAttackSteps(
    "Put damage counters on 1 of your opponent's Pokémon until its remaining HP is 30.",
    { selfName: 'Tsareena ex' }
  ).after;
  assert.deepEqual(pick, [{ type: 'atkHpCap', target: 'opponentAny', hp: 30 }]);
  const active = parseAttackSteps(
    "Put damage counters on your opponent's Active Pokémon until its remaining HP is 50.",
    { selfName: 'Medicham ex' }
  ).after;
  assert.deepEqual(active, [{ type: 'atkHpCap', target: 'opponentActive', hp: 50 }]);
});

test("attack: Word of Ruin Knocks Out the Defending Pokémon at the end of the opponent's next turn", () => {
  const b = duel({ p1Attack: { damage: '10', text: WORD_OF_RUIN } });
  const afterAttack = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  assert.ok(
    afterAttack.players.p2.zones.active.some((c) => c.instanceId === b.darkAttacker.instanceId),
    'still in play during its own turn'
  );

  const ended = run(structuredClone(afterAttack), 'p2', 'pass');
  assert.ok(
    ended.players.p2.zones.discard.some((c) => c.instanceId === b.darkAttacker.instanceId),
    'Knocked Out at the end of turn 4'
  );

  const switched = run(structuredClone(afterAttack), 'p2', 'retreat', {
    benchInstanceId: afterAttack.players.p2.zones.bench[0].instanceId,
  });
  const spared = run(switched, 'p2', 'pass');
  assert.ok(
    spared.players.p2.zones.bench.some((c) => c.instanceId === b.darkAttacker.instanceId),
    'a Pokémon that left the Active Spot is spared'
  );
});

const retaliationGuard = (marker) => (ctx) =>
  addAttackMarker(ctx.gardevoir, { ...marker, untilTurn: 4, topId: ctx.gardevoir.instanceId, sourceAttack: 'Fire Wall' });

test('attack: Right Back at You puts the damage taken on the Attacking Pokémon, even after a Knock Out', () => {
  const b = duel({ turn: { player: 'p2', number: 4 }, setup: retaliationGuard({ kind: 'retaliate', mode: 'counters' }) });
  const hit = run(b.state, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p1', b.gardevoir.instanceId).damage, 120);
  assert.equal(findCard(hit, 'p2', b.darkAttacker.instanceId).damage, 120, '60 ×2 comes back as counters');

  const ko = duel({
    turn: { player: 'p2', number: 4 },
    p2Damage: '200',
    setup: retaliationGuard({ kind: 'retaliate', mode: 'counters' }),
  });
  const koHit = run(ko.state, 'p2', 'attack', { attackIndex: 0 });
  assert.ok(koHit.players.p1.zones.discard.some((c) => c.instanceId === ko.gardevoir.instanceId));
  assert.ok(
    koHit.players.p2.zones.discard.some((c) => c.instanceId === ko.darkAttacker.instanceId),
    'the counters Knock Out the Attacking Pokémon too'
  );

  const expired = duel({ turn: { player: 'p2', number: 6 }, setup: retaliationGuard({ kind: 'retaliate', mode: 'counters' }) });
  const late = run(expired.state, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(late, 'p2', expired.darkAttacker.instanceId).damage || 0, 0, 'expired marker does nothing');
});

test('attack: Fire Wall attacks back for its damage with Weakness applied', () => {
  const b = duel({
    turn: { player: 'p2', number: 4 },
    setup: (ctx) => {
      ctx.darkAttacker.weakness = { type: 'Psychic', value: 2 };
      retaliationGuard({ kind: 'retaliate', mode: 'attack', amount: 10 })(ctx);
    },
  });
  const hit = run(b.state, 'p2', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p2', b.darkAttacker.instanceId).damage, 20, '10 ×2');
});

test('attack: HP-cap damage counters on the Active stop at the printed HP', () => {
  const text = "Put damage counters on your opponent's Active Pokémon until its remaining HP is 50.";
  const b = duel({ p1Attack: { damage: '', text } });
  const hit = run(b.state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(findCard(hit, 'p2', b.darkAttacker.instanceId).damage, 250);

  const low = duel({ p1Attack: { damage: '', text }, setup: (ctx) => (ctx.darkAttacker.damage = 260) });
  const none = run(low.state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(findCard(none, 'p2', low.darkAttacker.instanceId).damage, 260, 'already under the cap');
});

test('attack: HP-cap on 1 of the opponent Pokémon asks only among Pokémon above the cap', () => {
  const text = "Put damage counters on 1 of your opponent's Pokémon until its remaining HP is 30.";
  const b = duel({ p1Attack: { damage: '', text } });
  const benchId = b.state.players.p2.zones.bench[0].instanceId;
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(5));
  assert.equal(res.error, null);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'two Pokémon above the cap need a choice');
  const picked = run(res.state, choice.player, 'resolveChoice', { choiceId: choice.choiceId, selection: [benchId] });
  assert.equal(findCard(picked, 'p2', benchId).damage, 270);
  assert.equal(findCard(picked, 'p2', b.darkAttacker.instanceId).damage || 0, 0);

  const auto = duel({ p1Attack: { damage: '', text }, setup: (ctx) => (ctx.darkAttacker.damage = 280) });
  const autoBenchId = auto.state.players.p2.zones.bench[0].instanceId;
  const autoHit = run(auto.state, 'p1', 'attack', { attackIndex: 0 });
  assert.equal(autoHit.pendingChoice ?? null, null, 'one candidate is picked without asking');
  assert.equal(findCard(autoHit, 'p2', autoBenchId).damage, 270);
});
