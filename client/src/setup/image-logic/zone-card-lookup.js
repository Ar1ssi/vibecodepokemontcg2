import { imageAnchor } from '../deck-constructor/hydrate-holo.js';

/** Map a click/drop target (plain or holo-wrapped) to a zone array index. */
export function findZoneCardIndex(zone, eventTarget) {
  if (!zone?.array || !eventTarget) return -1;

  const direct = zone.array.findIndex((card) => card.image === eventTarget);
  if (direct >= 0) return direct;

  return zone.array.findIndex((card) => {
    const anchor = imageAnchor(card.image);
    return anchor === eventTarget || anchor?.contains?.(eventTarget);
  });
}
