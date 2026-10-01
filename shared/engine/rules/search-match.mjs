// Shared deck/discard search filtering (trainers, abilities, attacks).
import { energyMatchesSearchWhat } from './energy-effects.mjs';
import { matchesBasicPokemonType, pokemonMatchesEnergyType } from './special-energy-effects.mjs';
import {
  isGxCard,
  isPrismStarCard,
  isRuleBoxPokemon,
  isTagTeamCard,
  isTeraCard,
  isUltraBeastCard,
} from './card-classify.mjs';
import { hasCardMarker } from './card-markers.mjs';
import { normalizeStage } from './evolution.mjs';
import { isAncientCard, isFutureCard } from './paradox-tags.mjs';

const SYMBOL_TO_TYPE = {
  c: 'Colorless',
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Dark',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
};

// Word-form Pokémon types ("a Water Pokémon", "Basic Psychic Pokémon") as they
// appear on trainer/attack search clauses. Kept in sync with pokemonMatchesEnergyType,
// which understands both 'Darkness' and the data's 'Dark' spelling.
export const WORD_POKEMON_TYPES = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  dark: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  colorless: 'Colorless',
  fairy: 'Fairy',
};

const POKEMON_TYPE_WORD_RE =
  /\b(grass|fire|water|lightning|psychic|fighting|darkness|dark|metal|dragon|colorless|fairy)\b/i;

export function isPokemonCard(card) {
  if (card?.hp) return true;
  const t = String(
    card?.type || card?.supertype || card?.image?.type || ''
  ).toLowerCase();
  return t.includes('pokémon') || t.includes('pokemon');
}

/** HP-cap search: exclude when HP is known over the cap; include when HP is not loaded yet. */
function matchesHpCap(card, maxHp) {
  const cardHp = Number(card.hp);
  if (Number.isFinite(cardHp)) return cardHp <= maxHp;
  // Deck zone cards often lack hp until async enrichment; keep Basic matches
  // in the pool so the picker is usable (player verifies the card visually).
  return true;
}

export function energySearchWhat({ basic = false, energyType = null } = {}) {
  const TYPE_TO_SYM = {
    water: 'W', fire: 'R', grass: 'G', lightning: 'L', psychic: 'P',
    fighting: 'F', darkness: 'D', metal: 'M', dragon: 'N', fairy: 'Y', colorless: 'C',
  };
  if (energyType) {
    const sym = TYPE_TO_SYM[String(energyType).toLowerCase()];
    if (sym && basic) return `Basic {${sym}} Energy`;
  }
  return basic ? 'Basic Energy' : 'Energy';
}

// Card rows whose `type` names the Trainer kind instead of "Trainer" (cards.mjs isTrainer).
const TRAINER_KIND_TYPES = new Set(['item', 'supporter', 'stadium', 'tool', 'pokémon tool']);

// Words that quantify "N cards" rather than name them ("any card", "2 other cards").
const SEARCH_DETERMINER = /^(?:any|a|an|all|the|that|those|these|other|up to \d+|\d+(?: other)?)$/i;

// Printed markers and name prefixes a search kind may carry ("a Tera Pokémon", "a Single Strike
// Supporter card", "Team Magma Pokémon"). Each test runs on the card; the rest of the kind
// ("Pokémon", "Supporter", "Basic Pokémon", "card") is then matched as usual (I220).
const lowerName = (card) => String(card?.name || '').toLowerCase().replace(/[’‘]/g, "'");
const MARKER_KINDS = [
  [/\btera\b/, (card) => isTeraCard(card)],
  [/\bteam plasma\b/, (card) => hasCardMarker(card, 'Team Plasma')],
  [/\bsingle strike\b/, (card) => hasCardMarker(card, 'Single Strike')],
  [/\brapid strike\b/, (card) => hasCardMarker(card, 'Rapid Strike')],
  [/\bfusion strike\b/, (card) => hasCardMarker(card, 'Fusion Strike')],
  [/\bbaby\b/, (card) => hasCardMarker(card, 'Baby')],
  [/\bprism star\b/, (card) => hasCardMarker(card, 'Prism Star') || isPrismStarCard(card)],
  [/\btag team\b/, (card) => hasCardMarker(card, 'TAG TEAM') || isTagTeamCard(card)],
  [/\btechnical machine\b/, (card) => lowerName(card).includes('technical machine')],
  // Team Magma Admin: "Team Magma Pokémon" are the "Team Magma's …" cards.
  [/\bteam (magma|aqua)\b/, (card, m) => lowerName(card).startsWith(`team ${m[1]}'s `)],
];

