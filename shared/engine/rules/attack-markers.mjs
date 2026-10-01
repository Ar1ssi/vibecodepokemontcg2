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
 * @param {{ turnNumber: number, zoneCards?: object[], sourceZoneCards?: object[] }} options
 *   `zoneCards` holds the stack; `sourceZoneCards` is the other player's Active Spot, which a
 *   presence-scoped marker (`sourceId`) needs its source in
 * @returns {object[]}
 */
export function liveAttackMarkers(card, { turnNumber, zoneCards = [], sourceZoneCards = [] } = {}) {
  const markers = card?.attackMarkers;
  if (!Array.isArray(markers) || markers.length === 0) return [];
  const topId = topPokemonCard(zoneCards, card)?.instanceId;
  return markers.filter(
    (marker) =>
      marker.untilTurn >= turnNumber &&
      (marker.fromTurn == null || marker.fromTurn <= turnNumber) &&
      (marker.topId == null || marker.topId === topId) &&
      sourceStillActive(marker, sourceZoneCards)
  );
}

/**
 * Leer "can't attack Cyndaquil … (Benching or evolving either Pokémon ends this effect)", Mean
 * Look "as long as Murkrow remains your Active Pokémon": the marker holds only while the
 * Pokémon that set it is still that Active Pokémon, unevolved.
 */
function sourceStillActive(marker, sourceZoneCards) {
  if (marker.sourceId == null) return true;
  const source = sourceZoneCards.find((c) => c.instanceId === marker.sourceId && !c.attachedTo);
  if (!source) return false;
  return marker.sourceTopId == null || topPokemonCard(sourceZoneCards, source)?.instanceId === marker.sourceTopId;
}

export function hasMarker(markers, kind) {
  return (markers || []).some((marker) => marker.kind === kind);
}

/** Does a statusImmunity marker stop `condition` ("Poisoned", …) landing? */
export function markersBlockCondition(markers, condition) {
  const wanted = String(condition || '').toLowerCase();
  return (markers || []).some(
    (marker) =>
      marker.kind === 'statusImmunity' &&
      (marker.conditions == null || marker.conditions.some((c) => c.toLowerCase() === wanted))
  );
}

/** A `healLock` marker in force on `card` (an in-play root) at `turnNumber`. */
export function healLocked(card, turnNumber) {
  return (card?.attackMarkers || []).some(
    (marker) =>
      marker.kind === 'healLock' &&
      marker.untilTurn >= turnNumber &&
      (marker.fromTurn == null || marker.fromTurn <= turnNumber)
  );
}

/**
 * Does an `effectPrevent` marker ("prevent all effects of attacks … done to this Pokémon")
 * stop an attack's effects from `attacker` (its top card) landing on the marked Pokémon?
 */
export function markersPreventEffects(markers, attacker) {
  return (markers || []).some((marker) => marker.kind === 'effectPrevent' && attackerMatchesFilter(marker.filter, attacker));
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
  // "Pokémon-ex" of the EX era (Deoxys ex): normalized text cannot tell it from "Pokémon-EX".
  exEra: (card) => / ex$/.test(String(card?.name || '')),
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
  // `attackEnergyCount` is stamped by reduce.mjs when the attack resolves; unknown never matches.
  if (filter.maxEnergy != null && !((attacker.attackEnergyCount ?? Infinity) <= filter.maxEnergy)) return false;
  return true;
}

export const SELF_NAME = '@self';

