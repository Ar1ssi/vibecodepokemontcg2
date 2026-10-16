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

// One slot per seat: a normal room uses the unnamed slot; a solo room (design 074 D7)
// gets both seats' deals and keys them by seat, each with its seat-relative starter.
const UNNAMED_SEAT = '';
const slots = new Map();

const slotFor = (seat) => {
  const key = seat || UNNAMED_SEAT;
  if (!slots.has(key)) slots.set(key, { order: null, starter: null, waiters: [] });
  return slots.get(key);
};

/**
 * Called from the 'dealOrder' socket listener once the server's deal is known.
 *
 * @param {number[]|null} order
 * @param {'self'|'opp'|null} [starter] relative to `seat`
 * @param {'p1'|'p2'|null} [seat] a solo room's seat; omitted in a normal room
 */
export function setDealOrder(order, starter = null, seat = null) {
  const slot = slotFor(seat);
  slot.order = Array.isArray(order) ? order : null;
  slot.starter = starter === 'self' || starter === 'opp' ? starter : null;
  const toResolve = slot.waiters;
  slot.waiters = [];
  toResolve.forEach((resolve) => resolve(slot.order));
}

/** Clears any stored/pending order/starter — call on room leave / game reset. */
export function resetDealOrder() {
  slots.clear();
}

/**
 * How long the opening Set Up waits for the server's deal. The server deals only
 * once the coin is called (TURN_ORDER_CALL_TIMEOUT_MS, 15 s) and its winner has
 * chosen first or second (TURN_ORDER_CHOICE_TIMEOUT_MS, 25 s; design 072), so
 * this covers both timeouts plus a margin for the ceremony and the network.
 * Pinned against server/game/room.mjs by deal-order.test.mjs.
 */
export const OPENING_DEAL_WAIT_MS = 45000;

/**
 * Resolves with the server's deal order once it arrives, or null after timeoutMs if
 * it never does. Callers must treat null as "fall back to local behavior", never guess.
 *
 * @param {number} [timeoutMs=5000]
 * @param {'p1'|'p2'|null} [seat] a solo room's seat whose deal to wait for
 * @returns {Promise<number[]|null>}
 */
export function waitForDealOrder(timeoutMs = 5000, seat = null) {
  const slot = slotFor(seat);
  if (slot.order) {
    const order = slot.order;
    slot.order = null;
    return Promise.resolve(order);
  }
  return new Promise((resolve) => {
    const onOrder = (order) => {
      clearTimeout(timer);
      slot.order = null;
      resolve(order);
    };
    const timer = setTimeout(() => {
      slot.waiters = slot.waiters.filter((w) => w !== onOrder);
      resolve(null);
    }, timeoutMs);
    slot.waiters.push(onOrder);
  });
}

/**
 * Returns the server's authoritative starter ('self'/'opp') if the 'dealOrder'
 * broadcast has already arrived, else null — callers must fall back to local
 * behavior on null rather than wait or guess (dealOrder normally arrives well
 * before the coin-flip UI runs, since setupPrizes() already awaits it first).
 *
 * @param {'p1'|'p2'|null} [seat] a solo room's seat the answer is relative to
 * @returns {'self'|'opp'|null}
 */
export function getDealOrderStarter(seat = null) {
  return slots.get(seat || UNNAMED_SEAT)?.starter ?? null;
}
