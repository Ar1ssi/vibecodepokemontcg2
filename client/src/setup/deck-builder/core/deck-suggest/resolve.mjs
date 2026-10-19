// Turns dataset cards into builder cards (design 069): Add buttons and "Start from this list".
// Network is injected as `deps` — the same `{ fetchCardDetail, searchByName }` the Import List popup
// uses — so this stays testable offline.
import { basicEnergyLabel, resolveEntry } from '../deck-text-import.mjs';
import { nameKey } from './dataset.mjs';

/**
 * Dataset card → `{ card }` (a normalized builder card) or `{ error }`.
 * Basic Energy uses the builder's own Energy cards; anything else fetches the dataset's most-played
 * print and, if TCGdex disagrees about the name or has no art, falls back to a name search.
 */
export async function resolveDatasetCard(datasetCard, deps) {
  if (!datasetCard?.name) return { error: 'Unknown card' };
  const energyLabel = datasetCard.kind === 'energy' ? basicEnergyLabel(`Basic ${datasetCard.name}`) : null;
  if (energyLabel) return resolveEntry({ name: energyLabel, qty: 1 }, deps);

  if (datasetCard.print) {
    try {
      const card = await deps.fetchCardDetail(datasetCard.print);
      if (card?.image && nameKey(card.name) === nameKey(datasetCard.name)) return { card };
    } catch {
      // Print lookup failed — the name search below still finds a printing.
    }
  }
  return resolveEntry({ name: datasetCard.name, qty: 1 }, deps);
}

/** A dataset list → importDeckEntries entries (one per card, `datasetCard` carried for the resolver). */
export function listToEntries(index, listIdx) {
  const list = index.dataset.lists[listIdx];
  if (!list) return [];
  const entries = [];
  for (let j = 0; j < list.c.length; j += 2) {
    const datasetCard = index.dataset.cards[list.c[j]];
    const qty = list.c[j + 1];
    entries.push({ qty, name: datasetCard.name, line: `${qty} ${datasetCard.name}`, datasetCard });
  }
  return entries;
}

/** Resolver for importDeckEntries over listToEntries' entries. */
export const resolveListEntry = (entry, deps) => resolveDatasetCard(entry.datasetCard, deps);
