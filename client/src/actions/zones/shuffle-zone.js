import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { rearrangeArray, shuffleIndices } from '../../setup/general/shuffle.js';
import { removeImages } from '../../setup/image-logic/remove-images.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { sort } from './general.js';
import { hydrateHolo, unhydrateHolo } from '../../setup/deck-constructor/hydrate-holo.js';
import { playShuffleFlight } from '../../setup/image-logic/shuffle-flight.js';

export const shuffleZone = (
  user,
  initiator,
  zoneId,
  indices,
  message = true,
  emit = true
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'shuffleZone', [
      oInitiator,
      zoneId,
      indices,
      message,
    ]);
    return;
  }

  const zone = getZone(user, zoneId);
  // Originator plays the flight; the mirror only applies the new order.
  // Animating on receive made the other player's deck look like it shuffled too.
  if (!(systemState.isTwoPlayer && !emit)) {
    playShuffleFlight(user, zoneId, zone.getCount());
  }
  removeImages(zone.element);
  indices = indices ? indices : shuffleIndices(zone.getCount());

  rearrangeArray(zone.array, indices);
  for (let i = 0; i < zone.getCount(); i++) {
    unhydrateHolo(zone.array[i]);
    zone.element.appendChild(zone.array[i].image);
  }
  if (['hand', 'prizes', 'discard', 'lostZone'].includes(zoneId)) {
    zone.array.forEach((card) => hydrateHolo(card));
  }
  // Never re-sort a just-shuffled deck in 2P — each client has its own
  // "sort deck" checkbox, so sorting here would destroy the shared order.
  if (zoneId === 'deck' && !systemState.isTwoPlayer) {
    sort(user, zoneId);
  }
  if (message) {
    appendMessage(
      initiator,
      determineUsername(user) + ' shuffled ' + zoneId,
      'player',
      false
    );
  }

  processAction(user, emit, 'shuffleZone', [
    oInitiator,
    zoneId,
    indices,
    message,
  ]);
};
