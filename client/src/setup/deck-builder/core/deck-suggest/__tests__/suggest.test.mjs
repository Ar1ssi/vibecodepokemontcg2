import test from 'node:test';
import assert from 'node:assert/strict';

import { indexDataset } from '../dataset.mjs';
import * as prefsModule from '../prefs.mjs';
import { EMPTY_PREFS, dismissKey, lockKey, toggleGoal } from '../prefs.mjs';
import {
  deckToCounts,
  describeList,
  findNeighbors,
  metaOverview,
  resolveDeckCard,
  suggestCards,
} from '../suggest.mjs';
import { CARD, deckOf, fixtureDataset } from './fixture-dataset.mjs';

const index = indexDataset(fixtureDataset());
// Six fixture lists: ask for 3 neighbours so the fixture can reach "high" confidence.
const OPTS = { minNeighbors: 3 };
const DRAGAPULT_DECK = deckOf([
  { id: 'sv06-128', name: 'Dreepy', count: 4 },
  { id: 'sv06-130', name: 'Dragapult ex', count: 3 },
]);
const names = (items) => items.map((item) => item.name);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

test('empty deck → confidence none, nothing suggested', () => {
  const result = suggestCards({}, index, OPTS);
  assert.equal(result.confidence, 'none');
  assert.equal(result.reason, 'empty');
  assert.equal(result.neighbors, 0);
  assert.deepEqual([result.missingCore, result.techs, result.cuts, result.countTweaks], [[], [], [], []]);
});

test('a deck the data has never seen → confidence none / no-match, its cards are not cuts', () => {
  const result = suggestCards(deckOf([{ name: 'Mystery Card', count: 2 }]), index, OPTS);
  assert.equal(result.confidence, 'none');
  assert.equal(result.reason, 'no-match');
  assert.deepEqual(result.cuts, []);
  assert.deepEqual(result.unresolved, ['Mystery Card']);
});

test('findNeighbors: containment picks the four Dragapult lists, similarity² weights', () => {
  const { counts } = deckToCounts(DRAGAPULT_DECK, index);
  const { neighbors, confidence } = findNeighbors(counts, index, OPTS);
  assert.equal(confidence, 'high');
  assert.deepEqual(neighbors.map((n) => n.listIdx), [0, 1, 3, 2]);
  close(neighbors[3].similarity, 6 / 7);
  close(neighbors[3].weight, (6 / 7) ** 2);
});

test('fewer lists than minNeighbors reach the threshold → confidence low, best lists anyway', () => {
  const { counts } = deckToCounts(DRAGAPULT_DECK, index);
  const { neighbors, confidence } = findNeighbors(counts, index);
  assert.equal(confidence, 'low');
  assert.equal(neighbors.length, 4);
});

test('suggestCards buckets: staples, techs, typical counts, archetype and deck price', () => {
  const result = suggestCards(DRAGAPULT_DECK, index, OPTS);
  assert.equal(result.confidence, 'high');
  assert.equal(result.neighbors, 4);
  assert.equal(suggestCards(DRAGAPULT_DECK, index).confidence, 'low');
  assert.equal(result.archetype.name, 'Dragapult');
  close(result.archetype.share, 1);
  assert.deepEqual(names(result.missingCore), ['Iono', 'Ultra Ball']);
  assert.deepEqual(result.missingCore.map((item) => item.typicalCount), [4, 4]);
  assert.deepEqual(names(result.techs), ['Darkness Energy', 'Munkidori', 'Counter Catcher']);
  const total = 3 + (6 / 7) ** 2;
  close(result.techs[0].inclusion, 2 / total);
  close(result.techs[2].inclusion, (1 + (6 / 7) ** 2) / total);
  assert.deepEqual(result.countTweaks, []);
  assert.deepEqual(result.cuts, []);
  assert.equal(result.deckPrice, 4 * 0.5 + 3 * 5);
  assert.equal(result.missingCore[0].key, 't:iono');
});

test('count tweak: you play 1 Iono where similar lists play 4', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv06-130', name: 'Dragapult ex', count: 3 },
    { id: 'sv04.5-080', name: 'Iono', count: 1 },
  ]);
  const result = suggestCards(deck, index, OPTS);
  assert.deepEqual(result.countTweaks.map((item) => [item.name, item.yourCount, item.typicalCount]), [['Iono', 1, 4]]);
  assert.ok(!names(result.missingCore).includes('Iono'));
});

test('cuts: an off-archetype card and an unknown card; a locked card is never a cut', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv06-130', name: 'Dragapult ex', count: 3 },
    { id: 'sv08-057', name: 'Pikachu ex', count: 1 },
    { name: 'Homebrew Card', count: 1 },
  ]);
  const result = suggestCards(deck, index, OPTS);
  assert.deepEqual(names(result.cuts), ['Homebrew Card', 'Pikachu ex']);
  assert.equal(result.cuts[0].key, 'x:homebrew card');

  const locked = suggestCards(deck, index, { ...OPTS, prefs: lockKey(EMPTY_PREFS, 'p:pikachu ex|topaz bolt|resolute heart') });
  assert.deepEqual(names(locked.cuts), ['Homebrew Card']);
  assert.ok(locked.deckKeys.find((entry) => entry.name === 'Pikachu ex').locked);
});

