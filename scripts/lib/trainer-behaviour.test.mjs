import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trainerKey,
  classifyTrainer,
  classifyCorpus,
  baselineOf,
  checkTrainerGate,
} from './trainer-behaviour.mjs';

const DRAW = { name: 'Draw Thing', subtype: 'Item', text: 'Draw 2 cards.' };
const NONSENSE = { name: 'Mystery', subtype: 'Item', text: 'Zorp the blorp.' };
const MIRAGE = {
  name: 'Mirage Gate',
  subtype: 'Item',
  text: 'You can use this card only if you have 7 or more cards in the Lost Zone. Search your deck for up to 2 basic Energy cards of different types and attach them to your Pokémon in any way you like. Then, shuffle your deck.',
};

test('trainerKey: reprints share a key, different text does not', () => {
  assert.equal(trainerKey(DRAW), trainerKey({ ...DRAW, subtype: 'Supporter' }));
  assert.notEqual(trainerKey(DRAW), trainerKey({ ...DRAW, text: 'Draw 3 cards.' }));
  assert.equal(trainerKey({}), trainerKey({ name: '(unnamed)', text: '' }));
});

test('classifyTrainer: executable card has no gaps; unknown wording is a gap', () => {
  assert.deepEqual(classifyTrainer(DRAW).gaps, []);
  assert.ok(classifyTrainer(NONSENSE).gaps.length > 0);
  assert.equal(classifyTrainer(MIRAGE).playCondition, 'lostZone>=7');
  assert.deepEqual(classifyTrainer(null).gaps.length > 0, true);
});

test('checkTrainerGate: new gaps and lost play conditions fail; closures and new cards do not', () => {
  const corpus = classifyCorpus([DRAW, DRAW, MIRAGE]);
  assert.equal(corpus.length, 2);
  const baseline = baselineOf(corpus);
  assert.deepEqual(checkTrainerGate(corpus, baseline), { failures: [], improvements: [], added: [] });

  const regressed = corpus.map((c) =>
    c.name === 'Draw Thing' ? { ...c, gaps: ['server-missing:draw'] } : { ...c, playCondition: null }
  );
  const result = checkTrainerGate(regressed, baseline);
  assert.equal(result.failures.length, 2);

  const improvedBaseline = { entries: { ...baseline.entries, [trainerKey(DRAW)]: { gaps: ['empty'] } } };
  const improved = checkTrainerGate(corpus, improvedBaseline);
  assert.deepEqual(improved.failures, []);
  assert.equal(improved.improvements.length, 1);

  const withNew = checkTrainerGate(classifyCorpus([DRAW, MIRAGE, NONSENSE]), baseline);
  assert.deepEqual(withNew.failures, []);
  assert.deepEqual(withNew.added, [trainerKey(NONSENSE)]);
});
