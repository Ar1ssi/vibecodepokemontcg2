// Design 024 slice 0: the choreography table. A "hold" is how long the FX queue
// waits after starting an effect before it starts the NEXT one — deliberately
// shorter than the effect's own duration, so tails overlap (TCG Live does the
// same: the damage number is still rising while the KO burst begins).
// Keeping every value in one table is the point: the pacing of a whole attack
// is reviewable here without reading six effect modules.
export const DEFAULT_HOLD_MS = 0;

export const HOLD_MS = {
  'attack-banner': 620,
  attack: 240,
  damage: 180,
  status: 260,
  'status-clear': 160,
  knockout: 520,
  'prize-claim': 320,
  evolve: 240,
  devolve: 240,
  attach: 140,
  'tool-attach': 120,
  retreat: 200,
  promote: 220,
  'trainer-play': 520,
  'stadium-play': 520,
  'ability-banner': 480,
  'turn-banner': 260,
  discard: 120,
  'coin-flip': 420,
  'game-over': 0,
};

/** Hold for an effect name; unknown names pace as 0 (play immediately). */
export const holdFor = (effect) =>
  Object.hasOwn(HOLD_MS, effect) ? HOLD_MS[effect] : DEFAULT_HOLD_MS;
