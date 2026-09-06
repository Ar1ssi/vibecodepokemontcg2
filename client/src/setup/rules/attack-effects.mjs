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
  'per-energy',       // "× the number of Energy attached" / "for each Energy attached"
  'per-prize',        // "for each of your opponent's Prize cards"
  'per-turn',         // "for each turn" / turn counters
  'multi-target',     // "do N to each of your opponent's Pokémon"
  'extra-by-type',    // "+N if the Defending Pokémon is [type]"
  'conditional-damage', // "if …, this attack does N more"
  'bench-damage',     // "you may also do N to a benched Pokémon"
  'discard-cost',     // "discard an Energy / N cards from this Pokémon / your hand"
  'discard-opponent', // "discard … from your opponent's deck / hand / Energy"
  'shuffle-cost',     // "shuffle into your deck, then draw"
  'status-asleep',    // "put the Defending Pokémon to Sleep"
  'status-paralyzed', // "Paralyze the Defending Pokémon"
  'status-poisoned',  // "Poison the Defending Pokémon"
  'status-burned',    // "Burn the Defending Pokémon"
  'status-confused',  // "Confuse the Defending Pokémon"
  'dual-status',      // "now Asleep and Poisoned" (two statuses at once)
  'self-status',      // "This Pokémon is now Asleep" (status on the attacker)
  'coin-flip',        // "flip a coin; if heads, …"
  'per-heads-coin',   // "flip … for each heads" (damage scales with heads count)
  'heal',             // "remove N damage counters" / "Heal N damage"
  'draw-attach',      // "draw N / attach an Energy"
  'draw-until',       // "draw cards until you have N cards"
  'search-deck',      // "search your deck for … put onto Bench / into hand"
  'switch',           // "then switch your Active"
  'move-energy',      // "move an Energy from this Pokémon to a Benched Pokémon"
  'reveal-hand',      // "your opponent reveals their hand"
  'conditional-ko',   // "if … Special Condition … Knocked Out"
  'once-per-turn',    // "Once during your turn: …"
  'damage-prevention', // "takes N less damage" / "prevent all damage"
  'next-turn-lock',   // "can't use [attack]" / "can't attack" / "can't retreat"
  'self-damage',      // "this Pokémon also does N damage to itself"
  'immunity',         // "damage isn't affected by Weakness/Resistance"
  'redirect-damage',  // "place N damage counters on the Attacking Pokémon"
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

// Status nouns (lowercased) used to detect "X and Y" dual-status applications.
const STATUS_NOUNS = ['asleep', 'paralyzed', 'poisoned', 'burned', 'confused'];

// Detect a dual-status application: "now Asleep and Poisoned",
// "is now Burned and Confused", etc. Returns the two status nouns or null.
function dualStatus(t) {
  const m = t.match(/now\s+('?(asleep|paralyzed|poisoned|burned|confused)')?\s+and\s+('?(asleep|paralyzed|poisoned|burned|confused)')?/);
  if (!m) {
    // Try "is now X and Y" where the nouns are explicit.
    const m2 = t.match(/(asleep|paralyzed|poisoned|burned|confused)\s+and\s+(asleep|paralyzed|poisoned|burned|confused)/);
    if (m2) return [m2[1], m2[2]];
    return null;
  }
  const a = m[2] || m[1];
  const b = m[3] || m[4];
  if (a && b && a !== b) return [a, b];
  const m3 = t.match(/(asleep|paralyzed|poisoned|burned|confused)\s+and\s+(asleep|paralyzed|poisoned|burned|confused)/);
  if (m3) return [m3[1], m3[2]];
  return null;
}

// Detect a self-status application: "This Pokémon is now Asleep."
// (status applied to the attacker, not the opponent's Active).
function selfStatus(t) {
  const m = t.match(/this pok[ée]mon\s+is\s+now\s+(asleep|paralyzed|poisoned|burned|confused)/);
  return m ? m[1] : null;
}

// Whether the text *applies* a status (an application verb / "is now X"),
// as opposed to merely referencing it inside a condition ("if … is Burned,
// … more damage"). This is what lets conditional-damage win over status when
// a status noun appears in the condition clause (fix: Roasting Heat).
function appliesStatus(t, status) {
  switch (status) {
    case 'asleep':
      return /to sleep|now asleep|sleeps/.test(t);
    case 'paralyzed':
      return /paralyz/.test(t);
    case 'poisoned':
      return /poison/.test(t);
    case 'burned':
      return /\bburn/.test(t);
    case 'confused':
      return /confus/.test(t);
    default:
      return false;
  }
}

