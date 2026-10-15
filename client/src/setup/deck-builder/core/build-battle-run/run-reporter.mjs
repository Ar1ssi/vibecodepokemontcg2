// Records a finished game into the Build & Battle run (design 071 Options 4). The builder tab closes
// itself on Play, so the game tab does this: it reads the run, adds the result when the lobby's Play
// armed one, and saves it; the builder tab picks it up through the storage event or its next open.
// Pure apart from the storage object passed in.

import { consumeArmedResult, loadRun, saveRun } from './run-state.mjs';

/**
 * @param {Storage|null} storage
 * @param {{winner?: string|null, isWinner?: unknown}} detail the `rules-game-ended` event detail
 * @returns {import('./run-state.mjs').Run|null} the updated run, or null when nothing was recorded.
 *   Only the netcode end screen sets a boolean `isWinner` with a `winner`; the local engine's
 *   `{ reason }`-only events and a drawn game leave the run alone (the lobby can record by hand).
 */
export function reportMatchResult(storage, detail, now = Date.now()) {
  if (!detail || typeof detail.isWinner !== 'boolean' || !detail.winner) return null;
  const run = loadRun(storage);
  if (!run) return null;
  const next = consumeArmedResult(run, detail.isWinner, now);
  if (!next || !saveRun(storage, next)) return null;
  return next;
}
