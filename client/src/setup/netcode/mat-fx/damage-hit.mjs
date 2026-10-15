// Design 024 (review fix): ONE classification of a `damageUpdated` plan, shared
// by the visual and the sound.
//
// `classifyDamagePlan` resolves a hit from `plan.dealt`/`plan.healed`, falling
// back to the delta against the last damage total seen for that card — most
// engine emitters (Poison/Burn checkup, Tool pings, special-energy effects)
// send only the cumulative `damage`. That fallback is stateful, so it can be
// run only ONCE per plan: a second call would diff against the total the first
// call just recorded and come back with nothing.
//
// Before this, combat.js owned the state and fx-audio.mjs re-derived the hit
// from `dealt` alone, so exactly those cumulative-only events drew a damage
// number, a hit flash and a table shake in total silence. Both sides now read
// through here, and the per-plan cache keeps them agreeing.
import { classifyDamagePlan } from './combat-pose.mjs';

const lastSeenDamage = new Map();
const classified = new WeakMap();

/**
 * @param {object} plan - a `damage` fx plan
 * @returns {{kind:'hit'|'heal', amount:number, weakness:boolean}|null}
 */
export function classifyHitOnce(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (classified.has(plan)) return classified.get(plan);
  const hit = classifyDamagePlan(plan, lastSeenDamage);
  classified.set(plan, hit);
  return hit;
}

/**
 * Design 069: what `classifyHitOnce` will make of `plan`, without recording its total, so the
 * attack scene can read its hits before their damage plans run.
 * @param {object} plan - a `damage` fx plan (or an attackHitIds entry)
 * @returns {{kind:'hit'|'heal', amount:number, weakness:boolean}|null}
 */
export function peekHit(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (classified.has(plan)) return classified.get(plan);
  return classifyDamagePlan(plan, new Map(lastSeenDamage));
}

/**
 * Design 069: the totals cards had before the batch now being applied, read off the board. A card
 * with no recorded total takes it, so a cumulative-only first event (an attack that places damage
 * counters) still reads as a hit. Totals already recorded are kept: they track plans still queued.
 * @param {{instanceId: *, damage: number}[]} entries
 */
export function seedDamageBaselines(entries) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (entry?.instanceId == null || !Number.isFinite(entry.damage)) continue;
    if (!lastSeenDamage.has(entry.instanceId)) lastSeenDamage.set(entry.instanceId, entry.damage);
  }
}

/** Test seam: drops the per-card damage baselines. */
export function resetDamageBaselines() {
  lastSeenDamage.clear();
}
