// Design 027: which Pokémon get a signature entry animation instead of the
// generic evolve burst. Tera is checked first; a card is never both.
import { isPokemon } from '../../../../../shared/engine/cards.mjs';
import {
  isMegaCard,
  isTeraCard,
} from '../../../../../shared/engine/rules/card-classify.mjs';
import { normalizeStage, TERAHB } from '../../../../../shared/engine/rules/evolution.mjs';

/** @returns {'tera' | 'mega' | null} */
export function signatureEntryKind(card) {
  if (!card || typeof card !== 'object' || !isPokemon(card)) return null;
  if (isTeraCard(card) || normalizeStage(card.stage) === TERAHB) return 'tera';
  if (isMegaCard(card)) return 'mega';
  return null;
}
