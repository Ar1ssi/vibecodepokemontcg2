import { imageAnchor } from '../deck-constructor/hydrate-holo.js';

/** Map a click/drop target (plain or holo-wrapped) to a Card instance. */
export function findZoneCard(zone, eventTarget) {
  if (!zone?.array || !eventTarget) return null;
  if (eventTarget.card && zone.array.includes(eventTarget.card)) {
    return eventTarget.card;
  }
  const idx = findZoneCardIndex(zone, eventTarget);
  return idx >= 0 ? zone.array[idx] : null;
}

/** Map a click/drop target (plain or holo-wrapped) to a zone array index. */
export function findZoneCardIndex(zone, eventTarget) {
  if (!zone?.array || !eventTarget) return -1;

  if (eventTarget.card) {
    const directCard = zone.array.indexOf(eventTarget.card);
    if (directCard >= 0) return directCard;
  }

  if (eventTarget.cardId != null) {
    const byCardId = zone.array.findIndex((card) => card.cardId === eventTarget.cardId);
    if (byCardId >= 0) return byCardId;
  }

  if (eventTarget.syncInstance != null) {
    const byInstance = zone.array.findIndex(
      (card) => card.syncInstance != null && String(card.syncInstance) === String(eventTarget.syncInstance)
    );
    if (byInstance >= 0) return byInstance;
  }

  const direct = zone.array.findIndex((card) => card.image === eventTarget);
  if (direct >= 0) return direct;

  return zone.array.findIndex((card) => {
    const anchor = imageAnchor(card.image);
    return anchor === eventTarget || anchor?.contains?.(eventTarget);
  });
}
