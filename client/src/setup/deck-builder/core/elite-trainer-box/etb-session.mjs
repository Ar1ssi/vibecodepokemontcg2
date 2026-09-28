// The Elite Trainer Box being opened, kept across reloads (design 055 § Session). One opening at
// a time. Not bound to a room: an ETB is not a match. Pure apart from the storage object passed
// in; every storage call is guarded, and a storage that throws means memory only.

import { packModelFor } from '../build-battle/box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS } from '../build-battle/build-battle.generated.mjs';
import { createUnboxing, parseUnboxing } from '../build-battle/unboxing.mjs';
import { getEtb } from './etb-catalog.mjs';

export const ETB_STORAGE_KEY = 'ptcg-sim.etb.v1';
const SESSION_VERSION = 1;
const MAX_SEED = 2 ** 31 - 1;

/**
 * @typedef {{version: 1, etbKey: string, seed: number, packs: string[][],
 *   unboxing: import('../build-battle/unboxing.mjs').Unboxing, createdAt: number}} EtbSession
 * `unboxing` is the scene's progress; it never changes `packs`.
 */

/** @returns {EtbSession} a freshly opened box, still sealed. */
export function createEtbSession({ etbKey, seed, packs, packModel, now = Date.now() }) {
  return {
    version: SESSION_VERSION,
    etbKey,
    seed,
    packs: packs.map((pack) => [...pack]),
    unboxing: createUnboxing({ packCount: packs.length, cardsPerPack: packModel.size }),
    createdAt: now,
  };
}

const isSeed = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_SEED;

function arePacksInSet(packs, etb, packModel) {
  if (!Array.isArray(packs) || packs.length !== etb.packCount) return false;
  const setIds = new Set((BUILD_BATTLE_SET_CARDS[etb.setId] || []).map((card) => card.id));
  return packs.every(
    (pack) =>
      Array.isArray(pack) &&
      pack.length > 0 &&
      pack.length <= packModel.size &&
      pack.every((id) => setIds.has(id))
  );
}

/** @returns {EtbSession|null} the stored session, or null for anything this version cannot trust. */
export function parseEtbSession(json) {
  let value;
  try {
    value = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== SESSION_VERSION) return null;
  const etb = getEtb(value.etbKey);
  const packModel = etb && packModelFor(etb.setId);
  if (!packModel || !isSeed(value.seed)) return null;
  if (!arePacksInSet(value.packs, etb, packModel)) return null;
  const unboxing = parseUnboxing(value.unboxing);
  if (
    !unboxing ||
    unboxing.packsTorn.length !== value.packs.length ||
    unboxing.cardsPerPack !== packModel.size
  ) {
    return null;
  }
  if (!Number.isFinite(value.createdAt)) return null;
  return {
    version: SESSION_VERSION,
    etbKey: value.etbKey,
    seed: value.seed,
    packs: value.packs.map((pack) => [...pack]),
    unboxing,
    createdAt: value.createdAt,
  };
}

/** @returns {boolean} false when the session could not be stored (memory only). */
export function saveEtbSession(storage, session) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(ETB_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** @returns {EtbSession|null} */
export function loadEtbSession(storage) {
  try {
    const json = storage?.getItem?.(ETB_STORAGE_KEY);
    return json ? parseEtbSession(json) : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} false when the storage refused the removal. */
export function clearEtbSession(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(ETB_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
