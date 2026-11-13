// Design 089: the board's one set of slide pins (slide-pins.mjs) on the live three.js scene. A
// module of its own so the effects that take pins (slides, knockouts, flights into a pile) and
// the module that sets them (lifecycle.js) do not import each other.
import { getBoardScene } from '../../board3d/board3d.js';
import { createSlidePins } from './slide-pins.mjs';

const slidePins = createSlidePins({
  pin: (id) => Boolean(getBoardScene()?.pinCard?.(id)),
  unpin: (id, options) => getBoardScene()?.unpinCard?.(id, options),
});

/** Holds card `id` where it stands until its scene takes it. False when the board draws no mesh for it. */
export const pinSlide = (id) => slidePins.pin(id);

/** Whether card `id` is pinned now. */
export const slidePinned = (id) => slidePins.has(id);

/** The scene flying card `id` takes its pin over (call it after the flight has started). */
export const takeSlidePin = (id) => slidePins.take(id);

/** Card `id` flies nowhere after all: it glides to where the view has it. */
export const releaseSlidePin = (id) => slidePins.release(id);

/** A scene about to play owns card `id`'s pin: an idle queue no longer releases it. */
export const claimSlidePin = (id) => slidePins.claim(id);

/** Lets go of pins whose scene never played (the FX queue went idle or was cleared). */
export const releaseSlidePins = () => slidePins.releaseAll();
