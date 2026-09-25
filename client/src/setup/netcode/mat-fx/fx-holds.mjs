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
  // Design 042: the prize claim lands while the knocked-out cards fly to the pile.
  knockout: 900,
  'prize-claim': 320,
  evolve: 240,
  // Design 041: the next effect lands as the evolved Pokémon emerges from the flare.
  'evolve-scene': 2000,
  devolve: 240,
  attach: 140,
  'tool-attach': 120,
  retreat: 200,
  promote: 220,
  'trainer-play': 520,
  // Design 043: what the opponent's Trainer does starts as its preview is placed.
  'opp-trainer-play': 1700,
  'stadium-play': 520,
  'ability-banner': 480,
  'turn-banner': 260,
  discard: 120,
  // One flip's ceremony until its fade; coin.js returns the hold for the plan's
  // actual flip count (coinCeremonyTimeline).
  'coin-flip': 2250,
  'game-over': 0,
};

/** Hold for an effect name; unknown names pace as 0 (play immediately). */
export const holdFor = (effect) =>
  Object.hasOwn(HOLD_MS, effect) ? HOLD_MS[effect] : DEFAULT_HOLD_MS;
