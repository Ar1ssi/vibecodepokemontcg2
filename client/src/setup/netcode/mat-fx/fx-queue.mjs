// Design 024 slice 0: the cosmetic FX queue. Effects used to all fire in the
// same frame, so an attack read as one flash; this drains plans in arrival
// order, waiting each plan's hold (fx-holds.mjs) before starting the next.
//
// It is COSMETIC ONLY. Board state is already applied by the time plans arrive,
// so nothing here gates input or rendering. Under a flood the queue must drain
// rather than stall, so committed holds are capped by `maxQueueMs` — past that
// budget every hold collapses to 0 until the queue goes idle and the budget
// resets. `schedule` and `now` are injected so tests run on a fake clock.
export const DEFAULT_MAX_QUEUE_MS = 2500;

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
    let hold = 0;
    try {
      hold = holdOf(run(plan));
    } catch {
      hold = 0;
    }
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

    /** Run everything still pending right now, with no holds between them. */
    flush() {
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      while (queue.length > 0) {
        const plan = queue.shift();
        try {
          run(plan);
        } catch {
          /* dispatcher already reports; a bad effect must not stop the drain */
        }
      }
      committedMs = 0;
    },

    /** Drop everything pending without running it (mirror guard, fx-off). */
    clear() {
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
