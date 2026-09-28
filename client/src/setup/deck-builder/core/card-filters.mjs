/**
 * TCG Live-style search filters for the deck builder (design 050).
 *
 * Pokémon TCG Live opens a filter drawer over its card gallery: format, card
 * class, Pokémon type, stage, rule-box "special" mechanics, Trainer and Energy
 * subtypes, HP, retreat, weakness, rarity, expansion and a few toggles. This
 * module owns what every filter means, how the filters narrow a result set,
 * which of them TCGdex can apply server-side, and the chip list the UI shows.
 * It is pure — the UI reads `BUILDER_FILTER_GROUPS` to draw the drawer.
 *
 * Semantics: OR within a group, AND across groups. A group only matches cards
 * that can carry its property, so an HP or stage constraint excludes Trainers.
 */

import { normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import {
  isAceSpecCard,
  isBasicEnergy,
  isGxCard,
  isLegendCard,
  isMegaCard,
  isPrismStarCard,
  isRadiantCard,
  isTagTeamCard,
  isVCard,
} from '../../../../../shared/engine/rules/card-classify.mjs';

/** The energy types that get an icon, in printed card order. */
export const FILTER_ENERGY_TYPES = [
  'grass',
  'fire',
  'water',
  'lightning',
  'psychic',
  'fighting',
  'darkness',
  'metal',
  'dragon',
  'fairy',
  'colorless',
];

export const FILTER_SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'];

export const FILTER_TRAINER_TYPES = ['Item', 'Tool', 'Supporter', 'Stadium', 'Technical Machine'];

export const FILTER_FORMATS = ['standard', 'expanded'];

// TCGdex /v2/en/regulation-marks (2026-09-28), minus its "None" placeholder.
export const FILTER_REGULATION_MARKS = ['D', 'E', 'F', 'G', 'H', 'I', 'J'];

// TCGdex /v2/en/stages values (2026-09-28). MEGA (legacy "M …-EX") is offered
// under Special as Mega instead, together with the modern Mega Evolution ex.
const STAGE_OPTIONS = [
  { value: 'Basic', label: 'Basic' },
  { value: 'Stage1', label: 'Stage 1' },
  { value: 'Stage2', label: 'Stage 2' },
  { value: 'Baby', label: 'Baby' },
  { value: 'BREAK', label: 'BREAK' },
  { value: 'LEVEL-UP', label: 'LV.X' },
  { value: 'VMAX', label: 'VMAX' },
  { value: 'VSTAR', label: 'VSTAR' },
  { value: 'V-UNION', label: 'V-UNION' },
  { value: 'RESTORED', label: 'Restored' },
];

// TCGdex has no Tera marker on its cards, so Tera is deliberately absent.
const MECHANIC_OPTIONS = [
  { value: 'ex', label: 'Pokémon ex' },
  { value: 'EX', label: 'Pokémon-EX' },
  { value: 'GX', label: 'GX' },
  { value: 'V', label: 'Pokémon V' },
  { value: 'TAG TEAM', label: 'TAG TEAM' },
  { value: 'Mega', label: 'Mega' },
  { value: 'Radiant', label: 'Radiant' },
  { value: 'Prism Star', label: 'Prism Star' },
  { value: 'ACE SPEC', label: 'ACE SPEC' },
  { value: 'LEGEND', label: 'LEGEND' },
];

// The TCG rarities from TCGdex /v2/en/rarities (2026-09-28); the Pocket-only
// diamond/star/crown rarities are left out. "Holo Rare" is printedRarity()'s
// name for WotC-era holos that TCGdex lists as plain "Rare".
export const FILTER_RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Holo Rare',
  'Rare Holo',
  'Double rare',
  'Ultra Rare',
  'Illustration rare',
  'Special illustration rare',
  'Hyper rare',
  'Mega Hyper Rare',
  'Shiny rare',
  'Shiny Ultra Rare',
  'ACE SPEC Rare',
  'Radiant Rare',
  'Amazing Rare',
  'Secret Rare',
  'Promo',
];

export const FILTER_RETREAT_COSTS = ['0', '1', '2', '3', '4', '5'];

export const HP_RANGE = { min: 0, max: 400, step: 10 };

