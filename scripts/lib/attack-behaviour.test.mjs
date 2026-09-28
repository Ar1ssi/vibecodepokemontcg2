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
  costPoolFor,
  scanCorpus,
  unresolvedNoteMismatches,
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

test('attackVerdict: an unresolved printed count or condition is partial, a coin note is not', () => {
  const run = (note) => attackVerdict({ dealt: [30], tags: ['opp:active+dmg'], scaled: [{ notes: [note] }] });
  assert.equal(run('per-energy scaling — resolve the printed count'), 'partial');
  assert.equal(run('conditional +30 bonus — resolve the printed condition'), 'partial');
  assert.equal(run('coin: tails (attack effect)'), 'ok');
});

test('attackVerdict: evidence without a board tag still counts as an effect', () => {
  assert.equal(attackVerdict({ dealt: [0], preTurnEvents: ['cardsLookedAt'] }), 'ok');
  assert.equal(attackVerdict({ dealt: [0], tags: ['shuffle'] }), 'ok');
  // The opponent's turn-start draw is setup, not the attack's effect.
  assert.equal(attackVerdict({ dealt: [0], tags: ['opp:deck->hand'], oppDrew: false }), 'ran-no-effect');
  assert.equal(attackVerdict({ dealt: [0], tags: ['opp:deck->hand'], oppDrew: true }), 'ok');
});

test('attackVerdict: a skipped condition step keeps an executed no-op out of ran-no-effect', () => {
  assert.equal(attackVerdict({ dealt: [0], skipped: ['condition_unmet'] }), 'ok');
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

test('costPoolFor takes the max printed count per symbol', () => {
  assert.deepEqual(
    costPoolFor([{ cost: ['Fire', 'Fire'] }, { cost: ['Fire', 'Water', 'Water'] }, { cost: [] }]),
    { Fire: 2, Water: 2 }
  );
});

test('scanCorpus dedupes reprints, skips damage-only attacks and keeps engine indices aligned', () => {
  const text = [
    '→Probe One',
    'This attack does nothing.',
    '→No Effect 20',
    '→Heal Probe',
    'Heal 30 damage from this Pokémon.',
  ].join('\n');
  const rows = scanCorpus(
    [
      { name: 'Testmon', set: 'Test', number: '1', text },
      { name: 'Testmon', set: 'Test', number: '2', text },
    ],
    { seeds: [1] }
  );
  assert.deepEqual(
    rows.map((r) => `${r.attack} ${r.verdict}`),
    ['Probe One ran-no-effect', 'Heal Probe ok']
  );
  assert.deepEqual(rows[1].printings, ['Testmon [Test 1]', 'Testmon [Test 2]']);
  assert.equal(rows[1].key, attackKey('Heal Probe', 'Heal 30 damage from this Pokémon.'));
  assert.ok(rows[1].tags.includes('own:heal'));
});

test('gate fails a new engine error even when another seed kept the verdict', () => {
  const before = base({ a: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'ok' } });
  const { failures } = checkAttackGate([{ ...row('a', 'ok'), errors: ['THROW boom'] }], before);
  assert.deepEqual(failures, ['Testmon Probe: engine error THROW boom']);
});

test('gate passes a known error and reports it gone, and a new row with one fails', () => {
  const known = base({
    a: { name: 'Testmon', attack: 'Probe', family: 'heal', verdict: 'partial', errors: ['THROW boom'] },
  });
  assert.deepEqual(checkAttackGate([{ ...row('a', 'partial'), errors: ['THROW boom'] }], known).failures, []);
  assert.deepEqual(checkAttackGate([row('a', 'partial')], known).improvements, [
    'Testmon Probe: engine error gone (THROW boom)',
  ]);
  assert.deepEqual(checkAttackGate([{ ...row('b', 'ok'), errors: ['THROW boom'] }], base({})).failures, [
    'Testmon Probe: engine-error (new attack)',
  ]);
});

test('baselineOf stores error strings so a new throw is visible on the next run', () => {
  const baseline = baselineOf([
    { ...row('a', 'ok'), errors: ['THROW boom'] },
    { ...row('b', 'ok'), errors: [] },
  ]);
  assert.deepEqual(baseline.entries.a.errors, ['THROW boom']);
  assert.equal(baseline.entries.b.errors, undefined);
});

test('unresolvedNoteMismatches turns the engine\'s unread-condition notes into findings', () => {
  const scaled = [
    { notes: ['conditional +90 bonus — resolve the printed condition', 'coin flip pending — pass ctx.coin to resolve'] },
    { notes: ['+ 30 (condition met: x)', 'conditional +90 bonus — resolve the printed condition'] },
  ];
  // Deduped, and coin notes are outcomes of the flip, not unread text.
  assert.deepEqual(unresolvedNoteMismatches(scaled), [
    { mech: 'unresolved-damage', sentence: 'conditional +90 bonus — resolve the printed condition', conditional: false },
  ]);
});

test('lock sentences need lock evidence, not just the hit', () => {
  const itemLock = "During your opponent's next turn, they can't play any Item cards from their hand.";
  assert.equal(attackMismatches(itemLock, ['opp:active+dmg'])[0].mech, 'lock-opp-play');
  assert.deepEqual(attackMismatches(itemLock, ['opp:active+dmg', 'opp:play-lock']), []);
  assert.equal(attackMismatches("The Defending Pokémon can't retreat during your opponent's next turn.", [])[0].mech, 'lock-opp-pokemon');
  assert.equal(attackMismatches("During your next turn, this Pokémon can't attack.", [])[0].mech, 'lock-self');
});

test('classifyAttackRow: a damage attack whose bonus, lock or typography is missed is partial', () => {
  const card = { name: 'Testmon', set: 'Test', number: '1' };
  const row = (damageText, text) =>
    classifyAttackRow(card, { name: 'Probe', cost: [], damageText, text }, 0, [{ name: 'Probe', cost: [], damage: damageText, text }], { seeds: [1] });

  // A parsed lock is observed on the player (Noivern-GX Distort wording).
  const distort = row('30', "Your opponent can't play any Item cards from their hand during their next turn.");
  assert.equal(distort.verdict, 'ok');
  assert.ok(distort.tags.includes('opp:play-lock'));

  // A resolved conditional bonus replays clean; its damage-only run was already ok.
  const stadium = row('30+', 'If there is any Stadium card in play, this attack does 90 more damage.');
  assert.equal(stadium.verdict, 'ok');
  assert.deepEqual(stadium.untestedBonus, []);

  // Unresolved: the engine notes it and the condition-true replay falls short (Keldeo ex Gale Thrust
  // wording, TCGdex sv10.5w-030). Built from a condition no reader knows so the test outlives fixes.
  const unread = row('30+', 'If this Pokémon is wearing a hat, this attack does 90 more damage.');
  assert.equal(unread.verdict, 'partial');
  assert.ok(unread.mismatches.some((m) => m.mech === 'unresolved-damage'));
  assert.deepEqual(unread.untestedBonus, ['this pokémon is wearing a hat']);
});