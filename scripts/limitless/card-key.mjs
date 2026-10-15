/**
 * Functional card identity for the deck-suggestion dataset (design 069, Option 4): reprints and
 * alt arts of one card share a key, different cards that share a name do not.
 *   Trainer → `t:<official name>`, Energy → `e:<official name>`,
 *   Pokémon → `p:<name>|<attack names sorted>|<ability names sorted>`.
 * Reads a raw TCGdex card record (it needs `attacks`, which deck-builder records drop).
 */
import { officialCardName } from '../../client/src/setup/deck-builder/core/deck-validation.mjs';

const lower = (value) => String(value ?? '').trim().toLowerCase();

const sortedNames = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => lower(entry?.name))
    .filter(Boolean)
    .sort()
    .join(';');

/** 'pokemon' | 'trainer' | 'energy' from a TCGdex `category`. */
export function kindOf(card = {}) {
  if (card.category === 'Pokemon') return 'pokemon';
  if (card.category === 'Energy') return 'energy';
  return 'trainer';
}

export function cardKeyOf(card = {}) {
  const kind = kindOf(card);
  const name = lower(officialCardName(card));
  if (kind === 'pokemon') return `p:${name}|${sortedNames(card.attacks)}|${sortedNames(card.abilities)}`;
  return `${kind === 'energy' ? 'e' : 't'}:${name}`;
}
