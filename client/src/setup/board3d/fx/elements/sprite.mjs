// Design 077 § Kinds: the sprite element's pure half — params → one instance row, and the
// flipbook grid a texture's name declares. DOM- and GL-free so it runs under `node --test`.
//
// Instance row (SPRITE_FLOATS), four vec4 attributes: x y z width · height rotation (rad) frame
// dissolve · r g b a · alignX alignY aligned 0. An aligned sprite turns its width along a stage
// heading as the camera sees it (a slash, a leaf, a gust); `rotation` then adds to that.
// Positions are stage px (y down the screen) with z px above the cloth; the vertex shader takes
// them to the world through uStageToWorld and faces the quad to the camera.

export const SPRITE_FLOATS = 16;
export const SPRITE_BLENDS = Object.freeze(['add', 'over']);
/**
 * How a texture carries its shape: most TCG Live particle textures are greyscale masks in RGB
 * with no alpha ('r'), a few keep their mask in alpha ('a'), colour sprites keep both ('rgba':
 * rgb × tint, alpha as is).
 */
export const SPRITE_CHANNELS = Object.freeze(['r', 'a', 'rgba']);

const DEG = Math.PI / 180;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The cols × rows a flipbook texture holds, from the `AxB` its name ends with (`_2x2`,
 * `SubUV_1x8`). Unity names do not say which side is which, so the image's own aspect picks the
 * orientation whose frames are nearest square. A name without a grid is one frame.
 * @param {string} name
 * @param {number} [width] image px, when known
 * @param {number} [height]
 * @returns {{ cols: number, rows: number }}
 */
export function flipbookGrid(name, width = 0, height = 0) {
  const match = /(\d+)x(\d+)(?=[_.]|$)/i.exec(String(name ?? '').replace(/\.[a-z0-9]+$/i, ''));
  if (!match) return { cols: 1, rows: 1 };
  const a = Math.max(1, Number(match[1]));
  const b = Math.max(1, Number(match[2]));
  if (!(width > 0 && height > 0) || a === b) return { cols: a, rows: b };
  const squareness = (cols, rows) => Math.abs(Math.log(width / cols / (height / rows)));
  return squareness(a, b) <= squareness(b, a) ? { cols: a, rows: b } : { cols: b, rows: a };
}

/**
 * A sprite emit's params checked and filled. Null when it cannot draw (no texture name, a
 * non-finite position, a size ≤ 0, alpha ≤ 0).
 * @param {{ texture: string, at: {x:number,y:number,z?:number}, size: number, aspect?: number,
 *   rotation?: number, colour?: number[], alpha?: number, frame?: number, blend?: string,
 *   dissolve?: number }} params `size` = width in stage px, `aspect` = height / width,
 *   `rotation` in degrees, `colour` rgb 0–1 (may exceed 1: HDR, it blooms), `frame` the flipbook
 *   frame (fractions floor), `blend` 'add' (light) or 'over' (premultiplied cover), `channel` one
 *   of SPRITE_CHANNELS (default 'r'), `alignDeg` a stage heading (degrees, y down) the sprite's
 *   width lies along on screen.
 */
export function normalizeSprite(params) {
  if (!params || typeof params.texture !== 'string' || params.texture === '') return null;
  const at = params.at ?? {};
  if (!finite(at.x) || !finite(at.y)) return null;
  const z = finite(at.z) ? at.z : 0;
  const size = finite(params.size) ? params.size : 0;
  const alpha = finite(params.alpha) ? clamp01(params.alpha) : 1;
  if (!(size > 0) || !(alpha > 0)) return null;
  const aspect = finite(params.aspect) && params.aspect > 0 ? params.aspect : 1;
  const colour = Array.isArray(params.colour) && params.colour.length >= 3 && params.colour.slice(0, 3).every(finite)
    ? params.colour.slice(0, 3).map((c) => Math.max(0, c))
    : [1, 1, 1];
  return {
    texture: params.texture,
    blend: SPRITE_BLENDS.includes(params.blend) ? params.blend : 'add',
    channel: SPRITE_CHANNELS.includes(params.channel) ? params.channel : 'r',
    x: at.x,
    y: at.y,
    z,
    width: size,
    height: size * aspect,
    rotation: finite(params.rotation) ? params.rotation * DEG : 0,
    colour,
    alpha,
    frame: finite(params.frame) && params.frame > 0 ? Math.floor(params.frame) : 0,
    dissolve: finite(params.dissolve) ? clamp01(params.dissolve) : 0,
    align: finite(params.alignDeg) ? { x: Math.cos(params.alignDeg * DEG), y: Math.sin(params.alignDeg * DEG) } : null,
  };
}

/** Writes a normalised sprite into `out` at instance `index`. */
export function packSprite(sprite, out, index) {
  const o = index * SPRITE_FLOATS;
  out[o] = sprite.x;
  out[o + 1] = sprite.y;
  out[o + 2] = sprite.z;
  out[o + 3] = sprite.width;
  out[o + 4] = sprite.height;
  out[o + 5] = sprite.rotation;
  out[o + 6] = sprite.frame;
  out[o + 7] = sprite.dissolve;
  out[o + 8] = sprite.colour[0];
  out[o + 9] = sprite.colour[1];
  out[o + 10] = sprite.colour[2];
  out[o + 11] = sprite.alpha;
  out[o + 12] = sprite.align ? sprite.align.x : 0;
  out[o + 13] = sprite.align ? sprite.align.y : 0;
  out[o + 14] = sprite.align ? 1 : 0;
  out[o + 15] = 0;
}

/** The bucket a sprite draws in: one texture, blend and channel per draw call. */
export const spriteBucketKey = (sprite) => `${sprite.texture}|${sprite.blend}|${sprite.channel}`;

/** Design 077 § Test plan: emits that exercise every sprite path (check-element-shaders.mjs). */
export const spriteSamples = () => [
  { texture: 'TEX_VFX_Dot_Glow.webp', at: { x: -60, y: 0, z: 20 }, size: 80, colour: [2, 1.2, 0.4] },
  { texture: 'T_VFX_Leaves_2x2.webp', channel: 'rgba', blend: 'over', at: { x: 0, y: 0, z: 20 }, size: 80, frame: 2, rotation: 30 },
  { texture: 'TEX_VFX_Star_FourPoint_Light.webp', channel: 'a', at: { x: 60, y: 0, z: 20 }, size: 80, dissolve: 0.4 },
  { texture: 'missing-texture.webp', at: { x: 0, y: 60, z: 20 }, size: 60 },
];
