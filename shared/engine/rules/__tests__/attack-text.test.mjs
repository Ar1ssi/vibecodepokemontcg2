// TCGdex type-word spellings fold to {X} symbols before any attack or ability parser reads them.
// Texts: Houndoom (Undaunted 82) style "Fire Energy", Rotom Type Shift (POP Series 9 5),
// Azumarill Glistening Bubbles (Surging Sparks 074), Dark Electrode Darkness Navigation
// (Team Rocket Returns 4), each in the TCGdex word spelling of its out/pkmn-pokemon-cards.json row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttackText, symbolizeTypeWords } from '../attack-text.mjs';
import { parseAbility } from '../abilities.mjs';

test('symbolizeTypeWords: type words that name a type become symbols', () => {
  assert.equal(symbolizeTypeWords('Attach a Fire Energy card to it.'), 'Attach a {R} Energy card to it.');
  assert.equal(symbolizeTypeWords('This attack costs ColorlessColorless less.'), 'This attack costs {C}{C} less.');
  assert.equal(symbolizeTypeWords('1 of your Benched Water Pokémon'), '1 of your Benched {W} Pokémon');
  assert.equal(symbolizeTypeWords('Grass, Fire, and Water Pokémon'), '{G}, {R}, and {W} Pokémon');
  assert.equal(symbolizeTypeWords('basic Fire and basic Lightning Energy'), 'basic {R} and basic {L} Energy');
  assert.equal(symbolizeTypeWords("Rotom's type is Psychic until the end of your turn."), "Rotom's type is {P} until the end of your turn.");
  assert.equal(symbolizeTypeWords('can use the Double-Edge attack for Psychic.'), 'can use the Double-Edge attack for {P}.');
  assert.equal(symbolizeTypeWords('a Darkness or Dark Metal Energy'), 'a {D} or Dark Metal Energy');
});

test('symbolizeTypeWords: names and special Energy names keep their words', () => {
  for (const text of [
    'Dark Gyarados uses Dragon Rush.',
    'Search your deck for a Double Colorless Energy.',
    'attach a Dark Metal Energy or Double Dragon Energy',
    'Metal Flash does 30 damage.',
  ]) {
    assert.equal(symbolizeTypeWords(text), text);
  }
});

test('symbolizeTypeWords: empty and missing text', () => {
  assert.equal(symbolizeTypeWords(''), '');
  assert.equal(symbolizeTypeWords(undefined), '');
  assert.equal(symbolizeTypeWords(null), '');
});

test('normalizeAttackText reads a type word as its symbol', () => {
  assert.equal(normalizeAttackText('Discard a Fire Energy attached to this Pokémon.'), 'discard a {r} energy attached to this pokémon.');
});

test('parseAbility: the TCGdex word spelling parses like the symbol spelling', () => {
  const pairs = [
    [
      "Once during your turn (before your attack), you may use this power. Rotom's type is {P} until the end of your turn.",
      "Once during your turn (before your attack), you may use this power. Rotom's type is Psychic until the end of your turn.",
    ],
    [
      'If you have any Tera Pokémon in play, this Pokémon can use the Double-Edge attack for {P}.',
      'If you have any Tera Pokémon in play, this Pokémon can use the Double-Edge attack for Psychic.',
    ],
    [
      'Once during your turn (before your attack), if Dark Electrode has no Energy attached to it, you may search your deck for a {D} or Dark Metal Energy and attach it to Dark Electrode. Shuffle your deck afterward.',
      'Once during your turn (before your attack), if Dark Electrode has no Energy attached to it, you may search your deck for a Darkness or Dark Metal Energy and attach it to Dark Electrode. Shuffle your deck afterward.',
    ],
  ];
  for (const [symbols, words] of pairs) assert.deepEqual(parseAbility(words), parseAbility(symbols));
});
