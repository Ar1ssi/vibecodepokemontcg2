// Design 073: which deck box each side shows and whether it has dealt its deck this game.
// Ids are boxes.json ids; null is the default box. Point-of-view sides only: the wire carries the
// sender's own id inside its deck packet (deck-box-args.mjs), never a side name.
import { sanitizeDeckBoxId } from '../../deck-constructor/deck-box-args.mjs';

export const DECK_BOX_SIDES = Object.freeze(['self', 'opp']);

const isSide = (side) => DECK_BOX_SIDES.includes(side);

export function createDeckBoxState() {
  const ids = { self: null, opp: null };
  const dealt = { self: false, opp: false };
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('deck box state: a listener failed', error);
      }
    }
  };

  return {
    idFor: (side) => (isSide(side) ? ids[side] : null),
    setId(side, id) {
      if (!isSide(side)) return;
      const next = sanitizeDeckBoxId(id);
      if (ids[side] === next) return;
      ids[side] = next;
      notify();
    },
    isDealt: (side) => (isSide(side) ? dealt[side] : false),
    setDealt(side, value) {
      if (!isSide(side) || dealt[side] === Boolean(value)) return;
      dealt[side] = Boolean(value);
      notify();
    },
    /** A new game, room or deck: every named side's box is full and shut again. */
    clearDealt(sides = DECK_BOX_SIDES) {
      let changed = false;
      for (const side of sides.filter(isSide)) {
        changed ||= dealt[side];
        dealt[side] = false;
      }
      if (changed) notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
