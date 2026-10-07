// Design 064 O6: the looping bed under a held special condition. One loop per condition (not per
// Pokémon): it starts when the first marker appears and stops when the last one goes. Pure of
// Audio -- the caller injects `startLoop`, so the lifecycle is node-testable.
//
// The loop ends without an outro when its marker disappears (KO, retreat, evolve); the outro belongs
// to the `status-clear` fx plan, which sounds `<cond>-outro` itself.
import { listConditions } from '../../../../../shared/engine/rules/special-conditions.mjs';
import { CUES, STATUS_CONDITION_KEYS } from './sfx-cues.mjs';

const BOARD_ZONES = ['active', 'bench'];

/**
 * Condition keys (`poison`, `burn`, `sleep`, `paralyze`, `confusion`) held by any Pokémon on the
 * board of the given player views (`view.you` / `view.them`; null and missing zones are skipped).
 * @returns {string[]} sorted, unique
 */
export function heldStatusKeys(playerViews) {
  const held = new Set();
  for (const playerView of playerViews ?? []) {
    for (const zone of BOARD_ZONES) {
      const cards = playerView?.zones?.[zone];
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        for (const condition of listConditions(card)) {
          const key = STATUS_CONDITION_KEYS[condition];
          if (key) held.add(key);
        }
      }
    }
  }
  return [...held].sort();
}

export const loopKeyFor = (statusKey) => `${statusKey}-loop`;

/**
 * @param {{startLoop: (key: string, opts: {gain: number, bus: string}) => ({stop: () => void} | null),
 *          enabled: () => boolean}} deps  `enabled` is false when muted or the toggle is off.
 */
export function createStatusAmbience({ startLoop, enabled }) {
  const running = new Map(); // status key -> loop handle
  let held = [];
  let hidden = false;
  let halted = false;

  const stopAll = () => {
    for (const handle of running.values()) {
      try {
        handle.stop();
      } catch {
        /* a loop that already ended is fine */
      }
    }
    running.clear();
  };

  // A loop whose cue is not decoded yet returns null: the next sync retries it.
  const reconcile = () => {
    const wanted = !hidden && !halted && enabled() ? new Set(held) : new Set();
    for (const [key, handle] of [...running]) {
      if (wanted.has(key)) continue;
      try {
        handle.stop();
      } catch {
        /* already stopped */
      }
      running.delete(key);
    }
    for (const key of wanted) {
      if (running.has(key)) continue;
      const loopKey = loopKeyFor(key);
      const cue = CUES[loopKey];
      const handle = startLoop(loopKey, { gain: cue?.gain ?? 0.25, bus: cue?.bus ?? 'status' });
      if (handle) running.set(key, handle);
    }
  };

  return {
    /** The conditions currently held on the board (keys); starts and stops loops to match. */
    sync(statusKeys) {
      held = [...new Set(statusKeys ?? [])];
      reconcile();
    },
    /** Re-evaluate after a setting changed, keeping the remembered conditions. */
    refresh: reconcile,
    /** Tab hidden stops every loop; visible resumes those whose conditions are still held. */
    setHidden(value) {
      hidden = Boolean(value);
      reconcile();
    },
    /** Game over: stop and ignore syncs until `reset`. */
    halt() {
      halted = true;
      stopAll();
    },
    /** New game or room teardown: forget everything. */
    reset() {
      halted = false;
      held = [];
      stopAll();
    },
    running: () => [...running.keys()].sort(),
  };
}
