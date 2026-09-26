// Pure parsers for the remaining Section C ability families
// (taxonomy docs/card-types-taxonomy.md §C): passive, when-played,
// end-of-turn, damage-prevent, hand-protect, opponent-disrupt.
//
// DOM-free and node:test friendly. Execution lives in chat-buttons.js /
// the attack path; this module only extracts *what* a card does from its
// printed ability text.

import { isBasicPokemon, isPokemon, isEnergy } from '../cards.mjs';
import { isExCard, isGxCard, isVCard, isVmaxCard, isTeraCard } from './card-classify.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const firstAbilityText = (card) => {
  const arr = Array.isArray(card?.abilities) ? card.abilities : [];
  if (arr.length === 0) return '';
  const first = arr[0];
  return typeof first === 'string' ? first : first?.text || '';
};

// The single ability-text accessor for the engine, lowercased for matching.
// Server-hydrated cards carry abilities as a plural array only; without the
// `firstAbilityText` fallback every text-driven parser saw an empty string and
// silently skipped the card's ability (I128), so passive consumers must read
// text through here rather than off `card.ability` directly.
export const cardAbilityText = (card) =>
  lower(
    card?.ability?.text ??
      card?.abilityText ??
      card?.text ??
      card?.effect ??
      firstAbilityText(card)
  );

const textOf = cardAbilityText;

// --- position ----------------------------------------------------------

// Whether the ability is printed as a conditional on THIS Pokémon's position, which gates where it
// may be activated from. The wording has to be the restrictive clause, not a bare mention of the
// Active Spot: "when this Pokémon moves from your Bench to the Active Spot" is a trigger that fires
// on the move and stays legal from the Bench, and "As long as this Pokémon is in the Active Spot …"
// is a passive with nothing to activate. Matching either of those would disable a legal ability,
// which costs more than the over-permissive behavior this replaces.
const ACTIVE_SPOT_CLAUSE = /if this pok[eé]mon is (?:in the active spot|active|your active pok[eé]mon)\b/;

export function requiresActiveSpot(card) {
  return ACTIVE_SPOT_CLAUSE.test(textOf(card));
}

// Legacy powers: "This power can't be used if <this Pokémon> is Asleep, Confused, or Paralyzed"
// ('rotation') or "… is affected by a Special Condition" ('any'); null when unrestricted.
export function powerConditionRestriction(card) {
  const match = textOf(card).match(
    /power can't be used if [\s\S]*?(asleep, confused, or paralyzed|affected by a special condition)/
  );
  if (!match) return null;
  return match[1].startsWith('asleep') ? 'rotation' : 'any';
}

// Ditto Transformative Start, Fan Call, Abnormal Outbreak: "Once during your first turn, …".
export function requiresFirstTurn(card) {
  return /once during your first turn\b/.test(textOf(card));
}

// Luxray Swelling Flash / Klinklang Emergency Rotation ("if this Pokémon is in your hand"),
// Charjabug Battery ("attach this card from your hand"): activated from the hand, not play.
const HAND_ACTIVATION_CLAUSE =
  /if this pok[eé]mon is in your hand(?! when you are setting up)|attach this card from your hand/;

export function isHandActivatedAbility(card) {
  return HAND_ACTIVATION_CLAUSE.test(textOf(card));
}

// Marshadow Resetting Hole: "if this Pokémon is on your Bench, you may …".
const BENCH_SPOT_CLAUSE = /if this pok[eé]mon is on your bench\b/;

export function requiresBenchSpot(card) {
  return BENCH_SPOT_CLAUSE.test(textOf(card));
}

// "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn"
// (Fezandipiti ex Flip the Script) is only activatable the turn after such a Knockout.
const OPPONENT_TURN_KO_CLAUSE = /knocked out during your opponent.s last turn/;

export function requiresKoOnOpponentTurn(card) {
  return OPPONENT_TURN_KO_CLAUSE.test(textOf(card));
}

// "When you play this Pokémon from your hand to evolve 1 of your Pokémon"
// (Primarina Enriching Melody) is a one-shot trigger, legal only on the turn
// that Pokémon was played. Distinct from the played-to-Bench wording, which
// has its own one-shot window.
const EVOLVE_PLAYED_CLAUSE =
  /when you play this pok[eé]mon from your hand to evolve\b/;

function matchesFirstAbilityOrText(card, clause) {
  const arrText =
    Array.isArray(card?.abilities) && card.abilities.length > 0
      ? typeof card.abilities[0] === 'string'
        ? card.abilities[0]
        : card.abilities[0]?.text
      : '';
  return clause.test(textOf(card)) || clause.test(lower(arrText || ''));
}

export function isEvolvePlayedTrigger(card) {
  return matchesFirstAbilityOrText(card, EVOLVE_PLAYED_CLAUSE);
}

// "When you play this Pokémon from your hand onto your Bench during your turn"
// (Meowth ex Last Ditch Catch) is a one-shot trigger: legal only while the
// Pokémon is still on the Bench the turn it was played there from hand.
const BENCH_PLAYED_CLAUSE =
  /when you play this pok[eé]mon from your hand (?:on)?to your bench\b/;

export function isBenchPlayedTrigger(card) {
  return matchesFirstAbilityOrText(card, BENCH_PLAYED_CLAUSE);
}

// Wording that makes an ability something the player activates. Anything else is a passive
// ("As long as…", "Prevent all damage…") or an automatic trigger ("If this Pokémon is Knocked
// Out…", "Whenever your opponent attaches…") that must never run from the ability button.
// Checked over the full corpus (S266): every non-matching text is a passive or trigger.
const ACTIVATED_ABILITY_CLAUSE =
  /once during your turn|during your (?:first )?turn\b[^.]*?\byou may\b|at any time during your turn|once during a game on your turn|you may use this ability|as often as you like|once per turn|when you play [^.]*?from your hand/;

export function isActivatedAbility(card, abilityIndex = 0) {
  const ability = Array.isArray(card?.abilities) ? card.abilities[abilityIndex] : null;
  const text = typeof ability === 'string' ? ability : ability?.text;
  return ACTIVATED_ABILITY_CLAUSE.test(text != null ? lower(text) : textOf(card));
}

// --- passive -----------------------------------------------------------

// How many cost symbols a passive ability removes from attacks.
// "reduce the cost … by 1" / "attacks cost 1 less" / "attacks cost {C}{C} less" → 1 / 1 / 2;
// "cost less" → 1.
//
// A false positive here silently removes a cost from combat, which is far worse than missing an
// exotic wording, so one sentence has to say that an ATTACK's COST goes DOWN. Earlier versions
// matched loose keywords across the whole card text: mentioning Energy made Charmander's Live
// Coal free, and "takes 30 less damage from attacks" (I157) — a reduction wording, printed on
// abilities and on attack text alike — discounted every attack by 30, i.e. made them free.
// Retreat Cost wordings are parseRetreatCostModifier's and never mention an attack's cost.
const ATTACK_COST_REDUCTION = [
  /\battacks?\b[^.]*?\bcosts?\b[^.]*?\b(?:less|fewer)\b/,
  /\bcosts? of [^.]*?\battacks?\b[^.]*?\b(?:reduced|less|fewer|lower|decreased)\b/,
  /\breduce the (?:energy )?cost of [^.]*?\battacks?\b/,
];

