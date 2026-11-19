const isActionEntry = (entry) =>
  Boolean(entry) &&
  typeof entry === 'object' &&
  typeof entry.user === 'string' &&
  (typeof entry.action === 'string' || (entry.action !== null && typeof entry.action === 'object'));

/**
 * The actions a saved-state payload replays, in order. A payload is a JSON array of
 * `{ user, action, parameters }` entries plus `{ version }` markers, which are dropped.
 * An empty payload has no actions; malformed JSON or a malformed entry throws, so a half-readable
 * state is never half-applied.
 */
export function parseImportActions(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('import data is not a list of actions');
  const entries = data.filter((entry) => !(entry && typeof entry === 'object' && 'version' in entry));
  const bad = entries.findIndex((entry) => !isActionEntry(entry));
  if (bad !== -1) throw new Error(`import data entry ${bad} is not an action`);
  return entries;
}
