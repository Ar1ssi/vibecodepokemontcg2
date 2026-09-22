import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_FORMATS,
  detectDeckFormat,
  isPocketCard,
  officialCardName,
  validateDeck,
} from '../core/deck-validation.mjs';

function makeGroup({ name, count, supertype = 'Pokémon', pocket = false, extra = {} }) {
  const image = pocket
    ? `https://example.com/tcgp/${name}.png`
    : `https://example.com/tcg/${name}.png`;

  return {
    [name]: {
      totalCount: count,
      cards: [
        {
          count,
          data: {
            id: `${name}-1`,
            name,
            supertype,
            image,
            ...extra,
          },
        },
      ],
    },
  };
}

function buildDeck(groups) {
  return Object.assign({}, ...groups);
}

test('isPocketCard detects tcgp image paths', () => {
  assert.equal(isPocketCard({ image: 'https://example.com/tcgp/card.png' }), true);
  assert.equal(isPocketCard({ image: 'https://example.com/tcg/card.png' }), false);
});

test('valid 60-card TCG deck passes validation', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, supertype: 'Pokémon' }),
    makeGroup({ name: 'Switch', count: 4, supertype: 'Trainer' }),
    makeGroup({ name: 'Lightning Energy', count: 52, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, true);
  assert.equal(result.totalCards, 60);
  assert.equal(result.requiredCards, 60);
  assert.equal(result.errors.length, 0);
});

test('valid 20-card Pocket deck passes validation', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 2, supertype: 'Pokémon', pocket: true }),
    makeGroup({ name: 'Potion', count: 2, supertype: 'Trainer', pocket: true }),
    makeGroup({ name: 'Lightning Energy', count: 16, supertype: 'Energy', pocket: true }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.POCKET);
  assert.equal(result.isValid, true);
  assert.equal(result.totalCards, 20);
  assert.equal(result.requiredCards, 20);
  assert.equal(result.errors.length, 0);
});

test('TCG deck fails when card count is not exactly 60', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, supertype: 'Pokémon' }),
    makeGroup({ name: 'Lightning Energy', count: 10, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, false);
  assert.match(result.errors[0], /Deck must contain exactly 60 cards/);
});

test('Pocket deck fails when non-energy copies exceed 2', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 3, supertype: 'Pokémon', pocket: true }),
    makeGroup({ name: 'Lightning Energy', count: 17, supertype: 'Energy', pocket: true }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.POCKET);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('Pikachu has 3 copies (max 2).')));
});

test('TCG deck fails when non-energy copies exceed 4', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Switch', count: 5, supertype: 'Trainer' }),
    makeGroup({ name: 'Lightning Energy', count: 55, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('Switch has 5 copies (max 4).')));
});

test('Energy cards are exempt from copy limits', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, supertype: 'Pokémon' }),
    makeGroup({ name: 'Lightning Energy', count: 56, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, true);
});

test('mixed TCG and Pocket pools fail validation', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 2, supertype: 'Pokémon', pocket: true }),
    makeGroup({ name: 'Switch', count: 18, supertype: 'Trainer', pocket: false }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.POCKET);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('mix of TCG and Pocket cards')));
});

test('Pocket format rejects TCG cards', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 20, supertype: 'Energy', pocket: false }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.POCKET);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('Pocket format selected, but deck contains TCG cards.')));
});

test('TCG format rejects Pocket cards', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 60, supertype: 'Energy', pocket: true }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('TCG format selected, but deck contains Pocket cards.')));
});

// ---------------------------------------------------------------------------
// detectDeckFormat
// ---------------------------------------------------------------------------

test('detectDeckFormat: all pocket cards → POCKET', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 10, pocket: true }),
    makeGroup({ name: 'Potion', count: 10, supertype: 'Trainer', pocket: true }),
  ]);
  assert.equal(detectDeckFormat(deck), DECK_FORMATS.POCKET);
});

test('detectDeckFormat: all TCG cards → TCG', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Charizard', count: 4, pocket: false }),
    makeGroup({ name: 'Switch', count: 56, supertype: 'Trainer', pocket: false }),
  ]);
  assert.equal(detectDeckFormat(deck), DECK_FORMATS.TCG);
});

test('detectDeckFormat: more pocket than TCG → POCKET', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 11, pocket: true }),
    makeGroup({ name: 'Charizard', count: 9, pocket: false }),
  ]);
  assert.equal(detectDeckFormat(deck), DECK_FORMATS.POCKET);
});

test('detectDeckFormat: more TCG than pocket → TCG', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 9, pocket: true }),
    makeGroup({ name: 'Charizard', count: 11, pocket: false }),
  ]);
  assert.equal(detectDeckFormat(deck), DECK_FORMATS.TCG);
});

test('detectDeckFormat: equal pocket and TCG → TCG (tie defaults to TCG)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 10, pocket: true }),
    makeGroup({ name: 'Charizard', count: 10, pocket: false }),
  ]);
  assert.equal(detectDeckFormat(deck), DECK_FORMATS.TCG);
});

