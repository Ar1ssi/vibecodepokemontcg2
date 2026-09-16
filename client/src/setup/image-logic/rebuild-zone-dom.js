import { systemState } from '../../state.js';
import { imageAnchor } from '../deck-constructor/hydrate-holo.js';
import { legacyDomSuppressed } from '../netcode/server-rendered-zones.mjs';
import { removeImages } from './remove-images.js';

// Legacy paths that rebuild a zone's DOM from its zone array (sort, shuffle,
// look-at/stop-looking) clear the zone and re-append every card. In a zone the
// authoritative renderer draws (I48), clearing everything would also delete the
// server's own images and re-appending would show every card twice — so there
// only the legacy images are detached and nothing is re-appended.

/** Clears a zone's card images before a legacy rebuild. */
export const clearZoneImages = (zone, zoneId) => {
  if (legacyDomSuppressed(zoneId, systemState)) {
    zone.array.forEach((card) => {
      if (card?.image) imageAnchor(card.image).remove();
    });
    return;
  }
  removeImages(zone.element);
};

/** Appends a legacy card image to its zone; false when the zone is server-drawn. */
export const appendZoneImage = (zone, zoneId, image) => {
  if (legacyDomSuppressed(zoneId, systemState)) return false;
  zone.element.appendChild(image);
  return true;
};
