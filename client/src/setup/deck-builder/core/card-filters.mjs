/**
 * Live-style search filters for the deck builder.
 *
 * Pokémon TCG Live sits a row of toggle pills above its card gallery: card
 * class (Pokémon / Trainer / Energy), energy type, and Trainer subtype. This
 * module owns what those pills mean and how they narrow a result set. It is
 * pure — the UI reads `BUILDER_FILTER_GROUPS` to draw the pills and calls
 * `applyCardFilters` to apply them.
 */

import { normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';

/** The energy types that get a pill, in printed card order. */
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

export const FILTER_TRAINER_TYPES = ['Item', 'Supporter', 'Stadium', 'Tool'];

/**
 * The empty filter state. Every field is a Set-like array so a pill row can
 * toggle members without the caller tracking three different shapes.
 */
export function createEmptyFilters() {
  return { supertypes: [], energyTypes: [], trainerTypes: [] };
}

export function hasActiveFilters(filters = {}) {
  return (
    (filters.supertypes?.length || 0) +
      (filters.energyTypes?.length || 0) +
      (filters.trainerTypes?.length || 0) >
    0
  );
}

export function countActiveFilters(filters = {}) {
  return (
    (filters.supertypes?.length || 0) +
    (filters.energyTypes?.length || 0) +
    (filters.trainerTypes?.length || 0)
  );
}

/**
 * Adds or removes one value from one filter group, returning a new state.
 * Unknown groups are ignored rather than throwing — the pill row is data-driven
 * and a stale `data-group` should narrow nothing, not break the search.
 */
export function toggleFilter(filters, group, value) {
  const base = { ...createEmptyFilters(), ...filters };
  const current = base[group];
  if (!Array.isArray(current)) return base;

  base[group] = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return base;
}

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

/**
 * Narrows a result set by the active filters.
 *
 * Within a group the pills are OR'd (Fire OR Water); across groups they are
 * AND'd (a Pokémon AND Fire) — the behaviour Live users expect. An empty group
 * means "no constraint", so empty filters return the input untouched.
 *
 * Energy-type and Trainer-subtype pills only constrain the cards they can
 * apply to: a Trainer has no energy type, so filtering by Fire excludes it.
 */
export function applyCardFilters(cards = [], filters = {}) {
  const supertypes = filters.supertypes || [];
  const energyTypes = filters.energyTypes || [];
  const trainerTypes = filters.trainerTypes || [];

  if (!supertypes.length && !energyTypes.length && !trainerTypes.length) {
    return Array.isArray(cards) ? [...cards] : [];
  }

  return (Array.isArray(cards) ? cards : []).filter((card) => {
    if (supertypes.length && !supertypes.includes(cardSupertype(card))) {
      return false;
    }

    if (energyTypes.length) {
      const keys = cardEnergyTypeKeys(card);
      if (!keys.some((key) => energyTypes.includes(key))) return false;
    }

    if (trainerTypes.length && !trainerTypes.includes(cardTrainerType(card))) {
      return false;
    }

    return true;
  });
}

/**
 * The pill rows to draw, as data. `icon` is a token image path where one
 * exists, so the energy row reads as printed type symbols rather than words.
 */
export const BUILDER_FILTER_GROUPS = [
  {
    key: 'supertypes',
    label: 'Card type',
    options: FILTER_SUPERTYPES.map((value) => ({ value, label: value })),
  },
  {
    key: 'energyTypes',
    label: 'Energy type',
    options: FILTER_ENERGY_TYPES.map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      icon: `/src/assets/energy/tokens/${value}.png`,
    })),
  },
  {
    key: 'trainerTypes',
    label: 'Trainer',
    options: FILTER_TRAINER_TYPES.map((value) => ({ value, label: value })),
  },
];
