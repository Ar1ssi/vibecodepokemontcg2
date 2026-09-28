export const LAST_SESSION_STORAGE_KEY = 'ptcg-sim.last-session.v1';

export function saveLastSession(storage, { deckId, target = 'self' } = {}) {
  if (!storage?.setItem || !deckId) return;
  try {
    storage.setItem(
      LAST_SESSION_STORAGE_KEY,
      JSON.stringify({
        deckId: String(deckId),
        target: target === 'opp' ? 'opp' : 'self',
        savedAt: Date.now(),
      })
    );
  } catch {
    /* persistence is best-effort */
  }
}

export function loadLastSession(storage) {
  try {
    const raw = storage?.getItem?.(LAST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.deckId !== 'string' || !parsed.deckId) return null;
    return {
      deckId: parsed.deckId,
      target: parsed.target === 'opp' ? 'opp' : 'self',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * The last-used deck id when it still names a deck in `library`, else null
 * (deleted since, or never saved). The builder tab reopens it at boot so edits
 * autosave into it instead of into an unbound editor.
 */
export function restorableDeckId(session, library) {
  const deckId = session?.deckId;
  if (!deckId || !library?.decks?.[deckId]) return null;
  return deckId;
}