const ARRAY_GROUPS = [
  'supertypes',
  'energyTypes',
  'trainerTypes',
  'energyKinds',
  'stages',
  'mechanics',
  'rarities',
  'sets',
  'regulationMarks',
  'weaknessTypes',
  'retreatCosts',
];

const BOOLEAN_GROUPS = ['hasAbility', 'inDeck'];

/** The empty filter state. Array groups toggle members; the rest are scalars. */
export function createEmptyFilters() {
  return {
    supertypes: [],
    energyTypes: [],
    trainerTypes: [],
    energyKinds: [],
    stages: [],
    mechanics: [],
    rarities: [],
    sets: [],
    regulationMarks: [],
    weaknessTypes: [],
    retreatCosts: [],
    format: '',
    hpMin: null,
    hpMax: null,
    hasAbility: false,
    inDeck: false,
  };
}

function withDefaults(filters) {
  return { ...createEmptyFilters(), ...(filters || {}) };
}

const hasHpRange = (filters) => filters.hpMin != null || filters.hpMax != null;

export function countActiveFilters(filters = {}) {
  const state = withDefaults(filters);
  let count = 0;
  for (const group of ARRAY_GROUPS) {
    count += Array.isArray(state[group]) ? state[group].length : 0;
  }
  if (state.format) count += 1;
  if (hasHpRange(state)) count += 1;
  for (const group of BOOLEAN_GROUPS) {
    if (state[group] === true) count += 1;
  }
  return count;
}

export function hasActiveFilters(filters = {}) {
  return countActiveFilters(filters) > 0;
}

/**
 * Adds or removes one value from one filter group, returning a new state.
 * `format` is single-select (picking the active format clears it) and the
 * boolean toggles flip. Unknown groups are ignored rather than throwing — the
 * drawer is data-driven and a stale `data-group` should narrow nothing.
 */
export function toggleFilter(filters, group, value) {
  const base = withDefaults(filters);

  if (group === 'format') {
    base.format = base.format === value || !FILTER_FORMATS.includes(value) ? '' : value;
    return base;
  }
  if (BOOLEAN_GROUPS.includes(group)) {
    base[group] = !base[group];
    return base;
  }
  if (!ARRAY_GROUPS.includes(group) || !Array.isArray(base[group])) return base;

  const current = base[group];
  base[group] = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return base;
}

const snapHp = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const clamped = Math.min(HP_RANGE.max, Math.max(HP_RANGE.min, number));
  return Math.round(clamped / HP_RANGE.step) * HP_RANGE.step;
};

/**
 * Sets the inclusive HP range. Values snap to the 10-HP grid and clamp to
 * 0–400; a reversed pair is swapped; a bound at the range edge means "no
 * bound" and is stored as null so an untouched slider never counts as a filter.
 */
export function setHpRange(filters, min, max) {
  const base = withDefaults(filters);
  let low = snapHp(min);
  let high = snapHp(max);
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  base.hpMin = low === null || low <= HP_RANGE.min ? null : low;
  base.hpMax = high === null || high >= HP_RANGE.max ? null : high;
  return base;
}

const lower = (value) => String(value ?? '').toLowerCase();

const isPokemon = (card) => lower(card?.supertype).startsWith('pok');

function cardSupertype(card) {
  return String(card?.supertype || '');
}

/** Canonical energy-type keys a card can be filtered by. */
function cardEnergyTypeKeys(card) {
  const declared = Array.isArray(card?.types) ? card.types : [];
  return declared.map((type) => normalizeEnergyType(type)).filter(Boolean);
}

function cardTrainerType(card) {
  // TCGdex spells Pokémon Tools as "Tool" on modern cards but older printings
  // carry the longer form; match on the leading word either way.
  const raw = String(card?.trainerType || '').trim();
  if (!raw) return '';
  if (/^tool\b/i.test(raw) || /pok[eé]mon tool/i.test(raw)) return 'Tool';
  return raw;
}

function cardWeaknessKeys(card) {
  const weaknesses = Array.isArray(card?.weaknesses) ? card.weaknesses : [];
  return weaknesses
    .map((entry) => normalizeEnergyType(typeof entry === 'string' ? entry : entry?.type))
    .filter(Boolean);
}

