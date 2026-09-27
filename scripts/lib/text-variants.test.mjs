// Typography fuzz: TCGdex prints curly apostrophes (SM era, Dusk Shot) and type words (BW/DP
// era, "attach a Fire Energy card"); the gates must catch a parser that reads only the corpus form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tcgdexVariants, comparableOutput, parseDrift } from './text-variants.mjs';

test('tcgdexVariants spells the corpus text the way TCGdex prints it', () => {
  assert.deepEqual(tcgdexVariants("Attach a {R} Energy to your opponent's Pokémon."), {
    curly: 'Attach a {R} Energy to your opponent’s Pokémon.',
    typeWords: "Attach a Fire Energy to your opponent's Pokémon.",
  });
  assert.deepEqual(tcgdexVariants('Heal 30 damage.'), {}, 'no variant when nothing differs');
});

test('comparableOutput folds spelling, not structure', () => {
  assert.equal(
    comparableOutput({ type: 'attach', energy: '{R}', guidance: "opponent's" }),
    comparableOutput({ type: 'attach', energy: 'Fire', guidance: 'something else' })
  );
  assert.notEqual(comparableOutput({ count: 1 }), comparableOutput({ count: 2 }));
});

test('parseDrift names the parser and the spelling it misreads', () => {
  const asciiOnly = (t) => /opponent's/.test(t);
  const normalizing = (t) => /opponent['’]s/.test(t);
  const symbolOnly = (t) => /\{R\}/.test(t);
  assert.deepEqual(
    parseDrift("Discard a {R} Energy from your opponent's Active Pokémon.", {
      asciiOnly,
      normalizing,
      symbolOnly,
    }),
    ['curly:asciiOnly', 'typeWords:symbolOnly']
  );
});

test('parseDrift reports a throw on one spelling as drift', () => {
  const picky = (t) => {
    if (t.includes('’')) throw new Error('bad quote');
    return 1;
  };
  assert.deepEqual(parseDrift("your opponent's", { picky }), ['curly:picky']);
});
