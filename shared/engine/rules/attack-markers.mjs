/**
 * @file Timed attack effects on in-play Pokémon (design 031).
 *
 * An attack that changes how later damage works ("During your opponent's next turn, this
 * Pokémon has no Weakness") leaves a marker on the root card: `card.attackMarkers =
 * [{ kind, untilTurn, topId, sourceAttack, ...params }]`. A marker counts only while its
 * Pokémon is Active, its turn window is open, and the Pokémon has not evolved since
 * (`topId` is the top card when the marker landed). Retreat, switch and Knock Out clear them.
 * Also reads the immunity wording ("This attack's damage isn't affected by ...").
 * Pure: no state beyond the card passed in, no randomness.
 */

import { topPokemonCard } from './evolved-pokemon.mjs';
import { isGxCard, isTagTeamCard, isVmaxCard } from './card-classify.mjs';
import { attackerTypes, cardHasAbility, isEvolutionCard, TYPE_LETTER } from './tool-combat.mjs';

/**
 * @param {object} card In-play root card
 * @param {object} marker `{ kind, untilTurn, topId?, sourceAttack?, ...params }`
 */
export function addAttackMarker(card, marker) {
  if (!card || !marker?.kind) return;
  card.attackMarkers = [...(card.attackMarkers || []), marker];
}

export function clearAttackMarkers(card) {
  if (card) delete card.attackMarkers;
}

/**
 * Markers still in force on an Active Pokémon. The caller checks the card is Active.
 * @param {object} card In-play root card
 * @param {{ turnNumber: number, zoneCards?: object[] }} options `zoneCards` holds the stack
 * @returns {object[]}
 */
export function liveAttackMarkers(card, { turnNumber, zoneCards = [] } = {}) {
  const markers = card?.attackMarkers;
  if (!Array.isArray(markers) || markers.length === 0) return [];
  const topId = topPokemonCard(zoneCards, card)?.instanceId;
  return markers.filter(
    (marker) =>
      marker.untilTurn >= turnNumber &&
      (marker.fromTurn == null || marker.fromTurn <= turnNumber) &&
      (marker.topId == null || marker.topId === topId)
  );
}

export function hasMarker(markers, kind) {
  return (markers || []).some((marker) => marker.kind === kind);
}

function stageOf(card) {
  const labels = [card?.stage, ...(card?.subtypes || [])].map((s) => String(s || '').toLowerCase());
  if (labels.includes('stage 2')) return 2;
  if (labels.includes('stage 1')) return 1;
  return isEvolutionCard(card) ? 1 : 0;
}

const FILTER_KINDS = {
  basic: (card) => !isEvolutionCard(card),
  evolution: (card) => isEvolutionCard(card),
  stage1: (card) => stageOf(card) === 1,
  stage2: (card) => stageOf(card) === 2,
  vmax: (card) => isVmaxCard(card),
  gx: (card) => isGxCard(card),
  // Uppercase "-EX" only: the old Pokémon-EX, not the modern lowercase "ex".
  EX: (card) => /-EX$/.test(String(card?.name || '')),
  tagTeam: (card) => isTagTeamCard(card),
  ability: (card) => cardHasAbility(card),
};

/**
 * Does the attacking Pokémon fall under a marker's "attacks from …" filter?
 * @param {object|null} filter `{ any: string[], types?: string[], excludeTypes?: string[], exceptName? }`
 * @param {object} attacker Attacker as its top card
 * @returns {boolean} true for a missing filter
 */
export function attackerMatchesFilter(filter, attacker) {
  if (!filter) return true;
  if (!attacker) return false;
  const types = attackerTypes(attacker);
  if (filter.any?.length && !filter.any.some((kind) => FILTER_KINDS[kind]?.(attacker))) return false;
  if (filter.types?.length && !filter.types.some((t) => types.includes(t))) return false;
  if (filter.excludeTypes?.some((t) => types.includes(t))) return false;
  if (filter.exceptName && String(attacker.name || '').toLowerCase() === filter.exceptName) return false;
  return true;
}

export const SELF_NAME = '@self';

