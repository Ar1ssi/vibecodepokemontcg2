/**
 * Loads the hand-kept box sources, `scripts/build-battle/boxes/<boxKey>.mjs` (design 054 § Generated
 * data): each names its Bulbapedia page and revision, and lists the box's contents as source lines
 * (see box-lines.mjs) — `decks` for a fixed-decks box; `promos`, `groups`, `groupTypes` (each group
 * header's type), optional `common`, `trainers` and `energySwaps` for an Evolution box.
 */

const isLineList = (value) => Array.isArray(value) && value.every((line) => typeof line === 'string');

function checkSource(source, box) {
  const problems = [];
  if (source?.key !== box.key) problems.push(`key is ${source?.key}`);
  if (!/^https:\/\/bulbapedia\.bulbagarden\.net\/wiki\//.test(source?.source?.url ?? '')) problems.push('no Bulbapedia url');
  if (!Number.isInteger(source?.source?.revision)) problems.push('no page revision');
  const lineMaps = box.kind === 'fixed-decks' ? ['decks'] : ['groups'];
  for (const name of lineMaps) {
    if (!Object.values(source?.[name] || {}).every(isLineList)) problems.push(`${name} are not line lists`);
  }
  if (source?.groupTypes && !Object.values(source.groupTypes).every((type) => typeof type === 'string')) {
    problems.push('groupTypes are not strings');
  }
  for (const pool of source?.trainers || []) {
    if (!pool.name || !isLineList(pool.cards)) problems.push('a Trainer pool needs a name and card lines');
  }
  if (problems.length) throw new Error(`box source ${box.key}: ${problems.join('; ')}`);
  return source;
}

/** @returns {Promise<object>} the box's source, checked against its catalog entry. */
export async function loadBoxSource(box) {
  const module = await import(`./boxes/${box.key}.mjs`);
  return checkSource(module.default, box);
}