test('steering: dismissing Munkidori hides it and down-weights the lists built around it', () => {
  const before = suggestCards(DRAGAPULT_DECK, index, OPTS);
  const prefs = dismissKey(EMPTY_PREFS, 'p:munkidori|mind bend|adrena-brain');
  const after = suggestCards(DRAGAPULT_DECK, index, { ...OPTS, prefs });
  assert.ok(!names(after.techs).includes('Munkidori'));
  const darkness = (result) => result.techs.find((item) => item.name === 'Darkness Energy').inclusion;
  const total = 0.6 + 0.6 + 1 + (6 / 7) ** 2;
  close(darkness(after), 1.2 / total);
  assert.ok(darkness(after) < darkness(before));
  assert.equal(names(after.techs)[0], 'Counter Catcher');
});

test('steering: locking Counter Catcher pulls the lists that play it to the top', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv04-160', name: 'Counter Catcher', count: 1 },
    { id: 'sv06-095', name: 'Munkidori', count: 1 },
  ]);
  const { counts } = deckToCounts(deck, index);
  const plain = findNeighbors(counts, index, OPTS);
  assert.deepEqual(plain.neighbors.map((n) => n.similarity), [5 / 6, 5 / 6, 5 / 6, 5 / 6]);
  const locked = findNeighbors(counts, index, { ...OPTS, prefs: lockKey(EMPTY_PREFS, 't:counter catcher') });
  assert.deepEqual(locked.neighbors.slice(0, 2).map((n) => n.listIdx).sort(), [2, 3]);
  close(locked.neighbors[0].similarity, 6 / 7);
});

test('goals: setup picks tagged cards from your lists first, then the wider meta', () => {
  const prefs = toggleGoal(EMPTY_PREFS, 'setup');
  const result = suggestCards(DRAGAPULT_DECK, index, { ...OPTS, prefs });
  assert.deepEqual(names(result.goals.setup), ['Ultra Ball', 'Rare Candy']);
  close(result.goals.setup[1].score, 0.3 * (1 / 6));
});

test('goals: budget lists cheap cards similar lists play; dismissed cards stay out of goals', () => {
  const prefs = dismissKey(toggleGoal(toggleGoal(EMPTY_PREFS, 'budget'), 'disruption'), 't:counter catcher');
  const result = suggestCards(DRAGAPULT_DECK, index, { ...OPTS, prefs });
  assert.deepEqual(names(result.goals.budget), ['Ultra Ball', 'Darkness Energy', 'Munkidori']);
  assert.deepEqual(names(result.goals.disruption), ['Iono']);
});

test('goal with nothing to offer → empty list', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv01-194', name: 'Switch', count: 1 },
  ]);
  const result = suggestCards(deck, index, { ...OPTS, prefs: toggleGoal(EMPTY_PREFS, 'mobility') });
  assert.deepEqual(result.goals.mobility, []);
});

test('resolveDeckCard: print id, then name (Basic Energy alias), then ability match, else null', () => {
  assert.equal(resolveDeckCard({ id: 'sv04.5-080', name: 'Iono' }, index), CARD.iono);
  assert.equal(resolveDeckCard({ id: 'unknown-1', name: 'Basic Darkness Energy' }, index), CARD.darkness);
  assert.equal(resolveDeckCard({ name: 'Nobody' }, index), null);

  const twoPikachu = fixtureDataset();
  twoPikachu.cards.push({ ...twoPikachu.cards[CARD.pikachu], key: 'p:pikachu ex|thunder|', abilities: [], print: 'zz-1' });
  const twoIndex = indexDataset(twoPikachu);
  assert.equal(resolveDeckCard({ id: 'other', name: 'Pikachu ex', abilities: [] }, twoIndex), 11);
  assert.equal(resolveDeckCard({ id: 'other', name: 'Pikachu ex', abilities: ['Resolute Heart'] }, twoIndex), CARD.pikachu);
  // No ability match → the more-played one (index 7 appears in two lists; 11 in none).
  assert.equal(resolveDeckCard({ id: 'other', name: 'Pikachu ex', abilities: ['Nope'] }, twoIndex), CARD.pikachu);
});

test('deckToCounts sums prints of one card', () => {
  const deck = deckOf([
    { id: 'sv02-185', name: 'Iono', count: 2 },
    { id: 'sv04.5-080', name: 'Iono', count: 2 },
  ]);
  assert.deepEqual([...deckToCounts(deck, index).counts], [[CARD.iono, 4]]);
});

test('metaOverview: archetype shares and the best (highest placing) list of each', () => {
  const meta = metaOverview(index);
  assert.deepEqual(
    meta.map((row) => [row.archetype, row.lists, row.bestListIdx]),
    [
      ['Dragapult', 4, 0],
      ['Pikachu', 2, 4],
    ]
  );
  close(meta[0].share, 4 / 6);
  assert.equal(describeList(index, 4), '5th · Regional Louisville, KY · 2026-10-10');
  assert.equal(describeList(index, 0), '1st · Regional Louisville, KY · 2026-10-10');
});