const FILTER_PHRASES = [
  [/^basic pokémon$/, () => ({ any: ['basic'] })],
  [/^basic non-\{([a-z])\} pokémon$/, (m) => ({ any: ['basic'], excludeTypes: [TYPE_LETTER[m[1]]] })],
  [/^pokémon vmax$/, () => ({ any: ['vmax'] })],
  [/^pokémon-gx and pokémon-ex$/, () => ({ any: ['gx', 'EX'] })],
  [/^pokémon-ex$/, () => ({ any: ['EX'] })],
  [/^tag team pokémon$/, () => ({ any: ['tagTeam'] })],
  [/^evolution pokémon$/, () => ({ any: ['evolution'] })],
  [/^stage 1 or stage 2 pokémon$/, () => ({ any: ['stage1', 'stage2'] })],
  [/^stage 2 evolved pokémon$/, () => ({ any: ['stage2'] })],
  [/^\{([a-z])\} pokémon$/, (m) => ({ types: [TYPE_LETTER[m[1]]] })],
  // "except any Simisage": the parser has already turned the attacker's own name into
  // "this pokémon"; the handler swaps SELF_NAME for the attacker's printed name.
  [
    /^pokémon that have an ability(?:, except any (.+))?$/,
    (m) => ({ any: ['ability'], ...(m[1] ? { exceptName: m[1] === 'this pokémon' ? SELF_NAME : m[1] } : {}) }),
  ],
];

/**
 * @param {string|undefined} phrase The "attacks from …" tail, or undefined for all attacks
 * @returns {object|null|undefined} null = no filter, undefined = unknown wording (no step)
 */
