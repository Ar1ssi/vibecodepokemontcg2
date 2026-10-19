// Design 074 D5: the pure half of the 3D board's pointer input. A click is a press and release
// on the same element with the same button, close in space and time; two such clicks on one
// element in quick succession are a double-click. `mirrorSelectorFor` names the DOM twin a scene
// hit dispatches to (board-mirror.js roots; the Stadium stays in the page). DOM-free.

/** The cover element each pile's clicks and context menu land on (the iframe board's covers). */
export const PILE_COVER_IDS = Object.freeze({
  deck: 'deckCover',
  discard: 'discardCover',
  lostZone: 'lostZoneCover',
});
export const STADIUM_SELECTOR = '#stadium img';

/**
 * @param {{ slopPx?: number, clickMs?: number, dblMs?: number }} [options]
 * @returns {{ down: (id: unknown, x: number, y: number, t: number, button: number) => void,
 *   up: (id: unknown, x: number, y: number, t: number, button: number) => { click: boolean, dblclick: boolean },
 *   reset: () => void }}
 *   `id` identifies the element under the pointer (null = nothing); `t` is in ms.
 */
export function createClickTracker({ slopPx = 6, clickMs = 400, dblMs = 350 } = {}) {
  let press = null;
  let lastClick = null;
  const none = { click: false, dblclick: false };

  const down = (id, x, y, t, button) => {
    press = { id, x, y, t, button };
  };

  const up = (id, x, y, t, button) => {
    const started = press;
    press = null;
    if (!started || id == null || started.id !== id || started.button !== button) return none;
    if (Math.hypot(x - started.x, y - started.y) > slopPx) return none;
    if (t - started.t > clickMs) return none;
    const doubled =
      lastClick !== null && lastClick.id === id && lastClick.button === button && t - lastClick.t <= dblMs;
    // A double-click consumes both clicks: a third quick click starts a new pair.
    lastClick = doubled ? null : { id, t, button };
    return { click: true, dblclick: doubled };
  };

  const reset = () => {
    press = null;
    lastClick = null;
  };

  return { down, up, reset };
}

/**
 * Where a `board-scene.js` hit's DOM twin lives: `side` 'self'/'opp' is that mirror root, null the
 * page document. Null for no hit or a hit with nothing to address.
 * @param {{ instanceId?: number|null, side?: string|null, zone?: string, pile?: boolean, plane?: boolean }|null} hit
 * @returns {{ side: 'self'|'opp'|null, selector: string }|null}
 */
export function mirrorSelectorFor(hit) {
  if (!hit || typeof hit !== 'object') return null;
  // An empty zone's footprint (a drop target) has no DOM twin to click.
  if (hit.plane) return null;
  if (hit.zone === 'stadium') return { side: null, selector: STADIUM_SELECTOR };
  if (hit.side !== 'self' && hit.side !== 'opp') return null;
  if (hit.pile) {
    // The listeners (coverClick, the card menu) are on the cover's <img>, which shares the slot's id.
    const cover = PILE_COVER_IDS[hit.zone];
    return cover ? { side: hit.side, selector: `#${cover} > img` } : null;
  }
  if (!Number.isFinite(hit.instanceId)) return null;
  return { side: hit.side, selector: `img[data-instance-id="${hit.instanceId}"]` };
}

/**
 * The hit a click (not a drag or the card menu) goes to: the Lost Zone's face-up top card is
 * its pile, so a click opens the Lost Zone as its cover did on the iframe board. The card's own
 * img sits in the hidden #lostZone panel, where a click selects it.
 * @param {{ zone?: string, pile?: boolean, plane?: boolean }|null} hit
 */
export function clickHitFor(hit) {
  if (hit?.zone === 'lostZone' && !hit.pile && !hit.plane) return { ...hit, pile: true };
  return hit;
}
