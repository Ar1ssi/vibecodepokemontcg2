// The oracle gate (I113): execution rates from state-diff rows, ratcheted against a baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowObserved, familyRates, checkGate } from './oracle-gate.mjs';

const attack = (family, extra = {}) => ({
  kind: 'attack',
  family,
  tags: ['opp:active+dmg'],
  printedBase: 30,
  dealt: [30, 30],
  ...extra,
});

test('plain damage and KO fallout do not count as the family executing', () => {
  assert.equal(
    rowObserved(
      attack('flat', { tags: ['opp:active+dmg', 'ko', 'own:prizes->hand'] })
    ),
    false
  );
  assert.equal(
    rowObserved({ kind: 'ability', family: 'draw', tags: ['ability-used'] }),
    false
  );
});

test('a non-base state change counts as executed', () => {
  assert.equal(
    rowObserved(
      attack('status-asleep', { tags: ['opp:active+dmg', 'opp:status'] })
    ),
    true
  );
  assert.equal(
    rowObserved({
      kind: 'ability',
      family: 'draw',
      tags: ['ability-used', 'own:deck->hand'],
    }),
    true
  );
});

test("an ability's damage on the opponent's Active is its own effect, not attack fallout", () => {
  assert.equal(
    rowObserved({ kind: 'ability', family: 'on-opponent-evolve', tags: ['ability-used', 'opp:active+dmg'] }),
    true
  );
});

test('damage that differs from the printed base in any seed counts as executed', () => {
  assert.equal(
    rowObserved(attack('per-energy', { printedBase: 10, dealt: [10, 90] })),
    true
  );
  assert.equal(rowObserved(attack('coin-flip', { dealt: [30, 0] })), true);
});

test('seeds without an attackExecuted event (dealt null) are not read as damage changes', () => {
  assert.equal(rowObserved(attack('flat', { dealt: [null, 30] })), false);
  assert.equal(rowObserved(attack('flat', { tags: [], dealt: [] })), false);
});

test('zero-base attacks are observed through target damage or prize/discard events', () => {
  assert.equal(
    rowObserved(attack('bench-damage', { printedBase: 0, dealt: [0], deltas: [50, 50] })),
    true
  );
  assert.equal(
    rowObserved(attack('per-prize', { printedBase: 0, dealt: [0], eventTypes: ['prizesTaken'] })),
    true
  );
  assert.equal(
    rowObserved(attack('discard-opponent', { printedBase: 0, dealt: [0], eventTypes: ['cardsDiscarded'] })),
    true
  );
  assert.equal(
    rowObserved(attack('flat', { printedBase: 0, dealt: [0], deltas: [0, 0], eventTypes: ['attackExecuted'] })),
    false
  );
});

test('familyRates counts rows and observed rows per kind:family', () => {
  const rates = familyRates([
    attack('heal', { tags: ['own:heal'] }),
    attack('heal'),
    { kind: 'ability', family: 'heal', tags: ['own:heal'] },
  ]);
  assert.deepEqual(rates, {
    'attack:heal': { n: 2, observed: 1 },
    'ability:heal': { n: 1, observed: 1 },
  });
  assert.deepEqual(familyRates([]), {});
});

test('checkGate passes an unchanged rate and fails a drop of one row', () => {
  const baseline = { 'attack:heal': { n: 4, observed: 3 } };
  assert.deepEqual(
    checkGate({ 'attack:heal': { n: 4, observed: 3 } }, baseline).failures,
    []
  );
  const { failures } = checkGate(
    { 'attack:heal': { n: 4, observed: 2 } },
    baseline
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /attack:heal: observed 2\/4 < baseline 3\/4/);
});

test('checkGate warns on families new since, or gone from, the baseline', () => {
  const { failures, warnings } = checkGate(
    { 'attack:new': { n: 1, observed: 0 } },
    { 'attack:old': { n: 2, observed: 1 } }
  );
  assert.deepEqual(failures, []);
  assert.deepEqual(warnings.sort(), [
    'attack:new: not in baseline',
    'attack:old: in baseline but no rows now',
  ]);
});

test('an executed family never observed fails, even when the baseline agrees, unless oracle-blind', () => {
  const rates = {
    'attack:switch': { n: 5, observed: 0 },
    'ability:hp-bonus': { n: 3, observed: 0 },
  };
  const opts = {
    executedAttack: new Set(['switch']),
    executedAbility: new Set(['hp-bonus']),
  };
  const { failures } = checkGate(rates, rates, opts);
  assert.deepEqual(failures, [
    'attack:switch: listed executed but 0/5 rows show an effect',
    'ability:hp-bonus: listed executed but 0/3 rows show an effect',
  ]);
  const blind = new Map([['ability:hp-bonus', 'passive']]);
  const blinded = checkGate(rates, rates, { ...opts, blind });
  assert.equal(blinded.failures.length, 1);
  assert.deepEqual(blinded.warnings, [
    'ability:hp-bonus: listed executed, oracle-blind (passive)',
  ]);
});

test('an executed family with no rows in the corpus is neither failure nor warning', () => {
  const { failures, warnings } = checkGate(
    {},
    {},
    { executedAttack: new Set(['lost-zone']) }
  );
  assert.deepEqual([failures, warnings], [[], []]);
});
