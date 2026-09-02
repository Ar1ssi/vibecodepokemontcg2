// Attack effect classifier (taxonomy Section D, Gap #1) — Piece A.
//
// Today the live attack path (`attack()` in `chat-buttons.js`) does NO damage
// math and applies NO effect: it gates via `canPerformAction`, marks the turn
// attacked, announces, and ends the turn. The pure damage/cost math already
// exists in `attack-engine.mjs` (`computeAttackDamage` / `canPayAttackCost`)
// but is never called. Every attack-effect *family* (per-energy damage, status
// application, coin-flip branching, bench damage, heal, switch, …) is still ❌
// in the live path.
//
// This module is the first, announce-only piece (Piece A). It is pure +
// DOM-free (node:test friendly) and mirrors `ability-effects.mjs` /
// `stadium-effects.mjs`:
//   - `classifyAttackEffect` buckets an attack's printed `text` into a single
//     family (works before async card data loads, from `attack.text` alone).
//   - `describeAttackEffect` builds a human-readable announcement line.
//   - `applyAttackEffect` is an announce-only stub: it returns a result object
//     and does NOT mutate any game state. Per-family execution is deferred
//     pending explicit user confirmation (project doctrine: do not silently
//     build execution).
//
// Attack data shape (from `rules-state.mjs` `ensureCardData`): each `attacks[]`
// entry is `{ name, cost[], damage (number), text }`, so `attack.text` is the
// parser's real input. `attackerCard` (the Pokémon card) is optional and only
// used for a friendly name in descriptions.

// Effect families an attack can be classified into (taxonomy Section D).
export const ATTACK_FAMILIES = [
  'flat',             // bare "30" damage number
  'per-energy',       // "× the number of Energy attached"
  'per-prize',        // "for each of your opponent's Prize cards"
  'per-turn',         // "for each turn" / turn counters
  'multi-target',     // "do N to each of your opponent's Pokémon"
  'extra-by-type',    // "+N if the Defending Pokémon is [type]"
  'conditional-damage', // "if …, this attack does N more"
  'bench-damage',     // "you may also do N to a benched Pokémon"
  'discard-cost',     // "discard an Energy / N cards from your hand"
  'shuffle-cost',     // "shuffle into your deck, then draw"
  'status-asleep',    // "put the Defending Pokémon to Sleep"
  'status-paralyzed', // "Paralyze the Defending Pokémon"
  'status-poisoned',  // "Poison the Defending Pokémon"
  'status-burned',    // "Burn the Defending Pokémon"
  'status-confused',  // "Confuse the Defending Pokémon"
  'coin-flip',        // "flip a coin; if heads, …"
  'heal',             // "remove N damage counters"
  'draw-attach',      // "draw N / attach an Energy"
  'switch',           // "then switch your Active"
  'once-per-turn',    // "Once during your turn: …"
  'unknown',          // attack we can't place
];

// Normalize curly quotes to straight so keyword checks work on card text.
const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

// Recognized Pokémon energy types (for the "extra by type" family).
const TYPES = [
  'grass',
  'fire',
  'water',
  'lightning',
  'psychic',
  'fighting',
  'dark',
  'metal',
  'fairy',
  'dragon',
];
const TYPE_RE = TYPES.join('|');
const hasTypeMention = (t) => new RegExp(`\\b(${TYPE_RE})\\b`).test(t);