// "Basic Team Rocket's Pokémon", "Basic Hop's Pokémon", "Ethan's Pokémon": the card's own name
// must carry that owner ("Team Rocket's Mewtwo").
const OWNER_KIND = /^((?:basic|evolution|stage [12]) )?(.+?)'s pok[eé]mon(.*)$/;

function markerKindMatch(card, w) {
  for (const [re, test] of MARKER_KINDS) {
    const m = w.match(re);
    if (!m) continue;
    if (!test(card, m)) return false;
    return matchesSearch(card, w.replace(re, ' ').replace(/\s+/g, ' ').trim());
  }
  const owned = w.replace(/[’‘]/g, "'").match(OWNER_KIND);
  if (owned) {
    // The whole owner must match: "Rocket's Zapdos ex" is not a "Team Rocket's Pokémon".
    const owner = lowerName(card).match(/^(.+?)'s /)?.[1];
    if (!owner || owner !== owned[2]) return false;
    return matchesSearch(card, `${owned[1] || ''}pokémon${owned[3]}`.trim());
  }
  return null;
}

/** Match a card against a parsed search-step `what` string. */
export function matchesSearch(card, what = '') {
  // Fossil Researcher: "up to 2 in any combination of Amaura or Tyrunt".
  what = String(what).replace(/^\s*in any combination of\s+/i, '');
  const w = what.toLowerCase();
  // "90 HP or less" is a range, not an or-clause: splitting it dropped the cap
  // and matched every card (same class as the typed-Basic HP cap bug below).
  if (
    /\s+or\s+/.test(w) &&
    !/(?:hp|prize cards?)\s+or\s+(?:less|fewer|more|higher)\b/.test(w)
  ) {
    return w.split(/\s+or\s+/).some((seg) => matchesSearch(card, seg.trim()));
  }
  const isPokemon = isPokemonCard(card);
  const isTrainer =
    String(card.supertype || card.type || '').toLowerCase().includes('trainer') ||
    TRAINER_KIND_TYPES.has(String(card.type || '').toLowerCase());
  // "Evolution card" (Master Ball) means an Evolution Pokémon; as a bare
  // generic word it used to fall through to the final `return true`, letting
  // Trainers/Energy match. The "evolution {X} pokémon" form below is a Pokémon
  // too, so this never excludes a typed match.
  if (w.includes('evolution') && !isPokemon) return false;
  if (w.includes('ultra beast')) {
    return isUltraBeastCard(card);
  }
  // Techno Radar is itself a Future Item: the tag alone does not make a card a Pokémon.
  const marked = markerKindMatch(card, w);
  if (marked !== null) return marked;
  if (/\bancient pok[eé]mon\b/.test(w)) return isPokemon && isAncientCard(card);
  if (/\bfuture pok[eé]mon\b/.test(w)) return isPokemon && isFutureCard(card);
  if (w.includes('item') && w.includes('tool')) return isTrainer;
  if (w === 'item' || (w.includes('item') && !w.includes('tool'))) {
    const tt = String(card.trainerType || card.type || '').toLowerCase();
    return tt.includes('item') || (isTrainer && tt.includes('item'));
  }
  if (/pok[eé]mon tool/.test(w)) {
    const kind = `${card.trainerType || ''} ${card.type || ''} ${(card.subtypes || []).join(' ')}`;
    return isTrainer && /tool/i.test(kind);
  }
  if (w.includes('supporter')) {
    const tt = String(card.trainerType || card.type || '').toLowerCase();
    const st = Array.isArray(card.subtypes) ? card.subtypes.map((s) => String(s).toLowerCase()) : [];
    return tt.includes('supporter') || st.includes('supporter');
  }
  if (w.includes('trainer')) {
    return isTrainer;
  }
  // A plain "Stadium" kind (Colress's Tenacity's first stage, Lusamine). Before, it fell
  // through to the generic branch and matched every card.
  if (w.includes('stadium') && !w.includes('energy')) {
    const tt = String(card.trainerType || card.type || '').toLowerCase();
    const st = Array.isArray(card.subtypes) ? card.subtypes.map((s) => String(s).toLowerCase()) : [];
    return tt.includes('stadium') || st.includes('stadium');
  }
  if (w.includes('stadium') && w.includes('energy')) {
    const isEnergy =
      String(card.type || '').toLowerCase().includes('energy') ||
      String(card.name || '').toLowerCase().includes('energy');
    const isStadium =
      (String(card.type || card.supertype || '').toLowerCase().includes('trainer') &&
        String(card.name || '').toLowerCase().includes('stadium')) ||
      String(card.trainerType || '').toLowerCase() === 'stadium';
    return isEnergy || isStadium;
  }
  if (w.includes('energy')) {
    return energyMatchesSearchWhat(card, what);
  }
  if (w.includes('mega evolution')) {
    return isPokemon && String(card.name || '').toLowerCase().includes('mega');
  }
  if (w.includes('basic') && w.includes('stage 1') && w.includes('stage 2')) {
    return isPokemon;
  }
  if (w.includes('stage 1') && !w.includes('stage 2')) {
    if (!isPokemon) return false;
    return normalizeStage(card.stage) === 'Stage 1';
  }
  if (w.includes('stage 2')) {
    if (!isPokemon) return false;
    return normalizeStage(card.stage) === 'Stage 2';
  }
  if (w.includes('basic') || w.includes('pokémon') || w.includes('pokemon')) {
    if (!isPokemon) return false;
    if (/pok[eé]mon-gx\b/.test(w)) return isGxCard(card);
    if (/^basic pok[eé]mon-ex$/.test(w)) return normalizeStage(card.stage) === 'Basic' && /(?:-| )EX$/.test(String(card.name || ''));
    if (/^pok[eé]mon-ex$/.test(w)) return /(?:-| )ex$/i.test(String(card.name || ''));
    const noRuleBox =
      w.includes("doesn't have a rule box") ||
      w.includes("does not have a rule box") ||
      w.includes("don't have a rule box") ||
      w.includes("do not have a rule box") ||
      w.includes("without a rule box") ||
      w.includes("no rule box") ||
      w.includes("non-rule box");
    if (noRuleBox && isRuleBoxPokemon(card)) return false;

    const withRuleBox =
      !noRuleBox &&
      (w.includes("with a rule box") ||
        w.includes("has a rule box") ||
        w.includes("rule box"));
    if (withRuleBox && !isRuleBoxPokemon(card)) return false;

    const normStage = normalizeStage(card.stage);
    const effectiveStage = normStage || (card.stage ? card.stage : 'Basic');

    if (w.includes('evolution') && effectiveStage === 'Basic') return false;
    const typedEvolution = what.match(/evolution\s+\{([A-Za-z])\}\s+pokémon/i);
    if (typedEvolution) {
      const typeName = SYMBOL_TO_TYPE[typedEvolution[1].toLowerCase()];
      if (!typeName) return false;
      if (effectiveStage === 'Basic') return false;
      return pokemonMatchesEnergyType(card, typeName);
    }
    if (w.includes('evolution') && !w.includes('mega')) {
      if (effectiveStage === 'Basic') return false;
    }
    const typedBasic = what.match(/basic\s+\{([A-Za-z])\}\s+pokémon/i);
    if (typedBasic) {
      const typeName = SYMBOL_TO_TYPE[typedBasic[1].toLowerCase()];
      // A type match is not enough: "Basic {C} Pokémon with 100 HP or less"
      // must still fall through to the HP-cap checks below.
      if (typeName && !matchesBasicPokemonType(card, typeName)) return false;
    }
    // "{W} Pokémon" with no stage word (Great Haul Net).
    const typedSymbol = !typedBasic && !typedEvolution && what.match(/\{([A-Za-z])\}\s+pok[eé]mon/i);
    if (typedSymbol) {
      const typeName = SYMBOL_TO_TYPE[typedSymbol[1].toLowerCase()];
      if (typeName && !pokemonMatchesEnergyType(card, typeName)) return false;
    }
    if (w.includes('basic') && effectiveStage !== 'Basic') return false;
    // Word-form type qualifier ("Water Pokémon", "Basic Psychic Pokémon");
    // symbol forms ("Basic {W} Pokémon") are handled above.
    const typedWord = what.match(POKEMON_TYPE_WORD_RE);
    if (typedWord) {
      return pokemonMatchesEnergyType(card, WORD_POKEMON_TYPES[typedWord[1].toLowerCase()]);
    }
    const hpCap = what.match(/[≤<]\s*(\d+)\s*hp/i);
    if (hpCap) return matchesHpCap(card, Number(hpCap[1]));
    const hpOrLess = what.match(/(\d+)\s*hp\s*or\s*less/i);
    if (hpOrLess) return matchesHpCap(card, Number(hpOrLess[1]));
    if (w.includes('basic')) return effectiveStage === 'Basic';
    return true;
  }
  const generic =
    /\b(card|pokémon|pokemon|energy|item|tool|trainer|basic|supporter|stadium|mega|stage|evolution)\b/i;
  // A card name followed by "card(s)" (Cara Liss: "up to 2 Rare Fossil cards") is a name search.
  const namedCards = what.trim().match(/^(.+?)\s+cards?$/i);
  if (namedCards && !generic.test(namedCards[1]) && !SEARCH_DETERMINER.test(namedCards[1])) {
    return String(card.name || '').toLowerCase().includes(namedCards[1].toLowerCase());
  }
  if (what.trim() && !generic.test(what)) {
    const needle = what.trim().toLowerCase();
    return String(card.name || '').toLowerCase().includes(needle);
  }
  return true;
}

/**
 * True when a discard-cost step restricts the discard to Energy cards.
 *
 * The ability parser marks this explicitly with `energyOnly` (false = an
 * explicit "discard any card" cost, e.g. "discard a card … draw 3"), while
 * trainer/stadium steps may carry only the raw filter fields. Falling back to
 * `basic`/`energyType` keeps older trainer step shapes working.
 */
export function isEnergyDiscardCost(step = {}) {
  if (step.energyOnly === false) return false;
  return (
    step.energyOnly === true ||
    step.basicOnly === true ||
    (Array.isArray(step.energyTypes) && step.energyTypes.length > 0) ||
    step.basic === true ||
    Boolean(step.energyType)
  );
}

/**
 * Whether `card` can pay a discard-cost step. A plain hand-discard cost
 * ("discard 2 cards") accepts any card; an Energy-scoped one is filtered by
 * type/basic through `energySearchWhat` + `matchesSearch`. Shared by the
 * client ability/trainer pickers so a typed Energy cost never offers the
 * whole hand (and a non-Energy cost never hides cards behind an Energy-only
 * filter).
 */
export function matchesDiscardCost(card, step = {}) {
  if (isEnergyDiscardCost(step)) {
    const what = energySearchWhat({
      basic: step.basicOnly === true || step.basic === true,
      energyType:
        (Array.isArray(step.energyTypes) && step.energyTypes[0]) || step.energyType || null,
    });
    return matchesSearch(card, what);
  }
  // A qualified hand cost ("discard an Ultra Beast card from your hand", "a {M} Pokémon")
  // carries the printed qualifier as `what`/`pokemonTypes`; a plain "discard a card" cost
  // accepts any card.
  if (step.what || (Array.isArray(step.pokemonTypes) && step.pokemonTypes.length > 0)) {
    if (step.what && !matchesSearch(card, step.what)) return false;
    if (Array.isArray(step.pokemonTypes) && step.pokemonTypes.length > 0) {
      return step.pokemonTypes.some((t) =>
        pokemonMatchesEnergyType(card, WORD_POKEMON_TYPES[t] || t)
      );
    }
    return true;
  }
  return true;
}

/** Filter candidates; returns [] and calls onNoMatches instead of silently showing full deck. */
export function filterSearchMatches(cards, what, { onNoMatches } = {}) {
  const matches = cards.filter((c) => matchesSearch(c, what));
  if (matches.length === 0 && cards.length > 0) {
    onNoMatches?.(what);
  }
  return matches;
}

/** Deck search picker: show VALID/ALL toggle when the filter hides some deck cards. */
export function searchPickerAllCandidates(pool, deckCards) {
  if (!pool?.length || !deckCards?.length) return null;
  return pool.length < deckCards.length ? deckCards : null;
}