const FILTER_PHRASES = [
  [/^basic pokémon$/, () => ({ any: ['basic'] })],
  [/^basic non-\{([a-z])\} pokémon$/, (m) => ({ any: ['basic'], excludeTypes: [TYPE_LETTER[m[1]]] })],
  [/^pokémon vmax$/, () => ({ any: ['vmax'] })],
  [/^pokémon-gx and pokémon-ex$/, () => ({ any: ['gx', 'EX'] })],
  [/^pokémon-ex$/, () => ({ any: ['EX'] })],
  [/^pokémon-ex-era$/, () => ({ any: ['exEra'] })],
  [/^tag team pokémon$/, () => ({ any: ['tagTeam'] })],
  [/^evolution pokémon$/, () => ({ any: ['evolution'] })],
  [/^stage 1 or stage 2 pokémon$/, () => ({ any: ['stage1', 'stage2'] })],
  [/^stage 2 evolved pokémon$/, () => ({ any: ['stage2'] })],
  [/^\{([a-z])\} pokémon$/, (m) => ({ types: [TYPE_LETTER[m[1]]] })],
  // Dusknoir Night Spin: "by your opponent's Pokémon that has 2 or less Energy attached to it".
  [/^pokémon that has (\d+) or less energy attached to it$/, (m) => ({ maxEnergy: Number(m[1]) })],
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
// A third element rewrites the body so a condition folded into the window survives.
const WINDOW_PHRASES = [
  [/^during your opponent's next turn, (.+)$/, 'opponentNextTurn'],
  [/^at the end of your opponent's next turn, (.+)$/, 'opponentNextTurn', (body) => `at the end of the turn, ${body}`],
  [
    /^if an attack does damage to this pokémon during your opponent's next turn, (.+)$/,
    'opponentNextTurn',
    (body) => `if this pokémon is damaged by an attack, ${body}`,
  ],
  // Cubone Snivel / Chikorita Growl: "If the Defending Pokémon attacks Cubone during your
  // opponent's next turn, any damage done by the attack is reduced by 20 …".
  [
    /^if your opponent's active pokémon attacks this pokémon during your opponent's next turn, (.+)$/,
    'opponentNextTurn',
    (body) => `when it attacks this pokémon, ${body}`,
  ],
  [/^(.+) during your opponent's next turn$/, 'opponentNextTurn'],
  [/^during your next turn, (.+)$/, 'yourNextTurn'],
  // Marshadow Shadow Flicker: "If the Defending Pokémon is Knocked Out during your next
  // turn, take N more Prize cards." Rewrites to the clause form the marker body reads.
  [
    /^if your opponent's active pokémon is knocked out during your next turn, (.+)$/,
    'yourNextTurn',
    (body) => `if your opponent's active pokémon is knocked out, ${body}`,
  ],
  [/^(.+) until the end of your next turn$/, 'throughYourNextTurn'],
  [/^until the end of your next turn, (.+)$/, 'throughYourNextTurn'],
  // Older wording: "Your opponent can't attach Energy … during his or her next turn."
  [/^(.+) during their next turn$/, 'opponentNextTurn'],
];

// "poké-powers" → 'power' (the kinds attack-damage-context.mjs abilityKinds reports).
const abilityKindWord = (word) => (/power/.test(word) ? 'power' : /bod/.test(word) ? 'body' : 'ability');

// "{c}{c}" → 2
const symbolCount = (symbols) => (String(symbols).match(/\{[a-z]\}/g) || []).length;

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
  // Jirachi-GX Star Shield-GX, Celebi ex Psychic Shield ("… by your opponent's Pokémon-ex"),
  // Aerodactyl Speed Stroke ("… by attacks from your opponent's Pokémon-ex"): damage and every
  // other effect of the attack.
  [
    new RegExp(
      `^prevent all effects(?: of (?:an attack|attacks?))?, including damage, done to this pokémon(?: (?:by (your opponent's [^,]+?)|${FROM_ATTACKS}))?$`
    ),
    'self',
    null,
    (m) => {
      const filter = parseAttackerFilter(m[1] || m[2]);
      return filter === undefined ? null : [{ kind: 'incomingPrevent', filter }, { kind: 'effectPrevent', filter }];
    },
  ],
  // Entei Protective Flame: each of the attacker's Benched Pokémon (atkAddMarker 'ownBench').
  [
    /^prevent all effects of attacks, including damage, done to your benched pokémon$/,
    'ownBench',
    null,
    () => [
      { kind: 'incomingPrevent', filter: null },
      { kind: 'effectPrevent', filter: null },
    ],
  ],
  // Latios-EX / Slurpuff Light Pulse ("except damage"), Light Dragonite ("other than damage"),
  // Venomoth ("excluding damage"), Altaria ex Light Pulse ("attacks used by your opponent's
  // Pokémon done to this Pokémon", reminder "Damage is not an effect").
  [
    /^prevent all effects of (?:your opponent's attacks|attacks|an attack)(?: used by your opponent's pokémon)?(?:, (?:except|other than|excluding) damage,)? done to this pokémon$/,
    'self',
    null,
    () => ({ kind: 'effectPrevent', filter: null }),
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
  // Snivel reduces all the attack's damage, Growl only the damage done to Chikorita
  // (`toSource`). Either holds only while the attacker stays the Active Pokémon it attacks.
  [
    /^when it attacks this pokémon, any damage done (by the attack|to this pokémon) is reduced by (\d+)$/,
    'opponentActive',
    null,
    (m, { wrOrder }) => ({
      ...outgoingReduce(m[2], wrOrder),
      whileSourceActive: true,
      ...(m[1] === 'to this pokémon' ? { toSource: true } : {}),
    }),
  ],
  [
    /^this pokémon's (.+?) attack does (\d+) more damage$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBonus', amount: Number(m[2]), attackName: m[1] }),
  ],
  // Metang: "During your next turn, Extra Comet Punch does 30 damage plus 30 more damage."
  [
    /^(?!this attack\b)([a-z][a-z' -]*?) does \d+ damage plus (\d+) more damage$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBonus', amount: Number(m[2]), attackName: m[1] }),
  ],
  // Vespiquen Mach Wind: read by the Retreat cost while the Pokémon is Active. The
  // possessive self name stays in place ("vespiquen's"); an apostrophe-free name excludes
  // "your opponent's active pokémon's".
  [/^(?:this pokémon|[a-z .-]+)'s retreat cost is 0$/, 'self', 'yourNextTurn', () => ({ kind: 'freeRetreat' })],
  // "Deoxys's attacks": the parser leaves a possessive self name in place.
  [
    /^(?:attacks used by this pokémon do|each of this pokémon's attacks does|[^,]+'s attacks do) (\d+) more damage(?: to your opponent's active pokémon)?$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBonus', amount: Number(m[1]), attackName: null }),
  ],
  // Design 036 A7/A8a. "Takes N more damage" / "is increased by N": computeAttackDamage adds
  // it when the attack does damage (after Weakness and Resistance unless printed before).
  [
    /^(?:this pokémon takes (\d+) more damage from attacks|any damage done to this pokémon by attacks is increased by (\d+))$/,
    'self',
    null,
    (m, { wrOrder }) => incomingBonus(m[1] || m[2], wrOrder),
  ],
  [
    /^(?:your opponent's active pokémon takes (\d+) more damage from attacks|any damage done to your opponent's active pokémon by attacks is increased by (\d+))$/,
    'opponentActive',
    'yourNextTurn',
    (m, { wrOrder }) => incomingBonus(m[1] || m[2], wrOrder),
  ],
  // Armaldo Crush Claw / Dustox ex Silver Wind ("During your next turn, if an attack does damage
  // to the Defending Pokémon …, that attack does 40 more damage") and Sharpedo Crunch ("… to
  // that Pokémon until the end of your next turn"): the same incoming bonus on the defender.
  [
    /^if an attack does damage to your opponent's active pokémon, that attack does (\d+) more damage(?: to that pokémon)?$/,
    'opponentActive',
    ['yourNextTurn', 'throughYourNextTurn'],
    (m, { wrOrder }) => incomingBonus(m[1], wrOrder),
  ],
  // Oranguru: only the Weakness type changes, not its amount.
  [
    /^your opponent's active pokémon's weakness is now \{([a-z])\}$/,
    'opponentActive',
    'throughYourNextTurn',
    (m) => (TYPE_LETTER[m[1]] ? { kind: 'weaknessOverride', type: TYPE_LETTER[m[1]] } : null),
  ],
  // Flapple V / Mawile: read by attackCostPayable and computeEffectiveRetreatCost.
  [
    /^(?:your opponent's active pokémon's attacks|attacks used by your opponent's active pokémon) cost ((?:\{[a-z]\})+) more(?:, and its retreat cost is ((?:\{[a-z]\})+) more)?$/,
    'opponentActive',
    null,
    (m) => [
      { kind: 'attackCostIncrease', count: symbolCount(m[1]) },
      ...(m[2] ? [{ kind: 'retreatDelta', amount: symbolCount(m[2]) }] : []),
    ],
  ],
  [
    /^your opponent's active pokémon's retreat cost is ((?:\{[a-z]\})+) more$/,
    'opponentActive',
    null,
    (m) => ({ kind: 'retreatDelta', amount: symbolCount(m[1]) }),
  ],
  // Design 036 A8b. Energy attach lock on the Defending Pokémon, read by attachCard legality.
  [
    /^(?:your opponent can't attach (?:any )?(special )?energy(?: cards)? (?:from their hand )?to (?:your opponent's|their|the) active pokémon|energy cards can't be attached from your opponent's hand to (?:your opponent's active pokémon|that pokémon))$/,
    'opponentActive',
    null,
    (m) => ({ kind: 'attachLock', ...(m[1] ? { specialOnly: true } : {}) }),
  ],
  // Dark Omastar Dark Tentacle: blocks evolving from the hand only.
  [
    /^your opponent's active pokémon can't evolve(?: except from effects of attacks or pokémon powers)?$/,
    'opponentActive',
    null,
    () => ({ kind: 'evolveLock' }),
  ],
  // Eevee Tail Wag / Rhyhorn, Cyndaquil, Totodile Leer / Giovanni's Nidoking Intimidate: "the
  // Defending Pokémon can't attack Eevee during your opponent's next turn. (Benching either
  // Pokémon ends this effect.)" Every attack is made against the Active Pokémon, so the lock
  // holds while the attacker stays that Active Pokémon (`whileSourceActive`).
  [
    /^(?:it|your opponent's active pokémon) can't attack this pokémon$/,
    'opponentActive',
    null,
    () => ({ kind: 'cantAttack', whileSourceActive: true }),
  ],
  // Lunala-GX Moongeist Beam: "The Defending Pokémon can't be healed during your opponent's next turn."
  [/^your opponent's active pokémon can't be healed$/, 'opponentActive', null, () => ({ kind: 'healLock' })],
  // Shiftry Seal Off: "The Defending Pokémon can't use any Poké-Powers or Poké-Bodies …";
  // Umbreon ex Black Cry: "… can't retreat or use any Poké-Powers …" (the retreat half is
  // attack-effects.mjs parseNextTurnLock's).
  [
    /^your opponent's active pokémon can't (?:retreat or )?use any (poké-powers|poké-bodies|abilities)(?: or (poké-powers|poké-bodies))?$/,
    'opponentActive',
    null,
    (m) => ({ kind: 'abilityLock', abilityKinds: [m[1], m[2]].filter(Boolean).map(abilityKindWord) }),
  ],
  // Goodra Shining Breath / Bayleef Pollen Shield. `conditions: null` blocks every one.
  [/^this pokémon can't (?:be|become) affected by (?:any special conditions|a special condition)$/, 'self', null, () => ({ kind: 'statusImmunity', conditions: null })],
  [
    /^this pokémon can't become ((?:asleep|burned|confused|paralyzed|poisoned)(?:,? (?:or )?(?:asleep|burned|confused|paralyzed|poisoned))*)$/,
    'self',
    null,
    (m) => ({
      kind: 'statusImmunity',
      conditions: m[1].match(/asleep|burned|confused|paralyzed|poisoned/g).map((c) => c[0].toUpperCase() + c.slice(1)),
    }),
  ],
  // "During your next turn, this Pokémon's X attack's base damage is N": computeAttackDamage
  // swaps the printed base for the named attack. Possessive self names stay in place.
  [
    /^(?:(?:this pokémon|[^,]+)'s )?([^,]+?)(?: attack)?'s base damage is (\d+)(?: instead of \d+)?$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBaseDamage', attackName: m[1], value: Number(m[2]) }),
  ],
  [
    /^base damage of (?:this pokémon|[^,]+)'s ([^,]+?)(?: is attack)? is (\d+) instead of \d+$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBaseDamage', attackName: m[1], value: Number(m[2]) }),
  ],
  [
    /^(?:this pokémon|[^,]+)'s ([^,]+?) attack does (\d+) damage instead of \d+$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBaseDamage', attackName: m[1], value: Number(m[2]) }),
  ],
  // Lt. Surge's Raticate [Gym Challenge 53] Focus Energy: the recoil doubles too.
  [
    /^(?:this pokémon|[^,]+)'s ([^,]+?)(?: attack)?'s base damage and damage to itself are doubled$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBaseDamage', attackName: m[1], doubled: true, selfDamageDoubled: true }),
  ],
  [
    /^(?:this pokémon|[^,]+)'s ([^,]+?)(?: attack)?'s (?:base )?damage(?: \([^)]*\))? is doubled$/,
    'self',
    'yourNextTurn',
    (m) => ({ kind: 'nextTurnBaseDamage', attackName: m[1], doubled: true }),
  ],
  // Galarian Slowking V Word of Ruin: resolveCheckup knocks the marked Pokémon out.
  [
    /^at the end of the turn, your opponent's active pokémon will be knocked out$/,
    'opponentActive',
    null,
    () => ({ kind: 'deferredKnockOut' }),
  ],
  // Ribombee Plentiful Pollen / Marshadow Shadow Flicker: `handleKnockout` pays the
  // marker's count when the marked Pokémon is Knocked Out inside the next-turn window.
  [
    /^if your opponent's active pokémon is knocked out, take (\d+) more prize cards?$/,
    'opponentActive',
    'yourNextTurn',
    (m) => ({ kind: 'prizeBonus', count: Number(m[1]) }),
  ],
  // Wobbuffet BREAK / Rocket's Moltres: strike back at the Pokémon that damaged this one.
  [
    /^if this pokémon is damaged by an attack, put damage counters on the attacking pokémon equal to the damage done to this pokémon$/,
    'self',
    null,
    () => ({ kind: 'retaliate', mode: 'counters' }),
  ],
  // Dracozolt VMAX Spark Trap, Turtonator-GX Shell Trap, Iron Boulder ex Repulsor Axe.
  [
    /^if this pokémon is damaged by an attack(?: \(even if (?:it|this pokémon) is knocked out\))?, (?:put|place) (\d+) damage counters on the attacking pokémon$/,
    'self',
    null,
    (m) => ({ kind: 'retaliate', mode: 'fixedCounters', count: Number(m[1]) }),
  ],
  [
    /^if this pokémon is damaged by an attack, this pokémon attacks your opponent's active pokémon for (\d+) damage$/,
    'self',
    null,
    (m) => ({ kind: 'retaliate', mode: 'attack', amount: Number(m[1]) }),
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

function incomingBonus(amount, wrOrder) {
  return { kind: 'incomingBonus', amount: Number(amount), afterWR: wrOrder !== 'before' };
}

function outgoingReduce(amount, wrOrder) {
  return { kind: 'outgoingReduce', amount: Number(amount), afterWR: wrOrder === 'after' };
}

function splitWindow(sentence) {
  for (const [re, window, rewrite] of WINDOW_PHRASES) {
    const m = re.exec(sentence);
    if (m) return { window, body: rewrite ? rewrite(m[1]) : m[1] };
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
    const windowFits = Array.isArray(requiredWindow)
      ? requiredWindow.includes(window)
      : requiredWindow
        ? window === requiredWindow
        : window && window !== 'yourNextTurn';
    if (!windowFits) return null;
    const built = build(m, context);
    // One sentence can set two markers ("… cost {c} more, and its retreat cost is {c} more").
    const [marker, ...alsoMarkers] = Array.isArray(built) ? built : [built];
    if (!marker) return null;
    return { type: 'atkAddMarker', target, window, marker, ...(alsoMarkers.length ? { alsoMarkers } : {}) };
  }
  return null;
}

// Same [regex, build] shape as rules/attack-steps.mjs TEMPLATES; last in that list.
export const MARKER_TEMPLATES = [
  [
    /^(?:during your|at the end of your opponent's next turn|if an attack does damage to this pokémon during|if your opponent's active pokémon attacks this pokémon during your opponent's next turn, |if your opponent's active pokémon is knocked out during your next turn|until the end of your next turn, |.+ (?:during your opponent's|during their|until the end of your) next turn$)/,
    (m, rest, context) => parseMarkerSentence(rest, context),
  ],
  // Locks with no turn window. Ariados Spider Web / Piloswine Freeze print "(Benching or evolving
  // that Pokémon ends this effect.)": a marker clears on the Bench and tracks the top card.
  // Murkrow Mean Look adds "as long as Murkrow remains your Active Pokémon".
  [
    /^your opponent's active pokémon can't (attack|retreat)( as long as this pokémon remains your active pokémon)?$/,
    (m) => ({
      type: 'atkAddMarker',
      target: 'opponentActive',
      window: 'whileActive',
      marker: { kind: m[1] === 'attack' ? 'cantAttack' : 'cantRetreat', ...(m[2] ? { whileSourceActive: true } : {}) },
    }),
  ],
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