const COST_SYMBOL_TYPE = {
  g: 'Grass', r: 'Fire', w: 'Water', l: 'Lightning', p: 'Psychic',
  f: 'Fighting', d: 'Darkness', m: 'Metal', y: 'Fairy', n: 'Dragon',
};

const rootsIn = (cards = []) => (cards || []).filter((c) => c && !c.attachedTo && isPokemon(c));

// Whose attacks the discount covers, checked against the attacker (for a Tool, its host).
function discountCoversAttacker(sentence, attacker) {
  const name = lower(attacker?.name);
  if (/hop's pok[eé]mon/.test(sentence) && !name.startsWith("hop's")) return false;
  if (/tera pok[eé]mon/.test(sentence) && !isTeraCard(attacker)) return false;
  if (/pok[eé]mon-gx[^.]*evolve from eevee/.test(sentence)) {
    if (!isGxCard(attacker) || lower(attacker?.evolvesFrom) !== 'eevee') return false;
  }
  const named = sentence.match(/pok[eé]mon v this card is attached to has ([^.]*?) in its name/);
  if (named) {
    const names = [...named[1].matchAll(/["“]([a-z]+),?["”]/g)].map((m) => m[1]);
    if (!isVCard(attacker) || !names.some((n) => name.includes(n))) return false;
  }
  return true;
}

// "If …" clauses a discount is printed behind: true / false from ctx, undefined when the clause
// is not this condition. Anything unrecognised fails closed.
const DISCOUNT_CONDITIONS = [
  (c, ctx) => {
    const m = c.match(/you have exactly (\d+) cards? in your hand/);
    if (!m) return undefined;
    return ctx.ownHandCount != null && ctx.ownHandCount === Number(m[1]);
  },
  (c, ctx) => {
    if (!/your opponent has any pok[eé]mon/.test(c)) return undefined;
    const opp = rootsIn(ctx.opponentSideCards);
    const wantVmax = /vmax/.test(c);
    const wantGxEx = /pok[eé]mon-gx or pok[eé]mon-ex/.test(c);
    if (!wantVmax && !wantGxEx) return undefined;
    return opp.some((p) => (wantVmax && isVmaxCard(p)) || (wantGxEx && (isGxCard(p) || isExCard(p))));
  },
  (c, ctx) => {
    if (!/you have more prize cards remaining than your opponent/.test(c)) return undefined;
    if (ctx.ownPrizesLeft == null || ctx.opponentPrizesLeft == null) return false;
    return ctx.ownPrizesLeft > ctx.opponentPrizesLeft;
  },
  (c, ctx) => {
    // "If you have Regirock, Regice, and Registeel in play": each named Pokémon on your side.
    const m = c.match(/^you have ([^,]+(?:, [^,]+)*?(?:,? and [^,]+)?) in play$/);
    if (!m || /pok[eé]mon|\{/.test(m[1])) return undefined;
    const names = m[1].split(/, and |, | and /).map((n) => n.trim()).filter(Boolean);
    const own = rootsIn(ctx.ownSideCards).map((p) => lower(p.name));
    return names.every((n) => own.some((o) => o.includes(n)));
  },
  // The Tool naming itself ("As long as <Tool> is attached to a Pokémon") always holds here.
  (c) => (/is attached to a pok[eé]mon$/.test(c) ? true : undefined),
  // A host filter, checked by discountCoversAttacker.
  (c) => (/this card is attached to has/.test(c) ? true : undefined),
];

// "for each …" units the discount scales by, or null when the unit is not read.
function discountUnits(sentence, ctx) {
  const each = sentence.match(/for each ([^.]+)/)?.[1];
  if (!each) return 1;
  const opp = rootsIn(ctx.opponentSideCards);
  if (/kofu card in your discard pile/.test(each)) {
    return (ctx.ownDiscard || []).filter((c) => lower(c.name).includes('kofu')).length;
  }
  if (/your opponent's benched pok[eé]mon/.test(each)) {
    return opp.filter((p) => !(ctx.opponentActive || []).includes(p)).length;
  }
  if (/prize card your opponent has taken/.test(each)) {
    return ctx.opponentPrizesLeft == null ? null : Math.max(0, 6 - ctx.opponentPrizesLeft);
  }
  if (/your opponent's pok[eé]mon v in play/.test(each)) return opp.filter((p) => isVCard(p)).length;
  if (/single strike, rapid strike, and fusion strike/.test(each)) {
    return opp.filter((p) =>
      (p.subtypes || []).some((t) => /single strike|rapid strike|fusion strike/i.test(t))
    ).length;
  }
  if (/team plasma pok[eé]mon/.test(each)) {
    return opp.filter((p) => /plasma/.test(`${lower(p.name)} ${lower((p.subtypes || []).join(' '))}`)).length;
  }
  return null;
}

/**
 * What an attack-cost discount printed on `source` (the attacker's own Ability, or a Tool
 * attached to it) takes off this attack: `{ count, symbol }` — `symbol` is the Energy type a
 * typed discount ("{Y} less") removes, null for Colorless/any. Null when nothing applies.
 * `ctx`: `{ attacker, ownHandCount, ownPrizesLeft, opponentPrizesLeft, ownSideCards,
 * opponentSideCards, opponentActive, ownDiscard }`; a condition or "for each" unit it cannot check fails closed
 * (I160). Only a sentence saying an attack's cost goes down is read (I157).
 */
export function costDiscountRead(source, ctx = {}) {
  const t = textOf(source);
  if (!t) return null;
  const sentence = t
    .split(/[.\n]/)
    .find((s) => !/retreat cost/.test(s) && ATTACK_COST_REDUCTION.some((re) => re.test(s)));
  if (!sentence) return null;
  const attacker = ctx.attacker || source;
  if (!discountCoversAttacker(sentence, attacker)) return null;
  // A list of names has its own commas: "If you have Regirock, Regice, and Registeel in play, …".
  const lead = sentence.trim();
  const clause = (lead.match(/^(?:if|as long as) (.+? in play),/) || lead.match(/^(?:if|as long as) (.+?),/))?.[1];
  if (clause) {
    const verdicts = DISCOUNT_CONDITIONS.map((check) => check(clause, ctx));
    if (verdicts.every((v) => v === undefined) || verdicts.some((v) => v === false)) return null;
  }
  const units = discountUnits(sentence, ctx);
  if (!units) return null;
  const symbols = sentence.match(/((?:\{[a-z]\})+)\s*(?:energy\s*)?(?:less|fewer)/);
  let per = 1;
  let symbol = null;
  if (symbols) {
    const letters = symbols[1].match(/[a-z]/g);
    per = letters.length;
    symbol = letters[0] === 'c' ? null : COST_SYMBOL_TYPE[letters[0]] || null;
  } else {
    const by = sentence.match(/\bby\s*(\d+)/) || sentence.match(/(\d+)\s+(?:energy\s+)?(?:less|fewer)/);
    if (by) per = parseInt(by[1], 10) || 1;
  }
  return { count: per * units, symbol };
}

/** The discount `card` grants as a symbol count (see `costDiscountRead`); 0 when none applies. */
export function passiveCostDiscount(card, ctx = {}) {
  return costDiscountRead(card, ctx)?.count || 0;
}

/**
 * Apply cost discounts: a typed one ("{Y} less") removes that many matching symbols; a
 * Colorless one drops symbols from the end of the cost (where Colorless is printed).
 * `discount` may be a count (Colorless) or a list of `costDiscountRead` results.
 */
export function applyCostDiscount(cost = [], discount = 0) {
  const reads = Array.isArray(discount) ? discount : [{ count: discount, symbol: null }];
  let out = [...cost];
  let generic = 0;
  for (const read of reads) {
    if (!read?.count) continue;
    if (!read.symbol) {
      generic += read.count;
      continue;
    }
    for (let i = 0; i < read.count; i++) {
      const at = out.lastIndexOf(read.symbol);
      if (at < 0) break;
      out.splice(at, 1);
    }
  }
  return out.slice(0, Math.max(0, out.length - generic));
}

// --- when-played -------------------------------------------------------

// One-shot "When you play this Pokémon" effect. Returns the parsed action:
// { kind: 'draw' | 'damage' | 'search', n } or null if unparseable.
export function parseWhenPlayedEffect(card) {
  const t = textOf(card);
  if (!t.includes('when you play')) return null;
  if (/draw/i.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)?/);
    return { kind: 'draw', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/damage counter/.test(t)) {
    const m = t.match(/(\d+)\s+damage/);
    return { kind: 'damage', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/search|look through|find/.test(t)) {
    return { kind: 'search', n: 1 };
  }
  return null;
}

// --- end-of-turn -------------------------------------------------------

// "At the end of your turn, draw N" style triggers.
// Returns { kind: 'draw' | 'search', n } or null.
export function parseEndOfTurnEffect(card) {
  const t = textOf(card);
  if (!t || !/end of your turn/.test(t)) return null;
  if (/draw/i.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)?/);
    return { kind: 'draw', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/search|look through|find/.test(t)) return { kind: 'search', n: 1 };
  return null;
}

// --- damage-prevent ----------------------------------------------------

// { preventAll: bool, reduce: number, reduceHp: number } — `reduceHp` is in HP
// units, which is what the printed "damage is reduced by N" actually means
// (I130: reading it as counters and multiplying by 10 turned a 20-damage
// reduction into full prevention). `reduce` stays the counter-unit field for
// callers that feed counters.
export function parseDamagePrevention(card) {
  const t = textOf(card);
  const out = { preventAll: false, reduce: 0, reduceHp: 0 };
  if (!t) return out;
  if (
    /prevent (all )?(damage|effect)/.test(t) ||
    t.includes("can't be damaged")
  ) {
    out.preventAll = true;
    return out;
  }
  // "The Retreat Cost … is reduced by N" is a retreat modifier, not damage
  // prevention (same guard as passiveCostDiscount).
  if (/retreat/.test(t) && !/damage/.test(t)) return out;
  const m = t.match(/reduc(?:e|ed).*?(\d+)/);
  if (m) out.reduceHp = parseInt(m[1], 10) || 0;
  return out;
}

// Apply prevention to an incoming damage amount (HP units).
export function applyDamagePrevention(incoming, prevention) {
  if (prevention?.preventAll) return 0;
  const reduced =
    incoming - (prevention?.reduce || 0) - (prevention?.reduceHp || 0);
  return reduced > 0 ? reduced : 0;
}

/** Merge two prevention structs (stack reductions; any preventAll wins). */
export function mergeDamagePrevention(a, b) {
  const out = { preventAll: false, reduce: 0, reduceHp: 0 };
  if (a?.preventAll || b?.preventAll) {
    out.preventAll = true;
    return out;
  }
  out.reduce = (a?.reduce || 0) + (b?.reduce || 0);
  out.reduceHp = (a?.reduceHp || 0) + (b?.reduceHp || 0);
  return out;
}

/** Pokémon Tool attached to a host (not Energy / Pokémon). */
export function isPokemonToolCard(card) {
  if (!card) return false;
  const type = String(card.type || '').toLowerCase();
  if (type === 'pokémon' || type === 'pokemon' || type === 'energy')
    return false;
  const sub = (Array.isArray(card.subtypes) ? card.subtypes : []).map((s) =>
    String(s).toLowerCase()
  );
  if (sub.includes('tool') || sub.includes('pokémon tool')) return true;
  if (card.isTool) return true;
  if (type === 'tool') return true;
  if (String(card.trainerType || '').toLowerCase() === 'tool') return true;
  return false;
}

/** Tools attached to a Pokémon in a zone array. */
export function attachedTools(pokemon, zoneCards = []) {
  if (!pokemon) return [];
  return (zoneCards || []).filter((c) => {
    if (!isPokemonToolCard(c)) return false;
    if (pokemon.instanceId != null && c.attachedTo === pokemon.instanceId)
      return true;
    if (pokemon.image && c.image?.relative === pokemon.image) return true;
    return false;
  });
}

/** Damage prevention from Pokémon + attached Tools (optional tool block). */
export function combinedDamagePrevention(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  let out = parseDamagePrevention(pokemon);
  if (blockTools) return out;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    out = mergeDamagePrevention(out, parseDamagePrevention(tool));
  }
  return out;
}

/** Passive attack-cost discount from Pokémon + attached Tools. */
export function combinedPassiveCostDiscount(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  let discount = passiveCostDiscount(pokemon);
  if (blockTools) return discount;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    discount += passiveCostDiscount(tool);
  }
  return discount;
}

