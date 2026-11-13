// Who may reach the server from outside its own pages: the Socket.IO admin UI, and browsers on
// another origin. The game's own pages are same-origin and need neither.

/** The password the admin UI takes on a developer's machine when none is set. */
export const DEV_ADMIN_PASSWORD = 'defaultPassword';
/** Where the hosted Socket.IO admin UI runs; it connects to this server from there. */
export const ADMIN_UI_ORIGIN = 'https://admin.socket.io';

/**
 * Whether the Socket.IO admin UI is served, and with which password.
 * A production server never falls back to the well-known development password: without a
 * password of its own, the admin UI stays off.
 * @param {Record<string, string | undefined>} env the process environment
 * @returns {{ enabled: true, password: string, mode: 'production' | 'development' }
 *   | { enabled: false, warning: string }}
 */
export function planAdminUi(env) {
  const password = typeof env?.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';
  const production = env?.NODE_ENV === 'production';
  const isSet = password.trim() !== '';
  if (!production) {
    return { enabled: true, password: isSet ? password : DEV_ADMIN_PASSWORD, mode: 'development' };
  }
  if (isSet && password !== DEV_ADMIN_PASSWORD) {
    return { enabled: true, password, mode: 'production' };
  }
  return {
    enabled: false,
    warning: isSet
      ? 'Socket.IO admin UI is off: ADMIN_PASSWORD is the development default. Set a password of your own to turn it on.'
      : 'Socket.IO admin UI is off: set ADMIN_PASSWORD to turn it on.',
  };
}

/**
 * The origins named in `ALLOWED_ORIGINS` (comma-separated), each reduced to scheme + host + port.
 * @param {string | undefined} value the raw env value
 * @returns {{ origins: string[], warnings: string[] }} entries that are not an http(s) URL are
 *   left out and named in a warning; `*` is refused, since this list is sent with credentials
 */
export function parseAllowedOrigins(value) {
  const origins = [];
  const warnings = [];
  for (const raw of String(value ?? '').split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const origin = httpOrigin(entry);
    if (!origin) {
      warnings.push(`ALLOWED_ORIGINS: ${JSON.stringify(entry)} is not an http(s) origin and is ignored.`);
      continue;
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return { origins, warnings };
}

function httpOrigin(entry) {
  let url;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
}

/**
 * The cross-origin allowances for the HTTP routes and for Socket.IO. With `ALLOWED_ORIGINS` unset
 * no other site is allowed; the admin UI's own origin is added for Socket.IO while it is on.
 * @param {Record<string, string | undefined>} env the process environment
 * @param {{ enabled: boolean }} adminUi the result of `planAdminUi`
 * @returns {{ http: { origin: string[] | false },
 *   socket: { origin: string[] | false, credentials: true }, warnings: string[] }}
 */
export function planCors(env, adminUi) {
  const { origins, warnings } = parseAllowedOrigins(env?.ALLOWED_ORIGINS);
  const socketOrigins =
    adminUi?.enabled && !origins.includes(ADMIN_UI_ORIGIN) ? [...origins, ADMIN_UI_ORIGIN] : origins;
  return {
    http: { origin: origins.length ? origins : false },
    socket: { origin: socketOrigins.length ? socketOrigins : false, credentials: true },
    warnings,
  };
}
