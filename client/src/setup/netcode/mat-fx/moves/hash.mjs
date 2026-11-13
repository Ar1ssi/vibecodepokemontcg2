// The one string hash the move modules share (move picks, seeds, motion variety): pure, and the
// same on both clients.

/** FNV-1a over UTF-16 code units, as an unsigned 32-bit integer. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  const input = String(text ?? '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
