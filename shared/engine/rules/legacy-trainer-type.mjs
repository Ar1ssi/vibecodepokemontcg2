// Design 062 § A: TCGdex gives most WotC Trainers no trainerType, so derive Stadium/Tool from the
// WotC rules wording once where card data enters (client ensureCardData, server cardStats).
const LEGACY_STADIUM =
  /^This card stays in play (?:when you play it|after being played)\. Discard this card if another Stadium card comes into play\./i;
// `.+?`, not `[^.]+?`: card names carry dots (neo4-93 "EXP.ALL").
const LEGACY_TOOL =
  /^Attach .+? to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it\./i;

export function isTrainer(card) {
  return [card.category, card.type, card.supertype].some(
    (kind) => String(kind || '').toLowerCase() === 'trainer',
  );
}

export function normalizedText(card) {
  return String(card.effect || card.text || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function legacyTrainerType(card) {
  if (!card || card.trainerType || !isTrainer(card)) return null;
  const text = normalizedText(card);
  if (LEGACY_STADIUM.test(text)) return 'Stadium';
  if (LEGACY_TOOL.test(text)) return 'Tool';
  return null;
}