/** Hand protection from Pokémon abilities or attached Tools. */
export function combinedHandProtected(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  if (isHandProtected(pokemon)) return true;
  if (blockTools) return false;
  return attachedTools(pokemon, zoneCards).some((t) => isHandProtected(t));
}

// --- hand-protect ------------------------------------------------------

// "Your hand can't be reduced / cards in hand can't be affected"
export function isHandProtected(card) {
  const t = textOf(card);
  return /hand/.test(t) && /(can't|cannot|immune)/.test(t);
}

// --- energy-redirect / lock --------------------------------------------

// "move/redirect N Energy from this Pokémon to 1 of your other Pokémon"
// → { kind: 'redirect', n }.
// "…can't move or remove Energy…" (energy lock) → { kind: 'lock' }.
// Anything else → null.
export function parseEnergyRedirect(card) {
  const t = textOf(card);
  if (!t || !t.includes('energy')) return null;
  const m = t.match(/(?:redirect|move)\s+(?:up to\s+)?(\d+)?\s+energy/);
  if (m) return { kind: 'redirect', n: m[1] ? parseInt(m[1], 10) : 1 };
  if (/(can't|cannot)/.test(t) && /(move|remov)/.test(t)) {
    return { kind: 'lock' };
  }
  return null;
}

// --- opponent-disrupt --------------------------------------------------

// "Discard N cards from your opponent's hand" → N; unparseable → 1.
// Self-hand discard costs (e.g. Mortal Shuriken) → 0.
export function parseOpponentDiscard(card) {
  const t = textOf(card);
  if (!/opponent/.test(t) || !/discard/.test(t)) return 0;
  if (
    t.includes('from your hand') &&
    !t.includes("opponent's hand") &&
    !t.includes('from your opponent')
  ) {
    return 0;
  }
  const m = t.match(/discard (?:up to )?(\d+)?/);
  return m?.[1] ? parseInt(m[1], 10) : 1;
}

// --- announce-only families (Section C parsers) ------------------------
// Pure extractors for ability families that are recognized but not yet
// executed. Mirrors the step shapes from abilities.mjs.

const ENERGY_LETTER_TO_TYPE = {
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  y: 'Fairy',
  c: 'Colorless',
};

const parseNumber = (m) => (m?.[1] ? parseInt(m[1], 10) || 0 : 0);

// "takes N less damage", "reduce damage by N"
export function parseDamageReduction(card) {
  const t = textOf(card);
  if (!t) return { reduce: 0 };
  const matches =
    t.includes('less damage') ||
    t.includes('reduce damage') ||
    (t.includes('damage dealt to') && t.includes('reduced'));
  if (!matches) return { reduce: 0 };
  const m =
    t.match(/(\d+)\s+less\s+damage/) ||
    t.match(/reduce\s+damage\s+by\s+(\d+)/) ||
    t.match(/reduc(?:e|ed).*?(\d+)/);
  return { reduce: parseNumber(m) };
}

// "does N more damage", "deals N more damage"
export function parseDamageBonus(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('more damage') ||
    !(
      t.includes('attack') ||
      t.includes('this pokémon') ||
      t.includes('deals') ||
      t.includes('does')
    )
  ) {
    return { bonus: 0 };
  }
  const m =
    t.match(/(\d+)\s+more\s+damage/) ||
    t.match(/(?:deals|does)\s+(\d+)\s+more/);
  const bonus = parseNumber(m);
  // Beastite: "…do 10 more damage … for each Prize card you have taken" — the
  // consumer scales by the attacker's taken Prizes (audit S&M F5).
  if (bonus && /for each prize card you have taken/.test(t)) {
    return { bonus, perPrizeTaken: true };
  }
  return { bonus };
}

export function applyDamageBonus(baseDamage, bonus) {
  return (baseDamage || 0) + (bonus || 0);
}

// "+N HP", "gets +N HP for each"
export function parseHpBonus(card) {
  const t = textOf(card);
  if (!t || !/hp/.test(t)) return { bonus: 0 };
  // Negative printed modifiers (Hero's Medal, Island Challenge Amulet).
  const neg = t.match(/gets\s+-(\d+)\s+hp/);
  if (neg) return { bonus: -(parseInt(neg[1], 10) || 0) };
  if (!/(more|increase|treated as|gets \+|\+\d+\s+hp|for each)/.test(t)) {
    return { bonus: 0 };
  }
  const m =
    t.match(/(\d+)\s+more\s+hp/) ||
    t.match(/(\d+)\s+hp\s+more/) ||
    t.match(/gets\s+\+(\d+)\s+hp/) ||
    t.match(/\+(\d+)\s+hp/) ||
    t.match(/for each[^.]*?\+(\d+)\s+hp/);
  return { bonus: parseNumber(m) };
}

export function applyHpBonus(baseHp, bonus) {
  const base = baseHp || 0;
  if (!base) return 0;
  return Math.max(1, base + (bonus || 0));
}

// A Pokémon's printed name read as "this pokémon": older cards say "Gligar's Retreat Cost is 0".
function selfFolded(card) {
  const t = textOf(card);
  const name = lower(card?.name).trim();
  if (!name || name.length < 3) return t;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp(`(?<![\\w'])${escaped}(?![\\w-])`, 'g'), 'this pokémon');
}