// Suffix first (TCGdex prints "ex" vs "EX" exactly); the case-sensitive name
// test covers custom cards and imported rows that carry only a name.
const MECHANIC_TESTS = {
  ex: (card) =>
    isPokemon(card) && (card.suffix === 'ex' || /(?:^|\s)ex$/.test(String(card.name || ''))),
  EX: (card) =>
    isPokemon(card) && (card.suffix === 'EX' || /[\s-]EX$/.test(String(card.name || ''))),
  GX: (card) => isPokemon(card) && isGxCard(card),
  V: (card) => isPokemon(card) && isVCard(card),
  'TAG TEAM': (card) =>
    isPokemon(card) && (card.suffix === 'TAG TEAM-GX' || isTagTeamCard(card)),
  Mega: (card) => isPokemon(card) && isMegaCard(card),
  Radiant: (card) => isPokemon(card) && isRadiantCard(card),
  'Prism Star': (card) => isPrismStarCard(card),
  'ACE SPEC': (card) => isAceSpecCard(card),
  LEGEND: (card) => isPokemon(card) && (card.suffix === 'Legend' || isLegendCard(card)),
};

function matchesEnergyKind(card, kind) {
  if (lower(card?.supertype) !== 'energy') return false;
  if (kind === 'Basic') return isBasicEnergy(card);
  if (kind === 'Special') return !isBasicEnergy(card);
  return false;
}

function matchesRetreat(card, cost) {
  const retreat = Number(card?.retreat);
  if (!isPokemon(card) || !Number.isFinite(retreat)) return false;
  return cost === '5' ? retreat >= 5 : retreat === Number(cost);
}

function matchesHp(card, filters) {
  const hp = Number(card?.hp);
  if (!Number.isFinite(hp) || hp <= 0) return false;
  if (filters.hpMin != null && hp < filters.hpMin) return false;
  if (filters.hpMax != null && hp > filters.hpMax) return false;
  return true;
}

function matchesFormat(card, format) {
  return card?.legal?.[format] === true;
}

/**
 * Narrows a result set by the active filters.
 *
 * `context.quantities` (card id → copies in the deck) drives "In current deck".
 */
export function applyCardFilters(cards = [], filters = {}, context = {}) {
  const list = Array.isArray(cards) ? cards : [];
  if (!hasActiveFilters(filters)) return [...list];
  const state = withDefaults(filters);
  const quantities = context.quantities || {};
  const lowerRarities = state.rarities.map(lower);
  const lowerMarks = state.regulationMarks.map(lower);
  const lowerStages = state.stages.map(lower);

  return list.filter((card) => {
    if (!card) return false;

    if (state.supertypes.length && !state.supertypes.includes(cardSupertype(card))) {
      return false;
    }
    if (state.energyTypes.length) {
      const keys = cardEnergyTypeKeys(card);
      if (!keys.some((key) => state.energyTypes.includes(key))) return false;
    }
    if (state.trainerTypes.length && !state.trainerTypes.includes(cardTrainerType(card))) {
      return false;
    }
    if (
      state.energyKinds.length &&
      !state.energyKinds.some((kind) => matchesEnergyKind(card, kind))
    ) {
      return false;
    }
    if (state.stages.length && !(isPokemon(card) && lowerStages.includes(lower(card.stage)))) {
      return false;
    }
    if (
      state.mechanics.length &&
      !state.mechanics.some((mechanic) => MECHANIC_TESTS[mechanic]?.(card))
    ) {
      return false;
    }
    if (state.rarities.length && !lowerRarities.includes(lower(card.rarity))) return false;
    if (state.sets.length && !state.sets.includes(card?.set?.id)) return false;
    if (state.regulationMarks.length && !lowerMarks.includes(lower(card.regulationMark))) {
      return false;
    }
    if (state.weaknessTypes.length) {
      const keys = cardWeaknessKeys(card);
      if (!keys.some((key) => state.weaknessTypes.includes(key))) return false;
    }
    if (
      state.retreatCosts.length &&
      !state.retreatCosts.some((cost) => matchesRetreat(card, cost))
    ) {
      return false;
    }
    if (state.format && !matchesFormat(card, state.format)) return false;
    if (hasHpRange(state) && !matchesHp(card, state)) return false;
    if (state.hasAbility && !(Array.isArray(card.abilities) && card.abilities.length > 0)) {
      return false;
    }
    if (state.inDeck && !(quantities[card.id] > 0)) return false;

    return true;
  });
}

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const SERVER_CATEGORY = { Pokémon: 'Pokemon', Trainer: 'Trainer', Energy: 'Energy' };
const SERVER_ENERGY_TYPE = { Basic: 'Normal', Special: 'Special' };
// Only the suffixes TCGdex stores verbatim; "V" is left to the client because
// VMAX/VSTAR cards count as Pokémon V but do not carry a "V" suffix.
const SERVER_SUFFIX = { ex: 'ex', EX: 'EX', GX: 'GX' };

