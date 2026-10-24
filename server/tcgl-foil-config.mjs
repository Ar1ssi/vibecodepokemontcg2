// Design 069: the TCG Live foil textures (~4.7 GB) are not in git. Production serves them from object storage
// (Cloudflare R2) named by FOIL_TEXTURE_URL; a developer who ran `pnpm foil:import` serves them from the local
// gitignored folder. With neither, the client gets textureBase: null and every card keeps the CSS holo.
export const LOCAL_FOIL_TEXTURE_BASE = '/src/assets/tcgl-foil';

/**
 * Custom sets that ship a foil.json beside their set.json (I271): the client merges each into its foil manifest.
 * @param {string[]} setIds loaded custom set ids
 * @param {(file: string) => boolean} hasFile whether `<setId>/foil.json` exists under the custom-sets root
 * @returns {{setId: string, url: string}[]}
 */
export const customFoilSets = (setIds, hasFile) =>
  setIds
    .filter((setId) => hasFile(`${setId}/foil.json`))
    .map((setId) => ({ setId, url: `/src/assets/custom-sets/${setId}/foil.json` }));

/**
 * @param {{envUrl?: string, localTexturesPresent?: boolean}} input
 * @returns {{textureBase: string|null, error: string|null}} error names a FOIL_TEXTURE_URL that was set but unusable.
 */
export function resolveFoilTextureBase({ envUrl, localTexturesPresent = false } = {}) {
  const raw = typeof envUrl === 'string' ? envUrl.trim() : '';
  const localBase = localTexturesPresent ? LOCAL_FOIL_TEXTURE_BASE : null;
  if (!raw) return { textureBase: localBase, error: null };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { textureBase: localBase, error: `FOIL_TEXTURE_URL is not a URL: ${raw}` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { textureBase: localBase, error: `FOIL_TEXTURE_URL must be http(s): ${raw}` };
  }
  if (url.search || url.hash) {
    return { textureBase: localBase, error: `FOIL_TEXTURE_URL must not carry a query or fragment: ${raw}` };
  }
  return { textureBase: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, error: null };
}
