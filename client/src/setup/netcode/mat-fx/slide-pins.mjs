// I265: a retreat/switch/promote slide plays after the 3D board's settle hold, but the view moves
// the card's mesh to its new slot at once, so the card landed, then jumped back to slide. The
// cards are pinned where they stood from before the diff until their slide takes the mesh over.
// Design 089: a pin is the scene's `pinCard` — the card rests frozen at its old pose and keeps its
// mesh even when the view buries it (a knocked-out stack) — not a held flight, so a pinned card
// still takes an attack scene's motion, and an attack that strikes a knocked-out defender finds
// it whole in its slot. DOM-free: `pin` / `unpin` are the scene's pinCard / unpinCard.

// Backstop: a pin whose slide or knockout never comes (the plan was dropped) lets go after this long;
// an attack banner, its move and the strike come first.
export const SLIDE_PIN_MAX_MS = 9000;
// A card nobody slid glides to where the view has it, like any other board move.
export const SLIDE_PIN_GLIDE_MS = 180;

/**
 * @param {{ pin: (id: *) => boolean, unpin: (id: *, o: { ms: number }) => void,
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 *   maxMs?: number }} deps
 */
export function createSlidePins({
  pin,
  unpin,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  maxMs = SLIDE_PIN_MAX_MS,
}) {
  const pinned = new Map();

  const letGo = (id, ms) => {
    const entry = pinned.get(id);
    if (!entry) return;
    pinned.delete(id);
    clearTimer(entry.timer);
    unpin(id, { ms });
  };

  return {
    /** Holds card `id` where it stands until `take`, `releaseAll` or the backstop. False when it has no mesh. */
    pin(id) {
      if (pinned.has(id)) return true;
      if (!pin(id)) return false;
      pinned.set(id, { claimed: false, timer: setTimer(() => letGo(id, SLIDE_PIN_GLIDE_MS), maxMs) });
      return true;
    },
    /** A flight on card `id` is taking it over: its own pose jumps to where the view has it. */
    take(id) {
      letGo(id, 0);
    },
    /** Card `id` flies nowhere after all: it glides to where the view has it. */
    release(id) {
      letGo(id, SLIDE_PIN_GLIDE_MS);
    },
    /** A scene that is about to play owns card `id`'s pin: `releaseAll` leaves it (the backstop still frees it). */
    claim(id) {
      const entry = pinned.get(id);
      if (entry) entry.claimed = true;
    },
    /**
     * Lets every unclaimed card go to where the view has it (the queue went idle or was cleared).
     * `claimed: true` lets the claimed ones go too: the game was reset, and no scene is coming.
     */
    releaseAll({ claimed = false } = {}) {
      for (const [id, entry] of [...pinned]) if (claimed || !entry.claimed) letGo(id, SLIDE_PIN_GLIDE_MS);
    },
    has: (id) => pinned.has(id),
  };
}
