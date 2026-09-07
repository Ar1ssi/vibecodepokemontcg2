// Tracks when a card effect has opened the private deck search window.

let access = { open: false, reason: '' };

export function openDeckSearchAccess(reason = '') {
  access = { open: true, reason: String(reason || '') };
}

export function closeDeckSearchAccess() {
  access = { open: false, reason: '' };
}

export function isDeckSearchAccessOpen() {
  return access.open;
}

export function deckSearchAccessReason() {
  return access.reason;
}

/** "Ultra Ball lets you search your deck" → "Ultra Ball" */
export function sourceNameFromDeckSearchReason(reason = '') {
  const text = String(reason).trim();
  if (!text) return null;
  const split = text.split(/\s+(?:lets you search|— search)/i)[0]?.trim();
  return split || null;
}
