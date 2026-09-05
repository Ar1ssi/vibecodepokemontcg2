// Stadium effect engine (taxonomy Section E).
//
// Tracks *which* Stadium is in play (`rules-state.mjs` `markStadiumPlayed` /
// `getStadium` — one-at-a-time rule) and *executes* the effect a Stadium card
// carries. This module is pure + DOM-free (node:test friendly) and mirrors
// `ability-executors.mjs`.

import { rulesState, getStadium } from './rules-state.mjs';
//
// Layers:
//   - `classifyStadiumEffect` — buckets a card into an effect family.
//   - `describeStadiumEffect` — human-readable announcement.
//   - `parseStadiumSetupDraw` / `parseStadiumOncePerTurn` / `parseStadiumDamagePrevention`
//     / `isStadiumRetreatPrevention` / `isStadiumHandProtect` — pure parsers
//     that extract *what* the card does from its printed text.
//   - `applyStadiumEffect` — orchestrates the above and returns a result
//     object with `{ family, executed, message, results[] }`.

// Effect families a Stadium can be classified into.
export const STADIUM_EFFECT_FAMILIES = [
  'setup-once',      // one-shot "when you play this card" effect
  'once-per-turn',   // repeatable once per turn (e.g. Safari Zone search)
  'continuous-both', // always-on modifier affecting both players
  'opponent-affected', // ongoing effect primarily aimed at the opponent
  'none',            // Stadium with no recognized effect (rare)
  'unknown',         // Stadium we can't place
];

// Normalize curly quotes to straight so keyword checks work on card text.
const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const subtypesOf = (card) =>
  (Array.isArray(card?.subtypes) ? card.subtypes : []).map(lower);

const textOf = (card) => lower(card?.text ?? card?.cardText ?? '');

const isStadiumCard = (card) => {
  if (!card) return false;
  if (subtypesOf(card).includes('stadium')) return true;
  if (subtypesOf(card).includes('location')) return true;
  const type = lower(card.type);
  const name = lower(card.name);
  return type === 'stadium' || name.includes('zone') || name.includes('rooftop');
};

export { isStadiumCard };

// Matches both the literal "once per turn" and the "once during {each/your/
// either} player's turn" phrasing (e.g. Grand Tree), which is semantically
// the same repeatable-once-per-turn trigger but doesn't contain the literal
// substring "once per turn".
const ONCE_PER_TURN_RE = /once per turn|once during (?:each|your|either) player'?s turn/;

// Bucket a card into a stadium-effect family. Non-stadium / unrecognizable
// cards return 'unknown'. Precedence: the most restrictive trigger wins.
export function classifyStadiumEffect(card) {
  if (!isStadiumCard(card)) return 'unknown';
  const t = textOf(card);
  if (!t) return 'none';
  if (t.includes('when you play this card') || t.includes('when you play it')) {
    return 'setup-once';
  }
  if (ONCE_PER_TURN_RE.test(t)) {
    return 'once-per-turn';
  }
  if (
    t.includes('both players') ||
    t.includes('each player') ||
    t.includes('both active pokémon')
  ) {
    return 'continuous-both';
  }
  if (t.includes('your opponent')) {
    return 'opponent-affected';
  }
  return 'unknown';
}

// Human-readable, guidance-only description of the effect (for announcements).
export function describeStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const name = card?.name || 'This Stadium';
  switch (family) {
    case 'setup-once':
      return `${name}: when-you-play Stadium — a one-shot effect when this card is played (see card text).`;
    case 'once-per-turn':
      return `${name}: once-per-turn Stadium — a repeatable effect available once each turn (see card text).`;
    case 'continuous-both':
      return `${name}: continuous Stadium — an always-on modifier affecting both players while in play.`;
    case 'opponent-affected':
      return `${name}: continuous Stadium — an ongoing effect primarily aimed at your opponent.`;
    case 'none':
      return `${name}: Stadium in play (no effect text recognized).`;
    case 'unknown':
    default:
      return `${name}: Stadium card (no effect family recognized — read the card text).`;
  }
}

// ── Pure parsers (extract WHAT the card does) ──────────────────────────

/**
 * Setup-once: "When you play this card, draw N cards."
 * Returns the number of cards to draw, or null if not a draw effect.
 */
