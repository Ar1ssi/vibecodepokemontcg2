import { isBasicEnergy } from '../../../../shared/engine/rules/card-classify.mjs';

// Maps a queryCardsByName result to the Card factory's 7-field row shape (same
// mapping deckToSimRows uses in native-deck-builder.js): [name, supertype,
// imageURL, number, setId, tcgId]. Pure — no DOM — so the debug panel and its
// test both import it.
export function resultToRow(result = {}) {
  return [
    result.name || '',
    result.supertype || '',
    result.image || result.images?.large || result.images?.small || '',
    result.number || null,
    result.set?.id || null,
    result.id || null,
  ];
}

// A spawned card is auto-attached only when it is a Special Energy: Basic Energy and every
// non-Energy card still land in the zone the tester picked.
export function shouldAutoAttach(card) {
  if (!card) return false;
  const supertype = String(card.type || card.supertype || '').toLowerCase();
  return supertype === 'energy' && !isBasicEnergy(card);
}

// Index of the Pokémon an attach should target in a zone array, or -1 when none is in play.
export function firstPokemonIndex(cards = []) {
  return cards.findIndex((card) => {
    const supertype = String(card?.type || card?.supertype || '').toLowerCase();
    return supertype === 'pokémon' || supertype === 'pokemon';
  });
}

export const LEGACY_ENERGY_NAME = 'Legacy Energy';

// First search result that is exactly the Legacy Energy card, or null. A name search also returns
// lookalikes, so an exact (case-insensitive) match is required.
export function pickLegacyEnergy(results = []) {
  return (
    results.find(
      (result) =>
        String(result?.name || '').trim().toLowerCase() ===
        LEGACY_ENERGY_NAME.toLowerCase()
    ) ?? null
  );
}
