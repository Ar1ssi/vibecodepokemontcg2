import { moveCardMessage } from './move-card-message.js';
import { moveCard } from './move-card.js';

const isBoardPokemon = (card) =>
  (card.type2 || card.type) === 'Pokémon' && !card.image.attached;

const nonAttachedPokemon = (zone) =>
  zone.array.filter((card) => isBoardPokemon(card));

export const autoMoveActiveBenchCard = (
  user,
  initiator,
  movingCard,
  targetCard,
  oZoneId,
  oZone,
  dZoneId,
  dZone,
  targetIndex
) => {
  // Case 1: playing a Pokémon to Active when another non-attached Pokémon
  // is already there — bench the previous Active. Attached Energy at array[1]
  // must NOT trigger this (was a common desync: wrong card benched).
  if (
    ['active'].includes(dZoneId) &&
    !movingCard.image.attached &&
    !targetCard &&
    isBoardPokemon(movingCard)
  ) {
    const pokemon = nonAttachedPokemon(dZone);
    if (pokemon.length > 1) {
      const oldIdx = dZone.array.findIndex(
        (c) => c !== movingCard && isBoardPokemon(c)
      );
      if (oldIdx >= 0) {
        moveCardMessage(user, initiator, 'active', 'bench', oldIdx, false, 'move');
        moveCard(user, initiator, 'active', 'bench', oldIdx, false);
        return;
      }
    }
  }

  // Case 2: moving from Active to Bench when Bench would have two Pokémon
  if (
    ['bench'].includes(dZoneId) &&
    ['active'].includes(oZoneId) &&
    nonAttachedPokemon(dZone).length === 2 &&
    nonAttachedPokemon(oZone).length === 0 &&
    !dZone.array[0]?.image.attached
  ) {
    moveCardMessage(user, initiator, 'bench', 'active', 0, false, 'move');
    moveCard(user, initiator, 'bench', 'active', 0, false);
    return;
  }

  // Case 3: targeted switch between Active and Bench
  if (
    ['active', 'bench'].includes(dZoneId) &&
    targetCard &&
    !movingCard.image.attached &&
    !dZone.array[targetIndex]?.image.attached
  ) {
    moveCardMessage(
      user,
      initiator,
      dZoneId,
      oZoneId,
      targetIndex,
      false,
      'move'
    );
    moveCard(user, initiator, dZoneId, oZoneId, targetIndex, false);
  }
};
