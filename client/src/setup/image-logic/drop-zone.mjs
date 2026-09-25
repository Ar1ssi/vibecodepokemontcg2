/**
 * Which board zone a drag/drop event target belongs to.
 *
 * A drop can land on the zone <div> itself or on anything inside it: a card
 * <img>, a holo wrapper around one, or a bench slot's play container. Every
 * zone that holds cards has to be listed here — a zone left out makes drops
 * onto its cards resolve to no zone at all, which is how the trainer board
 * (and the stadium and pile covers) stopped accepting drops onto their cards.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */
import { isTrainer } from '../../../../shared/engine/cards.mjs';

export const DROP_ZONE_IDS = [
  'deck',
  'hand',
  'active',
  'bench',
  'prizes',
  'discard',
  'lostZone',
  'board',
  'stadium',
  'deckCover',
  'discardCover',
  'lostZoneCover',
];

export const DROP_ZONE_SELECTOR = DROP_ZONE_IDS.map((id) => `#${id}`).join(', ');

/** The zone element containing `el` (or `el` itself), else null. */
export const zoneOf = (el) => el?.closest?.(DROP_ZONE_SELECTOR) ?? null;

// Design 046: the Trainers that are played onto the board (Items, Supporters).
// A Stadium goes to the Stadium slot and a Tool onto a Pokémon; the kind text
// is read the way the engine's isToolCard/isStadiumCard read it. A legacy card
// knows only `type: 'Trainer'`, so it counts.
const kindText = (card) =>
  [card.type, card.trainerType, ...(Array.isArray(card.subtypes) ? card.subtypes : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Whether a held card lands on the Trainer board when played. */
export const playsOntoBoard = (card) => {
  if (!card || !isTrainer(card)) return false;
  const kind = kindText(card);
  return !kind.includes('tool') && !kind.includes('stadium');
};