// Bucket an attack into a single effect family from its printed `text`.
// The most distinctive effect keyword wins; a bare damage number is the
// `flat` fallback. Non-attack / unrecognizable inputs return 'unknown'.
export function classifyAttackEffect(attack, attackerCard = {}) {
  const text = lower(attack?.text ?? '');
  const hasDamage = Number.isFinite(attack?.damage);
  if (!text) return hasDamage ? 'flat' : 'unknown';
  const t = text;

  // Status application — the most "effectful" and unambiguous family.
  if (/(put )?to sleep|sleeps|asleep/.test(t)) return 'status-asleep';
  if (/paralyz/.test(t)) return 'status-paralyzed';
  if (/poison/.test(t)) return 'status-poisoned';
  if (/\bburn/.test(t)) return 'status-burned';
  if (/confus/.test(t)) return 'status-confused';

  // Target shape — multi-Pokémon and bench damage.
  if (
    /each of your opponent's pokémon|to all of your opponent's|to every of|each pokémon/.test(
      t,
    )
  ) {
    return 'multi-target';
  }
  if (/(benched pokémon|a benched|your bench)/.test(t) && /damage|do \d|\d+ damage|hit/.test(t)) {
    return 'bench-damage';
  }

  // Follow-up actions that ride on the attack.
  if (/(remove|heal)[^.]*damage counter|remove [^.]*counters/.test(t)) return 'heal';
  if (/switch/.test(t)) return 'switch';
  if (/draw (a |the )?card|draw \d+|attach [^.]*energy/.test(t)) return 'draw-attach';

  // Coin-flip branching.
  if (/flip a coin|flip a coin|a coin/.test(t)) return 'coin-flip';

  // Scaling damage.
  if (/number of energy|× the number|\* the number/.test(t)) return 'per-energy';
  if (/for each (of )?(your opponent's )?prize|each prize card|prize card/.test(t)) return 'per-prize';
  if (/for each turn|each turn|turn counter|this is the \d+th turn|this is the first turn/.test(t)) {
    return 'per-turn';
  }

  // Conditional / type-gated extra damage (more specific first).
  if (/if the defending pokémon is/.test(t) && hasTypeMention(t)) return 'extra-by-type';
  if (/if .*more damage|if .*this attack does|if the defending/.test(t)) return 'conditional-damage';

  // Costs attached to the attack.
  if (/discard/.test(t)) return 'discard-cost';
  if (/shuffle/.test(t)) return 'shuffle-cost';

  // Turn-locked one-shot.
  if (/once (during your turn|per turn|during the game)/.test(t)) return 'once-per-turn';

  return hasDamage ? 'flat' : 'unknown';
}

// Human-readable, guidance-only description of the attack family (for
// announcements). Complements the printed card text; use for a single-line
// family summary.
export function describeAttackEffect(attack, attackerCard = {}) {
  const family = classifyAttackEffect(attack, attackerCard);
  const name = attackerCard?.name || attack?.name || 'This attack';
  const attackName = attack?.name || 'the attack';
  const damage = Number.isFinite(attack?.damage) ? attack.damage : 'the printed';

  switch (family) {
    case 'flat':
      return `${name}: "${attackName}" deals ${damage} damage (plus weakness/resistance).`;
    case 'per-energy':
      return `${name}: "${attackName}" scales with the number of Energy attached — count your attacker's Energy for the total.`;
    case 'per-prize':
      return `${name}: "${attackName}" deals more the fewer Prize cards your opponent has left — count their remaining Prizes.`;
    case 'per-turn':
      return `${name}: "${attackName}" scales with how many turns it has been played — track the turn counter.`;
    case 'multi-target':
      return `${name}: "${attackName}" hits each of your opponent's Pokémon — apply damage to all of them, not just the Active.`;
    case 'extra-by-type':
      return `${name}: "${attackName}" deals bonus damage if the Defending Pokémon matches a certain type — check its type before resolving.`;
    case 'conditional-damage':
      return `${name}: "${attackName}" has a conditional bonus — resolve the stated condition before finalizing the damage.`;
    case 'bench-damage':
      return `${name}: "${attackName}" can also deal damage to a benched Pokémon — pick the bench target if you choose.`;
    case 'discard-cost':
      return `${name}: "${attackName}" requires discarding cards as a cost — pay it before resolving the effect.`;
    case 'shuffle-cost':
      return `${name}: "${attackName}" involves shuffling into your deck and/or drawing — resolve the shuffle/draw order as printed.`;
    case 'status-asleep':
      return `${name}: "${attackName}" puts the Defending Pokémon to Sleep — it will need to flip heads to act next turn.`;
    case 'status-paralyzed':
      return `${name}: "${attackName}" Paralyzes the Defending Pokémon — it can't attack next turn, then it clears.`;
    case 'status-poisoned':
      return `${name}: "${attackName}" Poisons the Defending Pokémon — it loses 10 HP at the end of its owner's turn.`;
    case 'status-burned':
      return `${name}: "${attackName}" Burns the Defending Pokémon — each turn its owner flips a coin; on tails, 20 damage.`;
    case 'status-confused':
      return `${name}: "${attackName}" Confuses the Defending Pokémon — before it attacks, its owner flips; on tails it does 30 to itself.`;
    case 'coin-flip':
      return `${name}: "${attackName}" depends on a coin flip — resolve heads/tails before applying the outcome.`;
    case 'heal':
      return `${name}: "${attackName}" removes damage counters — choose which Pokémon to heal as printed.`;
    case 'draw-attach':
      return `${name}: "${attackName}" draws cards and/or attaches Energy as part of its effect.`;
    case 'switch':
      return `${name}: "${attackName}" includes a switch — bring in or swap a Pokémon after resolving damage.`;
    case 'once-per-turn':
      return `${name}: "${attackName}" has a once-per-turn effect — it can be used only once before your next turn.`;
    case 'unknown':
    default:
      return `${name}: attack present (no specific family recognized — read the card text for the full effect).`;
  }
}

// Announce-only stub. Returns a result describing the recognized family and a
// message, but performs NO game-state mutation. `executed` is always false
// until a family's execution is explicitly built + user-confirmed (Pieces
// B–D in the handoff plan).
export function applyAttackEffect(attack, attackerCard = {}) {
  const family = classifyAttackEffect(attack, attackerCard);
  const description = describeAttackEffect(attack, attackerCard);
  return {
    family,
    executed: false,
    message: `✦ ${description} (announce-only — effect execution not yet implemented)`,
  };
}
