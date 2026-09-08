/**
 * @file Counter-ordered `requestAction` queue (design 002, slice 1.2 / #6).
 * A `requestAction` arriving out of order used to be either dropped or, for
 * `moveCardBundle` and the counter/status actions, applied anyway against the
 * wrong counter. Both were worse than buffering: this module holds a gapped
 * action until its counter comes up, so the caller applies every action in
 * counter order. If the gap never closes, the caller falls through to the
 * slice 1.1 peer-log catch-up instead of guessing at partial state.
 */

export const STALE_ACTION_TIMEOUT_MS = 2000;

/**
 * Classifies an incoming `requestAction` against the next counter this
 * client expects to apply.
 *
 * @param {number} counter The counter on the incoming action.
 * @param {number} expected The next counter this client expects (`systemState.selfCounter`).
 * @returns {'stale'|'apply'|'buffer'} `stale`: already applied or duplicate, drop it.
 *   `apply`: matches `expected`, apply now. `buffer`: ahead of `expected`, hold it.
 */
export function admitRequestAction(counter, expected) {
  if (counter < expected) return 'stale';
  if (counter === expected) return 'apply';
  return 'buffer';
}

/**
 * Holds out-of-order `requestAction` payloads keyed by counter, and releases
 * the contiguous run starting at `expected` once it closes.
 */
export function createRequestActionQueue() {
  const pending = new Map();

  return {
    /** Buffers one gapped action, keyed by its counter. */
    buffer(counter, entry) {
      pending.set(counter, entry);
    },
    /**
     * Removes and returns the contiguous run of buffered actions starting at
     * `expected`, in counter order.
     *
     * @param {number} expected
     * @returns {Array<{action: string, parameters: any}>}
     */
    takeReady(expected) {
      const ready = [];
      let next = expected;
      while (pending.has(next)) {
        ready.push(pending.get(next));
        pending.delete(next);
        next += 1;
      }
      return ready;
    },
    hasPending() {
      return pending.size > 0;
    },
    /** Drops every buffered action. Called when the gap goes stale. */
    clear() {
      pending.clear();
    },
  };
}