test('detectDeckFormat: empty deck → TCG', () => {
  assert.equal(detectDeckFormat({}), DECK_FORMATS.TCG);
});

// ---------------------------------------------------------------------------
// Phase 3: deck-legality suite
// ---------------------------------------------------------------------------

test('deck with no Basic Pokémon is rejected (gap #6)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Haunter', count: 4, extra: { stage: 'Stage1' } }),
    makeGroup({ name: 'Gengar', count: 4, extra: { stage: 'Stage2' } }),
    makeGroup({ name: 'Lightning Energy', count: 52, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('at least one Basic Pokémon')));
});

test('deck with a Basic Pokémon satisfies the Basic requirement (gap #6)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 56, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(
    result.errors.some((e) => e.includes('Basic Pokémon')),
    false
  );
});

test('Special Energy is subject to the copy limit (gap #7)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({
      name: 'Double Turbo Energy',
      count: 6,
      supertype: 'Energy',
      extra: { energyType: 'Special' },
    }),
    makeGroup({ name: 'Lightning Energy', count: 50, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('Double Turbo Energy has 6 copies (max 4).')));
});

test('Special Energy subtype is subject to the copy limit (gap #7)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({
      name: 'Jet Energy',
      count: 5,
      supertype: 'Energy',
      extra: { subtypes: ['Special'] },
    }),
    makeGroup({ name: 'Lightning Energy', count: 51, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('Jet Energy has 5 copies (max 4).')));
});

test('Basic Energy remains exempt from the copy limit (gap #7)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 40, supertype: 'Energy' }),
    makeGroup({ name: 'Fire Energy', count: 16, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(
    result.errors.some((e) => e.includes('copies (max 4)')),
    false
  );
});

test('officialCardName strips Level and Team Plasma but keeps owner/form (gap #8)', () => {
  assert.equal(officialCardName({ name: 'Gengar LV.43' }), 'Gengar');
  assert.equal(officialCardName({ name: 'Gengar LV.X' }), 'Gengar');
  assert.equal(officialCardName({ name: 'Team Plasma Liepard' }), 'Liepard');
  assert.equal(officialCardName({ name: 'Alolan Meowth' }), 'Alolan Meowth');
  assert.equal(officialCardName({ name: "Rocket's Meowth" }), "Rocket's Meowth");
});

test('copy limit groups Level variants under one official name (gap #8)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Gengar', count: 4, extra: { stage: 'Stage2' } }),
    makeGroup({ name: 'Gengar LV.43', count: 1, extra: { stage: 'Stage2' } }),
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 51, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('Gengar has 5 copies (max 4).')));
});

test('copy limit groups Team Plasma under the base name (gap #8)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Liepard', count: 3, extra: { stage: 'Stage1' } }),
    makeGroup({ name: 'Team Plasma Liepard', count: 2, extra: { stage: 'Stage1' } }),
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 51, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('Liepard has 5 copies (max 4).')));
});

test('owner/form names are not merged for the copy limit (gap #8)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Alolan Meowth', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Meowth', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 52, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(
    result.errors.some((e) => e.includes('copies (max 4)')),
    false
  );
});

test('more than one ACE SPEC total is rejected (gap #9)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({
      name: 'Prime Catcher',
      count: 1,
      supertype: 'Trainer',
      extra: { subtypes: ['Item', 'ACE SPEC'] },
    }),
    makeGroup({
      name: 'Computer Search',
      count: 1,
      supertype: 'Trainer',
      extra: { rarity: 'ACE SPEC Rare' },
    }),
    makeGroup({ name: 'Lightning Energy', count: 54, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('only 1 ACE SPEC card')));
});

test('more than one Radiant Pokémon is rejected (gap #10)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Radiant Greninja', count: 1, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Radiant Charizard', count: 1, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 54, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('only 1 Radiant Pokémon')));
});

test('two Prism Star copies of the same name are rejected (gap #11)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: '◇ Victini', count: 2, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 54, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.ok(result.errors.some((e) => e.includes('Prism Star')));
});

test('different Prism Star names may coexist (gap #11)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({ name: '◇ Victini', count: 1, extra: { stage: 'Basic' } }),
    makeGroup({ name: '◇ Shaymin', count: 1, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 54, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(
    result.errors.some((e) => e.includes('Prism Star')),
    false
  );
});

test('one ACE SPEC and one Radiant are legal (gaps #9, #10)', () => {
  const deck = buildDeck([
    makeGroup({ name: 'Pikachu', count: 4, extra: { stage: 'Basic' } }),
    makeGroup({
      name: 'Prime Catcher',
      count: 1,
      supertype: 'Trainer',
      extra: { subtypes: ['Item', 'ACE SPEC'] },
    }),
    makeGroup({ name: 'Radiant Greninja', count: 1, extra: { stage: 'Basic' } }),
    makeGroup({ name: 'Lightning Energy', count: 54, supertype: 'Energy' }),
  ]);

  const result = validateDeck(deck, DECK_FORMATS.TCG);
  assert.equal(result.isValid, true, result.errors.join('; '));
});