// Bucket an attack into a single effect family from its printed `text`.
// The most distinctive effect keyword wins; a bare damage number is the
// `flat` fallback. Non-attack / unrecognizable inputs return 'unknown'.
//
// Ordering notes (intentional, see Mega Evolution attack audit A–J):
//   - conditional-damage / extra-by-type run BEFORE bare status checks so a
//     status noun inside a condition ("if … is Burned, … more damage") is not
//     misfiled as a status application (E: Roasting Heat).
//   - status checks require an application verb ("put … to Sleep", "is now
//     Asleep", "Paralyze the …") rather than the bare noun, so conditions are
//     never stolen into a status family.
//   - dual-status and self-status are detected before the single-status
//     families so "now Asleep and Poisoned" / "This Pokémon is now Asleep"
//     keep their distinct meaning (E).
export function classifyAttackEffect(attack, attackerCard = {}) {
  const text = lower(attack?.text ?? '');
  const hasDamage = Number.isFinite(attack?.damage);
  if (!text) return hasDamage ? 'flat' : 'unknown';
  const t = text;

  // Dual-status application (two statuses at once) — most specific status form.
  if (dualStatus(t)) return 'dual-status';
  // Self-status application (status on the attacker, not the opponent).
  if (selfStatus(t)) return 'self-status';

  // Conditional / type-gated extra damage — BEFORE bare status so a status
  // noun inside the condition clause is not misfiled as a status application.
  // Coin-conditional bonuses ("if heads/if tails … more damage") are excluded
  // here and handled by the coin-flip / per-heads-coin families below.
  const hasCoin = /flip a coin|flip \d+ coins?|a coin/.test(t);
  if (/if the defending pok[ée]mon is/.test(t) && hasTypeMention(t)) return 'extra-by-type';
  if (
    !hasCoin &&
    /if .*more damage|if .*this attack does|if the defending|base damage is \d+/.test(t)
  ) {
    return 'conditional-damage';
  }

  // Conditional KO (Abyss Eye) — before status so Special Condition refs aren't misfiled.
  if (
    /if your opponent's active pok[ée]mon is affected by a special condition/i.test(t) &&
    /knocked out/i.test(t)
  ) {
    return 'conditional-ko';
  }

  // Status application (single) — requires an application verb.
  if (appliesStatus(t, 'asleep')) return 'status-asleep';
  if (appliesStatus(t, 'paralyzed')) return 'status-paralyzed';
  if (appliesStatus(t, 'poisoned')) return 'status-poisoned';
  if (appliesStatus(t, 'burned')) return 'status-burned';
  if (appliesStatus(t, 'confused')) return 'status-confused';

  // Target shape — multi-Pokémon and bench damage.
  if (
    /each of your opponent's pok[ée]mon|to all of your opponent's|to every of|each pok[ée]mon/.test(
      t,
    )
  ) {
    return 'multi-target';
  }
  if (/(benched pok[ée]mon|a benched|your bench)/.test(t) && /damage|do \d|\d+ damage|hit/.test(t)) {
    return 'bench-damage';
  }

  // Follow-up actions that ride on the attack.
  if (/your opponent reveal(?:s)? (?:their )?hand/i.test(t)) return 'reveal-hand';
  if (
    /move an? energy from this pok[ée]mon/i.test(t) ||
    (/move\b[^.;]*\benergy\b/i.test(t) && /benched pok[ée]mon|your bench/i.test(t))
  ) {
    return 'move-energy';
  }
  if (/(remove|heal)[^.]*damage counter|remove [^.]*counters|heal \d+ damage/.test(t)) return 'heal';
  if (/switch/.test(t)) return 'switch';
  if (/draw cards until you have \d+ cards/.test(t)) return 'draw-until';
  if (/draw (a |the )?card|draw \d+|attach [^.]*energy/.test(t)) return 'draw-attach';

  // Coin-flip branching (per-heads scaling is the more specific form).
  if (/for each heads/.test(t) && /flip/.test(t)) return 'per-heads-coin';
  if (/flip a coin|flip \d+ coins?|a coin/.test(t)) return 'coin-flip';

  // Scaling damage.
  if (
    /number of energy|× the number|\* the number|for each damage counter|does \d+(?: more)? damage for each .*energy attached|for each (\{[a-zA-Z]\}|[a-zA-Z]+ )?energy attached/.test(
      t,
    )
  ) {
    return 'per-energy';
  }
  if (/for each (of )?(your opponent's )?prize|each prize card|prize card/.test(t)) return 'per-prize';
  if (/for each turn|each turn|turn counter|this is the \d+th turn|this is the first turn/.test(t)) {
    return 'per-turn';
  }
  // Per-heads coin scaling (damage scales with the number of heads).
  if (/for each heads/.test(t)) return 'per-heads-coin';

  // Self-damage (the attack deals damage to the attacker).
  if (/(this pok[ée]mon|it) (also )?does \d+ damage to (itself|itself)/.test(t) ||
      /does \d+ damage to itself/.test(t)) {
    return 'self-damage';
  }

  // Damage prevention / next-turn protection.
  if (/takes \d+ less damage|prevent all damage|do \d+ less damage|less damage from attacks/.test(t)) {
    return 'damage-prevention';
  }

  // Next-turn lock (can't use / can't attack / can't retreat).
  if (/can't use|can't attack|can't retreat|cannot use|cannot attack|cannot retreat/.test(t)) {
    return 'next-turn-lock';
  }

  // Immunity (damage not affected by Weakness/Resistance/effects).
  if (/isn't affected by|is not affected by|not affected by (weakness|resistance)/.test(t)) {
    return 'immunity';
  }

  // Redirect-damage (place counters on the Attacking Pokémon).
  if (/place \d+ damage counters on the attacking pok[ée]mon/.test(t)) {
    return 'redirect-damage';
  }

  // Costs attached to the attack.
  if (/discard/.test(t) && /your opponent's (deck|hand|active pok[ée]mon)/.test(t)) {
    return 'discard-opponent';
  }
  if (/discard/.test(t)) return 'discard-cost';
  // Deck search (Call for Family, Flock, Lucky Find, …) — before shuffle so
  // trailing "then, shuffle your deck" is not misfiled as shuffle-cost.
  if (/search your deck for/i.test(t)) return 'search-deck';
  if (/shuffle\s+(?:your\s+)?hand\s+into\s+(?:your\s+|the\s+)?deck/i.test(t)) {
    return 'shuffle-cost';
  }
  if (/shuffle/.test(t)) return 'shuffle-cost';

  // Turn-locked one-shot.
  if (/once (during your turn|per turn|during the game)/.test(t)) return 'once-per-turn';

  // Hand-scaling counter placement, return-energy, lowest-HP KO — before flat.
  if (/place \d+ damage counters? on your opponent's active.*for each card in your hand/.test(t)) {
    return 'bench-damage';
  }
  if (/put (?:\d+|an?) .*energy .* into your hand/.test(t)) return 'move-energy';
  if (/exactly \d+ damage counters/.test(t) && /knocked out/.test(t)) return 'conditional-ko';
  if (/least hp remaining/.test(t) && /knocked out/.test(t)) return 'conditional-ko';
  if (/for each damage counter/.test(t)) return 'per-energy';
  if (/this attack can be used for/.test(t)) return 'conditional-damage';

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
      return `${name}: "${attackName}" scales with the number of Energy attached — count the relevant Energy for the total.`;
    case 'per-prize':
      return `${name}: "${attackName}" deals more the fewer Prize cards remain — count the relevant Prizes.`;
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
    case 'discard-opponent':
      return `${name}: "${attackName}" discards cards from your opponent's deck/hand/Energy — resolve the discard as printed.`;
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
    case 'dual-status':
      return `${name}: "${attackName}" applies TWO status conditions at once — read the card text for both.`;
    case 'self-status':
      return `${name}: "${attackName}" applies a status to itself (the attacker), not the opponent — read the card text.`;
    case 'coin-flip':
      return `${name}: "${attackName}" depends on a coin flip — resolve heads/tails before applying the outcome.`;
    case 'per-heads-coin':
      return `${name}: "${attackName}" deals more damage per heads — flip the printed number of coins and count heads.`;
    case 'heal':
      return `${name}: "${attackName}" heals/removes damage counters — choose which Pokémon to heal as printed.`;
    case 'draw-attach':
      return `${name}: "${attackName}" draws cards and/or attaches Energy as part of its effect.`;
    case 'draw-until':
      return `${name}: "${attackName}" draws until you reach a hand-size target — count your hand before drawing.`;
    case 'search-deck':
      return `${name}: "${attackName}" searches your deck — pick the matching card(s), put them on your Bench or into your hand, then shuffle.`;
    case 'switch':
      return `${name}: "${attackName}" includes a switch — bring in or swap a Pokémon after resolving damage.`;
    case 'move-energy':
      return `${name}: "${attackName}" moves Energy from this Pokémon to a Benched Pokémon — pick the Energy and destination as printed.`;
    case 'reveal-hand':
      return `${name}: "${attackName}" reveals your opponent's hand — list the cards for both players.`;
    case 'conditional-ko':
      return `${name}: "${attackName}" Knocks Out the opponent's Active if it has a Special Condition — check status before resolving.`;
    case 'once-per-turn':
      return `${name}: "${attackName}" has a once-per-turn effect — it can be used only once before your next turn.`;
    case 'damage-prevention':
      return `${name}: "${attackName}" reduces or prevents damage to this Pokémon on the next turn — track the protection window.`;
    case 'next-turn-lock':
      return `${name}: "${attackName}" locks this Pokémon out of an action next turn — remember the restriction.`;
    case 'self-damage':
      return `${name}: "${attackName}" also deals damage to itself — apply the self-damage after the main hit.`;
    case 'immunity':
      return `${name}: "${attackName}"'s damage ignores Weakness/Resistance and certain effects — skip those modifiers.`;
    case 'redirect-damage':
      return `${name}: "${attackName}" redirects damage onto the Attacking Pokémon — apply the counters as printed.`;
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
