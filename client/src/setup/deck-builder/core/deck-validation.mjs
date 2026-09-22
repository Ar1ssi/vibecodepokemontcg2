// Deck legality checks (size, copies, Basic requirement, per-deck limits).
//
// Name normalisation split (rulebook 30c 4.1): this module's `officialCardName`
// implements the COPY-LIMIT name (p.21) — it strips the Level marker and the
// `Team Plasma ` prefix but KEEPS `ex`/`V`/`GX`/form suffixes and trailing
// symbols, because those are part of the name for the 4-copy rule.
// `evolution.mjs`'s `cleanPokemonName` is deliberately different: it strips
// `ex`/`GX`, collapses `VMAX`/`VSTAR` to `V` (not away) and preserves
// owner/form/Team Plasma, because it answers "is this the same SPECIES?".
// Do not merge the two.

import { isBasicPokemon } from '../../../../../shared/engine/cards.mjs';
import {
  isAceSpecCard,
  isBasicEnergy,
  isPrismStarCard,
  isRadiantCard,
} from '../../../../../shared/engine/rules/card-classify.mjs';

export const DECK_FORMATS = {
  POCKET: 'pocket',
  TCG: 'tcg',
};

export const POCKET_DECK_RULES = {
  formatName: 'TCG Pocket',
  deckSize: { min: 20, max: 20 },
  maxCopiesPerCard: 2,
};

export const TCG_DECK_RULES = {
  formatName: 'TCG',
  deckSize: { min: 60, max: 60 },
  maxCopiesPerCard: 4,
};

const RULES_BY_FORMAT = {
  [DECK_FORMATS.POCKET]: POCKET_DECK_RULES,
  [DECK_FORMATS.TCG]: TCG_DECK_RULES,
};

export function isPocketCard(card = {}) {
  const image = card?.image || card?.images?.large || card?.images?.small || '';
  // Cards from TCGdex contain /tcgp/
  // Cards from Limitless contain /pocket/
  return String(image).includes('/tcgp/') || String(image).includes('/pocket/');
}

export function detectDeckFormat(deck = {}) {
  let pocketCount = 0;
  let tcgCount = 0;
  for (const group of Object.values(deck)) {
    for (const variant of group?.cards || []) {
      if (isPocketCard(variant?.data)) pocketCount += variant.count || 0;
      else tcgCount += variant.count || 0;
    }
  }
  return pocketCount > tcgCount ? DECK_FORMATS.POCKET : DECK_FORMATS.TCG;
}

// Official name rules (p.21): Level is not part of the name (`Gengar`,
// `Gengar LV.43` and `Gengar LV.X` are one name) and the `Team Plasma ` prefix
// is not either. Owner/form words and trailing symbols (`Alolan Meowth`,
// `Rocket's Meowth`, `◇`, `ex`, `V`, `GX`) ARE part of the name, so unlike
// evolution.mjs's `cleanPokemonName` this normaliser keeps them.
export function officialCardName(card = {}) {
  const raw = typeof card === 'string' ? card : String(card?.name ?? '');
  return raw
    .replace(/\bLV\.\s*(?:X|\d+)\b/gi, '')
    .replace(/^Team Plasma\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function validateDeck(decklist = {}, selectedFormat = DECK_FORMATS.POCKET) {
  const rules = RULES_BY_FORMAT[selectedFormat] || POCKET_DECK_RULES;
  const errors = [];

  const cardGroups = Object.values(decklist || {});
  const totalCards = cardGroups.reduce((total, group) => total + (group?.totalCount || 0), 0);

  if (totalCards < rules.deckSize.min || totalCards > rules.deckSize.max) {
    errors.push(`Deck must contain exactly ${rules.deckSize.max} cards. Current total: ${totalCards}.`);
  }

  // Every printing is aggregated under its official name so level/Team-Plasma
  // variants share one copy allowance (p.21), and the per-deck limits
  // (ACE SPEC / Radiant / Prism Star) count across all printings too.
  const byOfficialName = new Map();
  const prismStarByName = new Map();
  let basicPokemonCount = 0;
  let aceSpecCount = 0;
  let radiantCount = 0;
  let hasPocketCards = false;
  let hasTcgCards = false;

  for (const [displayName, group] of Object.entries(decklist || {})) {
    if (!group?.cards?.length) continue;

    for (const variant of group.cards) {
      const card = variant?.data || {};
      const variantCount = Number(variant?.count || 0);

      if (isPocketCard(card)) hasPocketCards = true;
      else hasTcgCards = true;

      if (isBasicPokemon(card)) basicPokemonCount += variantCount;
      if (isAceSpecCard(card)) aceSpecCount += variantCount;
      if (isRadiantCard(card)) radiantCount += variantCount;
      if (isPrismStarCard(card)) {
        const key = officialCardName(card).toLowerCase();
        prismStarByName.set(key, (prismStarByName.get(key) || 0) + variantCount);
      }
    }

    const representativeCard = group.cards[0]?.data || {};
    const officialName = officialCardName(representativeCard) || displayName;
    const key = officialName.toLowerCase();
    const entry = byOfficialName.get(key) || {
      name: officialName,
      count: 0,
      card: representativeCard,
    };
    entry.count += Number(group.totalCount || 0);
    byOfficialName.set(key, entry);
  }

  // At least one Basic Pokémon is required (p.22).
  if (basicPokemonCount === 0) {
    errors.push('Deck must contain at least one Basic Pokémon.');
  }

  // Only Basic Energy is exempt from the copy limit (p.22); Special Energy is not.
  for (const entry of byOfficialName.values()) {
    if (isBasicEnergy(entry.card)) continue;
    if (entry.count > rules.maxCopiesPerCard) {
      errors.push(`${entry.name} has ${entry.count} copies (max ${rules.maxCopiesPerCard}).`);
    }
  }

  // Per-deck limits: one ACE SPEC total, one Radiant total, one Prism Star per name.
  if (aceSpecCount > 1) {
    errors.push(`Deck can contain only 1 ACE SPEC card (found ${aceSpecCount}).`);
  }
  if (radiantCount > 1) {
    errors.push(`Deck can contain only 1 Radiant Pokémon (found ${radiantCount}).`);
  }
  for (const [key, count] of prismStarByName) {
    if (count > 1) {
      const name = byOfficialName.get(key)?.name || key;
      errors.push(`${name} has ${count} Prism Star copies (max 1 per name).`);
    }
  }

  const isMixedPool = hasPocketCards && hasTcgCards;

  if (isMixedPool) {
    errors.push('Deck contains a mix of TCG and Pocket cards. Use only one card pool per deck.');
  } else if (selectedFormat === DECK_FORMATS.POCKET && hasTcgCards) {
    errors.push('Pocket format selected, but deck contains TCG cards.');
  } else if (selectedFormat === DECK_FORMATS.TCG && hasPocketCards) {
    errors.push('TCG format selected, but deck contains Pocket cards.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalCards,
    // The legal deck size for this format (60 for TCG, 20 for Pocket). The
    // Live-style "x / y" counter reads it so it never hard-codes 60.
    requiredCards: rules.deckSize.max,
    formatName: rules.formatName,
    selectedFormat,
  };
}
