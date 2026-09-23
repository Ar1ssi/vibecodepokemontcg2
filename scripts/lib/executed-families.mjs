// Families the server engine claims to execute. Shared by ability-audit.mjs,
// attack-false-positive-audit.mjs and the oracle gate (scripts/audit-oracle.mjs), which checks
// each claim against observed state changes.

/**
 * Attack families the server engine executes (applyCommand 'attack': damage parser, attack helpers,
 * parseAttackSteps). Synced S268 to oracle state diffs, not to the legacy client attack(): a family
 * belongs here only when its printed effect is observed.
 * Removed then (client-only or no effect observed): reveal-hand, immunity, redirect-damage,
 * copy-attack, retaliate, deferred-damage, look-opponent-deck, next-turn-bonus, hp-cap-damage,
 * damage-prevention.
 */
export const EXECUTED_ATTACK_FAMILIES = new Set([
  'flat',
  'per-energy',
  'per-prize',
  'per-turn',
  'multi-target',
  'extra-by-type',
  'conditional-damage',
  'bench-damage',
  'discard-cost',
  'status-asleep',
  'status-paralyzed',
  'status-poisoned',
  'status-burned',
  'status-confused',
  'dual-status',
  'self-status',
  'coin-flip',
  'per-heads-coin',
  'heal',
  'draw-attach',
  'draw-until',
  'search-deck',
  'switch',
  'move-energy',
  'conditional-ko',
  'once-per-turn',
  'self-damage',
  'mirror-heal',
  'return-self',
  'devolve-opponent',
  'recover-status',
  'return-opponent-energy',
  'look-own-deck',
  'next-turn-lock',
  'discard-opponent',
  'lost-zone',
]);

/** Partial / heuristic execution — still flagged but lower priority. */
export const PARTIAL_ATTACK_FAMILIES = new Set([
  // 24/46 run (attacker / opponent-Bench shuffles); hand shuffles and "shuffle any amount"
  // wordings show no effect in the oracle.
  'shuffle-cost',
]);

export const EXECUTED_ABILITY_FAMILIES = new Set([
  'search',
  'draw',
  'switch',
  'heal',
  'attach',
  'when-played',
  'end-of-turn',
  'damage-prevent',
  'energy-redirect',
  'move-energy',
  'hand-protect',
  'opponent-disrupt',
  'cost-discount',
  'move-damage',
  'status',
  'look-at-top',
  'recursion',
  'evolve',
  'passive',
  'damage-reduce',
  'damage-bonus',
  'effect-prevent',
  'thorns',
  'checkup',
  'attack-inheritance',
  'on-opponent-evolve',
  'ko-prevention',
  'retreat-cost',
  'hp-bonus',
  'weakness',
  'setup',
  'tool-cap',
  'prize-modify',
  'energy-multiplier',
]);

/** Executed families the oracle cannot observe (key 'attack:<f>' / 'ability:<f>' → why). */
export const ORACLE_BLIND_FAMILIES = new Map([
  [
    'attack:once-per-turn',
    'only Alakazam ex "usable from the Bench"; the oracle attacks from the Active Spot',
  ],
  [
    'attack:extra-by-type',
    'only Poliwrath "if the Defending Pokémon is a {D}"; the oracle Defending Pokémon is {W}',
  ],
  ['ability:retreat-cost', 'passive rule modifier; useAbility rejects it'],
  ['ability:effect-prevent', 'passive rule modifier; useAbility rejects it'],
  ['ability:hp-bonus', 'passive rule modifier; useAbility rejects it'],
  ['ability:energy-multiplier', 'passive rule modifier; useAbility rejects it'],
  [
    'ability:attack-inheritance',
    'passive rule modifier; useAbility rejects it',
  ],
  ['ability:damage-reduce', 'passive rule modifier; useAbility rejects it'],
]);
