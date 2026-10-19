// I265: a retreat/switch/promote slide plays after the 3D board's settle hold, but the view moves
// the card's mesh to its new slot at once, so the card landed, then jumped back to slide. The
// cards are pinned where they stood from before the diff until their slide takes the mesh over.
// DOM-free: `tween` is the board scene's `tween(id, poseFn, ms)`.

// Backstop: a pin whose slide or knockout never comes (the plan was dropped) lets go after this long;
// an attack banner, its move and the strike come first.
export const SLIDE_PIN_MAX_MS = 9000;

export function createSlidePins(tween) {
  const pinned = new Map();
  return {
    /** Holds card `id`'s mesh at `pose` (a flight pose) until `take`, `releaseAll` or the backstop. */
    pin(id, pose) {
      pinned.set(id, pose);
      const done = tween(id, () => pose, SLIDE_PIN_MAX_MS);
      done?.then?.(() => {
        if (pinned.get(id) === pose) pinned.delete(id);
      });
    },
    /** The slide is taking card `id` over (its tween replaces the pin). */
    take(id) {
      pinned.delete(id);
    },
    /** Lets every pinned card go to its own pose (the queue went idle or was cleared). */
    releaseAll() {
      const left = [...pinned];
      pinned.clear();
      for (const [id, pose] of left) tween(id, () => pose, 0);
    },
    has: (id) => pinned.has(id),
  };
}
