/**
 * Multiplayer catch-up / hash-resync helpers.
 *
 * A persistent board-hash mismatch used to request a fullReplay of the
 * opponent's entire action log every few seconds. `draw` / `setup` then
 * re-ran deck→hand `moveCard` without a replay flag, so the draw-to-hand
 * flight replayed on a loop. These helpers:
 *   - suppress that flight during catch-up
 *   - allow only one fullReplay per (peer, local) counter pair
 *
 * `hint_mismatch` / `apply_failed` used to emit `resyncActions` on every
 * failed mirror move. When the action log cannot converge (e.g. a local-only
 * ability swap), catch-up rebuilds the board, the same move fails again, and
 * the board flickers. Share one last-key across hash, hint, and apply-failed
 * so a single pair only full-replays once.
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

let lastBoardResyncKey = null;
let lastSnapshotKey = null;

/** @internal reset between unit tests */
export function resetBoardResyncDedupe() {
  lastBoardResyncKey = null;
  lastSnapshotKey = null;
}

/**
 * One fullReplay request per counter pair, and never while catch-up is
 * already rebuilding the board. Shared by hash, hint_mismatch, and
 * apply_failed so a failed replay does not immediately request another.
 */
export function shouldEmitBoardResync({
  selfCounter,
  oppCounter,
  syncReplaying = false,
  isCatchingUp = false,
} = {}) {
  if (syncReplaying || isCatchingUp) {
    return {
      request: false,
      skipped: 'replaying',
      key: lastBoardResyncKey,
    };
  }
  const { request, key } = shouldRequestHashResync(
    lastBoardResyncKey,
    selfCounter,
    oppCounter
  );
  if (request) lastBoardResyncKey = key;
  return { request, key };
}

/**
 * One board snapshot per counter pair after action replay cannot converge.
 * Separate from fullReplay dedupe so a failed replay can still request a
 * snapshot of the peer's self board.
 */
export function shouldRequestBoardSnapshot({
  selfCounter,
  oppCounter,
  syncReplaying = false,
  isCatchingUp = false,
} = {}) {
  if (syncReplaying || isCatchingUp) {
    return {
      request: false,
      skipped: 'replaying',
      key: lastSnapshotKey,
    };
  }
  const { request, key } = shouldRequestHashResync(
    lastSnapshotKey,
    selfCounter,
    oppCounter
  );
  if (request) lastSnapshotKey = key;
  return { request, key };
}
