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

export const decideTurnOrder = ({ caller, call, result } = {}) => {
  if (caller !== 'self' && caller !== 'opp') return 'self';
  if (!isFace(call) || !isFace(result)) return other(caller);
  return result === call ? caller : other(caller);
};
