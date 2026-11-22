/**
 * Runs `moveOne` for each pick in order, awaiting each move before starting
 * the next. Search effects shuffle the deck in their confirm callback, so every
 * picked card's move has to finish — and relay to the peer — before that
 * callback runs. Otherwise the peer receives the shuffle first and applies a
 * permutation built for a different deck length.
 *
 * A pick whose move throws is logged and skipped; the remaining picks still
 * move and the caller's callbacks still run.
 * @param {unknown[]} picks
 * @param {(pick: unknown) => unknown} moveOne may return a promise
 */
export async function movePicksInOrder(picks, moveOne) {
  for (const pick of picks) {
    try {
      await moveOne(pick);
    } catch (err) {
      console.error('card picker: move failed', err);
    }
  }
}

export const EMPTY_PICK_PROMPT = 'You have not chosen anything. Continue without choosing?';

/**
 * True when the player may proceed with `picks`. An empty selection (no pick,
 * or only the `undefined` a single picker passes for "declined") needs the
 * player's explicit yes; a real selection never asks.
 * @param {unknown[]} picks
 * @param {(message: string) => boolean} ask
 */
export function confirmPicksOrEmpty(picks, ask) {
  if (picks.some((pick) => pick != null)) return true;
  return ask(EMPTY_PICK_PROMPT) === true;
}
