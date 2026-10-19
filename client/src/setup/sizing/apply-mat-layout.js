/**
 * Applies playmats and zone layouts to the board.
 *
 * The mat artwork halves (`#battleMatArt`) and the page-level layout variables
 * follow each player's mat. In solo mode P1 and P2 can pick different mats with
 * different zone geometry; the coin/sleeve picker already tracks a target,
 * and this module mirrors that split. The three.js table reads the applied
 * mats through `currentMatSpec`.
 */

import {
  getMatLayout,
  layoutToCssVars,
  resolveMatLayout,
  withImageAspect,
} from './mat-layouts.mjs';
import {
  matImageProxyUrl,
  resolveMatBoardUrl,
  toAbsoluteClientPath,
} from '../deck-builder/core/mat-image-urls.mjs';
import { getMatById } from '../deck-builder/core/mats.mjs';
import {
  NO_MAT_LAYOUT_ID,
  ZONES_OVERLAY_PATH,
  isTwoPlayerMat,
  matSpecFor,
  wantsZonesOverlay,
} from './mat-spec.mjs';
import { processAction } from '../general/process-action.js';

const MAT_STORAGE_KEY = 'ptcg-sim.playmat.v1';

/** @type {{ self: object|null, opp: object|null }} */
let currentMats = { self: null, opp: null };

/** Per-half paint tokens so a slow probe cannot overwrite a later pick. */
const matPaintToken = { self: 0, opp: 0 };

/** Natural width/height of each half's loaded art, so the box matches it. */
const matArtAspect = { self: null, opp: null };

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

/** `--mat-scale` as the page has it, else the stored picker value (percent), else '1'. */
const currentMatScaleText = () =>
  document.documentElement?.style?.getPropertyValue('--mat-scale') ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('ptcg-sim.playmat.scale')
    ? String((Number(localStorage.getItem('ptcg-sim.playmat.scale')) || 100) / 100)
    : '1');

const applyMatLayoutToDoc = (layout, doc) => {
  if (!doc?.documentElement) return;
  const vars = layoutToCssVars(layout);
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  const scale = currentMatScaleText();
  if (scale) root.style.setProperty('--mat-scale', scale);
};

const applyMatLayoutToElement = (layout, el) => {
  if (!el) return;
  const vars = layoutToCssVars(layout);
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
};

/** @param {'self'|'opp'} target */
const layoutForTarget = (target) => {
  const mat = currentMats[target];
  if (!mat) return getMatLayout(NO_MAT_LAYOUT_ID);
  return withImageAspect(resolveMatLayout(mat), matArtAspect[target]);
};

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

const syncLayouts = () => {
  const halfSelf = document.querySelector('#battleMatArt .mat-half-self');
  const halfOpp = document.querySelector('#battleMatArt .mat-half-opp');

  const shared = activeTwoPlayerMat();
  if (shared) {
    const layout = resolveMatLayout(shared.mat);
    applyMatLayoutToElement(layout, halfSelf);
    applyMatLayoutToElement(layout, halfOpp);
    applyMatLayoutToDoc(layout, document);
    return;
  }

  applyMatLayoutToElement(layoutForTarget('self'), halfSelf);
  applyMatLayoutToElement(layoutForTarget('opp'), halfOpp);

  // Stadium sits on the parent page; follow the bottom player's mat, then opp.
  const parentLayout = currentMats.self
    ? layoutForTarget('self')
    : layoutForTarget('opp');
  applyMatLayoutToDoc(parentLayout, document);
};

