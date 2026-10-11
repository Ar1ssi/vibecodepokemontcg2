// Design 068: which TCG Live impact prefab a hit plays, and which beats of a move scene it
// replaces. Pure: both seats pick the same prefab from the same card and damage.
import { normalizeEnergyType } from '../../../../actions/move-card-bundle/energy-token-assets.mjs';

export const IMPACT_TYPES = Object.freeze(['colorless', 'darkness', 'dragon', 'fairy', 'fighting', 'fire', 'grass', 'lightning', 'metal', 'psychic', 'water']);
const FALLBACK_TYPE = 'colorless';

/**
 * The TCG types a main-series type has been printed as, the first its usual one. A move's
 * impact keeps the move's palette (the user's standing FX rule: one palette through the
 * payoff), so the move's type decides — the card's printed type only breaks the tie.
 */
export const IMPACT_TYPES_BY_VG = Object.freeze({
  grass: ['grass'],
  bug: ['grass'],
  poison: ['darkness', 'psychic', 'grass'],
  fire: ['fire'],
  water: ['water'],
  ice: ['water'],
  electric: ['lightning'],
  psychic: ['psychic'],
  ghost: ['psychic'],
  fairy: ['fairy', 'psychic'],
  fighting: ['fighting'],
  rock: ['fighting'],
  ground: ['fighting'],
  dark: ['darkness'],
  steel: ['metal'],
  dragon: ['dragon', 'colorless'],
  flying: ['colorless'],
  normal: ['colorless'],
  stellar: ['colorless'],
});

/** The game's own rule (`FXManager.GetAttackVariationFromDamage`). */
export const LARGE_ABOVE_DAMAGE = 150;
export const MEDIUM_FROM_DAMAGE = 50;

/**
 * The impact type for an attack: the move's main-series type mapped to a TCG type (the card's
 * printed type when the move's type is printed as it), else the printed type, else colorless.
 * @param {{types?: string[]}|null} card the attacking card
 * @param {string|null} [vgType] the move scene's main-series type; none for a plain lunge
 */
export function impactTypeFor(card, vgType = null) {
  const printed = normalizeEnergyType(card?.types?.[0]);
  const candidates = Object.hasOwn(IMPACT_TYPES_BY_VG, vgType ?? '') ? IMPACT_TYPES_BY_VG[vgType] : null;
  if (candidates) return candidates.includes(printed) ? printed : candidates[0];
  return IMPACT_TYPES.includes(printed) ? printed : FALLBACK_TYPE;
}

/** 'Small' | 'Medium' | 'Large' for a damage amount. */
export function impactSizeFor(damage) {
  const amount = Number(damage) || 0;
  if (amount > LARGE_ABOVE_DAMAGE) return 'Large';
  return amount >= MEDIUM_FROM_DAMAGE ? 'Medium' : 'Small';
}

/** The prefab key in a type file: the size, `_C` for a Bench target. */
export const impactVariant = (damage, bench) => `${impactSizeFor(damage)}${bench ? '_C' : ''}`;

/** Drawers that only dress the contact: the prefab brings its own flash, debris, smoke and rings. */
const DRESSING_DRAWERS = new Set(['impactFlash', 'shards', 'smoke', 'ring', 'splash']);
const AT_CONTACT_SLACK_MS = 1;

/**
 * True for a beat the impact prefab replaces: generic contact dressing on the defender that
 * starts at or after the contact. What the move itself is — a flare, a pillar, cracked ground,
 * a bolt — is never one.
 */
export function isImpactBeat(beat, contactMs) {
  if (!beat || !DRESSING_DRAWERS.has(beat.drawer) || !(beat.at >= contactMs - AT_CONTACT_SLACK_MS)) return false;
  return (beat.params?.target ?? 'defender') === 'defender';
}

const isImpactBurst = (burst, contactMs) => burst?.anchor === 'defender' && burst.at >= contactMs - AT_CONTACT_SLACK_MS;

const stripped = new WeakMap();

/** `spec` without its impact beats and its contact particle bursts on the defender. */
export function withoutImpactBeats(spec) {
  if (!spec || !Array.isArray(spec.beats)) return spec;
  if (!stripped.has(spec)) {
    stripped.set(
      spec,
      Object.freeze({
        ...spec,
        beats: spec.beats.filter((beat) => !isImpactBeat(beat, spec.contactMs)),
        particles: (spec.particles ?? []).filter((burst) => !isImpactBurst(burst, spec.contactMs)),
      })
    );
  }
  return stripped.get(spec);
}
