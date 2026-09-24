// Families the server engine claims to execute. Shared by ability-audit.mjs,
// attack-false-positive-audit.mjs and the oracle gate (scripts/audit-oracle.mjs), which checks
// each claim against observed state changes.

/**
 * Attack families the server engine executes (applyCommand 'attack': damage parser, attack helpers,
 * parseAttackSteps). Synced S268 to oracle state diffs, not to the legacy client attack(): a family
 * belongs here only when its printed effect is observed.
 * S269 (design 031, I118) added the former client-only families back: reveal-hand, immunity,
 * damage-prevention, next-turn-bonus, copy-attack, hp-cap-damage, deferred-damage, retaliate, and the
 * shuffle-cost remainder. immunity and hp-cap-damage change damage amounts only; they are kept on
 * parser coverage and reduce tests. redirect-damage has no printings. S271 (design 033, I119) added
 * look-opponent-deck (Inkay, Gothorita) and the last unparsed printings.
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
  'reveal-hand',
  'immunity',
  'damage-prevention',
  'next-turn-bonus',
  'copy-attack',
  'hp-cap-damage',
  'deferred-damage',
  'retaliate',
  'shuffle-cost',
  'look-opponent-deck',
]);

/** Partial / heuristic execution — still flagged but lower priority. */
export const PARTIAL_ATTACK_FAMILIES = new Set([]);

// Claimed from `pnpm audit:abilities` evidence (D128): at least half the family's printed rows
// run (activated, board changes) or are read by a passive reader. The gate fails a claim that
// drops under that share and warns on an unclaimed family that meets it.
export const EXECUTED_ABILITY_FAMILIES = new Set([
  'attach',
  'attack-inheritance',
  'checkup',
  'coin-control',
  'copy-attack',
  'cost-discount',
  'damage-prevent',
  'damage-reduce',
  'discard-bench',
  'discard-cost',
  'draw',
  'effect-prevent',
  'energy-on-ko',
  'energy-redirect',
  'evolve',
  'extra-supporter',
  'heal',
  'look-at-top',
  'move-damage',
  'on-opponent-evolve',
  'passive',
  'search',
  'self-attach-energy',
  'self-return',
  'setup',
  'status',
  'status-recover',
  'switch',
  'tool-cap',
  'weakness',
  'when-played',
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
  // Design 031 families, covered by shared/engine/__tests__/attack-markers.test.mjs.
  ['attack:next-turn-bonus', 'a marker read on the next turn; the oracle runs one attack'],
  ['attack:deferred-damage', 'the Knock Out comes at the end of the next turn; the oracle runs one attack'],
  [
    'attack:hp-cap-damage',
    'damage counters, not dealt damage: the only change is opp:active+dmg, a base tag',
  ],
  // Passive ability families: the oracle cannot see them, `pnpm audit:abilities` reads them
  // through the passive-reader probes (D127) and holds their claim (D128).
  ['ability:effect-prevent', 'passive rule modifier; useAbility rejects it'],
  ['ability:coin-control', 'passive rule modifier; read by the audit:abilities probes'],
  ['ability:copy-attack', 'passive attack borrowing; read by the audit:abilities probes'],
  ['ability:energy-on-ko', 'triggered on a Knock Out; read by the audit:abilities probes'],
  ['ability:extra-supporter', 'passive rule modifier; read by the audit:abilities probes'],
  [
    'ability:attack-inheritance',
    'passive rule modifier; useAbility rejects it',
  ],
  ['ability:damage-reduce', 'passive rule modifier; useAbility rejects it'],
]);
