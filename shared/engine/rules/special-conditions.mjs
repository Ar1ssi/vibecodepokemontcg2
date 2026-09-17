// Special Conditions on a server card (design 011, audit A-1).
//
// Poisoned and Burned are markers: they coexist with each other and with the one
// "rotation" condition (Asleep, Confused or Paralyzed). A card stores the rotation
// condition in `specialCondition` and each marker as its own key (`poisoned: true`,
// `burned: true`). Marker keys exist only while set, so a card with no markers
// serializes exactly as it did before markers existed (views and zone hashes carry
// cards verbatim).
//
// Older state can still hold 'Poisoned'/'Burned' in `specialCondition`; readers
// treat that as the marker and every write here moves it into the marker key.

export const MARKER_KEYS = { Poisoned: 'poisoned', Burned: 'burned' };
export const ROTATION_CONDITIONS = ['Asleep', 'Confused', 'Paralyzed'];

function isMarker(condition) {
  return Object.hasOwn(MARKER_KEYS, condition);
}

function normalizeLegacyMarker(card) {
  const legacy = card.specialCondition;
  if (!isMarker(legacy)) return;
  card[MARKER_KEYS[legacy]] = true;
  card.specialCondition = null;
}

export function hasCondition(card, condition) {
  if (!card) return false;
  if (isMarker(condition)) {
    return card[MARKER_KEYS[condition]] === true || card.specialCondition === condition;
  }
  return ROTATION_CONDITIONS.includes(condition) && card.specialCondition === condition;
}

/** Conditions on the card in Pokémon Checkup order: Poisoned, Burned, then the rotation condition. */
export function listConditions(card) {
  if (!card) return [];
  const conditions = Object.keys(MARKER_KEYS).filter((c) => hasCondition(card, c));
  if (ROTATION_CONDITIONS.includes(card.specialCondition)) conditions.push(card.specialCondition);
  return conditions;
}

export function hasAnyCondition(card) {
  return listConditions(card).length > 0;
}

/** Adds a condition. A rotation condition replaces the previous one; markers are kept. */
export function addCondition(card, condition) {
  if (!card) return false;
  if (isMarker(condition)) {
    normalizeLegacyMarker(card);
    card[MARKER_KEYS[condition]] = true;
    return true;
  }
  if (!ROTATION_CONDITIONS.includes(condition)) return false;
  normalizeLegacyMarker(card);
  card.specialCondition = condition;
  return true;
}

/** Removes one condition, leaving every other condition in place. */
export function removeCondition(card, condition) {
  if (!card) return false;
  normalizeLegacyMarker(card);
  if (isMarker(condition)) {
    delete card[MARKER_KEYS[condition]];
    return true;
  }
  if (!ROTATION_CONDITIONS.includes(condition)) return false;
  if (card.specialCondition === condition) card.specialCondition = null;
  return true;
}

/** Removes every condition and marker (Bench, Knockout, evolution, full cure). */
export function clearConditions(card) {
  if (!card) return;
  card.specialCondition = null;
  for (const key of Object.values(MARKER_KEYS)) delete card[key];
}

/** Makes `to` carry exactly the conditions `from` has. */
export function copyConditions(from, to) {
  if (!to) return;
  clearConditions(to);
  for (const condition of listConditions(from)) addCondition(to, condition);
}
