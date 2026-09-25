// The ability-behaviour gate (design 034 slice 7): classes from the engine's step plan plus the
// oracle's observed state change, ratcheted per family against a baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityPlan,
  behaviourClass,
  classCounts,
  totalCounts,
  checkBehaviourGate,
  checkExecutedClaims,
  worksShare,
} from './ability-behaviour.mjs';

const SWITCH =
  'Once during your turn, you may use this Ability. Switch your Active Pokémon with 1 of your Benched Pokémon.';
const PASSIVE =
  "As long as Scizor ex's remaining HP is 60 or less, Scizor ex does 40 more damage to the Defending Pokémon (before applying Weakness and Resistance).";
// Espathra ex: an opponent attack-cost increase no reader applies yet.
const UNCONSUMED =
  "As long as this Pokémon is in the Active Spot, attacks used by your opponent's Active Pokémon cost {C} more.";
// Garganacl: read by abilityStatusImmune, which addCondition consults.
const CONSUMED = "This Pokémon can't be affected by any Special Conditions.";
// A hand-discard cost that runs, then resetInPlayAbility, which has no executor.
const UNEXECUTED =
  'Once per game during your turn, you may discard a card from your hand. If you do, each player shuffles all cards in play into their deck.';
// Ninjask ROS Wing Buzz: the hand cost and the opponent mill both run as attack steps (design 036 A11).
const NINJASK =
  "Once during your turn (before your attack), if this Pokémon is your Active Pokémon, you may discard a card from your hand. If you do, discard the top card of your opponent's deck.";

const row = (text, tags, extra = {}) => ({
  kind: 'ability',
  card: 'Testmon',
  family: 'switch',
  text,
  tags,
  ...extra,
});

test('abilityPlan reads the step plan useAbility runs', () => {
  assert.deepEqual(abilityPlan(SWITCH, 'Dragonite'), {
    activated: true,
    unexecutable: [],
  });
  assert.deepEqual(abilityPlan(PASSIVE, 'Scizor ex'), {
    activated: false,
    reason: 'passive',
  });
  assert.deepEqual(abilityPlan('', 'Dunsparce'), {
    activated: false,
    reason: 'unparsed',
  });
  const plan = abilityPlan(UNEXECUTED, 'Testmon');
  assert.equal(plan.activated, true);
  assert.ok(plan.unexecutable.includes('resetInPlayAbility'));
  assert.deepEqual(abilityPlan(NINJASK, 'Ninjask'), { activated: true, unexecutable: [] });
});

test('abilityPlan: the when-played trigger is not an unexecutable step beside a real effect', () => {
  const meowth =
    'When you play this Pokémon from your hand onto your Bench during your turn, you may use this Ability. Search your deck for a Supporter card, reveal it, and put it into your hand. Then, shuffle your deck.';
  assert.deepEqual(abilityPlan(meowth, 'Meowth ex'), { activated: true, unexecutable: [] });
});

test('abilityPlan: a trigger the server will not activate is passive even when its steps run', () => {
  const finalChain =
    "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, search your deck for a card and put it into your hand. Then, shuffle your deck.";
  assert.deepEqual(abilityPlan(finalChain, 'Pecharunt'), { activated: false, reason: 'passive' });
});

test("abilityPlan: a can't-attach lock is passive, not an attach button", () => {
  const water = "You can't attach {W} Energy cards from your hand to Articuno.";
  assert.deepEqual(abilityPlan(water, 'Articuno'), { activated: false, reason: 'passive' });
});

test('behaviourClass: runs, partial and dead need an observed state change', () => {
  assert.equal(
    behaviourClass(row(SWITCH, ['ability-used', 'own:active-changed'])),
    'runs'
  );
  assert.equal(behaviourClass(row(SWITCH, ['ability-used'])), 'dead');
  assert.equal(behaviourClass(row(SWITCH, [])), 'dead');
  assert.equal(
    behaviourClass(row(UNEXECUTED, ['own:hand->discard'])),
    'partial'
  );
  assert.equal(behaviourClass(row(UNEXECUTED, ['ability-used'])), 'dead');
  // Passive rows are classed by the probe: no reader applies Espathra's cost increase, while
  // the Special Condition immunity is read.
  assert.equal(behaviourClass(row(UNCONSUMED, [])), 'unconsumed');
  assert.equal(behaviourClass(row(CONSUMED, [])), 'consumed');
  // Damage counters on the opponent's Active are an ability's own effect, not attack noise.
  assert.equal(
    behaviourClass(row(SWITCH, ['ability-used', 'opp:active+dmg'])),
    'runs'
  );
  assert.equal(behaviourClass(row('', [])), 'unparsed');
});

