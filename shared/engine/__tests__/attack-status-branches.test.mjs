// Coin-branch status clauses (design 036 A2): the dual-branch attacks that applied neither
// branch, plus the single-branch/threshold/always controls they must not regress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { listConditions } from '../rules/special-conditions.mjs';
import { parseAttackStatusBranches, statusesFromBranches } from '../rules/attack-status.mjs';

// ── parser / evaluator ──────────────────────────────────────────────────────

const branches = (text, selfName = '') => parseAttackStatusBranches(text, { selfName });
const applied = (text, flip, selfName = '') => statusesFromBranches(branches(text, selfName), flip);

test('dual-branch: one status set per face (Lilligant Bemusing Aroma)', () => {
  const text =
    "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
  assert.deepEqual(branches(text), [
    { when: 'heads', target: 'defender', statuses: ['Paralyzed', 'Poisoned'] },
    { when: 'tails', target: 'defender', statuses: ['Confused'] },
  ]);
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 1, flips: ['heads'] }), {
    defenderConditions: ['Paralyzed', 'Poisoned'],
    attackerConditions: [],
  });
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }), {
    defenderConditions: ['Confused'],
    attackerConditions: [],
  });
});

test('single heads branch applies only on heads (Unown X control)', () => {
  const text = "Flip a coin. If heads, the Defending Pokémon is now Paralyzed.";
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 1, flips: ['heads'] }).defenderConditions, [
    'Paralyzed',
  ]);
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }).defenderConditions, []);
});

test('an always clause and a coin branch stack (Beedrill Paralyze Poison)', () => {
  const text =
    "The Defending Pokémon is now Poisoned. Flip a coin. If heads, the Defending Pokémon is also Paralyzed.";
  assert.deepEqual(branches(text), [
    { when: 'always', target: 'defender', statuses: ['Poisoned'] },
    { when: 'heads', target: 'defender', statuses: ['Paralyzed'] },
  ]);
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 1, flips: ['heads'] }).defenderConditions, [
    'Poisoned',
    'Paralyzed',
  ]);
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }).defenderConditions, [
    'Poisoned',
  ]);
});

test('a self status applies to the attacker, not the defender', () => {
  const text = 'This Pokémon is now Confused.';
  assert.deepEqual(branches(text), [{ when: 'always', target: 'attacker', statuses: ['Confused'] }]);
  assert.deepEqual(applied(text, {}), { defenderConditions: [], attackerConditions: ['Confused'] });
});

test('a branch can target the attacker (Spinda Staggering Steps)', () => {
  const text =
    "Flip a coin. If heads, your opponent's Active Pokémon is now Confused. If tails, this Pokémon is now Confused.";
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 1, flips: ['heads'] }), {
    defenderConditions: ['Confused'],
    attackerConditions: [],
  });
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }), {
    defenderConditions: [],
    attackerConditions: ['Confused'],
  });
});

test('a both-sides clause applies to both (Snorlax Roll Over)', () => {
  const text =
    "Flip a coin. If heads, both Snorlax and the Defending Pokémon are now Asleep. If tails, Snorlax is now Asleep.";
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 1, flips: ['heads'] }, 'Snorlax'), {
    defenderConditions: ['Asleep'],
    attackerConditions: ['Asleep'],
  });
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }, 'Snorlax'), {
    defenderConditions: [],
    attackerConditions: ['Asleep'],
  });
});

test('a multi-flip threshold chain applies only the highest matching clause', () => {
  const text =
    'Flip 2 coins. If 1 of them is heads, the Defending Pokémon is now Confused. If 2 of them are heads, the Defending Pokémon is now Paralyzed.';
  assert.deepEqual(applied(text, { coin: null, headsCount: 1, flips: ['heads', 'tails'] }).defenderConditions, [
    'Confused',
  ]);
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 2, flips: ['heads', 'heads'] }).defenderConditions, [
    'Paralyzed',
  ]);
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails', 'tails'] }).defenderConditions, []);
});

test('"at least N of them are heads" gates the status', () => {
  const text =
    'Flip 4 coins. If at least 2 of them are heads, your opponent’s Active Pokémon is now Paralyzed.';
  assert.deepEqual(applied(text, { coin: null, headsCount: 1, flips: ['heads', 'tails', 'tails', 'tails'] }).defenderConditions, []);
  assert.deepEqual(applied(text, { coin: null, headsCount: 2, flips: ['heads', 'heads', 'tails', 'tails'] }).defenderConditions, [
    'Paralyzed',
  ]);
});

test('"if both of them are tails" gates the status (Slurpuff Slurp Slurp)', () => {
  const text =
    "Flip 2 coins. If both of them are tails, your opponent's Active Pokémon is now Confused.";
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails', 'tails'] }).defenderConditions, [
    'Confused',
  ]);
  assert.deepEqual(applied(text, { coin: null, headsCount: 1, flips: ['heads', 'tails'] }).defenderConditions, []);
});

test('"if the first flip is tails" reads the first flip only', () => {
  const text =
    "Flip a coin until you get tails. This attack does 90 damage for each heads. If the first flip is tails, your opponent's Active Pokémon is now Confused.";
  assert.deepEqual(applied(text, { coin: null, headsCount: 2, flips: ['heads', 'heads', 'tails'] }).defenderConditions, []);
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails'] }).defenderConditions, ['Confused']);
});