/**
 * The subset of the filters TCGdex can apply on `/cards` (verified live,
 * design 050), as query params. TCGdex narrows; `applyCardFilters` stays the
 * truth, so a param only has to be no stricter than its client filter.
 * Returns `{}` when nothing can be narrowed server-side.
 */
export function buildTcgdexFilterParams(filters = {}) {
  const state = withDefaults(filters);
  const params = {};
  const join = (values) => values.join('|');

  const categories = state.supertypes.map((value) => SERVER_CATEGORY[value]).filter(Boolean);
  if (categories.length) params.category = join(categories);
  if (state.energyTypes.length) params.types = join(state.energyTypes.map(capitalize));
  if (state.stages.length) params.stage = join(state.stages);
  if (state.trainerTypes.length) params.trainerType = join(state.trainerTypes);
  const energyTypes = state.energyKinds.map((kind) => SERVER_ENERGY_TYPE[kind]).filter(Boolean);
  if (energyTypes.length) params.energyType = join(energyTypes);
  if (state.regulationMarks.length) params.regulationMark = join(state.regulationMarks);
  if (state.rarities.length) {
    // WotC holos are "Rare" on TCGdex; printedRarity() renames them client-side.
    const rarities = new Set(state.rarities);
    if (rarities.has('Holo Rare')) rarities.add('Rare');
    params.rarity = join([...rarities]);
  }
  if (state.retreatCosts.length === 1 && state.retreatCosts[0] !== '5') {
    params.retreat = state.retreatCosts[0];
  }
  // The proxy accepts one value per key, so the range goes out as its lower
  // bound (or its upper bound alone); the client applies the other end.
  if (state.hpMin != null) params.hp = `gte:${state.hpMin}`;
  else if (state.hpMax != null) params.hp = `lte:${state.hpMax}`;
  if (state.format) params[`legal.${state.format}`] = 'true';
  if (state.mechanics.length && state.mechanics.every((value) => SERVER_SUFFIX[value])) {
    params.suffix = join(state.mechanics.map((value) => SERVER_SUFFIX[value]));
  }
  return params;
}

/** The expansions present in a result set, newest release first, for the Expansion group. */
export function deriveSetOptions(cards = []) {
  const byId = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const id = card?.set?.id;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      value: id,
      label: card.set.name || id,
      releaseDate: card.set.releaseDate || '',
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }));
}

/**
 * The drawer sections, as data. `kind` picks the control: pills, energy
 * `icons`, single-select, `range`, retreat `pips`, or `toggles` (each option
 * value is the boolean state key it flips). `span: 2` takes the full drawer
 * width. `dynamic: 'sets'` means the options come from `deriveSetOptions`.
 */