test('classCounts and totalCounts tally per family', () => {
  const counts = classCounts([
    { family: 'switch', behaviour: 'runs' },
    { family: 'switch', behaviour: 'dead' },
    { family: 'passive', behaviour: 'consumed' },
  ]);
  assert.deepEqual(counts.switch, {
    n: 2,
    runs: 1,
    partial: 0,
    dead: 1,
    consumed: 0,
    unconsumed: 0,
    unparsed: 0,
  });
  assert.equal(counts.passive.consumed, 1);
  assert.deepEqual(totalCounts(counts), {
    n: 3,
    runs: 1,
    partial: 0,
    dead: 1,
    consumed: 1,
    unconsumed: 0,
    unparsed: 0,
  });
});

const fam = (n, runs, dead = 0, extra = {}) => ({
  n,
  runs,
  partial: 0,
  dead,
  consumed: n - runs - dead,
  unconsumed: 0,
  unparsed: 0,
  ...extra,
});

test('gate passes an unchanged or improved family', () => {
  const base = { draw: fam(10, 6, 2) };
  assert.deepEqual(
    checkBehaviourGate({ draw: fam(10, 6, 2) }, base).failures,
    []
  );
  assert.deepEqual(
    checkBehaviourGate({ draw: fam(10, 8, 0) }, base).failures,
    []
  );
});

test('gate fails a runs drop, a dead rise and an unparsed rise', () => {
  const base = { draw: fam(10, 6, 2) };
  const fewerRuns = checkBehaviourGate({ draw: fam(10, 5, 2) }, base).failures;
  assert.equal(fewerRuns.length, 1);
  assert.match(fewerRuns[0], /draw: runs 5\/10 vs baseline 6\/10/);
  // runs → dead fails on both ratchets.
  assert.equal(
    checkBehaviourGate({ draw: fam(10, 5, 3) }, base).failures.length,
    2
  );
  const unparsed = checkBehaviourGate(
    { draw: fam(10, 6, 2, { unparsed: 1, consumed: 1 }) },
    base
  );
  assert.match(unparsed.failures[0], /draw: unparsed 1\/10/);
});

test('gate fails a passive reader that stopped reading its text', () => {
  const base = { hp: fam(10, 0, 0) };
  const { failures } = checkBehaviourGate({ hp: fam(10, 0, 0, { consumed: 9, unconsumed: 1 }) }, base);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /hp: unconsumed 1\/10 vs baseline 0\/10/);
});

test('gate compares shares, so a grown corpus with the same rates passes', () => {
  const base = { draw: fam(10, 6, 2) };
  assert.deepEqual(
    checkBehaviourGate({ draw: fam(20, 12, 4) }, base).failures,
    []
  );
});

test('gate warns on new and vanished families', () => {
  const { failures, warnings } = checkBehaviourGate(
    { heal: fam(1, 1) },
    { draw: fam(1, 1) }
  );
  assert.deepEqual(failures, []);
  assert.deepEqual(warnings.sort(), [
    'draw: in baseline but no rows now',
    'heal: not in baseline',
  ]);
});

test('executed claims need half the family running or read (D136)', () => {
  const counts = {
    draw: fam(10, 6, 2), // 6 runs + 2 consumed = 80%
    evolve: fam(10, 0, 0, { consumed: 0, partial: 10 }),
    tool: fam(4, 0, 0, { consumed: 4 }),
  };
  assert.equal(worksShare(counts.draw), 0.8);
  const { failures, warnings } = checkExecutedClaims(counts, new Set(['draw', 'evolve', 'ghost']));
  assert.deepEqual(failures, [
    'evolve: claimed executed but only 0/10 rows run or are read',
    'ghost: claimed executed but has no ability rows',
  ]);
  assert.deepEqual(warnings, ['tool: 4/4 rows work — not claimed executed']);
});