test('"is still asleep" is a checkup modifier, not a status application', () => {
  const text =
    "Your opponent's Active Pokémon is now Asleep. During Pokémon Checkup, your opponent flips 2 coins instead of 1. If either of them is tails, that Pokémon is still asleep.";
  assert.deepEqual(branches(text), [{ when: 'always', target: 'defender', statuses: ['Asleep'] }]);
});

test('a bare legacy wording still applies through the family fallback', () => {
  assert.deepEqual(branches('Your opponent’s Active Pokémon is Poisoned.'), [
    { when: 'always', target: 'defender', statuses: ['Poisoned'] },
  ]);
  assert.deepEqual(branches('Put the Defending Pokémon to Sleep.'), [
    { when: 'always', target: 'defender', statuses: ['Asleep'] },
  ]);
});

test('a conditional wording with no known gate applies nothing (Suicune Aurora Wave)', () => {
  const text =
    'Flip 2 coins. If both are heads, the Defending Pokémon is now Paralyzed. If only 1 is heads, the Defending Pokémon is now Asleep.';
  assert.deepEqual(applied(text, { coin: 'heads', headsCount: 2, flips: ['heads', 'heads'] }).defenderConditions, [
    'Paralyzed',
  ]);
  assert.deepEqual(applied(text, { coin: null, headsCount: 1, flips: ['heads', 'tails'] }).defenderConditions, [
    'Asleep',
  ]);
  assert.deepEqual(applied(text, { coin: 'tails', headsCount: 0, flips: ['tails', 'tails'] }).defenderConditions, []);
  // "if this Pokémon has at least 1 extra Energy attached …" is a damage condition this parser
  // does not evaluate: it must not leak in as an unconditional status.
  const conditional =
    "If this Pokémon has at least 1 extra Energy attached to it (in addition to this attack's cost), your opponent's Active Pokémon is now Burned and Confused.";
  assert.deepEqual(branches(conditional), []);
});

test('three statuses in one clause all apply (Radiant Venusaur Pollen Hazard)', () => {
  const text = "Your opponent's Active Pokémon is now Burned, Confused, and Poisoned.";
  assert.deepEqual(applied(text, {}).defenderConditions, ['Burned', 'Confused', 'Poisoned']);
});

test('the target comes from the status clause, not another subject in the sentence', () => {
  const text =
    "This Pokémon does 30 damage to itself, and your opponent's Active Pokémon is now Confused.";
  assert.deepEqual(applied(text, {}), { defenderConditions: ['Confused'], attackerConditions: [] });
});

test('a first-flip clause is not dropped by a threshold clause in the same text', () => {
  const text =
    "Flip 2 coins. If both of them are tails, your opponent's Active Pokémon is now Asleep. If the first flip is tails, your opponent's Active Pokémon is now Paralyzed.";
  assert.deepEqual(
    applied(text, { coin: 'tails', headsCount: 0, flips: ['tails', 'tails'] }).defenderConditions,
    ['Paralyzed', 'Asleep']
  );
});

test('an empty or status-free text has no branches', () => {
  assert.deepEqual(branches(''), []);
  assert.deepEqual(branches('Flip a coin. If tails, this attack does nothing.'), []);
  assert.deepEqual(branches('This attack does 30 damage.'), []);
});

// ── reducer integration ─────────────────────────────────────────────────────

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

function board(text, { name = 'Attacker', damage = '0', seed = 5 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-status', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Test Attack', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(mon('Defender', { hp: 400 }));
  return { state, rng: createRng(seed) };
}

/** Attacks with the first seed whose coin lands on `face`. */
function attackOn(face, text, options = {}) {
  for (let seed = 1; seed <= 60; seed++) {
    const b = board(text, { ...options, seed });
    const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
    assert.equal(res.error, null);
    const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
    if (flip?.coin === face) return res;
  }
  throw new Error(`no seed lands ${face}`);
}

test('reducer: Lilligant Bemusing Aroma applies each face’s status', () => {
  const text =
    "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
  const heads = attackOn('heads', text, { name: 'Lilligant', damage: '30' });
  assert.deepEqual(
    new Set(listConditions(heads.state.players.p2.zones.active[0])),
    new Set(['Paralyzed', 'Poisoned'])
  );
  const tails = attackOn('tails', text, { name: 'Lilligant', damage: '30' });
  assert.deepEqual(listConditions(tails.state.players.p2.zones.active[0]), ['Confused']);
});

test('reducer: Swinub Freezing Breath applies one status per face', () => {
  const text =
    "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed. If tails, your opponent's Active Pokémon is now Asleep.";
  const heads = attackOn('heads', text, { name: 'Swinub' });
  assert.deepEqual(listConditions(heads.state.players.p2.zones.active[0]), ['Paralyzed']);
  // The same command's Checkup may flip Asleep away before the state is returned, so the
  // applied-status event is the evidence for the tails face.
  const tails = attackOn('tails', text, { name: 'Swinub' });
  assert.ok(
    tails.events.some((e) => e.type === 'specialConditionUpdated' && e.condition === 'Asleep'),
    'Asleep applied on tails'
  );
});

test('reducer: a KO’d defender takes no status', () => {
  const text =
    "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed. If tails, your opponent's Active Pokémon is now Confused.";
  const res = attackOn('heads', text, { name: 'Lilligant', damage: '9999' });
  assert.equal(res.state.players.p2.zones.active.length, 0);
});
