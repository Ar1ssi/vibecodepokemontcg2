/* eslint-disable no-undef */
/**
 * Playmat container refs, kept separate from `global-variables.js` so zone
 * helpers can import them without creating a circular import through
 * `front-end.js` (which deadlocks module initialization in the browser).
 *
 * With the three.js board requested (design 074 D4), the "container documents" are the two
 * open shadow roots of the board mirror and the containers are their hosts (`#selfBoard`,
 * `#oppBoard`); otherwise they are the playmat iframes, exactly as before. The choice is made
 * once, here, because every importer reads these bindings at its own load.
 */
import { createBoardMirror } from '../../setup/board3d/board-mirror.js';
import { isBoard3dRequested } from '../../setup/board3d/board-flag.mjs';

const pageDocument = typeof document !== 'undefined' ? document : null;

const readLocalStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Whether this browser can make a WebGL2 context; without one the 3D board never starts. */
const canRunWebgl2 = (doc) => {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
};

const mirrorFor = (doc) => {
  if (!doc) return null;
  if (!isBoard3dRequested(globalThis.location?.search ?? '', readLocalStorage())) return null;
  const hostSelf = doc.getElementById('selfBoard');
  const hostOpp = doc.getElementById('oppBoard');
  if (!hostSelf || !hostOpp || !canRunWebgl2(doc)) return null;
  try {
    return createBoardMirror({ hostSelf, hostOpp, doc });
  } catch (error) {
    console.warn('board3d: mirror unavailable, using the playmat iframes', error);
    return null;
  }
};

/** The board mirror (board-mirror.js) when the 3D board owns the containers, else null. */
export const boardMirror = mirrorFor(pageDocument);

const iframe = (id) => pageDocument?.getElementById(id) ?? null;

export const selfContainer = boardMirror ? boardMirror.hosts.self : iframe('selfContainer');
export const selfContainerDocument = boardMirror
  ? boardMirror.roots.self
  : (selfContainer?.contentWindow?.document ?? null);
export const oppContainer = boardMirror ? boardMirror.hosts.opp : iframe('oppContainer');
export const oppContainerDocument = boardMirror
  ? boardMirror.roots.opp
  : (oppContainer?.contentWindow?.document ?? null);
