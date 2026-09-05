/** Allowed remote hosts for the mat-image proxy (server validates the same list). */
export const MAT_IMAGE_REMOTE_HOSTS = ['cdn.artofpkm.com'];

/**
 * Normalize a client-relative asset path (`src/assets/...`) to an absolute URL
 * path (`/src/assets/...`) so it resolves correctly from any route depth.
 */
export function toAbsoluteClientPath(path) {
  const text = String(path || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/')) return text;
  return `/${text.replace(/^\.\//, '')}`;
}

/** Same-origin proxy route — server fetches CDN art without a Referer header. */
export function matImageProxyUrl(remoteUrl, base = '') {
  const url = String(remoteUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!MAT_IMAGE_REMOTE_HOSTS.includes(parsed.hostname)) return url;
  } catch {
    return url;
  }
  const encoded = encodeURIComponent(url);
  const prefix = base ? String(base).replace(/\/$/, '') : '';
  return `${prefix}/api/mat-image?url=${encoded}`;
}

/**
 * Picker thumbnail: always prefer the committed WebP on our origin.
 * CDN is only used through the proxy when no local thumb exists.
 */
export function resolveMatThumbUrl(mat, base = '') {
  if (!mat) return '';
  const local = toAbsoluteClientPath(mat.thumb || mat.image || '');
  if (local && mat.thumb) return local;
  if (mat.imageUrl) return matImageProxyUrl(mat.imageUrl, base);
  return local;
}

/**
 * Board/full-size mat art: proxied CDN on production; local PNG in dev when present.
 */
export function resolveMatBoardUrl(mat, base = '') {
  if (!mat) return '';
  const board = mat.board ? toAbsoluteClientPath(mat.board) : '';
  if (board) return board;
  const proxy = mat.imageUrl ? matImageProxyUrl(mat.imageUrl, base) : '';
  const local = mat.image ? toAbsoluteClientPath(mat.image) : '';
  return proxy || local;
}

/** Ordered fallbacks for `<img onerror>` wiring in the picker. */
export function matThumbFallbackChain(mat, base = '') {
  const primary = resolveMatThumbUrl(mat, base);
  const fallbacks = [];
  const proxy = mat.imageUrl ? matImageProxyUrl(mat.imageUrl, base) : '';
  if (proxy && proxy !== primary) fallbacks.push(proxy);
  const localPng = mat.image ? toAbsoluteClientPath(mat.image) : '';
  if (localPng && localPng !== primary && !fallbacks.includes(localPng)) {
    fallbacks.push(localPng);
  }
  return { primary, fallback: fallbacks[0] || '' };
}