const SYMBOL_TYPE = {
  g: 'grass', r: 'fire', w: 'water', l: 'lightning', p: 'psychic',
  f: 'fighting', d: 'darkness', m: 'metal', y: 'fairy', n: 'dragon',
};

function holderEnergy(card, zoneCards = []) {
  if (card?.instanceId == null) return [];
  return (zoneCards || []).filter((c) => c?.attachedTo === card.instanceId && isEnergy(c));
}

function energyIsType(energy, letter) {
  const want = SYMBOL_TYPE[letter];
  const kinds = [energy.energyType, ...(Array.isArray(energy.types) ? energy.types : []), energy.name]
    .map(lower)
    .join(' ');
  return Boolean(want) && kinds.includes(want);
}

// Leading conditions on a Pokémon's own Retreat Cost change: true / false when the board
// answers it, undefined when the clause is not this condition.
const SELF_RETREAT_CONDITIONS = [
  (c, card, b) => {
    if (!/this pok[eé]mon has no energy(?: cards?)? attached/.test(c)) return undefined;
    return holderEnergy(card, b.zoneCards).length === 0;
  },
  (c, card, b) => {
    const m = c.match(/this pok[eé]mon has any (?:\{([a-z])\} |basic )?energy(?: cards?)? attached/) ||
      c.match(/there is an? \{([a-z])\} energy card attached to this pok[eé]mon/);
    if (!m) return undefined;
    const energy = holderEnergy(card, b.zoneCards);
    return m[1] ? energy.some((e) => energyIsType(e, m[1])) : energy.length > 0;
  },
  (c, card, b) => {
    const m = c.match(/this pok[eé]mon has (\d+) or fewer energy attached|this pok[eé]mon has (\d+) energy or less attached/);
    if (!m) return undefined;
    return holderEnergy(card, b.zoneCards).length <= Number(m[1] ?? m[2]);
  },
  (c, card) => {
    if (!/this pok[eé]mon has any damage counters on it/.test(c)) return undefined;
    return (card?.damage || 0) > 0;
  },
  (c, card, b) => {
    if (!/this pok[eé]mon has a pok[eé]mon tool(?: card)? attached/.test(c)) return undefined;
    return (b.zoneCards || []).some(
      (x) => x?.attachedTo === card?.instanceId && /tool/.test(lower(`${x.type} ${x.trainerType} ${(x.subtypes || []).join(' ')}`))
    );
  },
  (c, _card, b) => {
    if (!/(?:you have )?(?:a|any) stadium(?: card)? (?:is )?in play|there is (?:a|any) stadium card (?:is )?in play/.test(c)) {
      return undefined;
    }
    return Boolean(b.stadium);
  },
  // "As long as Illumise is in play" (Volbeat Uplifting Glow): a named partner.
  (c, _card, b) => {
    const m = c.match(/^(.+?) is in play$/);
    if (!m || /your opponent|you have any|this pok[eé]mon/.test(c)) return undefined;
    if (!Array.isArray(b.sideCards) || !Array.isArray(b.opponentSideCards)) return undefined;
    const name = m[1].trim();
    return [...b.sideCards, ...b.opponentSideCards].some(
      (x) => !x?.attachedTo && isPokemon(x) && lower(x.name || '').includes(name)
    );
  },
  // "As long as this Pokémon is your Active Pokémon" — a position gate on the
  // holder's own cost (Magnemite Sparkling Induction). Callers price the Active.
  (c, _card, b) => {
    if (!/^this pok[eé]mon is (?:your active pok[eé]mon|in the active spot)$/.test(c)) return undefined;
    return b.isActive !== false;
  },
  // Genesect Fast-Flight Configuration.
  (c, _card, b) => {
    if (!/your opponent has any pok[eé]mon-gx or pok[eé]mon-ex in play/.test(c)) return undefined;
    if (!Array.isArray(b.opponentSideCards)) return undefined;
    return b.opponentSideCards.some(
      (x) => !x?.attachedTo && isPokemon(x) && (isGxCard(x) || isExCard(x))
    );
  },
  // Alolan Vulpix Secret Alleyway / Wimpod V: a typed Pokémon of your own in play.
  (c, _card, b) => {
    const m =
      c.match(/^you have any \{([a-z])\} pok[eé]mon in play$/) ||
      c.match(/^you have any ([a-z]+) pok[eé]mon in play$/);
    if (!m) return undefined;
    if (!Array.isArray(b.sideCards)) return undefined;
    return b.sideCards.some(
      (x) =>
        !x?.attachedTo &&
        isPokemon(x) &&
        (energyIsType({ types: x.types, name: x.name }, m[1]) ||
          lower(x.name || '').includes(m[1]))
    );
  },
];

