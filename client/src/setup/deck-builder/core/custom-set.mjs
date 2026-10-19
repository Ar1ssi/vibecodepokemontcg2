// Custom Set (Deck Builder tab): a named list of cards the player picks, saved in this browser and
// exported as a JSON file that others can import. Pure model: no DOM, no network.

export const CUSTOM_SET_STORAGE_KEY = 'ptcg-sim.custom-set.v1';
export const CUSTOM_SET_FILE_FORMAT = 'ptcg-sim.custom-set';
export const CUSTOM_SET_FILE_VERSION = 1;
export const DEFAULT_CUSTOM_SET_NAME = 'My Custom Set';

const MAX_CUSTOM_SET_NAME_LENGTH = 60;

export function createEmptyCustomSet(name = DEFAULT_CUSTOM_SET_NAME) {
  return { name: sanitizeCustomSetName(name), cards: [] };
}

export function sanitizeCustomSetName(name) {
  const trimmed = String(name ?? '').trim().slice(0, MAX_CUSTOM_SET_NAME_LENGTH);
  return trimmed || DEFAULT_CUSTOM_SET_NAME;
}

// A card is usable only with a string id and name: both key it in the set and label it in the panel.
function isUsableCard(card) {
  return Boolean(card) && typeof card === 'object' && typeof card.id === 'string' && card.id !== '' && typeof card.name === 'string' && card.name !== '';
}

export function customSetHasCard(customSet, cardId) {
  return customSet.cards.some((card) => card.id === cardId);
}

/** Returns a new set with `card` appended; a card already in the set (same id) is not added twice. */
export function addCardToCustomSet(customSet, card) {
  if (!isUsableCard(card) || customSetHasCard(customSet, card.id)) return structuredClone(customSet);
  return { ...structuredClone(customSet), cards: [...structuredClone(customSet.cards), structuredClone(card)] };
}

export function removeCardFromCustomSet(customSet, cardId) {
  return { ...structuredClone(customSet), cards: customSet.cards.filter((card) => card.id !== cardId).map((card) => structuredClone(card)) };
}

export function renameCustomSet(customSet, name) {
  return { ...structuredClone(customSet), name: sanitizeCustomSetName(name) };
}

/** Adds every usable card not already in the set. Returns the new set and how many were added. */
export function mergeCardsIntoCustomSet(customSet, cards = []) {
  let next = customSet;
  let addedCount = 0;
  for (const card of cards) {
    if (!isUsableCard(card) || customSetHasCard(next, card.id)) continue;
    next = addCardToCustomSet(next, card);
    addedCount += 1;
  }
  return { customSet: next, addedCount };
}

/** Keeps only the usable cards of a stored or imported list, first occurrence of each id wins. */
export function normalizeCustomSetCards(cards) {
  if (!Array.isArray(cards)) return [];
  const seenIds = new Set();
  const kept = [];
  for (const card of cards) {
    if (!isUsableCard(card) || seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    kept.push(structuredClone(card));
  }
  return kept;
}

/** A stored or hand-edited set made safe to use: bad names and bad cards are repaired or dropped. */
export function normalizeCustomSet(value) {
  if (!value || typeof value !== 'object') return createEmptyCustomSet();
  return { name: sanitizeCustomSetName(value.name), cards: normalizeCustomSetCards(value.cards) };
}

export function serializeCustomSet(customSet, now = Date.now()) {
  return JSON.stringify(
    {
      format: CUSTOM_SET_FILE_FORMAT,
      version: CUSTOM_SET_FILE_VERSION,
      name: sanitizeCustomSetName(customSet.name),
      exportedAt: new Date(now).toISOString(),
      cards: normalizeCustomSetCards(customSet.cards),
    },
    null,
    2
  );
}

/** Download name for an exported set: lowercase words joined by dashes, never empty. */
export function customSetFileName(name) {
  const slug = sanitizeCustomSetName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'custom-set'}.ptcg-set.json`;
}

/**
 * Reads an exported set file. Returns { ok: true, name, cards, skippedCount } or
 * { ok: false, error } when the text is not a set file this version understands.
 */
export function parseCustomSetFile(json = '') {
  let parsed;
  try {
    parsed = JSON.parse(String(json));
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || parsed.format !== CUSTOM_SET_FILE_FORMAT) {
    return { ok: false, error: 'This file is not a custom set export.' };
  }
  if (parsed.version !== CUSTOM_SET_FILE_VERSION) {
    return { ok: false, error: `Custom set version ${String(parsed.version)} is not supported.` };
  }
  if (!Array.isArray(parsed.cards)) {
    return { ok: false, error: 'This custom set file has no card list.' };
  }
  const cards = normalizeCustomSetCards(parsed.cards);
  return {
    ok: true,
    name: sanitizeCustomSetName(parsed.name),
    cards,
    skippedCount: parsed.cards.length - cards.length,
  };
}

export function loadCustomSetFromStorage(storage) {
  try {
    const stored = storage?.getItem?.(CUSTOM_SET_STORAGE_KEY);
    return stored ? normalizeCustomSet(JSON.parse(stored)) : createEmptyCustomSet();
  } catch {
    return createEmptyCustomSet();
  }
}

/** False when the browser refuses the write (quota, storage disabled); the caller tells the player to export. */
export function saveCustomSetToStorage(storage, customSet) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(CUSTOM_SET_STORAGE_KEY, JSON.stringify(normalizeCustomSet(customSet)));
    return true;
  } catch {
    return false;
  }
}
