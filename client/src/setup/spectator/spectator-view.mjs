// Design 069: a spectator's server view lists both players under `players`, with both hands
// visible. The board renderer draws `you` (bottom/left board) and `them` (top/right board), so
// this maps the spectator view onto one player's seat. In a POV mode the other player's hand is
// redacted the way that player's opponent sees it; the broadcast layout shows both hands.

export const SPECTATOR_MODES = ['p1', 'p2', 'broadcast'];
export const DEFAULT_SPECTATOR_MODE = 'p1';

export const isSpectatorMode = (mode) => SPECTATOR_MODES.includes(mode);

/** The view's seat ids in seat order ('p1' before 'p2'). */
export const seatIds = (view) => Object.keys(view?.players || {}).sort();

/** The player id a mode puts in the `you` seat, or null when the view has no seats. */
export const perspectiveSeat = (view, mode) => {
  const seats = seatIds(view);
  if (seats.length === 0) return null;
  if (mode === 'p2') return seats[1] ?? seats[0];
  return seats[0];
};

const redactedHandCard = (card) => (card?.revealed ? card : { instanceId: card?.instanceId });

const withHiddenHand = (player) => {
  const hand = player?.zones?.hand;
  if (!Array.isArray(hand)) return player;
  return { ...player, zones: { ...player.zones, hand: hand.map(redactedHandCard) } };
};

/**
 * Maps a spectator view onto one seat for the renderer.
 *
 * @param {object} view the server's spectator view (`isSpectator: true`, `players`)
 * @param {'p1'|'p2'|'broadcast'} mode
 * @returns {object|null} a `you`/`them` view still flagged `isSpectator`, or null when `view`
 *   is not a spectator view
 */
export function spectatorPerspective(view, mode = DEFAULT_SPECTATOR_MODE) {
  if (!view || typeof view !== 'object' || !view.isSpectator) return null;
  if (!view.players || typeof view.players !== 'object') return null;

  const youId = perspectiveSeat(view, mode);
  const themId = seatIds(view).find((id) => id !== youId) ?? null;
  const you = youId ? view.players[youId] : null;
  const opponent = themId ? view.players[themId] : null;
  const them = opponent && mode !== 'broadcast' ? withHiddenHand(opponent) : opponent;

  const { players: _players, ...rest } = view;
  return {
    ...rest,
    turn: { ...view.turn, isYourTurn: Boolean(youId) && view.turn?.player === youId },
    you: you || null,
    them: them || null,
  };
}

/** Label for a mode's switch button: the seat's username, or a fallback. */
export function spectatorModeLabel(view, mode) {
  if (mode === 'broadcast') return 'Both';
  const seats = seatIds(view);
  const seat = mode === 'p2' ? seats[1] : seats[0];
  const fallback = mode === 'p2' ? 'Player 2' : 'Player 1';
  return (seat && view?.players?.[seat]?.username) || fallback;
}
