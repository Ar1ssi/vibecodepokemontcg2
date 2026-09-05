/**
 * Applies a playmat and its zone layout to the board.
 *
 * The board is three separate documents: the parent page (which owns the mat
 * artwork and the stadium) plus the two playmat iframes (which own every card
 * zone). CSS custom properties do not cross an iframe boundary, so the layout
 * variables have to be written onto each document's own `documentElement`.
 * That is the whole job here — `mat-layouts.mjs` decides the geometry, this
 * module delivers it and paints the mat.
 */

import {
  DEFAULT_MAT_LAYOUT_ID,
  getMatLayout,
  layoutToCssVars,
  resolveMatLayout,
} from './mat-layouts.mjs';

const MAT_STORAGE_KEY = 'ptcg-sim.playmat.v1';

let currentMat = null;

/** localStorage is unavailable in some embeddings; a mat choice is not worth throwing over. */
const readStoredMat = () => {
  try {
    const raw = localStorage.getItem(MAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStoredMat = (mat) => {
  try {
    if (mat) localStorage.setItem(MAT_STORAGE_KEY, JSON.stringify(mat));
    else localStorage.removeItem(MAT_STORAGE_KEY);
  } catch {
    /* choice simply will not persist */
  }
};

/** The two playmat iframes, skipping any that has not parsed yet. */
const frameDocuments = () => {
  const docs = [];
  for (const id of ['selfContainer', 'oppContainer']) {
    const frame = document.getElementById(id);
    // Same-origin, but the iframe may not have parsed yet on first paint.
    const doc = frame?.contentDocument;
    if (doc?.documentElement) docs.push(doc);
  }
  return docs;
};

const boardDocuments = () => [document, ...frameDocuments()];

/** Identifies the newest paint so a slow probe cannot overwrite a later pick. */
let matPaintToken = 0;

/**
 * Point `--mat-image` at the mat's artwork, preferring the local file.
 *
 * `png/` is gitignored and so is absent from a deploy, where the local path
 * 404s but the scraped CDN original still resolves. A CSS background reports
 * no load failure, so the local file is probed and the variable re-pointed at
 * the remote copy if it is missing.
 */
const paintMatImage = (mat) => {
  const token = ++matPaintToken;
  // A relative url() inside a custom property is resolved against the
  // stylesheet that consumes it, not the document, so a catalog path like
  // `src/assets/...` would be looked up under `src/css/`. Resolve it against
  // the page first so the variable carries an absolute URL.
  const local = mat.image ? new URL(mat.image, document.baseURI).href : null;
  const remote = mat.imageUrl || null;
  const setImage = (url) =>
    document.documentElement.style.setProperty('--mat-image', `url("${url}")`);

  setImage(local || remote);

  if (!local || !remote) return;

  const probe = new Image();
  probe.onerror = () => {
    if (token === matPaintToken) setImage(remote);
  };
  probe.src = local;
};

/**
 * Push a layout profile's variables onto the parent page and both iframes.
 * Zone variables are only meaningful inside the iframes and the stadium ones
 * only in the parent, but writing the whole set everywhere keeps this from
 * having to know which document owns which zone.
 */
export const applyMatLayout = (layoutId) => {
  const layout = getMatLayout(layoutId);
  const vars = layoutToCssVars(layout);

  for (const doc of boardDocuments()) {
    const root = doc.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }

  return layout;
};

/**
 * Paint the mat artwork. `mat` is a catalog record (`{ id, title, image,
 * layout }`) or null to fall back to the simulator's own board.
 */
export const applyMat = (mat) => {
  const battleMat = document.getElementById('battleMat');
  const art = document.getElementById('battleMatArt');
  const layout = mat
    ? resolveMatLayout(mat)
    : getMatLayout(DEFAULT_MAT_LAYOUT_ID);

  applyMatLayout(layout.id);

  if (battleMat) {
    battleMat.classList.toggle('mat-active', Boolean(mat));
    battleMat.classList.toggle('mat-one-player', layout.matMode === 'one-player');
    battleMat.classList.toggle('mat-two-player', layout.matMode === 'two-player');
  }

  // Each iframe paints its own opaque arena background, which would sit on
  // top of the parent's mat art; `mat-active` makes it transparent so the
  // artwork underneath is visible.
  for (const doc of frameDocuments()) {
    doc.body?.classList.toggle('mat-active', Boolean(mat));
  }

  if (art) {
    if (mat?.image || mat?.imageUrl) {
      paintMatImage(mat);
      art.hidden = false;
    } else {
      matPaintToken++;
      document.documentElement.style.removeProperty('--mat-image');
      art.hidden = true;
    }
  }

  currentMat = mat || null;
  writeStoredMat(currentMat);

  document.dispatchEvent(
    new CustomEvent('mat-layout-applied', {
      detail: { mat: currentMat, layout: layout.id },
    })
  );

  return layout;
};

export const getCurrentMat = () => currentMat;

/**
 * Re-apply the active choice. The iframes are reloaded on board flips and
 * resets, which wipes the inline variables written onto their roots, so the
 * layout has to be replayed whenever a frame comes back.
 */
export const refreshMatLayout = () => applyMat(currentMat);

export const initializeMatLayout = () => {
  currentMat = readStoredMat();
  applyMat(currentMat);

  // Replay onto each iframe once it has a document to write to.
  for (const id of ['selfContainer', 'oppContainer']) {
    const frame = document.getElementById(id);
    if (frame) frame.addEventListener('load', refreshMatLayout);
  }

  // Dispatched by the deck builder's mat picker.
  document.addEventListener('playmat-changed', (event) => {
    applyMat(event.detail?.mat || null);
  });
};
