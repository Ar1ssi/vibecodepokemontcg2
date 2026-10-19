/* eslint-disable no-undef */
/**
 * Playmat container refs, kept separate from `global-variables.js` so zone
 * helpers can import them without creating a circular import through
 * `front-end.js` (which deadlocks module initialization in the browser).
 *
 * The "container documents" are the two open shadow roots of the board mirror
 * (board-mirror.js) and the containers are their hosts (`#selfBoard`, `#oppBoard`); the three.js
 * board (design 074) draws from them. Every importer reads these bindings at its own load, so
 * the mirror is built once, here. If it cannot be built the bindings stay null.
 */
import { createBoardMirror } from '../../setup/board3d/board-mirror.js';

const pageDocument = typeof document !== 'undefined' ? document : null;

const mirrorFor = (doc) => {
  if (!doc) return null;
  const hostSelf = doc.getElementById('selfBoard');
  const hostOpp = doc.getElementById('oppBoard');
  if (!hostSelf || !hostOpp) {
    console.error('board3d: board mirror hosts #selfBoard/#oppBoard are missing');
    return null;
  }
  try {
    return createBoardMirror({ hostSelf, hostOpp, doc });
  } catch (error) {
    console.error('board3d: board mirror could not be created', error);
    return null;
  }
};

/** The board mirror (board-mirror.js) that owns the containers; null when it could not be built. */
export const boardMirror = mirrorFor(pageDocument);

export const selfContainer = boardMirror?.hosts.self ?? null;
export const selfContainerDocument = boardMirror?.roots.self ?? null;
export const oppContainer = boardMirror?.hosts.opp ?? null;
export const oppContainerDocument = boardMirror?.roots.opp ?? null;
