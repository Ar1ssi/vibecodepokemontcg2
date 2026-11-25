// The seat whose Set Up button the local player presses. In 2P each client owns the self zones;
// `initiator` only reflects a coaching/spectator mat flip. One-player mode readies whichever
// side faces the player.
export const localReadySeat = (state) =>
  state.isTwoPlayer ? 'self' : state.initiator;

export const readyKeyOf = (seat) => (seat === 'self' ? 'selfReady' : 'oppReady');
