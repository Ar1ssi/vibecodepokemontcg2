// three.js side of the texture cache (design 074 O11/O12). Loaded only through import().
import { NoColorSpace, SRGBColorSpace, TextureLoader } from 'three';
import { createTextureCacheCore } from './texture-cache.mjs';

const defaultLoader = () => {
  const loader = new TextureLoader();
  loader.setCrossOrigin('anonymous');
  return loader;
};

/**
 * @param {{ loader?: { loadAsync: (url: string) => Promise<import('three').Texture> },
 *           textureUrlFor?: (url: string) => string, anisotropy?: number }} [options]
 *   `anisotropy` (the renderer's max) keeps card art sharp when the tilted table minifies it.
 * @returns {{ acquire: (url: string, options?: { colorSpace?: 'srgb'|'linear' }) => Promise<import('three').Texture>,
 *             release: (url: string, options?: { colorSpace?: 'srgb'|'linear' }) => void,
 *             size: () => number }}
 */
export function createTextureCache({ loader = defaultLoader(), textureUrlFor = (u) => u, anisotropy = 1 } = {}) {
  return createTextureCacheCore({
    load: async (url, { colorSpace }) => {
      const texture = await loader.loadAsync(textureUrlFor(url));
      texture.colorSpace = colorSpace === 'srgb' ? SRGBColorSpace : NoColorSpace;
      texture.anisotropy = Math.max(texture.anisotropy, anisotropy);
      texture.needsUpdate = true;
      return texture;
    },
    dispose: (texture) => texture.dispose(),
  });
}
