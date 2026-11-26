// Design 027: which Pokémon get a signature entry animation instead of the
// generic evolve burst. Tera is checked first; a card is never two kinds.
// Every Pokémon VMAX is the TCG's Dynamax / Gigantamax, so it plays the
// Gigantamax entry (gmax-entry.mjs).
import { isPokemon } from '../../../../../shared/engine/cards.mjs';
import {
  isMegaCard,
  isTeraCard,
  isVmaxCard,
} from '../../../../../shared/engine/rules/card-classify.mjs';
import { normalizeStage, TERAHB } from '../../../../../shared/engine/rules/evolution.mjs';

// The client's card stats carry a Pokémon's stage but not always its subtypes.
const isVmaxStage = (stage) => String(stage ?? '').toLowerCase().replace(/[^a-z]/g, '') === 'vmax';

/** @returns {'tera' | 'mega' | 'gmax' | null} */
export function signatureEntryKind(card) {
  if (!card || typeof card !== 'object' || !isPokemon(card)) return null;
  if (isTeraCard(card) || normalizeStage(card.stage) === TERAHB) return 'tera';
  if (isMegaCard(card)) return 'mega';
  if (isVmaxCard(card) || isVmaxStage(card.stage)) return 'gmax';
  return null;
}
