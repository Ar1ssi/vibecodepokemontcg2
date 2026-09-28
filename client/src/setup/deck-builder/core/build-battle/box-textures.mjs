// Box-face textures for the unboxing scene (design 052 § Options 2, box unwrap). The front and
// left faces are cut from the official render `.agent/designs/refs/052-box-render.webp`
// (1024 × 1377, transparent background); right, back, top and bottom are procedural CSS.
//
// Each asset is the bounding box of its face in the render (`cropInRender`, render pixels), so
// the cut is reproducible. `quad` is the face's corners inside that asset, clockwise from
// top-left: `faceMatrix3d(quad, faceWidth, faceHeight)` squares it onto the cuboid face.
// Corners were read off the render's alpha silhouette (left/right/bottom edges) and its
// front/left fold line at x ≈ 212.

import { PACK_ARTS } from './unboxing.mjs';

export const BOX_PROPORTIONS = Object.freeze({ width: 1, height: 1.45, depth: 0.65 });

export const BOX_FACE_TEXTURES = Object.freeze({
  front: Object.freeze({
    src: 'src/assets/build-battle/box/front.webp',
    cropInRender: Object.freeze({ x: 212, y: 40, width: 812, height: 1336 }),
    quad: Object.freeze([
      Object.freeze({ x: 0, y: 32 }),
      Object.freeze({ x: 811, y: 0 }),
      Object.freeze({ x: 765, y: 1170 }),
      Object.freeze({ x: 33, y: 1335 }),
    ]),
  }),
  left: Object.freeze({
    src: 'src/assets/build-battle/box/left.webp',
    cropInRender: Object.freeze({ x: 0, y: 28, width: 246, height: 1348 }),
    quad: Object.freeze([
      Object.freeze({ x: 0, y: 2 }),
      Object.freeze({ x: 212, y: 44 }),
      Object.freeze({ x: 245, y: 1347 }),
      Object.freeze({ x: 44, y: 1132 }),
    ]),
  }),
});

/** Faces drawn in CSS from the palette tokens (no sharp source photo). */
export const PROCEDURAL_FACES = Object.freeze(['right', 'back', 'top', 'bottom']);

/** @returns {object|null} the vendored texture for `face`, or null when the face is procedural. */
export function boxFaceTexture(face) {
  return Object.hasOwn(BOX_FACE_TEXTURES, face) ? BOX_FACE_TEXTURES[face] : null;
}

/** @returns {string} the pack-front asset for one `PACK_ARTS` key. */
export function packArtSrc(key) {
  return `src/assets/build-battle/packs/me02-${key}.webp`;
}

const ME02_LOGO_URL = 'https://assets.tcgdex.net/en/me/me02/logo.webp';

/**
 * Everything the unboxing scene draws that belongs to one product (design 055 § Product art): box
 * proportions (width 1), lid kind, vendored face textures and the faces drawn in CSS, pack fronts,
 * the set logo and the key art the procedural lid/front shows.
 */
export const PRODUCT_ART = Object.freeze({
  'phantasmal-flames': Object.freeze({
    proportions: BOX_PROPORTIONS,
    lid: 'hinged',
    faces: BOX_FACE_TEXTURES,
    proceduralFaces: PROCEDURAL_FACES,
    packArts: PACK_ARTS,
    packArtSrc,
    logoUrl: ME02_LOGO_URL,
    keyArtUrl: 'https://assets.tcgdex.net/en/me/me02/125/high.webp',
  }),
  // Proportions UNVERIFIED: a landscape box with the lid on top, to be read off a reference render.
  // Every face is procedural until `refs/055-etb-*.webp` textures exist. Key art: Mega Charizard X
  // ex (me02-013), the box art.
  'phantasmal-flames-etb': Object.freeze({
    proportions: Object.freeze({ width: 1, height: 0.76, depth: 0.36 }),
    lid: 'lift',
    faces: Object.freeze({}),
    proceduralFaces: Object.freeze(['front', 'back', 'left', 'right', 'top', 'bottom']),
    packArts: PACK_ARTS,
    packArtSrc,
    logoUrl: ME02_LOGO_URL,
    keyArtUrl: 'https://assets.tcgdex.net/en/me/me02/013/high.webp',
  }),
});

/** @returns {object|null} the product art descriptor for `key`, or null for an unknown product. */
export function productArt(key) {
  return typeof key === 'string' && Object.hasOwn(PRODUCT_ART, key) ? PRODUCT_ART[key] : null;
}
