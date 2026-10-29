// Design 079: the TCG Live attack textures (design 068's import, client/src/assets/fx/attack/
// textures) as three.js textures for the element kinds, by file name. A texture starts loading on
// first ask and is "not ready" until its bitmap arrives; a kind draws its procedural fallback
// meanwhile. A failed load is forgotten so a later ask tries again (design 079 edge 5).
import { flipbookGrid } from './sprite.mjs';

export const ELEMENT_TEXTURE_URL = '/src/assets/fx/attack/textures/';
// Textures hold data (masks, flow maps) as well as colour: no premultiply, no colour conversion,
// flipped so UV (0, 0) is the bottom-left texel as in Unity (the impact stage loads them alike).
const BITMAP_OPTIONS = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

const defaultLoad = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return createImageBitmap(await response.blob(), BITMAP_OPTIONS);
};

/**
 * @param {{ three: typeof import('three'), baseUrl?: string, load?: (url: string) => Promise<ImageBitmap>,
 *   debug?: (...args: unknown[]) => void }} options
 * @returns {{ get: (name: string) => { texture: import('three').Texture|null, grid: {cols:number,rows:number}, ready: boolean },
 *   dispose: () => void }}
 */
export function createElementTextures({ three, baseUrl = ELEMENT_TEXTURE_URL, load = defaultLoad, debug = (...args) => console.debug(...args) }) {
  const entries = new Map();
  let disposed = false;

  const start = (name) => {
    const entry = { texture: null, grid: flipbookGrid(name), ready: false };
    entries.set(name, entry);
    load(`${baseUrl}${encodeURIComponent(name)}`)
      .then((image) => {
        if (disposed || entries.get(name) !== entry) {
          image?.close?.();
          return;
        }
        const texture = new three.Texture(image);
        texture.flipY = false;
        texture.premultiplyAlpha = false;
        texture.wrapS = three.RepeatWrapping;
        texture.wrapT = three.RepeatWrapping;
        texture.minFilter = three.LinearMipmapLinearFilter;
        texture.magFilter = three.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        entry.texture = texture;
        entry.grid = flipbookGrid(name, image.width, image.height);
        entry.ready = true;
      })
      .catch((error) => {
        if (entries.get(name) === entry) entries.delete(name);
        debug('element textures: load failed', name, error?.message || error);
      });
    return entry;
  };

  return {
    get(name) {
      if (typeof name !== 'string' || name === '') return { texture: null, grid: { cols: 1, rows: 1 }, ready: false };
      return entries.get(name) ?? start(name);
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) entry.texture?.dispose();
      entries.clear();
    },
  };
}
