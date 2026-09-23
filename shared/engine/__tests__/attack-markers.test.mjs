// Timed attack effects and damage immunity on the server (design 031; I118).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAttackMarker,
  clearAttackMarkers,
  liveAttackMarkers,
  markerUntilTurn,
  parseDamageImmunity,
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
