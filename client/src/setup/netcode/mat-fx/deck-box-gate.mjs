// Design 073: the opening coin waits for the deck boxes' deal. The server sends the coin call the
// moment both players are ready, and the call picker, the flip and the result are not FX plans, so
// the FX queue cannot hold them; this gate does. While a deal plays, callbacks queue in arrival
// order; they run when it ends, or at the backstop if the deal never reports its end.

export const GATE_BACKSTOP_SLACK_MS = 1500;

/**
 * @param {{ schedule?: (fn: () => void, ms: number) => unknown, cancel?: (id: unknown) => void }} [clock]
 */
export function createOpeningDealGate({
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
} = {}) {
  let busy = false;
  let backstop = null;
  let waiting = [];

  const run = (fn) => {
    try {
      fn();
    } catch (error) {
      console.error('deck box gate: a waiting callback failed', error);
    }
  };

  const end = () => {
    if (backstop !== null) cancel(backstop);
    backstop = null;
    busy = false;
    const queued = waiting;
    waiting = [];
    queued.forEach(run);
  };

  return {
    /** A deal of `ms` starts now; a deal already playing is extended to the later end. */
    begin(ms) {
      busy = true;
      if (backstop !== null) cancel(backstop);
      backstop = schedule(end, Math.max(0, Number(ms) || 0) + GATE_BACKSTOP_SLACK_MS);
    },
    end,
    /** Runs `fn` now when no deal plays, else once it ends. */
    afterOpeningDeal(fn) {
      if (typeof fn !== 'function') return;
      if (busy) waiting.push(fn);
      else run(fn);
    },
    busy: () => busy,
  };
}

const appGate = createOpeningDealGate();
export const beginOpeningDeal = (ms) => appGate.begin(ms);
export const endOpeningDeal = () => appGate.end();
export const afterOpeningDeal = (fn) => appGate.afterOpeningDeal(fn);
export const openingDealBusy = () => appGate.busy();
