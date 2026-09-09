/**
 * @file Design 002 I17/I27 — the server's authoritative opening-deal order and starter.
 * The server never trusts a client-supplied shuffle (D10 / slice 3.4a's rejection of
 * client-relayed shuffle indices for the same reason). Without this, the client's own
 * local legacy shuffle and the server's independent shuffle in GameRoom deal two
 * different hands from the same deck, so any client-issued moveCard from hand fails
 * validateReferences' zone check server-side (stale_view). Once the server emits its
 * own deal ('dealOrder', see server.js's post-'setup' broadcast), the client waits for
 * it here and uses it as the `indices` argument to its existing legacy
 * shuffleZone()/setupPrizes() call instead of rolling a local one — so both sides
 * genuinely deal the same cards, not just agree not to reject each other.
 *
 * The same broadcast also carries `starter` ('self'/'opp', relative to the recipient):
 * setupGame() picks the real starter from its own RNG, independently of the client's
 * peer-to-peer coin flip (rules-bridge.js) — two unrelated RNG streams that only agree
 * by chance (I27). rules-bridge.js reads it via getDealOrderStarter() to make its local
 * flip's outcome match the server's instead of guessing.
 */

let pendingOrder = null;
let pendingStarter = null;
let waiters = [];

/** Called from the 'dealOrder' socket listener once the server's deal is known. */
export function setDealOrder(order, starter = null) {
  pendingOrder = Array.isArray(order) ? order : null;
  pendingStarter = starter === 'self' || starter === 'opp' ? starter : null;
  const toResolve = waiters;
  waiters = [];
  toResolve.forEach((resolve) => resolve(pendingOrder));
}

/** Clears any stored/pending order/starter — call on room leave / game reset. */
export function resetDealOrder() {
  pendingOrder = null;
  pendingStarter = null;
  waiters = [];
}

/**
 * Resolves with the server's deal order once it arrives, or null after timeoutMs if
 * it never does. Callers must treat null as "fall back to local behavior", never guess.
 *
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<number[]|null>}
 */
export function waitForDealOrder(timeoutMs = 5000) {
  if (pendingOrder) return Promise.resolve(pendingOrder);
  return new Promise((resolve) => {
    const onOrder = (order) => {
      clearTimeout(timer);
      resolve(order);
    };
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== onOrder);
      resolve(null);
    }, timeoutMs);
    waiters.push(onOrder);
  });
}

/**
 * Returns the server's authoritative starter ('self'/'opp') if the 'dealOrder'
 * broadcast has already arrived, else null — callers must fall back to local
 * behavior on null rather than wait or guess (dealOrder normally arrives well
 * before the coin-flip UI runs, since setupPrizes() already awaits it first).
 *
 * @returns {'self'|'opp'|null}
 */
export function getDealOrderStarter() {
  return pendingStarter;
}
