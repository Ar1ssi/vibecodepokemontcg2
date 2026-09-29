// Box-face textures for the unboxing scene (design 052 § Options 2, box unwrap). The front and
// left faces are cut from the official render `.agent/designs/refs/052-box-render.webp`
// (1024 × 1377, transparent background); right, back, top and bottom are procedural CSS.
//
// Each asset is the bounding box of its face in the render (`cropInRender`, render pixels), so
// the cut is reproducible. `quad` is the face's corners inside that asset, clockwise from
// top-left: `faceMatrix3d(quad, faceWidth, faceHeight)` squares it onto the cuboid face.
// Corners were read off the render's alpha silhouette (left/right/bottom edges) and its
// front/left fold line at x ≈ 212.

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

/** @returns {string} a vendored pack front: `<setId>-<key>.webp` (me02 ships `PACK_ARTS`). */
export function packArtSrc(setId, key) {
  return `src/assets/build-battle/packs/${setId}-${key}.webp`;
}