test('findDeckCardForKey finds the deck card behind a steering key', async () => {
  const { findDeckCardForKey } = await import('../suggest.mjs');
  const deck = deckOf([
    { id: 'sv04.5-080', name: 'Iono', count: 2 },
    { name: 'Homebrew Card', count: 1 },
  ]);
  assert.equal(findDeckCardForKey(deck, index, 't:iono').id, 'sv04.5-080');
  assert.equal(findDeckCardForKey(deck, index, 'x:homebrew card').name, 'Homebrew Card');
  assert.equal(findDeckCardForKey(deck, index, 't:switch'), null);
  assert.equal(findDeckCardForKey(null, index, 't:iono'), null);
});

test('goals: an off-archetype Pokémon needs ≥10% of all lists; a Trainer only needs to be played', () => {
  const dataset = fixtureDataset();
  dataset.cards.push({ ...dataset.cards[CARD.pikachu], key: 'p:dwebble|ram|', name: 'Dwebble', print: 'zz-2', tags: ['setup'], abilities: [] });
  const dwebble = dataset.cards.length - 1;
  // Ten filler lists drop Rare Candy to 1/16 of the meta; Dwebble appears in one of them (1/16 < 10%).
  for (let i = 0; i < 10; i += 1) dataset.lists.push({ e: 0, p: 7, a: 1, c: i === 0 ? [CARD.lightning, 10, dwebble, 2] : [CARD.lightning, 10] });
  const result = suggestCards(DRAGAPULT_DECK, indexDataset(dataset), { ...OPTS, prefs: toggleGoal(EMPTY_PREFS, 'setup') });
  assert.deepEqual(names(result.goals.setup), ['Ultra Ball', 'Rare Candy']);
});

test('review #1: count tweaks carry a direction; playing more than usual is a "down" tweak', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv06-130', name: 'Dragapult ex', count: 4 },
  ]);
  const result = suggestCards(deck, index, OPTS);
  assert.deepEqual(
    result.countTweaks.map((item) => [item.name, item.yourCount, item.typicalCount, item.direction]),
    [['Dragapult ex', 4, 3, 'down']]
  );
  const kept = suggestCards(deck, index, { ...OPTS, prefs: lockKey(EMPTY_PREFS, 'p:dragapult ex|jet headbutt;phantom dive|') });
  assert.deepEqual(kept.countTweaks, []);
});

test('review #1: weightedMedian takes the higher count on an exact 50/50 split', async () => {
  const { weightedMedian } = await import('../suggest.mjs');
  assert.equal(weightedMedian([[1, 1], [4, 1]]), 4);
  assert.equal(weightedMedian([[1, 2], [4, 1]]), 1);
  assert.equal(weightedMedian([[3, 1], [4, 1], [4, 0.73], [4, 1]]), 4);
});

test('review #3: a dismissed card you play anyway does not penalise the lists that play it', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv06-130', name: 'Dragapult ex', count: 3 },
    { id: 'sv06-095', name: 'Munkidori', count: 2 },
  ]);
  const { counts } = deckToCounts(deck, index);
  const plain = findNeighbors(counts, index, OPTS);
  const dismissed = findNeighbors(counts, index, { ...OPTS, prefs: dismissKey(EMPTY_PREFS, 'p:munkidori|mind bend|adrena-brain') });
  assert.deepEqual(dismissed.neighbors, plain.neighbors);
});

test('review #4: one Ultra Ball or a pile of Basic Energy is never "high" confidence', () => {
  const ultra = suggestCards(deckOf([{ id: 'me01-131', name: 'Ultra Ball', count: 1 }]), index, OPTS);
  assert.equal(ultra.confidence, 'low');
  const energy = suggestCards(deckOf([{ id: 'mee-008', name: 'Basic Lightning Energy', count: 10 }]), index, OPTS);
  assert.equal(energy.confidence, 'low');
  // Six non-Energy copies the data knows is enough.
  const six = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv06-130', name: 'Dragapult ex', count: 2 },
  ]);
  assert.equal(suggestCards(six, index, OPTS).confidence, 'high');
});

test('accepted cards weigh 1.5× in similarity', () => {
  const deck = deckOf([
    { id: 'sv06-128', name: 'Dreepy', count: 4 },
    { id: 'sv04-160', name: 'Counter Catcher', count: 1 },
    { id: 'sv06-095', name: 'Munkidori', count: 1 },
  ]);
  const { counts } = deckToCounts(deck, index);
  const { acceptKey } = prefsModule;
  const result = findNeighbors(counts, index, { ...OPTS, prefs: acceptKey(EMPTY_PREFS, 'p:munkidori|mind bend|adrena-brain') });
  assert.deepEqual(result.neighbors.slice(0, 2).map((n) => n.listIdx).sort(), [0, 1]);
  close(result.neighbors[0].similarity, 5.5 / 6.5);
});
