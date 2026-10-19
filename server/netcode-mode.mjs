// Server authority is the default netcode (I251); the legacy relay is opt-out only.
const LEGACY_OPT_OUT = new Set(['0', 'false', 'off', 'no']);
const AUTHORITY_ON = new Set(['', '1', 'true', 'on', 'yes']);

/**
 * Whether the server runs the authoritative command/view protocol.
 * @param {string | undefined} value the raw `SERVER_AUTHORITATIVE` env value
 * @returns {{ serverAuthoritative: boolean, warning: string | null }} off only for 0, false, off
 *   or no (any case, surrounding spaces ignored); any other unrecognised value stays on and warns
 */
export function readServerAuthoritative(value) {
  if (value == null) return { serverAuthoritative: true, warning: null };
  const normalized = String(value).trim().toLowerCase();
  if (LEGACY_OPT_OUT.has(normalized)) return { serverAuthoritative: false, warning: null };
  if (AUTHORITY_ON.has(normalized)) return { serverAuthoritative: true, warning: null };
  return {
    serverAuthoritative: true,
    warning: `SERVER_AUTHORITATIVE=${JSON.stringify(value)} is not recognised; server authority stays on (use 0, false, off or no for the legacy relay).`,
  };
}