export const BUILDER_FILTER_GROUPS = [
  {
    key: 'format',
    label: 'Format',
    kind: 'single',
    options: FILTER_FORMATS.map((value) => ({ value, label: capitalize(value) })),
  },
  {
    key: 'regulationMarks',
    label: 'Regulation mark',
    kind: 'pills',
    options: FILTER_REGULATION_MARKS.map((value) => ({ value, label: value })),
  },
  {
    key: 'supertypes',
    label: 'Card type',
    kind: 'pills',
    options: FILTER_SUPERTYPES.map((value) => ({ value, label: value })),
  },
  {
    key: 'energyKinds',
    label: 'Energy',
    kind: 'pills',
    options: [
      { value: 'Basic', label: 'Basic' },
      { value: 'Special', label: 'Special' },
    ],
  },
  {
    key: 'energyTypes',
    label: 'Pokémon type',
    kind: 'icons',
    span: 2,
    options: FILTER_ENERGY_TYPES.map((value) => ({
      value,
      label: capitalize(value),
      icon: `/src/assets/energy/tokens/${value}.png`,
    })),
  },
  { key: 'stages', label: 'Stage', kind: 'pills', options: STAGE_OPTIONS },
  { key: 'mechanics', label: 'Special', kind: 'pills', options: MECHANIC_OPTIONS },
  {
    key: 'trainerTypes',
    label: 'Trainer type',
    kind: 'pills',
    options: FILTER_TRAINER_TYPES.map((value) => ({
      value,
      label: value === 'Tool' ? 'Pokémon Tool' : value,
    })),
  },
  {
    key: 'toggles',
    label: 'Toggles',
    kind: 'toggles',
    options: [
      { value: 'hasAbility', label: 'Has Ability' },
      { value: 'inDeck', label: 'In current deck' },
    ],
  },
  { key: 'hp', label: 'HP', kind: 'range', options: [] },
  {
    key: 'retreatCosts',
    label: 'Retreat cost',
    kind: 'pips',
    options: FILTER_RETREAT_COSTS.map((value) => ({
      value,
      label: value === '5' ? '5+' : value,
    })),
  },
  {
    key: 'weaknessTypes',
    label: 'Weakness',
    kind: 'icons',
    span: 2,
    options: FILTER_ENERGY_TYPES.filter((value) => value !== 'colorless').map((value) => ({
      value,
      label: capitalize(value),
      icon: `/src/assets/energy/tokens/${value}.png`,
    })),
  },
  {
    key: 'rarities',
    label: 'Rarity',
    kind: 'pills',
    span: 2,
    options: FILTER_RARITIES.map((value) => ({ value, label: value })),
  },
  { key: 'sets', label: 'Expansion', kind: 'pills', span: 2, dynamic: 'sets', options: [] },
];

function optionLabel(groupKey, value, context) {
  if (groupKey === 'sets') {
    return context.setNames?.[value] || value;
  }
  const group = BUILDER_FILTER_GROUPS.find((entry) => entry.key === groupKey);
  return group?.options.find((option) => option.value === value)?.label || value;
}

const GROUP_CHIP_PREFIX = {
  weaknessTypes: 'Weak: ',
  retreatCosts: 'Retreat ',
  regulationMarks: 'Reg. ',
};

/**
 * The active filters as removable chips, in drawer order.
 * `context.setNames` maps set ids to display names for Expansion chips.
 */
export function describeActiveFilters(filters = {}, context = {}) {
  const state = withDefaults(filters);
  const chips = [];
  for (const group of BUILDER_FILTER_GROUPS) {
    if (group.key === 'format') {
      if (state.format) {
        chips.push({ group: 'format', value: state.format, label: capitalize(state.format) });
      }
      continue;
    }
    if (group.key === 'toggles') {
      for (const option of group.options) {
        if (state[option.value] === true) {
          chips.push({ group: option.value, value: true, label: option.label });
        }
      }
      continue;
    }
    if (group.key === 'hp') {
      if (hasHpRange(state)) {
        const low = state.hpMin ?? HP_RANGE.min;
        const high = state.hpMax ?? HP_RANGE.max;
        chips.push({ group: 'hp', value: `${low}-${high}`, label: `HP ${low}–${high}` });
      }
      continue;
    }
    for (const value of state[group.key] || []) {
      const prefix = GROUP_CHIP_PREFIX[group.key] || '';
      chips.push({
        group: group.key,
        value,
        label: `${prefix}${optionLabel(group.key, value, context)}`,
      });
    }
  }
  return chips;
}

/** Clears the one filter a chip stands for. */
export function removeFilterChip(filters, chip = {}) {
  const base = withDefaults(filters);
  if (chip.group === 'format') {
    base.format = '';
    return base;
  }
  if (chip.group === 'hp') {
    base.hpMin = null;
    base.hpMax = null;
    return base;
  }
  if (BOOLEAN_GROUPS.includes(chip.group)) {
    base[chip.group] = false;
    return base;
  }
  if (ARRAY_GROUPS.includes(chip.group)) {
    base[chip.group] = base[chip.group].filter((entry) => entry !== chip.value);
  }
  return base;
}
