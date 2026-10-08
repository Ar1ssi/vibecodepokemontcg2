// Design 065 § Selection: which signature move (if any) an attack plays. Pure: both clients
// compute the same pick from the registry card and the plan's attack name.
import { normalizeEnergyType } from '../../../../../actions/move-card-bundle/energy-token-assets.mjs';
import { pokemonSpriteForName } from '../../../../deck-builder/core/card-sprites.mjs';
import {
  CARD_TYPED,
  MASK_MATERIAL,
  SIGNATURE_BY_SLUG,
  SIGNATURE_MOVES,
  TCG_TO_MATERIAL,
} from './signature-moves.mjs';

/** The card's species/form slug (the sprite resolver's), or null. */
export const slugFor = (card) =>
  pokemonSpriteForName(card?.name, { types: card?.types })?.slug ?? null;

/** Case-, apostrophe- and punctuation-insensitive attack-name key. */
export const normalizeAttackName = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const SIGNATURE_BY_NAME = new Map(
  Object.entries(SIGNATURE_MOVES).map(([id, m]) => [
    normalizeAttackName(m.name),
    id,
  ])
);

/** The first integer of a printed damage string ('120+' → 120, '30×' → 30, '' → 0). */
export const baseDamage = (printed) =>
  Number(String(printed ?? '').match(/\d+/)?.[0] ?? 0);

/** Name of the attack with the largest base damage > 0 (ties → the later one), else null. */
export const strongestAttackName = (attacks) => {
  let best = null;
  let bestDamage = 0;
  for (const a of Array.isArray(attacks) ? attacks : []) {
    const dmg = baseDamage(a?.damage);
    if (dmg > 0 && dmg >= bestDamage) {
      best = a;
      bestDamage = dmg;
    }
  }
  return best ? (best.name ?? null) : null;
};

/** Walk `slug` up its '-' segments through `table`; an exact key (even null) wins. */
const walk = (table, slug) => {
  let s = String(slug ?? '');
  while (s) {
    if (Object.hasOwn(table, s)) return table[s];
    const cut = s.lastIndexOf('-');
    s = cut > 0 ? s.slice(0, cut) : '';
  }
  return undefined;
};

/** Signature move id of a species/form slug, or null. */
export const signatureForSlug = (slug) => walk(SIGNATURE_BY_SLUG, slug) ?? null;

/** Material key the signature plays in (§ Options 4). */
export const signatureMaterial = (moveId, { slug, card } = {}) => {
  const fallback = SIGNATURE_MOVES[moveId]?.material;
  if (CARD_TYPED.has(moveId))
    return TCG_TO_MATERIAL[normalizeEnergyType(card?.types?.[0])] ?? fallback;
  if (moveId === 'ivy-cudgel') return walk(MASK_MATERIAL, slug) ?? 'grass';
  return fallback;
};

/** { move, reason: 'name'|'strongest', material } for this attack, or null. */
export const signatureFor = (card, { attackName, slug } = {}) => {
  const key = normalizeAttackName(attackName);
  const named = key ? SIGNATURE_BY_NAME.get(key) : undefined;
  if (named)
    return {
      move: named,
      reason: 'name',
      material: signatureMaterial(named, { slug, card }),
    };
  const move = signatureForSlug(slug);
  if (!move) return null;
  const strongest = strongestAttackName(card?.attacks);
  if (!strongest) return null;
  if (normalizeAttackName(strongest) !== key) return null;
  return {
    move,
    reason: 'strongest',
    material: signatureMaterial(move, { slug, card }),
  };
};

/**
 * The signature `sig` plays as `{ ...sig, spec }` (the spec in the card's material), or null
 * when `sig` is null or `specs` has no spec for its move (edge 11: the shipped 063 path then).
 */
export const withSignatureSpec = (sig, specs) => {
  const spec = sig && specs[sig.move];
  return spec ? { ...sig, spec: { ...spec, material: sig.material } } : null;
};
