/**
 * The applied playmats as the three.js table draws them (design 074 C1): the same art, zone
 * overlay, fit and mat box `apply-mat-layout.js` paints into `#battleMatArt`, as the spec
 * `table-mesh.js` `setMat` takes. Shared by apply-mat-layout.js and the board lab.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

import { getMatLayout, resolveMatLayout, withImageAspect } from './mat-layouts.mjs';
import { resolveMatBoardUrl, toAbsoluteClientPath } from '../deck-builder/core/mat-image-urls.mjs';

export const ZONES_OVERLAY_PATH = 'src/assets/playmats/playmat_zones_overlay.svg';

/** No mat chosen: the edge-to-edge one-player profile the zones overlay svg was drawn against. */
export const NO_MAT_LAYOUT_ID = 'edge-to-edge';

/** Zoneless and custom mats get the zone-outline svg drawn over their art. */
export const wantsZonesOverlay = (mat) =>
  Boolean(
    mat &&
      (mat.overlay ||
        mat.hasOverlay ||
        mat.clean ||
        mat.id?.startsWith('custom-') ||
        /edge[\s-]?to[\s-]?edge/i.test(mat.title || ''))
  );

export const isTwoPlayerMat = (mat) => Boolean(mat && resolveMatLayout(mat).matMode === 'two-player');

/** One half's layout profile: the mat's (sized to its art) or the no-mat profile. */
export const layoutForMat = (mat, artAspect) =>
  mat ? withImageAspect(resolveMatLayout(mat), artAspect) : getMatLayout(NO_MAT_LAYOUT_ID);

/** The full-size mat both halves share, if either side picked one. */
export const sharedTwoPlayerMat = (mats) => {
  if (isTwoPlayerMat(mats?.self)) return { mat: mats.self, owner: 'self' };
  if (isTwoPlayerMat(mats?.opp)) return { mat: mats.opp, owner: 'opp' };
  return null;
};

/**
 * What one half shows (paintMatImageForTarget): the art url (null for none) and the zone
 * overlay url (null for none). A half without art shows the overlay on the dark backing.
 */
export function halfArtFor(mat) {
  if (!mat?.image && !mat?.imageUrl && !mat?.board) {
    return { src: null, overlaySrc: toAbsoluteClientPath(ZONES_OVERLAY_PATH) };
  }
  const src = resolveMatBoardUrl(mat) || null;
  if (!src) return { src: null, overlaySrc: null };
  return { src, overlaySrc: wantsZonesOverlay(mat) ? toAbsoluteClientPath(ZONES_OVERLAY_PATH) : null };
}

const fitOf = (layout) => ({
  fit: layout.matFit,
  boxAspect: Number(layout.aspectRatio) > 0 ? Number(layout.aspectRatio) : null,
});

/**
 * @param {{ self: object|null, opp: object|null }} mats the picked mat records per half
 * @param {{ artAspect?: { self: number|null, opp: number|null }, scale?: number }} [options]
 *   `artAspect` is each half's loaded art aspect; `scale` is `--mat-scale`.
 * @returns {{ mode: 'one-player'|'two-player', flip: boolean, src: string|null, farSrc: string|null,
 *   fit: string, boxAspect: number|null, imageAspect: number|null, overlaySrc: string|null,
 *   farOverlaySrc: string|null, far?: { fit: string, boxAspect: number|null, imageAspect: number|null },
 *   scale: number, profile: object }} `profile` is the near half's layout (zones for `flatLayout`).
 */
export function matSpecFor(mats, { artAspect = { self: null, opp: null }, scale = 1 } = {}) {
  const safeScale = Number(scale) > 0 ? Number(scale) : 1;
  const shared = sharedTwoPlayerMat(mats);
  if (shared) {
    const profile = resolveMatLayout(shared.mat);
    const art = halfArtFor(shared.mat);
    return {
      mode: 'two-player',
      flip: shared.owner === 'opp',
      src: art.src,
      farSrc: null,
      ...fitOf(profile),
      imageAspect: artAspect?.[shared.owner] ?? null,
      overlaySrc: art.overlaySrc,
      farOverlaySrc: null,
      scale: safeScale,
      profile,
    };
  }
  const near = layoutForMat(mats?.self ?? null, artAspect?.self);
  const far = layoutForMat(mats?.opp ?? null, artAspect?.opp);
  const nearArt = halfArtFor(mats?.self ?? null);
  const farArt = halfArtFor(mats?.opp ?? null);
  return {
    mode: 'one-player',
    flip: false,
    src: nearArt.src,
    farSrc: farArt.src,
    ...fitOf(near),
    imageAspect: artAspect?.self ?? null,
    overlaySrc: nearArt.overlaySrc,
    farOverlaySrc: farArt.overlaySrc,
    far: { ...fitOf(far), imageAspect: artAspect?.opp ?? null },
    scale: safeScale,
    profile: near,
  };
}
