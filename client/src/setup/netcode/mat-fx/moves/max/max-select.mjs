// Design 092 § Selection: which Max or G-Max Move (if any) a Pokémon VMAX's attack plays. Pure:
// both clients compute the same pick from the registry card and the plan's attack name.
import { isVmaxCard } from '../../../../../../../shared/engine/rules/card-classify.mjs';
import { vgTypesFor } from '../move-select.mjs';
import { normalizeAttackName } from '../signature/signature-select.mjs';
import { GMAX_MOVE_BY_SPECIES, MAX_MOVE_BY_TYPE } from './max-moves.mjs';

// The client's card stats carry a Pokémon's stage but not always its subtypes.
const isVmax = (card) => isVmaxCard(card) || String(card?.stage ?? '').toLowerCase().replace(/[^a-z]/g, '') === 'vmax';

/** 'gmax' for a "G-Max …" attack, 'max' for a "Max …" one, else null. */
export function maxAttackKind(attackName) {
  const key = normalizeAttackName(attackName);
  if (key.startsWith('g max ')) return 'gmax';
  if (key.startsWith('max ')) return 'max';
  return null;
}

/** A card name as a species key: "Snorlax VMAX" → snorlax. */
const speciesKeyOfName = (name) =>
  String(name ?? '')
    .replace(/\s+vmax$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The G-Max Move of the card's species, or null when it has none. `slug` is the sprite slug
 * (signature-select.mjs `slugFor`); the card's own name is the fallback when no sprite resolves.
 * Only the exact species counts: Galarian Meowth (meowth-galar) has no G-Max form.
 */
export function gmaxMoveFor(card, slug) {
  for (const key of [String(slug ?? '').replace(/-gmax$/, ''), speciesKeyOfName(card?.name)]) {
    if (key && Object.hasOwn(GMAX_MOVE_BY_SPECIES, key)) return GMAX_MOVE_BY_SPECIES[key];
  }
  return null;
}

/**
 * The Max Move of the card's species type: design 063's type pick (the printed TCG type narrowed by
 * the species' own types; a dual type flips on `seed`), Max Strike when no type has one.
 */
export function typedMaxMoveFor(card, species, seed = 0) {
  const vgType = vgTypesFor(card, species, seed).find((type) => Object.hasOwn(MAX_MOVE_BY_TYPE, type));
  return MAX_MOVE_BY_TYPE[vgType ?? 'normal'];
}

/**
 * The move a VMAX's Dynamax attack plays: `{ move, kind }`, or null for any other card or attack.
 * A "G-Max …" attack plays its species' G-Max Move, or the typed Max Move when the species has
 * none; a "Max …" attack plays the typed Max Move.
 * @returns {{ move: string, kind: 'max' | 'gmax' } | null}
 */
export function maxMoveFor(card, { attackName, slug = null, species = null, seed = 0 } = {}) {
  if (!card || typeof card !== 'object' || !isVmax(card)) return null;
  const kind = maxAttackKind(attackName);
  if (!kind) return null;
  const gmax = kind === 'gmax' ? gmaxMoveFor(card, slug) : null;
  if (gmax) return { move: gmax, kind: 'gmax' };
  return { move: typedMaxMoveFor(card, species, seed), kind: 'max' };
}

/** `pick` with its spec, or null when `pick` is null or its spec has not shipped (the attack plays as before). */
export const withMaxSpec = (pick, specs) => {
  const spec = pick && specs[pick.move];
  return spec ? { ...pick, spec } : null;
};
