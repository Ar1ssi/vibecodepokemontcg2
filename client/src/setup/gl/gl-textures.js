// three.js side of the texture cache (design 074 O11/O12). Loaded only through import().
import { NoColorSpace, SRGBColorSpace, TextureLoader } from 'three';
import { createTextureCacheCore } from './texture-cache.mjs';

const defaultLoader = () => {
  const loader = new TextureLoader();
  loader.setCrossOrigin('anonymous');
  return loader;
};

/** A card's art kept this long after its last holder lets go, for its return (a KO, a search). */
const RELEASE_GRACE_MS = 15000;

/**
 * @param {{ loader?: { loadAsync: (url: string) => Promise<import('three').Texture> },
 *           textureUrlFor?: (url: string) => string, anisotropy?: number,
 *           renderer?: import('three').WebGLRenderer|null, graceMs?: number }} [options]
 *   `anisotropy` (the renderer's max) keeps card art sharp when the tilted table minifies it.
 *   `renderer` uploads each texture as it arrives, so a frame that shows many new cards at once
 *   (game start, a search) does not do every upload itself.
 * @returns {{ acquire: (url: string, options?: { colorSpace?: 'srgb'|'linear' }) => Promise<import('three').Texture>,
 *             release: (url: string, options?: { colorSpace?: 'srgb'|'linear' }) => void,
 *             size: () => number }}
 */
export function createTextureCache({
  loader = defaultLoader(),
  textureUrlFor = (u) => u,
  anisotropy = 1,
  renderer = null,
  graceMs = RELEASE_GRACE_MS,
} = {}) {
  return createTextureCacheCore({
    load: async (url, { colorSpace }) => {
      const texture = await loader.loadAsync(textureUrlFor(url));
      texture.colorSpace = colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace;
      texture.anisotropy = Math.max(texture.anisotropy, anisotropy);
      texture.needsUpdate = true;
      try {
        renderer?.initTexture?.(texture);
      } catch {
        // A lost context uploads nothing; the first frame that draws it uploads it instead.
      }
      return texture;
    },
    dispose: (texture) => {
      texture.dispose();
      // An ImageBitmap holds its decoded pixels until closed.
      texture.image?.close?.();
    },
    graceMs,
  });
}
