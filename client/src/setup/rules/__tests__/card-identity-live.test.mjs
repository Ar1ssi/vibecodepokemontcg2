import test from 'node:test';
import assert from 'node:assert/strict';

// Live TCGdex smoke test — skipped when offline. Verifies the real PFL Piloswine
// incident: collector number "24" alone must not resolve to Skyridge (ecard3-24).
const { ensureCardData, resolveCardId } = await import('../rules-state.mjs');

test('live: PBL Popplio #18 resolves to Pitch Black (me05-018)', { skip: !globalThis.fetch }, async () => {
  const card = { name: 'Popplio', type: 'Pokémon', set: 'PBL', number: '18' };
  await ensureCardData(card);
  assert.equal(card.id, 'me05-018');
  assert.ok(card.attacks?.some((a) => a.name === 'Pound'), 'expected Pitch Black Pound attack');
  assert.ok(!card.attacks?.some((a) => a.name === 'Sing'), 'must not be SM Black Star Promos');
});

test('live: PFL Piloswine #24 resolves to Phantasmal Flames (me02-024)', { skip: !globalThis.fetch }, async () => {
  const card = { name: 'Piloswine', type: 'Pokémon', set: 'PFL', number: '24' };
  await ensureCardData(card);
  assert.equal(card.id, 'me02-024');
  assert.ok(card.attacks?.some((a) => a.name === 'Frost Smash'), 'expected modern attacks');
  assert.ok(!card.attacks?.some((a) => a.name === 'Freezing Breath'), 'must not be Skyridge');
});

test('live: name search with number only still ambiguous without set code', { skip: !globalThis.fetch }, async () => {
  const res = await fetch('https://api.tcgdex.net/v2/en/cards?name=Piloswine');
  const summaries = await res.json();
  const id = resolveCardId(summaries, 'Piloswine', 'Pokémon', '24');
  // Document current behaviour: without set, number-only may pick any Piloswine #24.
  assert.ok(id === 'ecard3-24' || id === 'me02-024' || id === 'me02-24');
  const withSet = resolveCardId(summaries, 'Piloswine', 'Pokémon', '24', 'PFL');
  assert.equal(withSet, 'me02-024');
});
