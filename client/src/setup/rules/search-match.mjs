// Shared deck/discard search filtering (trainers, abilities, attacks).
import { energyMatchesSearchWhat } from './energy-effects.mjs';
import { matchesBasicPokemonType, pokemonMatchesEnergyType } from './special-energy-effects.mjs';

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
};

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

/** Match a card against a parsed search-step `what` string. */
export function matchesSearch(card, what = '') {
  const w = what.toLowerCase();
  if (w.includes(' or ')) {
    return w.split(/\s+or\s+/).some((seg) => matchesSearch(card, seg.trim()));
  }
  const isPokemon = isPokemonCard(card);
  const isTrainer = String(card.supertype || card.type || '').toLowerCase().includes('trainer');
  if (w.includes('item') && w.includes('tool')) return isTrainer;
  if (w === 'item' || (w.includes('item') && !w.includes('tool'))) {
    const tt = String(card.trainerType || card.type || '').toLowerCase();
    return tt.includes('item') || (isTrainer && tt.includes('item'));
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
  if (w.includes('basic') || w.includes('pokémon') || w.includes('pokemon')) {
    if (!isPokemon) return false;
    const typedEvolution = what.match(/evolution\s+\{([A-Za-z])\}\s+pokémon/i);
    if (typedEvolution) {
      const typeName = SYMBOL_TO_TYPE[typedEvolution[1].toLowerCase()];
      if (!typeName) return false;
      const stage = card.stage || 'Basic';
      if (stage === 'Basic') return false;
      return pokemonMatchesEnergyType(card, typeName);
    }
    const typedBasic = what.match(/basic\s+\{([A-Za-z])\}\s+pokémon/i);
    if (typedBasic) {
      const typeName = SYMBOL_TO_TYPE[typedBasic[1].toLowerCase()];
      if (typeName) return matchesBasicPokemonType(card, typeName);
    }
    if (w.includes('basic') && (card.stage || 'Basic') !== 'Basic') return false;
    const hpCap = what.match(/[≤<]\s*(\d+)\s*hp/i);
    if (hpCap) return matchesHpCap(card, Number(hpCap[1]));
    const hpOrLess = what.match(/(\d+)\s*hp\s*or\s*less/i);
    if (hpOrLess) return matchesHpCap(card, Number(hpOrLess[1]));
    if (w.includes('basic')) return (card.stage || 'Basic') === 'Basic';
    return true;
  }
  const generic =
    /\b(card|pokémon|pokemon|energy|item|tool|trainer|basic|supporter|stadium|mega|stage|evolution)\b/i;
  if (what.trim() && !generic.test(what)) {
    const needle = what.trim().toLowerCase();
    return String(card.name || '').toLowerCase().includes(needle);
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
