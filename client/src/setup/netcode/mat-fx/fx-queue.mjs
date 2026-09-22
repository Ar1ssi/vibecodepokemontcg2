// Design 024 slice 0: the cosmetic FX queue. Effects used to all fire in the
// same frame, so an attack read as one flash; this drains plans in arrival
// order, waiting each plan's hold (fx-holds.mjs) before starting the next.
//
// Replayed or hidden-tab batches are DROPPED (`clear`), not fast-forwarded:
// re-playing a catch-up burst silently would be worse than skipping it.
//
// It is COSMETIC ONLY. Board state is already applied by the time plans arrive,
// so nothing here gates input or rendering. Under a flood the queue must drain
// rather than stall, so committed holds are capped by `maxQueueMs` — past that
// budget every hold collapses to 0 until the queue goes idle and the budget
// resets. `schedule` and `now` are injected so tests run on a fake clock.
const DEFAULT_MAX_QUEUE_MS = 2500;

const holdOf = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

export const createFxQueue = ({
  run,
  schedule,
  cancel = () => {},
  maxQueueMs = DEFAULT_MAX_QUEUE_MS,
}) => {
  const queue = [];
  let timer = null;
  let committedMs = 0;
  // Bumped by clear(); `step` checks it after `run` so an effect that clears
  // the queue synchronously (one that dispatches `game-restarted`, say) cannot
  // have a fresh timer armed on top of the stop it just requested.
  let epoch = 0;

  const idle = () => {
    timer = null;
    committedMs = 0;
  };

  // Runs one plan, then arms the wait for whatever comes next. The timer is
  // armed even when the queue is empty: that armed timer IS the outgoing plan's
  // hold, and it is what makes a plan pushed mid-hold wait its turn instead of
  // jumping the one still playing. `run` is the dispatcher, which already
  // try/catches every effect — but a hold that comes back NaN or from a thrown
  // call must still not wedge the chain, hence holdOf + try.
  const step = () => {
    timer = null;
    const plan = queue.shift();
    if (!plan) return idle();
    const startedIn = epoch;
    let hold = 0;
    try {
      hold = holdOf(run(plan));
    } catch {
      hold = 0;
    }
    // `run` is synchronous but arbitrary: it may have cleared the queue, or
    // pushed and re-armed one of its own. Either way this call no longer owns
    // the chain and must not overwrite what happened while it ran.
    if (epoch !== startedIn || timer !== null) return;
    if (committedMs >= maxQueueMs) hold = 0;
    committedMs += hold;
    timer = schedule(step, hold);
  };

  // Idle means no hold outstanding, so the plan can start in this same tick.
  const start = () => {
    if (timer === null) step();
  };

  return {
    push(plan) {
      if (!plan) return;
      queue.push(plan);
      start();
    },

    /** Drop everything pending without running it (mirror guard, fx-off). */
    clear() {
      epoch += 1;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      queue.length = 0;
      committedMs = 0;
    },

    pending: () => queue.length,
  };
};
