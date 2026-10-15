// Per-deck steering for the Suggest tab (design 069, "Steering state"). Keys are dataset card keys
// (`t:iono`, `p:…`) or `x:<name>` for deck cards the dataset does not know. A key sits in at most one
// of locked / accepted / dismissed, and the latest action wins. Every transition returns a new object.
import { GOAL_IDS } from './goals.mjs';

const LIST_CAP = 200;
const LISTS = ['locked', 'accepted', 'dismissed'];

export const EMPTY_PREFS = Object.freeze({
  locked: Object.freeze([]),
  accepted: Object.freeze([]),
  dismissed: Object.freeze([]),
  goals: Object.freeze([]),
});

const uniqueStrings = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item))] : [];

/** Anything (an old record, corrupt storage) → valid prefs. Overlaps resolve locked > accepted > dismissed. */
export function normalizeSuggestPrefs(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const taken = new Set();
  const out = {};
  for (const list of LISTS) {
    out[list] = uniqueStrings(source[list])
      .filter((key) => !taken.has(key))
      .slice(-LIST_CAP);
    out[list].forEach((key) => taken.add(key));
  }
  out.goals = uniqueStrings(source.goals).filter((goal) => GOAL_IDS.includes(goal));
  return out;
}

function moveTo(prefs, key, target) {
  const current = normalizeSuggestPrefs(prefs);
  if (typeof key !== 'string' || !key) return current;
  const next = { ...current };
  for (const list of LISTS) next[list] = current[list].filter((item) => item !== key);
  if (target) next[target] = [...next[target], key].slice(-LIST_CAP);
  return next;
}

export const acceptKey = (prefs, key) => moveTo(prefs, key, 'accepted');
export const dismissKey = (prefs, key) => moveTo(prefs, key, 'dismissed');
export const lockKey = (prefs, key) => moveTo(prefs, key, 'locked');
/** Unlock and restore both clear the key's steering entirely. */
export const unlockKey = (prefs, key) => moveTo(prefs, key, null);
export const restoreKey = (prefs, key) => moveTo(prefs, key, null);

export function toggleGoal(prefs, goalId) {
  const current = normalizeSuggestPrefs(prefs);
  if (!GOAL_IDS.includes(goalId)) return current;
  const goals = current.goals.includes(goalId)
    ? current.goals.filter((goal) => goal !== goalId)
    : [...current.goals, goalId];
  return { ...current, goals };
}

/**
 * After a deck edit: locks and accepts for keys no longer in the deck are dropped, and an accepted
 * key the player removed becomes dismissed (they tried it and took it out). Dismissed keys stay.
 */
export function prunePrefs(prefs, presentKeys) {
  const current = normalizeSuggestPrefs(prefs);
  const present = presentKeys instanceof Set ? presentKeys : new Set(presentKeys || []);
  const removedAccepts = current.accepted.filter((key) => !present.has(key));
  if (!removedAccepts.length && current.locked.every((key) => present.has(key))) return current;
  return {
    ...current,
    locked: current.locked.filter((key) => present.has(key)),
    accepted: current.accepted.filter((key) => present.has(key)),
    dismissed: [...current.dismissed, ...removedAccepts].slice(-LIST_CAP),
  };
}

export function samePrefs(a, b) {
  const left = normalizeSuggestPrefs(a);
  const right = normalizeSuggestPrefs(b);
  return [...LISTS, 'goals'].every(
    (list) => left[list].length === right[list].length && left[list].every((item, i) => item === right[list][i])
  );
}

export function steeringCounts(prefs) {
  const current = normalizeSuggestPrefs(prefs);
  return { locked: current.locked.length, accepted: current.accepted.length, dismissed: current.dismissed.length };
}
