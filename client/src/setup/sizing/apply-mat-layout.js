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
import {
  matImageProxyUrl,
  resolveMatBoardUrl,
  toAbsoluteClientPath,
} from '../deck-builder/core/mat-image-urls.mjs';
import { getMatById } from '../deck-builder/core/mats.mjs';
import { processAction } from '../general/process-action.js';

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

const isTwoPlayerMat = (mat) =>
  Boolean(mat && resolveMatLayout(mat).matMode === 'two-player');

/** When a full-size mat is active, both halves share its layout and artwork. */
const activeTwoPlayerMat = () => {
  if (isTwoPlayerMat(currentMats.self)) {
    return { mat: currentMats.self, owner: 'self' };
  }
  if (isTwoPlayerMat(currentMats.opp)) {
    return { mat: currentMats.opp, owner: 'opp' };
  }
  return null;
};

const syncIframeLayouts = () => {
  const shared = activeTwoPlayerMat();
  if (shared) {
    const layoutId = resolveMatLayout(shared.mat).id;
    for (const target of MAT_TARGETS) {
      applyMatLayoutToDoc(layoutId, frameDocument(target));
    }
    applyMatLayoutToDoc(layoutId, document);
    return;
  }

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

/** Ensure each mat half has an <img> we can point at CDN art without hotlink watermarks. */
const matHalfImage = (target) => {
  const selector =
    target === 'opp' ? '#battleMatArt .mat-half-opp' : '#battleMatArt .mat-half-self';
  const half = document.querySelector(selector);
  if (!half) return null;
  let img = half.querySelector('img.mat-art-image');
  if (!img) {
    img = document.createElement('img');
    img.className = 'mat-art-image';
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    half.appendChild(img);
  }
  return img;
};

/**
 * Point a half's artwork at the mat image.
 *
 * cdn.artofpkm.com returns a generic watermark when a Referer is sent. Load
 * remote art through `/api/mat-image` (same-origin proxy) instead.
 */
const paintMatImageForTarget = (target, mat) => {
  const key = normalizeTarget(target);
  const token = ++matPaintToken[key];
  const img = matHalfImage(key);

  if (!img) return;

  if (!mat?.image && !mat?.imageUrl && !mat?.board) {
    img.removeAttribute('src');
    img.hidden = true;
    return;
  }

  img.hidden = false;
  img.referrerPolicy = 'no-referrer';

  const primary = resolveMatBoardUrl(mat);
  const local = mat.image ? toAbsoluteClientPath(mat.image) : null;
  const remote = mat.imageUrl ? matImageProxyUrl(mat.imageUrl) : null;

  if (!primary) {
    img.removeAttribute('src');
    img.hidden = true;
    return;
  }

  img.src = primary;

  // When local PNGs exist (dev), upgrade after load.
  if (local && remote && local !== remote) {
    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      if (token === matPaintToken[key]) img.src = local;
    };
    probe.src = local;
  }
};

const syncMatArt = () => {
  const battleMat = document.getElementById('battleMat');
  const art = document.getElementById('battleMatArt');
  const shared = activeTwoPlayerMat();
  const hasAny = Boolean(shared || currentMats.self || currentMats.opp);

  if (battleMat) {
    battleMat.classList.toggle('mat-active', hasAny);
    battleMat.classList.toggle(
      'mat-two-player',
      Boolean(shared && shared.owner === 'self')
    );
    battleMat.classList.toggle(
      'mat-two-player-opp',
      Boolean(shared && shared.owner === 'opp')
    );
  }

  for (const target of MAT_TARGETS) {
    frameDocument(target)?.body?.classList.toggle(
      'mat-active',
      Boolean(shared || currentMats[target])
    );
  }

  if (art) {
    if (shared) {
      paintMatImageForTarget(shared.owner, shared.mat);
      const other = shared.owner === 'self' ? 'opp' : 'self';
      paintMatImageForTarget(other, null);
    } else {
      paintMatImageForTarget('self', currentMats.self);
      paintMatImageForTarget('opp', currentMats.opp);
    }
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
  const other = key === 'opp' ? 'self' : 'opp';
  currentMats[key] = mat || null;

  // A full-size mat covers both players — drop whatever the other side had.
  if (mat && isTwoPlayerMat(mat)) {
    currentMats[other] = null;
  }

  writeStoredMats(currentMats);
  syncIframeLayouts();
  syncMatArt();

  document.dispatchEvent(
    new CustomEvent('mat-layout-applied', {
      detail: {
        target: key,
        mat: currentMats[key],
        mats: { ...currentMats },
        clearedTarget: mat && isTwoPlayerMat(mat) ? other : null,
      },
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

/** @param {'self'|'opp'} target */
export const getStoredMatId = (target) => {
  const mat = readStoredMats()[normalizeTarget(target)];
  return mat?.id || null;
};

/**
 * Syncable playmat change (multiplayer + undo log). Mirrors `changeCardBack`.
 * @param {'self'|'opp'} user
 * @param {string|null} matId
 * @param {boolean} [emit]
 */
export const changePlaymat = (user, matId, emit = true) => {
  const mat = matId ? getMatById(matId) : null;
  applyMatForTarget(normalizeTarget(user), mat || null);
  processAction(user, emit, 'changePlaymat', [matId]);
};

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
