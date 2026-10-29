// Design 077: a Stadium board's change (reveal, swap, dissolve) waits its turn in the FX queue,
// behind the Stadium card's own play. The board's target is already set from the view, so a plan
// that never plays must still land on it: a push that may not animate settles at once, and a
// queue clear (FX turned off, a restart, a skipped catch-up batch) settles every plan it drops.

export const BOARD_ENVIRONMENT = 'board-environment';

/**
 * @param {{ push: (plan: object) => void, clear: () => void, mayAnimate: () => boolean }} queue
 *   `push`/`clear` are the FX queue's; `mayAnimate` is false while the board must not animate
 *   (FX off, catch-up replay, a hidden tab).
 * @returns {{ queue: (transition: { play: () => number, settle: () => void }) => void,
 *   run: (plan: object) => number, clear: () => void }}
 *   `run` plays a queued plan (the FX queue's runner calls it) and returns its hold; `clear` empties
 *   the FX queue, settling the board plans it held.
 */
export function createBoardEnvironmentQueue({ push, clear, mayAnimate }) {
  const pending = new Set();

  const queue = ({ play, settle }) => {
    if (!mayAnimate()) {
      settle();
      return;
    }
    const plan = { kind: BOARD_ENVIRONMENT, play, settle };
    pending.add(plan);
    push(plan);
  };

  const run = (plan) => {
    pending.delete(plan);
    return plan.play();
  };

  const clearAll = () => {
    const dropped = [...pending];
    pending.clear();
    clear();
    for (const plan of dropped) plan.settle();
  };

  return { queue, run, clear: clearAll };
}
