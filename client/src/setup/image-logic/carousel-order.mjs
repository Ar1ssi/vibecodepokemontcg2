/**
 * @file Slide order for the attached-card carousel.
 *
 * The card-picker lays candidates out with the array index increasing to the LEFT
 * (card-picker.js `computeSlideLayout`: peekOffset = virtualIndex - slideIndex), so the
 * candidate array is the reverse of what the player sees. This helper returns the attached
 * cards in candidate-array order so that, read left to right on screen, they run:
 * the evolution line highest stage first, then Pokémon Tools, then Energy. The clicked card
 * is appended by the caller and stays the leftmost, focused slide.
 */

import { isPokemon } from '../../../../shared/engine/cards.mjs';
import { normalizeStage } from '../../../../shared/engine/rules/evolution.mjs';
import { isEnergyCard } from '../../actions/move-card-bundle/energy-token-assets.mjs';

const STAGE_RANK = { Basic: 0, 'Stage 1': 1, 'Stage 2': 2 };

const stageRank = (card) => STAGE_RANK[normalizeStage(card?.stage)] ?? 0;

// Candidate-array rank, low index landing rightmost: Energy, then Tools/other Trainers,
// then the evolution line (the clicked, highest-stage card is appended after these).
const groupRank = (card) => {
  if (isEnergyCard(card)) return 0;
  if (isPokemon(card)) return 2;
  return 1;
};

export const orderAttachedForCarousel = (attachedCards = []) =>
  attachedCards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const group = groupRank(a.card) - groupRank(b.card);
      if (group !== 0) return group;
      if (groupRank(a.card) === 2) {
        return stageRank(a.card) - stageRank(b.card);
      }
      return a.index - b.index;
    })
    .map(({ card }) => card);