/** Ensure each mat half has both an ambient backdrop <img>, a crisp foreground <img>, and a zones overlay <img>. */
const matHalfImages = (target) => {
  const selector =
    target === 'opp' ? '#battleMatArt .mat-half-opp' : '#battleMatArt .mat-half-self';
  const half = document.querySelector(selector);
  if (!half) return null;

  let ambient = half.querySelector('img.mat-ambient-image');
  if (!ambient) {
    ambient = document.createElement('img');
    ambient.className = 'mat-ambient-image';
    ambient.referrerPolicy = 'no-referrer';
    ambient.alt = '';
    ambient.setAttribute('aria-hidden', 'true');
    half.appendChild(ambient);
  }

  let art = half.querySelector('img.mat-art-image');
  if (!art) {
    art = document.createElement('img');
    art.className = 'mat-art-image';
    art.referrerPolicy = 'no-referrer';
    art.alt = '';
    half.appendChild(art);
  }

  let overlay = half.querySelector('img.mat-zones-overlay');
  if (!overlay) {
    overlay = document.createElement('img');
    overlay.className = 'mat-zones-overlay';
    overlay.referrerPolicy = 'no-referrer';
    overlay.alt = '';
    overlay.setAttribute('aria-hidden', 'true');
    half.appendChild(overlay);
  }

  return { art, ambient, overlay };
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
  const images = matHalfImages(key);

  if (!images) return;
  const { art, ambient, overlay } = images;

  if (!mat?.image && !mat?.imageUrl && !mat?.board) {
    art.removeAttribute('src');
    art.hidden = true;
    ambient.removeAttribute('src');
    ambient.hidden = true;
    // No mat art chosen: still show the zone-outline svg over the flat
    // black board, same as a one-sided mat's overlay would.
    if (overlay) {
      overlay.src = toAbsoluteClientPath(ZONES_OVERLAY_PATH);
      overlay.hidden = false;
    }
    return;
  }

  art.hidden = false;
  art.referrerPolicy = 'no-referrer';
  ambient.hidden = false;
  ambient.referrerPolicy = 'no-referrer';

  const primary = resolveMatBoardUrl(mat);
  const local = mat.image ? toAbsoluteClientPath(mat.image) : null;
  const remote = mat.imageUrl ? matImageProxyUrl(mat.imageUrl) : null;

  if (!primary) {
    art.removeAttribute('src');
    art.hidden = true;
    ambient.removeAttribute('src');
    ambient.hidden = true;
    if (overlay) {
      overlay.removeAttribute('src');
      overlay.hidden = true;
    }
    return;
  }

  art.onload = () => {
    if (token !== matPaintToken[key]) return;
    if (!art.naturalWidth || !art.naturalHeight) return;
    const aspect = art.naturalWidth / art.naturalHeight;
    if (aspect === matArtAspect[key]) return;
    matArtAspect[key] = aspect;
    syncLayouts();
  };
  art.src = primary;
  ambient.src = primary;

  if (overlay) {
    if (wantsZonesOverlay(mat)) {
      overlay.src = toAbsoluteClientPath(ZONES_OVERLAY_PATH);
      overlay.hidden = false;
    } else {
      overlay.removeAttribute('src');
      overlay.hidden = true;
    }
  }

  // When local PNGs exist (dev), upgrade after load.
  if (local && remote && local !== remote) {
    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      if (token === matPaintToken[key]) {
        art.src = local;
        ambient.src = local;
      }
    };
    probe.src = local;
  }
};

const syncMatArt = () => {
  const battleMat = document.getElementById('battleMat');
  const art = document.getElementById('battleMatArt');
  const shared = activeTwoPlayerMat();

  const activeLayout = shared
    ? resolveMatLayout(shared.mat)
    : currentMats.self
      ? layoutForTarget('self')
      : layoutForTarget('opp');
  const isCover = activeLayout?.matFit === 'cover';

  // No mat chosen behaves exactly like a chosen mat (default zone-outline
  // svg standing in for the art): mat-active is always on, not gated on
  // hasAny.
  if (battleMat) {
    battleMat.classList.toggle('mat-active', true);
    battleMat.classList.toggle('mat-fit-cover', isCover);
    battleMat.classList.toggle(
      'mat-two-player',
      Boolean(shared && shared.owner === 'self')
    );
    battleMat.classList.toggle(
      'mat-two-player-opp',
      Boolean(shared && shared.owner === 'opp')
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
    // Always visible: even without a chosen mat, the zone-outline svg
    // painted above needs #battleMatArt shown.
    art.hidden = false;
  }
};

/**
 * The applied mats as the three.js table draws them (design 074 C1): see `matSpecFor`.
 */
export const currentMatSpec = () =>
  matSpecFor(currentMats, {
    artAspect: { ...matArtAspect },
    scale: Number.parseFloat(currentMatScaleText()) || 1,
  });

/**
 * Push a layout profile's variables onto the page.
 * Prefer `applyMatForTarget` when zones should differ per player.
 */
export const applyMatLayout = (layoutId) => {
  const layout = getMatLayout(layoutId);
  applyMatLayoutToDoc(layout, document);
  return layout;
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
  syncLayouts();
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
  syncLayouts();
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

/** Re-apply the active mat choices. */
export const refreshMatLayout = () => {
  syncLayouts();
  syncMatArt();
};

export const initializeMatLayout = () => {
  currentMats = readStoredMats();
  refreshMatLayout();

  document.addEventListener('playmat-changed', (event) => {
    applyMatForTarget(
      event.detail?.target || 'self',
      event.detail?.mat || null
    );
  });
};
