import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCardId,
  isAncientCard,
  isFutureCard,
  paradoxTagOf,
  withParadoxSubtype,
} from '../paradox-tags.mjs';
import { PARADOX_TAGS } from '../paradox-tags.generated.mjs';

// Tags per printing: pokemontcg.io subtypes (sv4-124 Roaring Moon ex Basic/ex/Ancient, sv5-120
// Koraidon ex Ancient, sv5-122 Miraidon ex Future, sv4-70 Iron Hands ex Future, sv4pt5-53 Great
// Tusk ex Ancient) and untagged sv1-123 Great Tusk ex / sv7-90 Koraidon (Basic/ex, Basic).

test('canonicalCardId folds pokemontcg.io and TCGdex spellings to one key', () => {
  assert.equal(canonicalCardId('sv4-86'), 'sv04-086');
  assert.equal(canonicalCardId('SV04-86'), 'sv04-086');
  assert.equal(canonicalCardId('sv04-086'), 'sv04-086');
  assert.equal(canonicalCardId('sv4pt5-53'), 'sv04.5-053');
  assert.equal(canonicalCardId('sv04.5-53'), 'sv04.5-053');
  assert.equal(canonicalCardId('svp-67'), 'svp-067');
  assert.equal(canonicalCardId(' me02-024 '), 'me02-024');
  assert.equal(canonicalCardId(null), '');
});

test('paradoxTagOf reads the TCGdex id, either id spelling, and tcgId', () => {
  assert.equal(paradoxTagOf({ id: 'sv04-124', name: 'Roaring Moon ex' }), 'Ancient');
  assert.equal(paradoxTagOf({ id: 'sv4-86', name: 'Scream Tail' }), 'Ancient');
  assert.equal(paradoxTagOf({ tcgId: 'sv04-070', name: 'Iron Hands ex' }), 'Future');
  assert.equal(paradoxTagOf({ id: 'sv04.5-053', name: 'Great Tusk ex' }), 'Ancient');
  assert.equal(paradoxTagOf({ id: 'svp-067', name: 'Roaring Moon ex' }), 'Ancient');
});

test('paradoxTagOf reads image URLs from TCGdex and pokemontcg.io', () => {
  assert.equal(paradoxTagOf({ src: 'https://assets.tcgdex.net/en/sv/sv05/120/high.webp' }), 'Ancient');
  assert.equal(paradoxTagOf({ image: { src: 'https://images.pokemontcg.io/sv5/122_hires.png' } }), 'Future');
  assert.equal(paradoxTagOf({ imageURL: 'https://assets.tcgdex.net/en/sv/sv04/124/high.png' }), 'Ancient');
  assert.equal(paradoxTagOf({ images: { small: 'https://images.pokemontcg.io/sv4pt5/53.png' } }), 'Ancient');
});

test('paradoxTagOf reads set code or TCGdex set id plus number', () => {
  assert.equal(paradoxTagOf({ set: 'TEF', number: '122' }), 'Future');
  assert.equal(paradoxTagOf({ set: 'PAR', number: 124 }), 'Ancient');
  assert.equal(paradoxTagOf({ set: { id: 'sv05' }, localId: '120' }), 'Ancient');
});

test('the tag is per printing: untagged printings of Paradox species stay untagged', () => {
  assert.equal(paradoxTagOf({ id: 'sv01-123', name: 'Great Tusk ex' }), null);
  assert.equal(paradoxTagOf({ set: 'SVI', number: '125', name: 'Koraidon ex' }), null);
  assert.equal(paradoxTagOf({ id: 'sv07-090', name: 'Koraidon' }), null);
  assert.equal(paradoxTagOf({ name: 'Roaring Moon ex' }), null, 'a name alone never tags');
});

test('subtypes that name the tag answer first; Ancient Trait does not count', () => {
  assert.equal(paradoxTagOf({ subtypes: ['Basic', 'Future'] }), 'Future');
  assert.equal(paradoxTagOf({ subtypes: 'Basic, Ancient' }), 'Ancient');
  assert.equal(paradoxTagOf({ subtypes: ['Ancient Trait'] }), null);
  assert.equal(paradoxTagOf({ subtypes: ['EX'], name: 'Primal Groudon-EX', id: 'xy5-86' }), null);
});

test('paradoxTagOf fails closed on empty and malformed input', () => {
  assert.equal(paradoxTagOf(null), null);
  assert.equal(paradoxTagOf(undefined), null);
  assert.equal(paradoxTagOf('sv04-124'), null);
  assert.equal(paradoxTagOf({}), null);
  assert.equal(paradoxTagOf({ id: 42, src: 17, set: 'PAR', number: '' }), null);
  assert.equal(paradoxTagOf({ src: 'not a url', set: 'NOPE', number: 'x' }), null);
});

test('isAncientCard / isFutureCard', () => {
  assert.equal(isAncientCard({ id: 'sv04-124' }), true);
  assert.equal(isFutureCard({ id: 'sv04-124' }), false);
  assert.equal(isFutureCard({ id: 'sv05-122' }), true);
  assert.equal(isAncientCard(null), false);
});

test('withParadoxSubtype appends the tag once and never mutates its input', () => {
  const subtypes = ['ex'];
  assert.deepEqual(withParadoxSubtype(subtypes, { id: 'sv04-124' }), ['ex', 'Ancient']);
  assert.deepEqual(subtypes, ['ex']);
  assert.deepEqual(withParadoxSubtype(['Basic', 'Ancient'], { id: 'sv04-124' }), ['Basic', 'Ancient']);
  assert.deepEqual(withParadoxSubtype(['ex'], { id: 'sv01-123' }), ['ex']);
  assert.deepEqual(withParadoxSubtype(null, { id: 'sv05-122' }), ['Future']);
});

test('the generated table only holds Ancient/Future values on TCGdex-shaped ids', () => {
  const entries = Object.entries(PARADOX_TAGS);
  assert.ok(entries.length > 100);
  for (const [id, tag] of entries) {
    assert.match(id, /^sv(?:\d{2}(?:\.5)?|p)-\d{3}$/, id);
    assert.ok(tag === 'Ancient' || tag === 'Future', `${id}: ${tag}`);
    assert.equal(canonicalCardId(id), id);
  }
});
