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
} from './ability-behaviour.mjs';

const SWITCH =
  'Once during your turn, you may use this Ability. Switch your Active Pokémon with 1 of your Benched Pokémon.';
const PASSIVE =
  "As long as Scizor ex's remaining HP is 60 or less, Scizor ex does 40 more damage to the Defending Pokémon (before applying Weakness and Resistance).";
// Ninjask ROS Wing Buzz: parsed as discardOpponentDeckAbility, which has no executor.
const UNEXECUTED =
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
  const plan = abilityPlan(UNEXECUTED, 'Ninjask');
  assert.equal(plan.activated, true);
  assert.ok(plan.unexecutable.includes('discardOpponentDeckAbility'));
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
  assert.equal(behaviourClass(row(PASSIVE, [])), 'passive');
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
    { family: 'passive', behaviour: 'passive' },
  ]);
  assert.deepEqual(counts.switch, {
    n: 2,
    runs: 1,
    partial: 0,
    dead: 1,
    passive: 0,
    unparsed: 0,
  });
  assert.equal(counts.passive.passive, 1);
  assert.deepEqual(totalCounts(counts), {
    n: 3,
    runs: 1,
    partial: 0,
    dead: 1,
    passive: 1,
    unparsed: 0,
  });
});

const fam = (n, runs, dead = 0, extra = {}) => ({
  n,
  runs,
  partial: 0,
  dead,
  passive: n - runs - dead,
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
    { draw: fam(10, 6, 2, { unparsed: 1, passive: 1 }) },
    base
  );
  assert.match(unparsed.failures[0], /draw: unparsed 1\/10/);
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
