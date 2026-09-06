/**
 * Multiplayer catch-up / hash-resync helpers.
 *
 * A persistent board-hash mismatch used to request a fullReplay of the
 * opponent's entire action log every few seconds. `draw` / `setup` then
 * re-ran deck→hand `moveCard` without a replay flag, so the draw-to-hand
 * flight replayed on a loop. These helpers:
 *   - suppress that flight during catch-up
 *   - allow only one hash-based fullReplay per (peer, local) counter pair
 */

/** Live pushAction should still animate; only catch-up / explicit replay skip. */
export function shouldAnimateDrawFlight({
  syncReplay = false,
  syncReplaying = false,
} = {}) {
  return !syncReplay && !syncReplaying;
}

export function hashResyncKey(peerSelfCounter, localOppCounter) {
  return `${peerSelfCounter}:${localOppCounter}`;
}

/**
 * If we already requested a hash fullReplay at this exact counter pair,
 * replaying the same action list cannot converge. Skip until a new action
 * advances a counter.
 */
export function shouldRequestHashResync(
  lastKey,
  peerSelfCounter,
  localOppCounter
) {
  const key = hashResyncKey(peerSelfCounter, localOppCounter);
  if (lastKey === key) {
    return { request: false, key };
  }
  return { request: true, key };
}
