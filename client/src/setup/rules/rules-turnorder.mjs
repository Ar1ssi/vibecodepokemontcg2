// Pure, DOM-free turn-order resolution for the "call the coin" flip.
//
// The player who is allowed to call (heads or tails) wins the coin — i.e. goes
// first — when the coin lands on the face they called, and loses otherwise.
// Every argument is expressed from the LOCAL client's perspective:
//   caller  — 'self' | 'opp' : which player is calling the coin
//   call    — 'heads' | 'tails' : the face the caller called
//   result  — 'heads' | 'tails' : the face the coin landed on
// Returns 'self' | 'opp' (local perspective) — who goes first.

const isFace = (v) => v === 'heads' || v === 'tails';
const other = (side) => (side === 'self' ? 'opp' : 'self');

/** FNV-1a 32-bit — stable across clients for the same seed string. */
const hashSeedToBool = (seed = '') => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0;
};

/**
 * Pick who calls the turn-order coin in multiplayer. Both clients must know
 * each other's socket.id; the designated caller is chosen randomly but
 * deterministically from roomId + sessionKey by picking one of the two ids.
 * Returns null when the peer id is not known yet. Solo callers always get
 * 'self'.
 */
export const resolveTurnOrderCaller = ({
  roomId,
  socketId,
  opponentSocketId = null,
  sessionKey = '0',
  isMultiplayer = true,
} = {}) => {
  if (!isMultiplayer || !roomId || !socketId) return 'self';
  if (!opponentSocketId || opponentSocketId === socketId) return null;

  const [lowId, highId] = [socketId, opponentSocketId].sort();
  const lowCalls = hashSeedToBool(`${roomId}:${sessionKey}`);
  const callerSocketId = lowCalls ? lowId : highId;
  return socketId === callerSocketId ? 'self' : 'opp';
};

export const decideTurnOrder = ({ caller, call, result } = {}) => {
  if (caller !== 'self' && caller !== 'opp') return 'self';
  if (!isFace(call) || !isFace(result)) return other(caller);
  return result === call ? caller : other(caller);
};