// How many times a "for each <unit>" Retreat Cost clause applies, or null when the
// board cannot answer it (fail closed). `selfFolded` has already replaced the
// holder's printed name with "this Pokémon".
function retreatPerEachCount(unit, card, board) {
  const u = lower(unit);
  const bench = Array.isArray(board.benchCards) ? board.benchCards : null;
  const energy = holderEnergy(card, board.zoneCards);
  const attachedMatch = u.match(/^(\{[a-z]\} )?energy attached to (?:this pok[eé]mon|it)\b/);
  if (attachedMatch) {
    return attachedMatch[1]
      ? energy.filter((e) => energyIsType(e, attachedMatch[1].trim()[1])).length
      : energy.length;
  }
  const benchMatch = u.match(/^this pok[eé]mon on your bench/);
  if (benchMatch) {
    if (!bench) return null;
    const name = lower(card?.name);
    return bench.filter((b) => lower(b?.name) === name).length;
  }
  return null;
}

/**
 * A Pokémon's printed change to its OWN Retreat Cost (I159): "this Pokémon has no Retreat
 * Cost", "its Retreat Cost is {C} less", "the Retreat Cost of this Pokémon is 0". Changes aimed
 * at other Pokémon (your Active, your opponent's Active, a team) are `abilityRetreatCost` /
 * `teamNoRetreatCostForActive`'s, "for each" scaling is not read, and a leading condition
 * must hold on `board` (`zoneCards`, `stadium`) — an unrecognised one fails closed.
 */
function selfRetreatModifier(card, board = {}) {
  const t = selfFolded(card);
  if (!/retreat/.test(t)) return { delta: 0 };
  for (const sentence of t.split(/(?<=\.)\s+/)) {
    const self =
      /(?:this pok[eé]mon|, it) has no retreat cost/.test(sentence) ||
      /(?:this pok[eé]mon's|its|the retreat cost of this pok[eé]mon) retreat cost is|the retreat cost of this pok[eé]mon is|you pay [^.]*? to retreat this pok[eé]mon/.test(sentence);
    if (!self) continue;
    const clause = sentence.match(/^(?:if|as long as|during) ([^,]+),/)?.[1];
    // The cost clause is what the holder's own modifier lives in; the leading
    // condition may legitimately name the opponent ("If your opponent has any
    // Pokémon-GX …") without aiming the modifier at another Pokémon.
    const body = clause ? sentence.slice(sentence.indexOf(',') + 1).trim() : sentence;
    if (
      /your opponent|each player|each of your|your active pok[eé]mon's retreat cost|retreat cost of your active pok[eé]mon|of your pok[eé]mon/.test(
        body
      )
    ) {
      continue;
    }
    if (clause) {
      if (/^your first turn/.test(clause)) {
        if (board.turnNumber == null || Number(board.turnNumber) > 2) return { delta: 0 };
      } else {
        const verdicts = SELF_RETREAT_CONDITIONS.map((check) => check(clause, card, board));
        if (verdicts.every((v) => v === undefined) || verdicts.some((v) => v === false)) {
          return { delta: 0 };
        }
      }
    }
    // "… less for each Magnemite on your Bench" (I161): scale by the board count.
    const perEach = body.match(/for each ([^.]*)/);
    let multiplier = 1;
    if (perEach) {
      multiplier = retreatPerEachCount(perEach[1], card, board);
      if (multiplier == null) continue;
    }
    if (/no retreat cost|retreat cost is 0\b/.test(body)) return { delta: -Infinity };
    // Only symbols before "for each" are the modifier; the unit's symbol is not.
    const costPart = body.split(' for each ')[0];
    const symbols = (costPart.match(/\{[a-z]\}/g) || []).length;
    const n = Number(body.match(/(\d+)\s*(?:more|less)/)?.[1]) || symbols || 1;
    if (/\bless\b|fewer/.test(body)) return { delta: -n * multiplier };
    if (/\bmore\b/.test(body)) return { delta: n * multiplier };
  }
  return { delta: 0 };
}

