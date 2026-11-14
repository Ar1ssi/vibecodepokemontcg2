// When a pending choice that just arrived may open its picker. A knockout's prize choice
// arrives in the same view as the attack that caused it, and its picker covered the whole
// attack, hit and knockout scene. It now waits for the batch's effects to drain from the FX
// queue, for every knockout scene to land in the discard pile (a knockout's queue hold ends
// well before its card lands), and for the last attack scene to end. The server is waiting
// on the choice, so the whole wait is bounded: past `backstopMs` the picker opens anyway.
// Clock and timers are injected so tests run on a fake clock.
export const CHOICE_BACKSTOP_MS = 9000;

/**
 * @param {object} deps
 * @param {() => Promise<void>} deps.queueIdle resolves once the FX queue has drained
 * @param {() => Promise<void>[]} deps.knockoutScenes the knockout scenes still playing, read once the queue drains
 * @param {() => number} deps.attackSceneEndsAt when the last attack scene ends (same clock as `now`)
 * @param {() => number} deps.now
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {number} [deps.backstopMs]
 * @returns {() => Promise<void>}
 */
export function createChoiceGate({
  queueIdle,
  knockoutScenes,
  attackSceneEndsAt,
  now,
  sleep,
  backstopMs = CHOICE_BACKSTOP_MS,
}) {
  return async function whenChoiceMayOpen() {
    const deadline = now() + backstopMs;
    const bounded = (step) => {
      const left = deadline - now();
      if (!(left > 0)) return Promise.resolve();
      // A waiter that throws must not keep the choice from opening.
      const settled = Promise.resolve().then(step).catch(() => {});
      return Promise.race([settled, sleep(left)]);
    };
    await bounded(queueIdle);
    await bounded(() => Promise.all(knockoutScenes()));
    await bounded(() => {
      const tail = attackSceneEndsAt() - now();
      return Number.isFinite(tail) && tail > 0 ? sleep(tail) : undefined;
    });
  };
}

/**
 * Resolves once `endsAt()` is in the past. The end can move out while waiting (a draw queued
 * behind another lands later), so it is read again after each sleep.
 *
 * @param {object} deps
 * @param {() => number} deps.endsAt when the last flight lands (same clock as `now`)
 * @param {() => number} deps.now
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @returns {Promise<void>}
 */
export async function waitOutFlights({ endsAt, now, sleep }) {
  for (;;) {
    const tail = endsAt() - now();
    if (!Number.isFinite(tail) || !(tail > 0)) return;
    await sleep(tail);
  }
}

/**
 * The knockout scenes still playing, for the choice gate. Each settles once its card has
 * landed: `landsMs` after its scene starts on its hit, else `startBackstopMs + landsMs` after
 * it was tracked, when playKnockoutGhost's own backstop start lands it. A hit later than that
 * backstop, or a hidden tab where the scene never starts, falls back to the same bound.
 *
 * @param {object} deps
 * @param {number} deps.landsMs
 * @param {number} deps.startBackstopMs
 * @param {(fn: () => void, ms: number) => unknown} deps.setTimer
 * @param {(id: unknown) => void} deps.clearTimer
 */
export function createKnockoutScenes({ landsMs, startBackstopMs, setTimer, clearTimer }) {
  const playing = new Set();
  return {
    /** Tracks one scene; returns the callback for the moment it starts. */
    track() {
      let settle;
      const scene = new Promise((resolve) => {
        settle = resolve;
      });
      playing.add(scene);
      const backstop = setTimer(settle, startBackstopMs + landsMs);
      scene.then(() => {
        clearTimer(backstop);
        playing.delete(scene);
      });
      return () => setTimer(settle, landsMs);
    },
    /** @returns {Promise<void>[]} */
    playing: () => [...playing],
  };
}
