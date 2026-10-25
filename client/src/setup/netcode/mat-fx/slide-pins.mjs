// I265: a retreat/switch/promote slide plays after the 3D board's settle hold, but the view moves
// the card's mesh to its new slot at once, so the card landed, then jumped back to slide. The
// cards are pinned where they stood from before the diff until their slide takes the mesh over.
// DOM-free: `tween` is the board scene's `tween(id, poseFn, ms)`. A pinned card also keeps its
// pre-diff table pose (`hold`/`release`: the scene's hold/releaseCardTablePose), so an attack
// that strikes a knocked-out defender aims at its slot, not at the discard pile it is headed for.

// Backstop: a pin whose slide or knockout never comes (the plan was dropped) lets go after this long;
// an attack banner, its move and the strike come first.
export const SLIDE_PIN_MAX_MS = 9000;

export function createSlidePins(tween, { hold = () => {}, release = () => {} } = {}) {
  const pinned = new Map();
  const unpin = (id) => {
    pinned.delete(id);
    release(id);
  };
  return {
    /** Holds card `id`'s mesh at `pose` (a flight pose) until `take`, `releaseAll` or the backstop. */
    pin(id, pose) {
      if (!pinned.has(id)) hold(id);
      pinned.set(id, pose);
      const done = tween(id, () => pose, SLIDE_PIN_MAX_MS);
      done?.then?.(() => {
        if (pinned.get(id) === pose) unpin(id);
      });
    },
    /** The slide is taking card `id` over (its tween replaces the pin). */
    take(id) {
      if (pinned.has(id)) unpin(id);
    },
    /** Lets every pinned card go to its own pose (the queue went idle or was cleared). */
    releaseAll() {
      const left = [...pinned];
      pinned.clear();
      for (const [id, pose] of left) {
        release(id);
        tween(id, () => pose, 0);
      }
    },
    has: (id) => pinned.has(id),
  };
}