// "+N more to retreat", "retreat cost is N less". A Pokémon reads only its own Retreat Cost
// (selfRetreatModifier, I159); a Tool keeps the plain text read ("the Retreat Cost of the
// Pokémon this card is attached to is {C}{C} less").
export function parseRetreatCostModifier(card, board = {}) {
  if (isPokemon(card)) return selfRetreatModifier(card, board);
  const t = textOf(card);
  if (!t || (!t.includes('retreat cost') && !/retreat/.test(t)))
    return { delta: 0 };
  if (
    !/remaining hp is 30 or less/i.test(t) &&
    /has no retreat cost|no retreat cost|retreat cost is 0|retreat for free/i.test(
      t
    )
  ) {
    // Rescue Board's zero is conditional on remaining HP; the "{C} less" half
    // must still apply, and combinedToolRetreatCost zeroes the conditional case.
    return { delta: -Infinity };
  }
  const increased = /(more|increase)/.test(t);
  const decreased = /(less|fewer|reduc|decrease)/.test(t);
  if (!increased && !decreased) return { delta: 0 };
  // The modifier numeral must sit next to more/less ("2 less", "is 3 or more"
  // is a CONDITION, not a modifier — Heavy Boots, I133/A4). TCGdex prints
  // retreat modifiers with energy symbols, not numerals: Air Balloon is
  // "{C}{C} less" (two Colorless), counted by symbolCount below.
  const m = t.match(/(\d+)\s*(?:more|less|fewer)/);
  const symbolCount = (t.match(/\{[a-z]\}/g) || []).length;
  const n = m ? parseInt(m[1], 10) || 1 : symbolCount;
  if (!n) return { delta: 0 };
  if (decreased && !increased) return { delta: -n };
  if (increased) return { delta: n };
  return { delta: 0 };
}

export function applyRetreatCostModifier(baseCost, delta) {
  if (delta === -Infinity) return 0;
  return Math.max(0, (baseCost || 0) + (delta || 0));
}

