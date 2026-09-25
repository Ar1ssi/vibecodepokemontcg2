// Builds TCGdex REST API URLs. In the browser every call goes through the server's
// same-origin proxy (server/tcgdex-proxy.mjs, D164): direct calls get Cloudflare-blocked
// under load and fail as CORS errors. Node (tests, scripts) has no origin to proxy
// through, so it calls TCGdex directly.

export const TCGDEX_DIRECT_BASE = 'https://api.tcgdex.net/v2/en';
export const TCGDEX_PROXY_PATH = '/api/tcgdex/v2/en';

function browserOrigin() {
  const origin = globalThis.location?.origin;
  return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : null;
}

/** Base URL for the English v2 API, without a trailing slash. */
export function tcgdexApiBase() {
  const origin = browserOrigin();
  return origin ? `${origin}${TCGDEX_PROXY_PATH}` : TCGDEX_DIRECT_BASE;
}

/**
 * @param {string} path API path starting with "/", e.g. "/cards/xy7-97".
 * @returns {string}
 */
export function tcgdexApiUrl(path) {
  return `${tcgdexApiBase()}${path}`;
}
