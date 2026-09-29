import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticGaps, classifyTrainer, checkTrainerGate } from './trainer-behaviour.mjs';

// Texts are corpus rows (out/pkmn-trainer-cards.json); the steps are what the parser used to
// emit for them before S332, so each tag names a bug the step-type gate let through.

test('loose-what: a kinded pick parsed as any card', () => {
  const vsSeeker = 'Put a Supporter card from your discard pile into your hand.';
  assert.deepEqual(semanticGaps(vsSeeker, [{ type: 'recursion', what: 'card', from: 'discard' }]), ['loose-what']);
  assert.deepEqual(semanticGaps(vsSeeker, [{ type: 'recursion', what: 'Supporter', count: 1, from: 'discard' }]), []);
});

test('merged-kinds: "a X and a Y card" parsed as one pick', () => {
  const arven =
    'Search your deck for an Item card and a Pokémon Tool card, reveal them, and put them into your hand. Then, shuffle your deck.';
  assert.deepEqual(semanticGaps(arven, [{ type: 'searchDeck', what: 'Item + Pokémon Tool', count: 1 }]), ['merged-kinds']);
  assert.deepEqual(
    semanticGaps(arven, [{ type: 'searchDeckSequence', stages: [{ what: 'Item', count: 1 }, { what: 'Pokémon Tool', count: 1 }] }]),
    []
  );
});

test('dropped-count: a printed "up to N" the steps do not carry', () => {
  const headset = 'Put up to 2 Supporter cards from your discard pile into your hand.';
  assert.deepEqual(semanticGaps(headset, [{ type: 'recursion', what: 'card', from: 'discard' }]), [
    'loose-what',
    'dropped-count',
  ]);
  assert.deepEqual(semanticGaps(headset, [{ type: 'recursion', what: 'Supporter', count: 2, from: 'discard' }]), []);
});

test('lost-draw: a leading "Draw N cards." with no draw step', () => {
  const roark = 'Draw 2 cards. Put a Basic Energy card from your discard pile into your hand.';
  assert.deepEqual(semanticGaps(roark, [{ type: 'recursion', what: 'Basic Energy', count: 1, from: 'discard' }]), ['lost-draw']);
  assert.deepEqual(
    semanticGaps(roark, [
      { type: 'draw', count: 2 },
      { type: 'recursion', what: 'Basic Energy', count: 1, from: 'discard' },
    ]),
    []
  );
});

test('classifyTrainer carries semantic tags into gaps; the fixed parser emits none for Arven', () => {
  const arven = classifyTrainer({
    name: 'Arven',
    subtype: 'Supporter',
    text: 'Search your deck for an Item card and a Pokémon Tool card, reveal them, and put them into your hand. Then, shuffle your deck.',
  });
  assert.deepEqual(arven.gaps, []);
  assert.deepEqual(arven.steps, ['searchDeckSequence']);
});

test('checkTrainerGate: searchDeck → searchDeckSequence is an upgrade, not a lost step', () => {
  const now = [{ key: 'Hilda#x', name: 'Hilda', gaps: [], playCondition: null, steps: ['searchDeckSequence'] }];
  const baseline = { entries: { 'Hilda#x': { steps: ['searchDeck'] } } };
  const { failures, improvements } = checkTrainerGate(now, baseline);
  assert.deepEqual(failures, []);
  assert.deepEqual(improvements, ['Hilda#x: step searchDeck upgraded']);
});
