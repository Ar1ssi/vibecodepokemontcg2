// Records a finished game into the Build & Battle run (design 071 Options 4). The builder tab closes
// itself on Play, so the game tab does this: it reads the run, adds the result when the lobby's Play
// armed one, and saves it; the builder tab picks it up through the storage event or its next open.
// Pure apart from the storage object passed in.

import { DECK_FORMAT_BUILD_BATTLE } from '../../../../../../shared/engine/formats.mjs';
import { consumeArmedResult, loadRun, saveRun } from './run-state.mjs';

/**
 * @param {Storage|null} storage
 * @param {{winner?: string|null, isWinner?: unknown, isLoser?: unknown}} detail the
 *   `rules-game-ended` event detail
 * @param {{now?: number, deckFormat?: string}} [context] `deckFormat` is the format the local
 *   player's deck was dealt under: a game played with a Standard deck never fills a node.
 * @returns {import('./run-state.mjs').Run|null} the updated run, or null when nothing was recorded.
 *   Only the netcode end screen names the local player's side: `isWinner` or `isLoser` is true.
 *   The local engine's `{ reason }`-only events, a drawn game and a spectator (neither flag) leave
 *   the run alone; the lobby can record by hand.
 */
export function reportMatchResult(storage, detail, { now = Date.now(), deckFormat } = {}) {
  if (deckFormat !== DECK_FORMAT_BUILD_BATTLE) return null;
  if (!detail || !detail.winner) return null;
  const won = detail.isWinner === true;
  if (!won && detail.isLoser !== true) return null;
  const run = loadRun(storage);
  if (!run) return null;
  const next = consumeArmedResult(run, won, now);
  if (!next || !saveRun(storage, next)) return null;
  return next;
}
