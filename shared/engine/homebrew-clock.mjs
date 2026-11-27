/**
 * @file The homebrew game clock (design 090). Pure; wall time comes in as `now` (ms).
 * A chess clock: each player has an 8:00 bank that runs only while that player owes the game an
 * action (their turn, or a prompt they must answer on the opponent's turn); every turn a player
 * finishes adds 40 s and every card they play from hand adds 3 s to their bank. A bank at 0:00 loses the game (the room sends `timeOut`).
 * It runs only when the room's toggle is on and both decks hold at least one homebrew card.
 */

export const HOMEBREW_SET_ID = 'customhb';
export const CLOCK_BANK_MS = 8 * 60 * 1000;
export const CLOCK_INCREMENT_MS = 40 * 1000;
export const CLOCK_PLAY_BONUS_MS = 3 * 1000;
const PLAY_DESTINATIONS = ['active', 'bench', 'board', 'stadium'];
export const TIME_OUT_REASON = 'time ran out';

/** @returns {boolean} true for a card of the homebrew set (TCGdex-shaped id `customhb-<n>`). */
export function isHomebrewCard(card) {
  return typeof card?.id === 'string' && card.id.startsWith(`${HOMEBREW_SET_ID}-`);
}

/** @returns {boolean} true when every seat's cards include at least one homebrew card. */
export function decksAreHomebrew(state) {
  const players = Object.values(state?.players || {});
  if (players.length < 2) return false;
  return players.every((player) =>
    Object.values(player?.zones || {}).some((zone) => Array.isArray(zone) && zone.some(isHomebrewCard))
  );
}

/**
 * Who owes the game an action now: the chooser of a pending prompt, else the turn player.
 * Nobody while the game is not in play: before the deal, during the opening Starting Active
 * placement (both seats act at once), and after it ends.
 * @returns {string|null}
 */
export function clockRunner(state) {
  const phase = state?.turn?.phase;
  if (!phase || phase === 'setup' || phase === 'ended') return null;
  if (!state.turn.number || state.openingDrawPending) return null;
  return state.pendingChoice?.player || state.turn.player || null;
}

/**
 * A fresh clock. `armed` is decided once, when play first starts (decks are fixed by then).
 * @param {{ enabled?: boolean }} [options]
 */
export function createClock({ enabled = true } = {}) {
  return {
    enabled: Boolean(enabled),
    armed: null,
    banks: {},
    runner: null,
    runningSince: null,
    turnNumber: 0,
    turnPlayer: null,
    flagged: null,
    playCredits: [],
  };
}

/**
 * @returns {boolean} true when `cmd` (applied to `stateBefore`) puts a card from the issuer's
 * hand into play: a Trainer, an attach/evolve, or a hand→board/Stadium move. Discards don't count.
 */
export function isCardPlay(cmd, stateBefore) {
  const hand = stateBefore?.players?.[cmd?.playerId]?.zones?.hand;
  if (!Array.isArray(hand)) return false;
  const inHand = hand.some((c) => c.instanceId === cmd.payload?.instanceId);
  if (!inHand) return false;
  if (cmd.type === 'playTrainer' || cmd.type === 'attachCard') return true;
  return cmd.type === 'moveCard' && cmd.payload?.from === 'hand' && PLAY_DESTINATIONS.includes(cmd.payload?.to);
}

/**
 * Adds the per-play bonus to `playerId`'s bank. Each card earns it once per turn, so undoing and
 * replaying a play cannot farm time. Call before `syncClock` for the same command.
 * @returns {boolean} whether time was added
 */
export function creditCardPlay(clock, playerId, instanceId, turnNumber) {
  if (!clock.enabled || clock.armed !== true || !(clock.banks[playerId] > 0)) return false;
  const key = `${turnNumber}:${instanceId}`;
  clock.playCredits = (clock.playCredits || []).filter((k) => k.startsWith(`${turnNumber}:`));
  if (clock.playCredits.includes(key)) return false;
  clock.playCredits.push(key);
  clock.banks[playerId] += CLOCK_PLAY_BONUS_MS;
  return true;
}

/** @returns {number} the runner's bank at `now`, others as stored (ms, never below 0). */
export function remainingMs(clock, playerId, now) {
  const bank = clock.banks[playerId] ?? 0;
  if (playerId !== clock.runner || clock.runningSince == null) return bank;
  return Math.max(0, bank - (now - clock.runningSince));
}

/**
 * Brings the clock up to date with the game after a state change: charges the elapsed time to
 * the old runner, credits +40 s to the player whose turn just ended, and starts the new runner.
 * Mutates and returns `clock`.
 */
export function syncClock(clock, state, now) {
  if (!clock.enabled || clock.armed === false) return clock;
  const runner = clockRunner(state);
  if (clock.armed === null) {
    if (!runner) return clock;
    clock.armed = decksAreHomebrew(state);
    if (!clock.armed) return clock;
    for (const playerId of Object.keys(state.players)) clock.banks[playerId] = CLOCK_BANK_MS;
    clock.turnNumber = state.turn.number;
    clock.turnPlayer = state.turn.player;
  }
  settleRunner(clock, now);
  creditFinishedTurn(clock, state);
  if (clock.flagged || state.turn?.phase === 'ended') {
    clock.runner = null;
    clock.runningSince = null;
    return clock;
  }
  clock.runner = runner;
  clock.runningSince = runner ? now : null;
  return clock;
}

function settleRunner(clock, now) {
  if (!clock.runner || clock.runningSince == null) return;
  clock.banks[clock.runner] = remainingMs(clock, clock.runner, now);
  clock.runningSince = now;
}

// Only a turn number above every one seen earns time, so undo cannot replay an increment.
function creditFinishedTurn(clock, state) {
  const number = state.turn?.number || 0;
  if (number <= clock.turnNumber) return;
  const finisher = clock.turnPlayer;
  if (finisher && clock.banks[finisher] > 0) clock.banks[finisher] += CLOCK_INCREMENT_MS;
  clock.turnNumber = number;
  clock.turnPlayer = state.turn.player;
}

/** @returns {number|null} ms until the runner's bank hits 0, or null when nothing runs. */
export function msUntilFlag(clock, now) {
  if (!clock.armed || !clock.runner || clock.flagged) return null;
  return remainingMs(clock, clock.runner, now);
}

/** @returns {string|null} the runner whose bank is at 0 now, if any. */
export function flaggedRunner(clock, now) {
  const left = msUntilFlag(clock, now);
  return left === 0 ? clock.runner : null;
}

/**
 * What the clients render: banks as of `now` and who is running. Clients count the runner down
 * locally from `remaining` until the next snapshot.
 */
export function clockSnapshot(clock, now) {
  const active = clock.enabled && clock.armed === true;
  const remaining = {};
  if (active) {
    for (const playerId of Object.keys(clock.banks)) remaining[playerId] = remainingMs(clock, playerId, now);
  }
  return {
    enabled: clock.enabled,
    active,
    runner: active ? clock.runner : null,
    remaining,
    flagged: clock.flagged,
  };
}

/** @returns {string} m:ss for a bank in ms (rounded up, so 0:00 means time is out). */
export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