function parseAttackerFilter(phrase) {
  if (!phrase) return null;
  const tail = phrase.replace(/^your opponent's /, '');
  for (const [re, build] of FILTER_PHRASES) {
    const m = re.exec(tail);
    if (m) return build(m);
  }
  return undefined;
}

const REMINDER_ONLY = /\(don't apply weakness and resistance for benched pokémon\.?\)/g;

/**
 * Immunity wording on an attack's own damage.
 * @param {string} text Printed attack effect text
 * @returns {{ ignoreWeakness: boolean, ignoreResistance: boolean, ignoreDefenderEffects: boolean }|null}
 */
export function parseDamageImmunity(text) {
  const lower = String(text || '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/pokemon/g, 'pokémon')
    .replace(REMINDER_ONLY, '');
  const clauses = [
    ...lower.matchAll(/damage (?:isn't|is not) affected by ([^.]*)/g),
    ...lower.matchAll(/don't apply ([^.]*)/g),
  ].map((m) => m[1]);
  if (clauses.length === 0) return null;
  const immunity = {
    ignoreWeakness: clauses.some((c) => /\bweakness\b/.test(c)),
    ignoreResistance: clauses.some((c) => /\bresistance\b/.test(c)),
    ignoreDefenderEffects: clauses.some((c) => /\beffects on\b/.test(c)),
  };
  return Object.values(immunity).some(Boolean) ? immunity : null;
}

// ── marker templates ─────────────────────────────────────────────────────────
// Same shape as rules/attack-steps.mjs TEMPLATES: anchored on a normalized, gate-stripped
// sentence ("this pokémon" = the attacker, "your opponent's active pokémon" = the defender).
// `window`: 'opponentNextTurn' (turn + 1), 'yourNextTurn' (turn + 2), 'throughYourNextTurn'
// (now until turn + 2), 'whileActive'. The parser passes `context.wrOrder` ('before'/'after')
// from a "(before/after applying Weakness and Resistance)" note it lifted off the sentence.
const WINDOW_PHRASES = [
  [/^during your opponent's next turn, (.+)$/, 'opponentNextTurn'],
  [/^(.+) during your opponent's next turn$/, 'opponentNextTurn'],
  [/^during your next turn, (.+)$/, 'yourNextTurn'],
  [/^(.+) until the end of your next turn$/, 'throughYourNextTurn'],
];

const FROM_ATTACKS = "by attacks(?: from ((?:your opponent's )?[^,]+?(?:, except any [^,]+)?))?";

// [body regex, target, required window (null = any opponent-turn window), build(m, context) => marker | null]
const MARKER_BODIES = [
  [/^this pokémon has no weakness$/, 'self', null, () => ({ kind: 'noWeakness' })],
  [
    /^this pokémon takes (\d+) less damage from attacks$/,
    'self',
    null,
    (m, { wrOrder }) => incomingReduce(m[1], undefined, wrOrder),
  ],
  [
    new RegExp(
      `^(?:prevent all effects of an attack, and )?any damage done to this pokémon ${FROM_ATTACKS} (?:is|in) reduced by (\\d+)$`
    ),
    'self',
    null,
    (m, { wrOrder }) => incomingReduce(m[2], m[1], wrOrder),
  ],
  [
    new RegExp(`^prevent all damage done to this pokémon ${FROM_ATTACKS}$`),
    'self',
    null,
    (m) => incomingPrevent(m[1]),
  ],
  // Damage part only; "effects of attacks" stays with the effect-prevention family.
  [
    /^prevent all damage from and effects of attacks done to this pokémon$/,
    'self',
    null,
    () => ({ kind: 'incomingPrevent', filter: null }),
  ],
  [
    /^if this pokémon would be damaged by an attack, prevent that attack's damage done to this pokémon if that damage is (\d+) or less$/,
    'self',
    null,
    (m) => ({ kind: 'incomingPrevent', filter: null, maxDamage: Number(m[1]) }),
  ],
  // M Diancie-EX: guards the whole side while it stays Active.
  [
    /^prevent all damage done to each of your pokémon from (your opponent's pokémon-ex)$/,
    'self',
    null,
    (m) => ({ ...incomingPrevent(m[1]), scope: 'side' }),
  ],
  [
    /^(?:your opponent's active pokémon's attacks do|attacks used by your opponent's active pokémon do) (\d+) less damage$/,
    'opponentActive',
    null,
    (m, { wrOrder }) => outgoingReduce(m[1], wrOrder),
  ],
  [
    /^any damage done by attacks from your opponent's active pokémon is reduced by (\d+)$/,
    'opponentActive',
    null,
    (m, { wrOrder }) => outgoingReduce(m[1], wrOrder),
  ],
  [
    /^this pokémon's (.+?) attack does (\d+) more damage$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBonus', amount: Number(m[2]), attackName: m[1] }),
  ],
  // "Deoxys's attacks": the parser leaves a possessive self name in place.
  [
    /^(?:attacks used by this pokémon do|each of this pokémon's attacks does|[^,]+'s attacks do) (\d+) more damage(?: to your opponent's active pokémon)?$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBonus', amount: Number(m[1]), attackName: null }),
  ],
];

function incomingReduce(amount, filterPhrase, wrOrder) {
  const filter = parseAttackerFilter(filterPhrase);
  if (filter === undefined) return null;
  return { kind: 'incomingReduce', amount: Number(amount), afterWR: wrOrder !== 'before', filter };
}

function incomingPrevent(filterPhrase) {
  const filter = parseAttackerFilter(filterPhrase);
  return filter === undefined ? null : { kind: 'incomingPrevent', filter };
}

function outgoingReduce(amount, wrOrder) {
  return { kind: 'outgoingReduce', amount: Number(amount), afterWR: wrOrder === 'after' };
}

function splitWindow(sentence) {
  for (const [re, window] of WINDOW_PHRASES) {
    const m = re.exec(sentence);
    if (m) return { window, body: m[1] };
  }
  return { window: null, body: sentence };
}

/**
 * A timed marker sentence as an `atkAddMarker` step, or null.
 * @param {string} sentence Normalized, gate-stripped sentence
 * @param {{ wrOrder?: 'before'|'after' }} [context]
 */
export function parseMarkerSentence(sentence, context = {}) {
  const { window, body } = splitWindow(sentence);
  for (const [re, target, requiredWindow, build] of MARKER_BODIES) {
    const m = re.exec(body);
    if (!m) continue;
    // Bonuses need "during your next turn"; protections need one of the opponent-turn windows.
    const windowFits = requiredWindow ? window === requiredWindow : window && window !== 'yourNextTurn';
    if (!windowFits) return null;
    const marker = build(m, context);
    return marker ? { type: 'atkAddMarker', target, window, marker } : null;
  }
  return null;
}

// Same [regex, build] shape as rules/attack-steps.mjs TEMPLATES; last in that list.
export const MARKER_TEMPLATES = [
  [/^(?:during your|.+ (?:during your opponent's|until the end of your) next turn$)/, (m, rest, context) => parseMarkerSentence(rest, context)],
];

const WINDOW_TURNS = {
  opponentNextTurn: [1, 1],
  yourNextTurn: [2, 2],
  throughYourNextTurn: [0, 2],
};

/**
 * @param {'opponentNextTurn'|'yourNextTurn'|'throughYourNextTurn'|'whileActive'} window
 * @param {number} turnNumber The attacking turn
 * @returns {number}
 */
export function markerUntilTurn(window, turnNumber) {
  // Game state round-trips through JSON, which turns Infinity into null.
  if (window === 'whileActive') return Number.MAX_SAFE_INTEGER;
  return turnNumber + (WINDOW_TURNS[window]?.[1] ?? 1);
}

/** First turn a marker counts; later-turn windows must not touch this attack's own damage. */
export function markerFromTurn(window, turnNumber) {
  return turnNumber + (WINDOW_TURNS[window]?.[0] ?? 0);
}
