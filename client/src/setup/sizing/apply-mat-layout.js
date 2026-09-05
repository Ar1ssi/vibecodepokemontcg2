/**
 * Applies playmats and zone layouts to the board.
 *
 * The board is three separate documents: the parent page (mat artwork +
 * stadium) plus the two playmat iframes (card zones). CSS custom properties
 * do not cross an iframe boundary, so each iframe gets the layout profile for
 * *its* player's mat. In solo mode P1 and P2 can pick different mats with
 * different zone geometry; the coin/sleeve picker already tracks a target,
 * and this module mirrors that split.
 */

import {
  DEFAULT_MAT_LAYOUT_ID,
  getMatLayout,
  layoutToCssVars,
  resolveMatLayout,
} from './mat-layouts.mjs';

const MAT_STORAGE_KEY = 'ptcg-sim.playmat.v1';
const MAT_TARGETS = ['self', 'opp'];

/** @type {{ self: object|null, opp: object|null }} */
let currentMats = { self: null, opp: null };

/** Per-half paint tokens so a slow probe cannot overwrite a later pick. */
const matPaintToken = { self: 0, opp: 0 };

const normalizeTarget = (target) => (target === 'opp' ? 'opp' : 'self');

/** @returns {{ self: object|null, opp: object|null }} */
const readStoredMats = () => {
  try {
    const raw = localStorage.getItem(MAT_STORAGE_KEY);
    if (!raw) return { self: null, opp: null };
    const parsed = JSON.parse(raw);
    if (parsed && ('self' in parsed || 'opp' in parsed)) {
      return { self: parsed.self || null, opp: parsed.opp || null };
    }
    // Older builds stored a single mat record for the whole board.
    return { self: parsed || null, opp: null };
  } catch {
    return { self: null, opp: null };
  }
};

/** @param {{ self: object|null, opp: object|null }} mats */
const writeStoredMats = (mats) => {
  try {
    if (mats.self || mats.opp) {
      localStorage.setItem(MAT_STORAGE_KEY, JSON.stringify(mats));
    } else {
      localStorage.removeItem(MAT_STORAGE_KEY);
    }
  } catch {
    /* choice simply will not persist */
  }
};

/** @param {'self'|'opp'} target */
const frameDocument = (target) => {
  const id = target === 'opp' ? 'oppContainer' : 'selfContainer';
  const frame = document.getElementById(id);
  const doc = frame?.contentDocument;
  return doc?.documentElement ? doc : null;
};

const applyMatLayoutToDoc = (layoutId, doc) => {
  if (!doc?.documentElement) return;
  const vars = layoutToCssVars(getMatLayout(layoutId));
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
};

/** @param {'self'|'opp'} target */
const layoutForTarget = (target) => {
  const mat = currentMats[target];
  return mat ? resolveMatLayout(mat) : getMatLayout(DEFAULT_MAT_LAYOUT_ID);
};

const syncIframeLayouts = () => {
  for (const target of MAT_TARGETS) {
    applyMatLayoutToDoc(layoutForTarget(target).id, frameDocument(target));
  }

  // Stadium sits on the parent page; follow the bottom player's mat, then opp.
  const parentLayout =
    currentMats.self && layoutForTarget('self').id !== DEFAULT_MAT_LAYOUT_ID
      ? layoutForTarget('self')
      : layoutForTarget('opp');
  applyMatLayoutToDoc(parentLayout.id, document);
};

/**
 * Point a half's background at the mat artwork, preferring the local file.
 *
 * `png/` is gitignored and absent from deploys; probe and fall back to the
 * scraped CDN original when the local path 404s.
 */
const paintMatImageForTarget = (target, mat) => {
  const key = normalizeTarget(target);
  const varName = key === 'opp' ? '--mat-image-opp' : '--mat-image-self';
  const token = ++matPaintToken[key];

  if (!mat?.image && !mat?.imageUrl) {
    document.documentElement.style.removeProperty(varName);
    return;
  }

  const local = mat.image ? new URL(mat.image, document.baseURI).href : null;
  const remote = mat.imageUrl || null;
  const setImage = (url) =>
    document.documentElement.style.setProperty(varName, `url("${url}")`);

  setImage(local || remote);

  if (!local || !remote) return;

  const probe = new Image();
  probe.onerror = () => {
    if (token === matPaintToken[key]) setImage(remote);
  };
  probe.src = local;
};

const syncMatArt = () => {
  const battleMat = document.getElementById('battleMat');
  const art = document.getElementById('battleMatArt');
  const hasAny = Boolean(currentMats.self || currentMats.opp);

  const selfTwo =
    Boolean(currentMats.self) &&
    layoutForTarget('self').matMode === 'two-player';
  const oppTwo =
    Boolean(currentMats.opp) && layoutForTarget('opp').matMode === 'two-player';

  if (battleMat) {
    battleMat.classList.toggle('mat-active', hasAny);
    battleMat.classList.toggle('mat-two-player', selfTwo);
    battleMat.classList.toggle('mat-two-player-opp', !selfTwo && oppTwo);
  }

  for (const target of MAT_TARGETS) {
    frameDocument(target)?.body?.classList.toggle(
      'mat-active',
      Boolean(currentMats[target])
    );
  }

  if (art) {
    paintMatImageForTarget('self', currentMats.self);
    paintMatImageForTarget('opp', currentMats.opp);
    art.hidden = !hasAny;
  }
};

/**
 * Push a layout profile's variables onto every board document.
 * Prefer `applyMatForTarget` when zones should differ per player.
 */
export const applyMatLayout = (layoutId) => {
  for (const target of MAT_TARGETS) {
    applyMatLayoutToDoc(layoutId, frameDocument(target));
  }
  applyMatLayoutToDoc(layoutId, document);
  return getMatLayout(layoutId);
};

/** Apply one player's mat and zone layout without touching the other half. */
export const applyMatForTarget = (target, mat) => {
  const key = normalizeTarget(target);
  currentMats[key] = mat || null;
  writeStoredMats(currentMats);
  syncIframeLayouts();
  syncMatArt();

  document.dispatchEvent(
    new CustomEvent('mat-layout-applied', {
      detail: { target: key, mat: currentMats[key], mats: { ...currentMats } },
    })
  );

  return layoutForTarget(key);
};

/** @deprecated Use applyMatForTarget; kept so a single mat clears both sides. */
export const applyMat = (mat) => {
  currentMats = { self: mat || null, opp: mat || null };
  writeStoredMats(currentMats);
  syncIframeLayouts();
  syncMatArt();
  return layoutForTarget('self');
};

/** @param {'self'|'opp'} [target] */
export const getCurrentMat = (target) => {
  if (target) return currentMats[normalizeTarget(target)];
  return currentMats.self || currentMats.opp || null;
};

export const getCurrentMats = () => ({ ...currentMats });

/**
 * Re-apply active choices. Iframes reload on board flips and wipe inline
 * variables, so replay whenever a frame comes back.
 */
export const refreshMatLayout = () => {
  syncIframeLayouts();
  syncMatArt();
};

export const initializeMatLayout = () => {
  currentMats = readStoredMats();
  refreshMatLayout();

  for (const id of ['selfContainer', 'oppContainer']) {
    document.getElementById(id)?.addEventListener('load', refreshMatLayout);
  }

  document.addEventListener('playmat-changed', (event) => {
    applyMatForTarget(
      event.detail?.target || 'self',
      event.detail?.mat || null
    );
  });
};