export function parseStadiumSetupDraw(card) {
  const t = textOf(card);
  if (!t.includes('when you play')) return null;
  const m = t.match(/draw (?:up to )?(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Once-per-turn: "Once per turn, you may …" (also matches "Once during
 * each player's turn" wording — see ONCE_PER_TURN_RE above).
 * Returns { kind: 'draw'|'search'|'search-evolve'|'heal'|'energy', n } or null.
 */
export function parseStadiumOncePerTurn(card) {
  const t = textOf(card);
  if (!ONCE_PER_TURN_RE.test(t)) return null;
  if (/draw/.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)/);
    return { kind: 'draw', n: m ? parseInt(m[1], 10) : 1 };
  }
  // Energy attach is checked before search: attach text may also mention
  // searching, but attaching is the primary action.
  if (/attach/.test(t) && /energy/.test(t)) {
    const m = t.match(/up to (\d+)/);
    return { kind: 'energy', n: m ? parseInt(m[1], 10) : 1 };
  }
  // Search-and-evolve (e.g. Grand Tree: search for an evolution and put it
  // onto a Pokémon already in play to evolve it) is a distinct mechanic
  // from a plain search-to-hand — evolving a Pokémon, not fetching a card
  // to hand — so it needs its own kind rather than falling into 'search'
  // and being misrouted as a hand pickup.
  if (/search/.test(t) && /evolv/.test(t)) {
    return { kind: 'search-evolve', n: 1 };
  }
  if (/search|look through|find/.test(t)) {
    return { kind: 'search', n: 1 };
  }
  if (/heal/.test(t)) {
    const m = t.match(/heal\s*(\d+)?/);
    return { kind: 'heal', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  return { kind: 'search', n: 1 };
}

/**
 * Continuous damage prevention: "Prevent all damage …"
 * Returns the number of damage counters prevented (Infinity for "all"),
 * or null if not a prevention effect.
 */
export function parseStadiumDamagePrevention(card) {
  const t = textOf(card);
  if (!t) return null;
  if (!/prevent/.test(t)) return null;
  if (!/damage/.test(t)) return null;
  // "prevent all damage" → Infinity
  if (/all damage|all\s+damage/.test(t)) return Infinity;
  const m = t.match(/(\d+)\s*(?:damage|poison|special)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/**
 * Opponent retreat prevention: "your opponent's active pokémon can't retreat"
 * Returns true if the stadium prevents opponent retreats.
 */
export function isStadiumRetreatPrevention(card) {
  const t = textOf(card);
  if (!t) return false;
  return /your opponent/.test(t) && /can'?t retreat|cannot retreat/.test(t);
}

/**
 * Cost modifier (continuous): "the energy cost of attacks by your Active
 * Pokémon is reduced by 1" / "attacks cost 1 less Energy" — the stadium
 * equivalent of the Section C `passiveCostDiscount` family (e.g. Lillie's
 * Room–style cost-reduction stadiums).
 * Returns the discount (number of cost symbols removed) or 0 if the
 * stadium does not reduce attack costs. Same parser shape as
 * `passiveCostDiscount` in ability-executors.mjs so the two stack cleanly.
 */
export function parseStadiumCostModifier(card) {
  const t = textOf(card);
  if (!t || !/cost/.test(t)) return 0;
  if (!/(less|reduc|lower)/.test(t)) return 0;
  const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

/**
 * Hand protection: "damage counters can't be placed on pokémon in your hand"
 * or "cards in your hand can't be discarded"
 * Returns true if the stadium protects the player's hand.
 */
export function isStadiumHandProtect(card) {
  const t = textOf(card);
  if (!t) return false;
  if (/hand/.test(t) && /(can'?t|cannot|protect|discard)/.test(t)) return true;
  if (/your hand/.test(t) && /can'?t be/.test(t)) return true;
  return false;
}

/**
 * HP modifier (continuous): "Basic Pokémon in play have +20 HP" /
 * "your Pokémon have +20 HP" / "Pokémon in play have 10 less HP".
 * Returns the modifier (positive = +HP, negative = −HP, 0 = none).
 */
export function parseStadiumHpModifier(card) {
  const t = textOf(card);
  if (!t) return 0;
  // Must mention HP explicitly
  if (!/hp/.test(t)) return 0;
  // Negative: "have N less HP" / "HP decreases by N" / "N less HP"
  if (/(less|decrease|reduc|lower)/.test(t)) {
    const m = t.match(/(\d+)\s*(?:less|hp)|decreases? by\s*(\d+)|reduced by\s*(\d+)/);
    const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 10;
    return -(n || 10);
  }
  // Positive: "+N HP" / "have N more HP" / "HP increases by N" / "N more HP"
  const m =
    t.match(/\+?(\d+)\s*(?:hp|more hp)|hp\s*(?:increases?|goes? up|raises?)\s*by\s*(\d+)|(\d+)\s*more hp/);
  const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 0;
  return n || 0;
}

/**
 * Determine the HP bonus applicable to a given player's Pokémon from the
 * current stadium. Returns a number (positive or negative, 0 if none).
 * Checks `rulesState.enabled` and stadium ownership:
 *   - "your" → only the stadium owner
 *   - "opponent" → only the non-owner
 *   - general ("all", "in play", no pronoun) → both players
 */
export function getStadiumHpBonus(targetPlayer) {
  if (!rulesState.enabled) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumHpModifier(stadium.card);
  if (bonus === 0) return 0;
  const t = textOf(stadium.card);
  // Determine who the bonus targets
  if (/your opponent|opponent's/.test(t)) {
    // Only applies to the non-owner
    return targetPlayer !== stadium.user ? bonus : 0;
  }
  if (/your pokémon|your (?!opponent)/.test(t)) {
    // Only applies to the owner
    return targetPlayer === stadium.user ? bonus : 0;
  }
  // General / both — applies to all
  return bonus;
}

/**
 * Compute effective HP for a Pokémon given a base HP and the target player.
 * Clamped to ≥ 1 so a −HP modifier can't make a Pokémon have 0 HP.
 */
export function effectiveHp(baseHp, targetPlayer) {
  const base = baseHp || 0;
  if (!base) return 0;
  const bonus = getStadiumHpBonus(targetPlayer);
  return Math.max(1, base + bonus);
}

/**
 * Evolution speed (continuous): two recognized sub-effects, mirroring the
 * Section C passive hook shape:
 *   - `relaxTurnGate` — "may evolve as if it had been in play for 1 more
 *     turn" / "as if it were already in play": the Pokémon is not treated
 *     as just-played, so the same-turn evolution gate is relaxed.
 *   - `costReduce` — "evolving costs N less Energy" / "evolutions cost N
 *     less": N energy removed from the evolution cost.
 * Returns `{ relaxTurnGate: bool, costReduce: number }`; both default to
 * their "no effect" values when the card does not grant them.
 */
export function parseStadiumEvolutionSpeed(card) {
  const t = textOf(card);
  const out = { relaxTurnGate: false, costReduce: 0 };
  if (!t || !/evolv/.test(t)) return out;
  // Turn-gate relaxer phrasings.
  if (
    /as if (?:it|they) (?:had been|were) (?:in play|already)/.test(t) ||
    /since the start of the (?:game|battle|previous turn)/.test(t) ||
    /even if (?:it|they) (?:had been|were) (?:just )?played/.test(t)
  ) {
    out.relaxTurnGate = true;
  }
  // Cost reducer: "evolving costs N less" / "evolutions cost N less Energy"
  // / "the Cost of evolving … is reduced by N".
  if (/cost/.test(t) && /(less|reduc|lower)/.test(t)) {
    const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
    if (m) out.costReduce = parseInt(m[1], 10) || 1;
  }
  return out;
}

/**
 * Determine the evolution-speed modifier applicable to a given player from
 * the current stadium, honouring the stadium's ownership targeting:
 *   - "your opponent" → only the non-owner
 *   - "your Pokémon" → only the owner
 *   - general (no pronoun) → both players
 * Returns `{ relaxTurnGate, costReduce }` (both neutral when none).
 */
export function getStadiumEvolutionSpeed(targetPlayer) {
  const neutral = { relaxTurnGate: false, costReduce: 0 };
  if (!rulesState.enabled) return neutral;
  const stadium = getStadium();
  if (!stadium?.card) return neutral;
  const parsed = parseStadiumEvolutionSpeed(stadium.card);
  if (!parsed.relaxTurnGate && parsed.costReduce === 0) return neutral;
  const t = textOf(stadium.card);
  if (/your opponent|opponent's/.test(t)) {
    return targetPlayer !== stadium.user ? parsed : neutral;
  }
  if (/your pokémon|your (?!opponent)/.test(t)) {
    return targetPlayer === stadium.user ? parsed : neutral;
  }
  return parsed;
}

// ── Execution orchestrator ─────────────────────────────────────────────

/**
 * Apply (or describe) a stadium effect. Returns:
 *   { family, executed, message, results: [] }
 *
 * For `setup-once` and `once-per-turn` families, `results` contains parsed
 * action descriptors that the *execution layer* (chat-buttons.js) can act on.
 * For `continuous-*` families, `results` describes the ongoing modifier.
 * `executed` is true when the effect is actionable (once-per-turn, setup-once),
 * false for passive/continuous effects (they don't require a player action)
 * or when the card is unparseable.
 */
export function applyStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const description = describeStadiumEffect(card);
  const results = [];

  switch (family) {
    case 'setup-once': {
      const drawN = parseStadiumSetupDraw(card);
      if (drawN) results.push({ action: 'draw', n: drawN });
      return {
        family,
        executed: true,
        message: `◈ ${description} → Draw ${drawN ?? 1} card(s).`,
        results,
      };
    }
    case 'once-per-turn': {
      const parsed = parseStadiumOncePerTurn(card);
      if (parsed) results.push({ action: parsed.kind, n: parsed.n });
      return {
        family,
        executed: true,
        message: `◈ ${description} → ${parsed ? `${parsed.kind} (${parsed.n})` : 'see card text'}.`,
        results,
      };
    }
    case 'continuous-both':
    case 'opponent-affected': {
      const prevention = parseStadiumDamagePrevention(card);
      if (prevention !== null) {
        results.push({ action: 'damage-prevention', amount: prevention });
      }
      if (isStadiumRetreatPrevention(card)) {
        results.push({ action: 'retreat-prevention', target: 'opponent' });
      }
      if (isStadiumHandProtect(card)) {
        results.push({ action: 'hand-protect' });
      }
      return {
        family,
        executed: true,
        message: `◈ ${description} (continuous — always active while in play).`,
        results,
      };
    }
    case 'none':
    case 'unknown':
    default:
      return {
        family,
        executed: false,
        message: `◈ ${description} (no recognized effect to execute)`,
        results: [],
      };
  }
}
