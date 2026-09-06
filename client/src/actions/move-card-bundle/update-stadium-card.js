import { systemState } from '../../state.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { moveCard } from './move-card.js';

/** Discard a stadium card wherever it sits (shared field or legacy board slot). */
export const discardStadiumCardFromField = async (owner, card, initiator) => {
  if (!card) return;
  const stadiumZone = getZone(owner, 'stadium');
  let idx = stadiumZone.array.indexOf(card);
  if (idx >= 0) {
    await moveCard(owner, initiator, 'stadium', 'discard', idx, false, 'move');
    return;
  }
  for (const side of ['self', 'opp']) {
    const board = getZone(side, 'board');
    idx = board.array.indexOf(card);
    if (idx >= 0) {
      await moveCard(side, initiator, 'board', 'discard', idx, false, 'move');
      return;
    }
  }
};

export const updateStadiumCard = (user, initiator, dZoneId, dZone) => {
  if (['stadium'].includes(dZoneId) && dZone.array[1]) {
    if (dZone.array[0].image.user === 'self') {
      moveCard('self', initiator, 'stadium', 'discard', 0);
    } else {
      moveCard('opp', initiator, 'stadium', 'discard', 0);
    }
  }
  if ('stadium' === dZoneId) {
    const stadiumElement = document.getElementById('stadium');
    stadiumElement.style.transform =
      user === systemState.initiator
        ? 'scaleX(1) scaleY(1)'
        : 'scaleX(-1) scaleY(-1)';
  }
};
