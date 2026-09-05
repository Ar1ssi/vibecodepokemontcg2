// Playmat catalog for the deck builder's Customize > Mat view. The records
// themselves are generated from the scrape manifest (see
// `scripts/generate-mat-thumbs.mjs`); this module only reads them, so it stays
// pure and DOM-free and runs under `node --test`.

import { MATS_CATALOG } from './mats-catalog.mjs';

/**
 * Zone layout family for a mat title. Full-size and "official playmat"
 * releases are single sheets covering both players; every other mat in the
 * catalog is one player's own sheet. The ids mirror the layout profiles in
 * `client/src/setup/sizing/mat-layouts.mjs`, which is what actually positions
 * the board zones once a mat is picked.
 */
export function classifyMatLayoutFromTitle(title) {
  const text = String(title || '');
  if (/full[\s-]?size/i.test(text)) return 'two-player';
  if (/official\s+playmat/i.test(text)) return 'two-player';
  return 'one-player';
}

export const MATS = MATS_CATALOG.map((mat) => ({
  id: mat.id,
  title: mat.title,
  image: mat.image,
  thumb: mat.thumb || mat.image,
  board: mat.board || mat.thumb || mat.image,
  layout: mat.layout || classifyMatLayoutFromTitle(mat.title),
  sourceUrl: mat.sourceUrl,
  imageUrl: mat.imageUrl,
}));

/** Every mat, as clones so callers cannot mutate the catalog. */
export function listMats() {
  return MATS.map((mat) => ({ ...mat }));
}

export function getMatById(id) {
  const mat = MATS.find((m) => m.id === id);
  return mat ? { ...mat } : undefined;
}

/** Case-insensitive title match, for the shared Customize filter box. */
export function searchMats(term = '') {
  const needle = String(term || '')
    .trim()
    .toLowerCase();
  if (!needle) return listMats();
  return MATS.filter((mat) => mat.title.toLowerCase().includes(needle)).map(
    (mat) => ({ ...mat })
  );
}
