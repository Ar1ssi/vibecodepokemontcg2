// The attack-behaviour gate (design 036 slice 16): sentence cross-check verdicts over the
// engine's rich-board observation, ratcheted per unique attack against a baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackKey,
  attackMismatches,
  attackVerdict,
  classCounts,
  totalCounts,
  baselineOf,
  checkAttackGate,
  classifyAttackRow,
} from './attack-behaviour.mjs';

test('attackKey folds reprints and text edits', () => {
  assert.equal(attackKey('Brain Crush', 'If X, this attack does nothing.'), attackKey('brain crush', 'if x,  this attack does nothing.'));
  assert.notEqual(attackKey('Brain Crush', 'If X, this attack does nothing.'), attackKey('Brain Crush', 'If Y, this attack does nothing.'));
});

test('attackMismatches flags a sentence whose mechanic changed nothing', () => {
  const text = 'Heal 30 damage from this Pokémon.';
  assert.deepEqual(attackMismatches(text, ['own:heal']), []);
  const [miss] = attackMismatches(text, []);
  assert.equal(miss.mech, 'heal');
  assert.equal(miss.conditional, false);
  const conditional = attackMismatches('If this Pokémon is Confused, heal 30 damage from it.', []);
  assert.equal(conditional[0].mech, 'heal');
  assert.equal(conditional[0].conditional, true);
});

test('attackVerdict: a no-effect attack with no gate is ran-no-effect', () => {
  assert.equal(attackVerdict({ dealt: [0, 0] }), 'ran-no-effect');
  assert.equal(attackVerdict({ dealt: [0], tags: ['own:heal'] }), 'ok');
});

test('attackVerdict: evidence without a board tag still counts as an effect', () => {
  assert.equal(attackVerdict({ dealt: [0], preTurnEvents: ['cardsLookedAt'] }), 'ok');
  assert.equal(attackVerdict({ dealt: [0], tags: ['shuffle'] }), 'ok');
  // The opponent's turn-start draw is setup, not the attack's effect.
  assert.equal(attackVerdict({ dealt: [0], tags: ['opp:deck->hand'], oppDrew: false }), 'ran-no-effect');
  assert.equal(attackVerdict({ dealt: [0], tags: ['opp:deck->hand'], oppDrew: true }), 'ok');
});

test('attackVerdict: a failed condition gate and a skipped step are not no-effect bugs', () => {
  assert.equal(attackVerdict({ dealt: [null], skipped: ['condition_unmet'] }), 'ok');
});

test('attackVerdict: a missing sentence mechanic is partial, a throw is engine-error', () => {
  assert.equal(attackVerdict({ dealt: [30], tags: ['opp:active+dmg'], mismatches: [{ mech: 'heal' }] }), 'partial');
  assert.equal(attackVerdict({ dealt: [null], errors: ['THROW boom'] }), 'engine-error');
});

test('classCounts and totalCounts tally per family', () => {
  const counts = classCounts([
    { family: 'heal', verdict: 'ok' },
    { family: 'heal', verdict: 'partial' },
    { family: 'coin-flip', verdict: 'ran-no-effect' },
  ]);
  assert.deepEqual(counts.heal, {
    n: 2,
    ok: 1,
    partial: 1,
    'ran-no-effect': 0,
    'engine-error': 0,
  });
  assert.deepEqual(totalCounts(counts), {
    n: 3,
    ok: 1,
    partial: 1,
    'ran-no-effect': 1,
    'engine-error': 0,
  });
});

const base = (entries) => ({ entries });
const row = (key, verdict, family = 'heal', name = 'Testmon', attack = 'Probe') => ({
  key,
  card: name,
  attack,
  family,
  verdict,
});

test('gate passes an unchanged row and reports an improvement', () => {
  const before = base({ a: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'ok' } });
  assert.deepEqual(checkAttackGate([row('a', 'ok')], before), {
    failures: [],
    improvements: [],
    warnings: [],
  });
  const regressedFrom = base({ a: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'ran-no-effect' } });
  assert.deepEqual(checkAttackGate([row('a', 'ok')], regressedFrom).improvements, [
    'Testmon Probe: ran-no-effect → ok',
  ]);
});

test('gate fails a verdict drop and a new engine error', () => {
  const before = base({ a: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'ok' } });
  const dropped = checkAttackGate([row('a', 'ran-no-effect')], before);
  assert.deepEqual(dropped.failures, ['Testmon Probe: ok → ran-no-effect']);
  const thrown = checkAttackGate([row('b', 'engine-error')], base({}));
  assert.deepEqual(thrown.failures, ['Testmon Probe: engine-error (new attack)']);
});

test('gate reports new and vanished rows, and a family change, without failing', () => {
  const before = base({
    gone: { name: 'Oldmon', attack: 'Old', family: 'heal', verdict: 'ok' },
    moved: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'ok' },
  });
  const { failures, warnings } = checkAttackGate([row('moved', 'ok', 'coin-flip'), row('new', 'ok')], before);
  assert.deepEqual(failures, []);
  assert.deepEqual(warnings.sort(), [
    'Oldmon Old: in baseline but not in the corpus (text edited?)',
    'Testmon Probe: family heal → coin-flip',
    'Testmon Probe: new to the corpus (ok)',
  ]);
});

test('baselineOf keys rows by attackKey with their family and verdict', () => {
  const rows = [
    { ...row('b', 'partial', 'heal', 'Bmon', 'B'), key: 'b' },
    { ...row('a', 'ok', 'coin-flip', 'Amon', 'A'), key: 'a' },
  ];
  const baseline = baselineOf(rows, { seeds: [1], corpus: 'test.json' });
  assert.equal(baseline.unique, 2);
  assert.deepEqual(Object.keys(baseline.entries), ['a', 'b']);
  assert.deepEqual(baseline.entries.a, { name: 'Amon', attack: 'A', family: 'coin-flip', verdict: 'ok' });
});

test('classifyAttackRow: the engine observation feeds the verdict (integration)', () => {
  const card = { name: 'Testmon', set: 'Test', number: '1' };
  const item = (text) => ({ name: 'Probe', cost: [], damageText: '', text });
  const all = (text) => [{ name: 'Probe', cost: [], damage: '', text }];

  const discard = classifyAttackRow(card, item('Discard 2 Energy from this Pokémon.'), 0, all('Discard 2 Energy from this Pokémon.'), { seeds: [1] });
  assert.equal(discard.verdict, 'ok');
  assert.ok(discard.tags.includes('own:attached->discard'));

  const noop = classifyAttackRow(card, item('This attack does nothing.'), 0, all('This attack does nothing.'), { seeds: [1] });
  assert.equal(noop.verdict, 'ran-no-effect');
  assert.equal(noop.family, 'unknown');
});
