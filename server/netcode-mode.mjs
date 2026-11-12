// The server always runs the rules. SERVER_AUTHORITATIVE used to select the legacy relay
// (design 087 removed it); an operator who still opts out is told the value is ignored.
const LEGACY_OPT_OUT = new Set(['0', 'false', 'off', 'no']);

/**
 * A startup warning for an env value that used to switch the server to the legacy relay.
 * @param {string | undefined} value the raw `SERVER_AUTHORITATIVE` env value
 * @returns {string | null} the warning for 0, false, off or no (any case, surrounding spaces
 *   ignored); null for every other value, unset included
 */
export function retiredLegacyRelayWarning(value) {
  if (value == null) return null;
  if (!LEGACY_OPT_OUT.has(String(value).trim().toLowerCase())) return null;
  return `SERVER_AUTHORITATIVE=${JSON.stringify(value)} is ignored: the legacy relay was removed and the server always runs the rules.`;
}