// Team-wide "no Retreat Cost" passives printed on a Pokémon in play, read for
// the Active Spot (e.g. Latias ex "Skyliner": "Your Basic Pokémon in play have
// no Retreat Cost."). The active Pokémon's own copy is handled by
// parseRetreatCostModifier; this covers the ability holder sitting on the Bench.
export function teamNoRetreatCostForActive(activeCard, benchCards, activeZoneCards = []) {
  if (!activeCard) return false;
  const activeName = lower(activeCard?.name || '');
  const activeIsBasic = isBasicPokemon(activeCard);
  const activeIsExOrGx = isExCard(activeCard) || isGxCard(activeCard);
  const activeEnergy = holderEnergy(activeCard, activeZoneCards);
  // The Active's own team wording ("Your Basic Pokémon in play have no Retreat Cost") counts too.
  for (const card of [activeCard, ...(Array.isArray(benchCards) ? benchCards : [])]) {
    if (!card || card.attachedTo || card.image?.attached) continue;
    const t = textOf(card);
    if (!/no retreat cost|retreat cost is 0/.test(t)) continue;
    // "All of your Pokémon that have {M} Energy attached have no Retreat Cost."
    // (Archaludon Metal Bridge, Zeraora-GX Thunderclap Zone)
    // "Each of your Pokémon that has any {W} Energy attached to it has no Retreat Cost."
    // (Manaphy-EX Aqua Tube)
    const typed = t.match(
      /(?:all|each) of your pok[eé]mon that (?:have|has) (?:any )?\{([a-z])\} energy attached(?: to it)? (?:have|has) no retreat cost/
    );
    if (typed) {
      if (activeEnergy.some((e) => energyIsType(e, typed[1]))) return true;
      continue;
    }
    // "Each of your Pokémon that evolves from Eevee has no Weakness, and that
    // Pokémon's Retreat Cost is 0." (Umbreon Moonlight Veil)
    const evolves = t.match(
      /each of your pok[eé]mon that evolves from ([a-z0-9 .'’-]+?) has no weakness/
    );
    if (evolves && /retreat cost is 0/.test(t)) {
      if (lower(activeCard?.evolvesFrom || '').includes(evolves[1].trim())) return true;
      continue;
    }
    // "Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX."
    if (/except[^.]*pok[eé]mon-(?:gx|ex)/.test(t) && activeIsExOrGx) continue;
    if (/your basic pok[eé]mon in play have no retreat cost/.test(t)) {
      if (activeIsBasic) return true;
      continue;
    }
    if (/your pok[eé]mon in play have no retreat cost/.test(t)) return true;
    // Name-specific, e.g. "Your Latios in play have no Retreat Cost."
    const named = t.match(
      /your ([a-z0-9 .'’-]+?) in play have no retreat cost/
    );
    if (named && activeName.includes(named[1].trim())) return true;
  }
  return false;
}

// "take N fewer/more Prize cards" (I131). Only the prize clause may supply the
// number: the text's first number is usually HP/damage ("gets -100 HP, and if
// it is Knocked Out … takes 1 fewer Prize card"), which made Hero's Medal take
// 0 prizes and Luxurious Cape take 101.
// `side` says whose Knock Outs the clause changes (I138): 'victim' when the
// holder is Knocked Out ("that player / your opponent takes"), 'attacker' for
// the imperative "take N more" when the holder's owner takes the Knock Out
// (Beast Bringer, Briar). A clause naming neither side is left neutral.
const VICTIM_PRIZE_CLAUSE =
  /\b(?:that player|your opponent|the attacking player)\s+takes\s+(\d+)\s+(more|fewer|less)\s+prize/;
const ATTACKER_PRIZE_CLAUSE = /(?:^|[.,]\s*)take\s+(\d+)\s+(more)\s+prize/;

export function parsePrizeModify(card) {
  const neutral = { delta: 0, side: null };
  const t = textOf(card);
  if (!t || !t.includes('prize card')) return neutral;
  const victim = t.match(VICTIM_PRIZE_CLAUSE);
  const attacker = victim ? null : t.match(ATTACKER_PRIZE_CLAUSE);
  const m = victim || attacker;
  if (!m) return neutral;
  const n = parseInt(m[1], 10);
  if (!n) return neutral;
  return {
    delta: /(fewer|less)/.test(m[2]) ? -n : n,
    side: victim ? 'victim' : 'attacker',
  };
}

export function applyPrizeModify(basePrizes, delta) {
  return Math.max(0, (basePrizes || 0) + (delta || 0));
}

// Resolute Heart pattern: full HP survive, optional remaining HP
export function parseKoPrevention(card) {
  const out = { fullHpOnly: false, surviveHp: null, coinFlip: false };
  const t = textOf(card);
  if (!t) return out;
  const matches =
    (t.includes('knocked out') &&
      (t.includes('prevent') ||
        t.includes("can't") ||
        t.includes('coin') ||
        t.includes('flip'))) ||
    (t.includes('full hp') &&
      t.includes('would be knocked out') &&
      t.includes('not knocked out'));
  if (!matches) return out;
  out.fullHpOnly = t.includes('full hp');
  out.coinFlip = /flip a coin/.test(t);
  const survive =
    t.match(/remaining hp becomes?\s+(\d+)/) || t.match(/hp becomes?\s+(\d+)/);
  if (survive) out.surviveHp = parseInt(survive[1], 10);
  return out;
}

// Damage to the attacker when this Pokémon is damaged.
// Pre-Sun & Moon wording names "that Pokémon" (the Attacking Pokémon) instead
// of "the Attacking Pokémon"; the attack-damage context is required so the
// energy-attach costs that print the same "put N damage counters on that
// Pokémon" clause stay out. `zone` reports whether the printed text restricts
// the trigger to the Active Spot (callers gate on it; the parser does not).
export function parseThorns(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('damage counter') ||
    !/(put|place)/.test(t) ||
    !(
      /(attacker|attacking pokémon)/.test(t) ||
      (/on that pokémon/.test(t) &&
        /damaged by (?:an? )?(?:opponent's )?attack/.test(t))
    )
  ) {
    return { count: 0, zone: 'any' };
  }
  const m = t.match(/(\d+)\s+damage/);
  const count = m ? parseInt(m[1], 10) || 0 : 0;
  const zone = /in the active spot|is your active pokémon/.test(t)
    ? 'active'
    : 'any';
  return { count, zone };
}

// During Pokémon Checkup damage
export function parseCheckupEffect(card) {
  const t = textOf(card);
  if (!t || !t.includes('checkup') || !t.includes('damage counter')) {
    return {
      count: 0,
      filter: null,
      exceptName: null,
      targetHasAbility: false,
      source: card?.name || 'Ability',
    };
  }
  const m = t.match(/put\s+(\d+)\s+damage/);
  let filter = null;
  if (/poisoned/.test(t)) filter = 'poisoned';
  else if (/burned/.test(t)) filter = 'burned';
  else if (/asleep/.test(t)) filter = 'asleep';
  else if (/confused/.test(t)) filter = 'confused';
  else if (/basic pokémon/.test(t)) filter = 'basic';
  else {
    const energy = t.match(/\{([a-z])\}\s*pokémon/);
    if (energy) filter = `{${energy[1]}}`;
    else if (/opponent/.test(t)) filter = 'opponent';
  }
  const exceptName =
    t
      .match(/except any ([^.]+)/)?.[1]
      ?.trim()
      .toLowerCase() || null;
  const targetHasAbility =
    t.includes('has an ability') || t.includes('with an ability');
  return {
    count: parseNumber(m),
    filter,
    exceptName,
    targetHasAbility,
    source: card?.name || 'Ability',
  };
}

// Wild Growth: Basic {G} provides {G}{G}
export function parseEnergyMultiplier(card) {
  const t = textOf(card);
  if (!t || !t.includes('energy')) return { multiplier: 0, energyType: null };
  const matches =
    t.includes('×') ||
    t.includes('x2') ||
    t.includes('counts as') ||
    t.includes('treated as') ||
    (t.includes('provides') &&
      (/\{[a-z]\}\{[a-z]\}/.test(t) || t.includes('basic')));
  if (!matches) return { multiplier: 0, energyType: null };

  let multiplier = 2;
  const xMatch = t.match(/x(\d+)/) || t.match(/×(\d+)/);
  if (xMatch) multiplier = parseInt(xMatch[1], 10) || 2;

  let energyType = null;
  const typeMatch =
    t.match(/basic\s*\{([a-z])\}/) ||
    t.match(/\{([a-z])\}\s*energy/) ||
    t.match(/\{([a-z])\}\{[a-z]\}/);
  if (typeMatch) {
    energyType = ENERGY_LETTER_TO_TYPE[typeMatch[1]] || null;
  }
  return { multiplier, energyType };
}

// Extra Pokémon Tool slot
export function parseToolCap(card) {
  const t = textOf(card);
  if (!t || !t.includes('tool') || !/(attach|slot|more|extra)/.test(t)) {
    return { extra: 0 };
  }
  const m = t.match(/(\d+)\s*(?:more|extra)/) || t.match(/extra\s+(\d+)/);
  return { extra: m ? parseInt(m[1], 10) || 1 : 1 };
}

// Use attacks from previous Evolutions
export function parseAttackInheritance(card) {
  const t = textOf(card);
  return (
    (t.includes('previous evolution') || t.includes('previous evolutions')) &&
    (t.includes('attack') || t.includes('attacks'))
  );
}

// Darkest Impulse: damage when opponent evolves
export function parseOnOpponentEvolve(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('opponent') ||
    !t.includes('evolve') ||
    !t.includes('damage counter')
  ) {
    return { count: 0 };
  }
  const m = t.match(/put\s+(\d+)\s+damage/);
  return { count: parseNumber(m) };
}

// Bench ↔ Active switch (Pecharunt ex Subjugating Chains, …)
export function parseSwitchAbility(card) {
  const out = {
    benchToActive: false,
    pokemonType: null,
    exceptName: null,
    poisonNewActive: false,
    target: 'self',
  };
  const t = textOf(card);
  if (!t) return out;

  const benchActiveSwitch =
    t.includes('switch') &&
    (t.includes('benched') || t.includes('bench')) &&
    t.includes('active');
  if (!benchActiveSwitch) return out;
  out.benchToActive = true;

  const typed = t.match(/benched\s+\{([a-z])\}\s+pok/);
  if (typed) {
    const map = {
      w: 'water',
      r: 'fire',
      g: 'grass',
      l: 'lightning',
      p: 'psychic',
      f: 'fighting',
      d: 'darkness',
      m: 'metal',
      n: 'dragon',
      y: 'fairy',
      c: 'colorless',
    };
    out.pokemonType = map[typed[1]] || null;
  }

  out.exceptName =
    t
      .match(/except any ([^.,]+)/)?.[1]
      ?.trim()
      .toLowerCase() || null;
  out.poisonNewActive =
    t.includes('if you do') &&
    (t.includes('now poisoned') || t.includes('is now poisoned'));
  if (t.includes("opponent's benched")) out.target = 'opponent';
  return out;
}

// Special Condition infliction
export function parseStatusInflict(card) {
  const out = { status: null, target: 'attacker' };
  const t = textOf(card);
  if (!t) return out;
  const matches =
    t.includes('confused') ||
    t.includes('burned') ||
    t.includes('poisoned') ||
    t.includes('asleep') ||
    t.includes('now poisoned') ||
    (t.includes('make') && t.includes('opponent')) ||
    (t.includes('special condition') && !t.includes('recover'));
  if (!matches) return out;

  if (t.includes('asleep')) out.status = 'asleep';
  else if (t.includes('poisoned') || t.includes('now poisoned'))
    out.status = 'poisoned';
  else if (t.includes('burned')) out.status = 'burned';
  else if (t.includes('confused')) out.status = 'confused';

  if (
    t.includes("opponent's active") ||
    (t.includes('opponent') && t.includes('make'))
  ) {
    out.target = 'opponent-active';
  }
  return out;
}

// Move / place damage counters
export function parseMoveDamage(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('damage counter') ||
    !/(move|place|put)/.test(t) ||
    !/(to|onto|\bon\b)/.test(t)
  ) {
    return { count: null, onOpponent: false };
  }
  const m = t.match(/(?:move|place|put)\s+(?:up to\s+)?(\d+)\s+damage/);
  return {
    count: m ? parseInt(m[1], 10) : null,
    onOpponent: t.includes('opponent'),
  };
}

// Look at top N of deck
export function parseLookAtTop(card) {
  const t = textOf(card);
  if (!t || !t.includes('look at the top'))
    return { count: 0, takeToHand: false };
  const m = t.match(/top\s+(\d+)\s+cards?/);
  const takeToHand =
    t.includes('into your hand') || (t.includes('put') && t.includes('hand'));
  return {
    count: m ? parseInt(m[1], 10) || 1 : 1,
    takeToHand,
  };
}

// Put cards from discard pile into hand
export function parseRecursionFromDiscard(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('discard pile') ||
    !t.includes('into your hand') ||
    !/(put|return|add)/.test(t)
  ) {
    return { count: 0, what: '' };
  }
  const m = t.match(/up to\s+(\d+)/) || t.match(/put\s+(\d+)/);
  let what = 'card';
  if (t.includes('energy')) what = 'Energy';
  else if (t.includes('trainer')) what = 'Trainer';
  else if (t.includes('item')) what = 'Item';
  else if (t.includes('leftovers')) what = 'Leftovers';
  else if (t.includes('supporter')) what = 'Supporter';
  return { count: parseNumber(m), what };
}

// Negate effects / abilities / items
export function parseEffectPrevent(card) {
  const t = textOf(card);
  if (!t) return { scope: null };
  const matches =
    (/(prevent|can't|have no effect|have no abilities|has no abilities)/.test(
      t
    ) &&
      /(effect|ability|attack|item)/.test(t)) ||
    (t.includes('active spot') && t.includes('no abilities'));
  if (!matches) return { scope: null };
  if (/item/.test(t)) return { scope: 'items' };
  if (/abilit/.test(t)) return { scope: 'abilities' };
  if (/effect/.test(t) || /attack/.test(t)) return { scope: 'effects' };
  return { scope: null };
}

// Face-down Active placement on play
export function parseSetupFaceDown(card) {
  const t = textOf(card);
  return t.includes('face-down') || t.includes('face down');
}

// --- live-hook helpers (stack / expand) --------------------------------

export function stackDamageReductions(incoming, cards = []) {
  let total = incoming;
  const applied = [];
  for (const card of cards) {
    const r = parseDamageReduction(card);
    if (!r?.reduce) continue;
    const next = Math.max(0, total - r.reduce);
    if (next !== total) {
      applied.push({ ...r, source: card?.name || 'Ability' });
      total = next;
    }
  }
  return { total, applied };
}

export function stackDamageBonuses(incoming, cards = []) {
  let total = incoming;
  const applied = [];
  for (const card of cards) {
    const b = parseDamageBonus(card);
    if (!b?.bonus) continue;
    total += b.bonus;
    applied.push({ ...b, source: card?.name || 'Ability' });
  }
  return { total, applied };
}

export function expandEnergyForMultiplier(
  energyTypes = [],
  multiplier = 2,
  energyType = null
) {
  if (!multiplier || multiplier <= 1) return energyTypes;
  const expanded = [];
  for (const entry of energyTypes) {
    const type = typeof entry === 'string' ? entry : entry?.type;
    const family =
      typeof entry === 'string' ? 'basic' : entry?.family || 'basic';
    if (!type) continue;
    if (energyType && type !== energyType) {
      expanded.push(entry);
      continue;
    }
    if (family === 'double-colorless' || family === 'double') {
      expanded.push(entry);
      continue;
    }
    for (let i = 0; i < multiplier; i++) {
      expanded.push(
        typeof entry === 'string' ? type : { type, family: 'basic' }
      );
    }
  }
  return expanded;
}

export function findEnergyMultiplier(cards = []) {
  for (const card of cards) {
    const m = parseEnergyMultiplier(card);
    if (m?.multiplier > 1) return { ...m, source: card?.name || 'Ability' };
  }
  return null;
}

export function pokemonHpThreshold(baseHp, card, stadiumBonus = 0) {
  const hpBonus = parseHpBonus(card)?.bonus || 0;
  return applyHpBonus((baseHp || 0) + (stadiumBonus || 0), hpBonus);
}

export function blocksItemPlay(card) {
  return parseEffectPrevent(card)?.scope === 'items';
}

/**
 * Unlimited hand energy acceleration (e.g. Baxcalibur Supercold, Frosmoth Ice Dance, Blastoise Deluge).
 * Returns { energyType, benchedOnly, noRuleBox, targetType } or null.
 */
export function parseUnlimitedHandEnergyAcceleration(card) {
  const t = textOf(card);
  if (!t) return null;
  const isUnlimited = /as often as you like/i.test(t);
  const isHandAttach =
    /(?:attach|put)\s+(?:an?|a basic|up to\s+\d+)?\s*.*energy.*(?:from your hand)/i.test(
      t
    ) ||
    (/from your hand/i.test(t) && /attach/i.test(t) && /energy/i.test(t));
  if (!isUnlimited || !isHandAttach) return null;

  let energyType = null;
  const typeLetterMatch = t.match(/\{([wlfmpdgynr])\}\s*energy/i);
  if (typeLetterMatch) {
    const typeMap = {
      w: 'Water',
      r: 'Fire',
      l: 'Lightning',
      f: 'Fighting',
      m: 'Metal',
      p: 'Psychic',
      d: 'Darkness',
      g: 'Grass',
      y: 'Fairy',
      n: 'Dragon',
    };
    energyType = typeMap[typeLetterMatch[1].toLowerCase()] || null;
  }
  if (!energyType) {
    const typeWordMatch = t.match(
      /\b(water|fire|grass|lightning|psychic|fighting|darkness|metal)\s+energy/i
    );
    if (typeWordMatch) {
      energyType =
        typeWordMatch[1].charAt(0).toUpperCase() +
        typeWordMatch[1].slice(1).toLowerCase();
    }
  }

  const benchedOnly = /benched/i.test(t) && !/active/i.test(t);
  const noRuleBox = /doesn't have a rule box|without a rule box/i.test(t);
  let targetType = null;
  const targetTypeMatch = t.match(
    /to 1 of your\s+(?:benched\s+)?([a-z]+)\s+pok[ée]mon/i
  );
  if (targetTypeMatch) {
    const candidate = targetTypeMatch[1].toLowerCase();
    if (
      [
        'water',
        'fire',
        'grass',
        'lightning',
        'psychic',
        'fighting',
        'darkness',
        'metal',
      ].includes(candidate)
    ) {
      targetType = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  return {
    energyType,
    benchedOnly,
    noRuleBox,
    targetType,
  };
}
