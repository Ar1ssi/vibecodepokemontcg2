// Design 063: pick the main-series move an attack plays, from the attacker card, its species'
// base stats and the attack. Pure and deterministic: the only randomness is seeded from the
// server-minted instanceId, so both clients choose the same move.
import {
  isExCard,
  isGxCard,
  isLegendCard,
  isMegaCard,
  isPrismStarCard,
  isRadiantCard,
  isTagTeamCard,
  isVCard,
  isVUnionCard,
  isVmaxCard,
  isVstarCard,
} from '../../../../../../shared/engine/rules/card-classify.mjs';
import { normalizeEnergyType } from '../../../../actions/move-card-bundle/energy-token-assets.mjs';
import { pokemonSpriteForName } from '../../../deck-builder/core/card-sprites.mjs';
import { seededRandom } from '../flow-pose.mjs';
import { cellLookup } from './move-table.mjs';
import { SPECIES_ID, SPECIES_STATS } from './species-stats.generated.mjs';

/** Base Attack and Special Attack within this many points read as "either": a seeded coin. */
export const CLOSE_STAT_GAP = 10;

// A printed TCG type names a family of main-series types; the first one the species has wins.
export const TCG_FAMILY = Object.freeze({
  grass: ['grass', 'bug', 'poison'],
  fire: ['fire'],
  water: ['water', 'ice'],
  lightning: ['electric'],
  psychic: ['psychic', 'ghost', 'fairy', 'poison'],
  fighting: ['fighting', 'rock', 'ground'],
  darkness: ['dark'],
  metal: ['steel'],
  dragon: ['dragon'],
  fairy: ['fairy'],
  colorless: ['dragon', 'flying', 'normal'],
});

export const TCG_DEFAULT = Object.freeze({
  ...Object.fromEntries(
    Object.entries(TCG_FAMILY).map(([tcgType, family]) => [tcgType, family[0]])
  ),
  colorless: 'normal',
});

const RULE_BOX_TESTS = [
  isMegaCard,
  isExCard,
  isVCard,
  isVmaxCard,
  isVstarCard,
  isGxCard,
  isTagTeamCard,
  isLegendCard,
  isVUnionCard,
  isPrismStarCard,
  isRadiantCard,
];

const collapseStage = (stage) =>
  String(stage || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

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

/**
 * Base Attack, Special Attack and main-series types of the card's species, or null when the
 * name resolves to no species (the caller then falls back to the seeded coin).
 * @returns {{atk:number, spa:number, types:string[]}|null}
 */
export function speciesFor(card) {
  const slug = pokemonSpriteForName(card?.name, { types: card?.types })?.slug;
  const id = slug && Object.hasOwn(SPECIES_ID, slug) ? SPECIES_ID[slug] : null;
  const row = id && Object.hasOwn(SPECIES_STATS, id) ? SPECIES_STATS[id] : null;
  if (!row) return null;
  const [atk, spa, ...types] = row;
  return { atk, spa, types };
}

/** Evolution tier: 3 for rule-box / Mega / Stage 2 / BREAK, 2 for Stage 1, else 1. */
export function tierFor(card) {
  if (!card || typeof card !== 'object') return 1;
  if (RULE_BOX_TESTS.some((isRuleBox) => isRuleBox(card))) return 3;
  const stage = collapseStage(card.stage || card.subtypes?.[0] || 'Basic');
  if (stage === 'stage2' || stage === 'break') return 3;
  if (stage === 'stage1') return 2;
  return 1;
}

/** The per-Pokémon-instance coin: one card is physical or special for the whole game. */
export function coinFor(instanceId) {
  return seededRandom(hashString(String(instanceId ?? '')))() < 0.5
    ? 'physical'
    : 'special';
}

/** @param {{atk:number, spa:number}|null} stats @param {'physical'|'special'} coin */
export function statClassFor(stats, coin) {
  if (!stats || !Number.isFinite(stats.atk) || !Number.isFinite(stats.spa)) {
    return coin;
  }
  if (Math.abs(stats.atk - stats.spa) <= CLOSE_STAT_GAP) return coin;
  return stats.atk > stats.spa ? 'physical' : 'special';
}

/** Main-series type for the move: the first family type the species has, else the family default. */
export function vgTypeFor(card, species) {
  const tcgType = normalizeEnergyType(card?.types?.[0]);
  const family = TCG_FAMILY[tcgType] ?? ['normal'];
  const speciesTypes = Array.isArray(species?.types) ? species.types : [];
  const owned = family.find((type) => speciesTypes.includes(type));
  return owned ?? TCG_DEFAULT[tcgType] ?? 'normal';
}

/**
 * The move an attack plays, or null when the generic lunge (or aura pulse) applies.
 * `scores` maps move slug to its score; when given, a move without a score yields null.
 * @returns {{move:string, vgType:string, statClass:string, tier:number, family:string|undefined, score:object|undefined}|null}
 */
export function moveFor(
  card,
  { instanceId, attackName, species, damage, benchDealt } = {},
  scores = null
) {
  if (damage === 0 && !(benchDealt > 0)) return null;
  const vgType = vgTypeFor(card, species);
  const tier = tierFor(card);
  const statClass = statClassFor(species ?? null, coinFor(instanceId));
  const candidates = cellLookup(vgType, statClass, tier);
  if (!candidates?.length) return null;
  const seed = hashString(`${instanceId ?? ''}|${attackName ?? ''}`);
  const move = candidates[seed % candidates.length];
  const score = scores ? scores[move] : undefined;
  if (scores && !score) return null;
  return { move, vgType, statClass, tier, family: score?.family, score };
}
