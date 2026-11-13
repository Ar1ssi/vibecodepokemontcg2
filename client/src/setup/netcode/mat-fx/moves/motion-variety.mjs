// Design 089 § D7: card motion that follows the move. The specs were written with a handful of
// motions (54 of 144 attackers reared and lurched, 109 defenders took the same knock), so every
// move, whatever its travel beat, moved the two cards alike. This is the rule that spreads the
// motions of card-motion.mjs over the specs as they are merged (specs/index.mjs and the signature
// index): the per-type spec files stay as written, and what plays is what SPECS holds.
//
// The rule keeps each spec's intent: a card that stayed home still stays home, a card that carried
// its weight to the defender still does, and a reaction takes the knock's own strength and heat.
// Pure and deterministic: the pick is a hash of the spec id, the same on both clients.
import { hashString } from './hash.mjs';

/** Specs that play exactly as written: Fire Blast is the look the user accepted (design 063). */
export const PINNED_MOTION_IDS = Object.freeze(['fire-blast']);

/**
 * How a struck card answers each material (card-motion.mjs reactions). Fighting, aura and normal
 * are blows: they keep the knock.
 */
export const REACTION_BY_MATERIAL = Object.freeze({
  fire: 'scorch',
  solar: 'scorch',
  dragon: 'scorch',
  water: 'drench',
  mud: 'drench',
  electric: 'jolt',
  buzz: 'jolt',
  grass: 'wither',
  petal: 'wither',
  poison: 'wither',
  bug: 'jolt',
  rock: 'crush',
  ground: 'crush',
  ancient: 'crush',
  steel: 'clang',
  gem: 'clang',
  silver: 'clang',
  ice: 'clang',
  aurora: 'clang',
  psychic: 'warp-hit',
  fairy: 'warp-hit',
  stellar: 'warp-hit',
  ghost: 'dread',
  dark: 'dread',
  flying: 'whirl',
});

/** What a card that stays home may do instead of the rear-and-lurch, by how the move hits. */
const HOME_MOTIONS = Object.freeze({
  physical: ['hop', 'rear-lurch', 'coil'],
  special: ['channel', 'rear-lurch', 'coil'],
});

const pickOf = (spec, salt) => hashString(`${spec.id}|${salt}`) % 3;

/** The glow a motion carries over, when the spec set one. */
const glowOf = (params) => (Number.isFinite(params?.glow) ? { glow: params.glow } : {});

/** The attacker motion `spec` plays: its own, or the varied one its own stands for. */
export function variedAttacker(spec) {
  const attacker = spec.attacker;
  const params = attacker?.params ?? {};
  // An echo and a held wind-up are authored timing: those specs keep their motion.
  if (!attacker || attacker.echo || params.hold > 0) return attacker;
  if (attacker.motion === 'rear-lurch') {
    const motion = HOME_MOTIONS[spec.statClass === 'physical' ? 'physical' : 'special'][pickOf(spec, 'home')];
    return motion === 'rear-lurch' ? attacker : { motion, params: glowOf(params) };
  }
  if (attacker.motion === 'dash' && pickOf(spec, 'dash') === 0) {
    const { wind, reach, overshoot, arc } = params;
    const kept = Object.fromEntries(Object.entries({ wind, reach, overshoot, arc }).filter(([, value]) => value !== undefined));
    return { motion: 'sweep', params: kept };
  }
  // A heavy single blow comes down from above; a flurry (`strikes`) keeps its lunges.
  const heavy = spec.tier === 2 || spec.tier === 3 || spec.tier === 'S';
  if (attacker.motion === 'lunge' && heavy && (params.strikes ?? 1) === 1 && pickOf(spec, 'lunge') !== 1) {
    const { wind, reach } = params;
    const kept = Object.fromEntries(Object.entries({ wind, reach }).filter(([, value]) => value !== undefined));
    return { motion: 'slam', params: { ...kept, ...glowOf(params) } };
  }
  return attacker;
}

/** The defender motion `spec` plays: a knock becomes its material's reaction, with the knock's params. */
export function variedDefender(spec) {
  const defender = spec.defender;
  if (defender?.motion !== 'knock') return defender;
  const motion = REACTION_BY_MATERIAL[spec.material];
  return motion ? { ...defender, motion } : defender;
}

/** `spec` with its card motions varied (the spec itself when nothing changes or it is pinned). */
export function withVariedMotion(spec) {
  if (!spec || PINNED_MOTION_IDS.includes(spec.id)) return spec;
  const attacker = variedAttacker(spec);
  const defender = variedDefender(spec);
  if (attacker === spec.attacker && defender === spec.defender) return spec;
  return Object.freeze({ ...spec, attacker: Object.freeze(attacker), defender: Object.freeze(defender) });
}

/** A spec table with every spec's motions varied. */
export const variedSpecs = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([id, spec]) => [id, withVariedMotion(spec)])));
