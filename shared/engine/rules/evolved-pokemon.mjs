// The server models an evolution as the Evolution card attached under the Basic (reduce.mjs
// attachCard), so the root card keeps the Basic's printed stats. Rules that read what the
// Pokémon *is* (HP, attacks, Weakness, Retreat Cost, ex prizes) must read the top of the stack.
// Damage, Special Conditions and instanceId stay on the root. Pure and DOM-free.

import { isPokemon } from '../cards.mjs';
import { normalizeStage } from './evolution.mjs';

const STAGE_RANK = { Basic: 0, 'Stage 1': 1, 'Stage 2': 2, BREAK: 3 };

const PRINTED_FIELDS = [
  'name',
  'hp',
  'attacks',
  'weakness',
  'resistance',
  'types',
  'retreatCost',
  'stage',
  'subtypes',
  'abilities',
  'rarity',
];

function stageRank(card) {
  return STAGE_RANK[normalizeStage(card?.stage) || 'Basic'] ?? 0;
}

function stackEvolutions(zoneCards, root) {
  return (zoneCards || []).filter(
    (c) => c.attachedTo === root.instanceId && isPokemon(c)
  );
}

/**
 * @param {object[]} zoneCards Cards in the zone holding the root (active or bench)
 * @param {object} root The in-play Pokémon (a card with no attachedTo)
 * @returns {object} The highest-stage Pokémon card in the stack; the root when unevolved
 */
export function topPokemonCard(zoneCards, root) {
  if (!root) return root;
  return stackEvolutions(zoneCards, root).reduce(
    (top, card) => (stageRank(card) >= stageRank(top) ? card : top),
    root
  );
}

// The highest-stage card below the top, i.e. the Pokémon a BREAK card
// evolved from (root when the stack has no other evolution).
function previousTopPokemonCard(zoneCards, root, top) {
  return stackEvolutions(zoneCards, root)
    .filter((card) => card !== top)
    .reduce((best, card) => (stageRank(card) >= stageRank(best) ? card : best), root);
}

// Union of two printed entry lists (attacks / abilities), with the top card's
// own entry replacing the base's on a name collision.
function mergeNamedEntries(baseEntries, topEntries) {
  const merged = Array.isArray(baseEntries) ? [...baseEntries] : [];
  for (const entry of Array.isArray(topEntries) ? topEntries : []) {
    const name = String(entry?.name ?? '').toLowerCase();
    const idx = merged.findIndex(
      (existing) => String(existing?.name ?? '').toLowerCase() === name
    );
    if (idx >= 0) merged[idx] = entry;
    else merged.push(entry);
  }
  return merged;
}

const isEmptyField = (value) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0);

/**
 * Read-only view of an in-play Pokémon: the root's state with the top card's printed stats.
 * A BREAK Evolution keeps the previous Evolution's attacks, Ability, Weakness,
 * Resistance and Retreat Cost (its own entries win on collision).
 * Never write through it; write damage and conditions to the root.
 */
export function evolvedView(zoneCards, root) {
  const top = topPokemonCard(zoneCards, root);
  if (!top || top === root) return root;
  const view = { ...root };
  for (const field of PRINTED_FIELDS) {
    if (top[field] !== undefined && top[field] !== null) view[field] = top[field];
  }
  if (normalizeStage(top.stage) === 'BREAK') {
    const base = previousTopPokemonCard(zoneCards, root, top);
    view.attacks = mergeNamedEntries(base?.attacks, top.attacks);
    view.abilities = mergeNamedEntries(base?.abilities, top.abilities);
    for (const field of ['weakness', 'resistance', 'retreatCost']) {
      if (isEmptyField(top[field])) view[field] = base?.[field];
    }
  }
  return view;
}

function isToolKind(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes.join(' ') : card?.subtypes || '';
  return `${card?.type || ''} ${card?.trainerType || ''} ${subtypes}`.toLowerCase().includes('tool');
}

/**
 * Whether Rare Candy may put this Stage 2 onto this Basic. A Stage 2 names only its Stage 1
 * (evolvesFrom), so the Basic is found through a known Stage 1 card of that name. When the
 * line cannot be traced (no evolvesFrom data, or no such Stage 1 card seen) it is allowed.
 * @param {object} stage2
 * @param {object} basic
 * @param {object[]} knownCards Cards whose evolvesFrom can name the Stage 1's Basic
 */
export function stage2EvolvesFromBasic(stage2, basic, knownCards = []) {
  const stage1Name = stage2?.evolvesFrom;
  if (!stage1Name) return true;
  const stage1s = knownCards.filter((c) => c?.name === stage1Name && c.evolvesFrom);
  if (stage1s.length === 0) return true;
  return stage1s.some((stage1) => stage1.evolvesFrom === basic?.name);
}

/**
 * Rare Candy options: each Stage 2 in hand with the unevolved Basics in play it can evolve.
 * @param {object} player Server-state player
 * @param {object[]} knownCards See stage2EvolvesFromBasic
 * @returns {{stage2: object, basics: object[]}[]} Only entries with at least one Basic
 */
export function rareCandyOptions(player, knownCards = [], turnNumber = null) {
  const inPlay = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])];
  const basics = inPlay.filter(
    (c) =>
      !c.attachedTo &&
      topPokemonCard(inPlay, c) === c &&
      (normalizeStage(c.stage) || 'Basic') === 'Basic' &&
      (turnNumber == null || c.enteredPlayTurn == null || c.enteredPlayTurn !== turnNumber)
  );
  return (player?.zones?.hand || [])
    .filter((c) => isPokemon(c) && normalizeStage(c.stage) === 'Stage 2')
    .map((stage2) => ({
      stage2,
      basics: basics.filter((basic) => stage2EvolvesFromBasic(stage2, basic, knownCards)),
    }))
    .filter((option) => option.basics.length > 0);
}

/**
 * Every card the player owns, for tracing evolution lines. Own cards only: the playtest bot
 * knows its own deck list and nothing of the opponent's, and must reach the same answer.
 */
export function ownedCards(player) {
  return Object.values(player?.zones || {}).filter(Array.isArray).flat();
}

/**
 * Counts that decide whether a targeted Trainer has anything to act on
 * (trainer-play-conditions.mjs), from a server-state player.
 */
export function trainerTargetCounts(player, knownCards = [], turnNumber = null) {
  const inPlay = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])];
  const roots = inPlay.filter((c) => !c.attachedTo);
  return {
    rareCandyOptionCount: rareCandyOptions(player, knownCards, turnNumber).length,
    toolTargetCount: roots.filter(
      (root) => !inPlay.some((c) => c.attachedTo === root.instanceId && isToolKind(c))
    ).length,
  };
}
