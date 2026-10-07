// Design 064 O7: the crowd. Pure of Audio -- reaction selection from fx plans, the bed state a
// board implies, and the bed lifecycle (the caller injects `startLoop` / `playSample`).
//
// The crowd has no synthesized stand-in: without samples it is silent.
import { classifyHitOnce } from './damage-hit.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import { CUES } from './sfx-cues.mjs';

export const REACTION_COOLDOWN_MS = 1500;
export const REACTION_FADE_SECONDS = 0.3;
export const GAME_OVER_FADE_SECONDS = 3;
export const BIG_HIT_DAMAGE = 200;
export const SMALL_REACTION_CHANCE = 0.5;
// Prizes a player still has to take. Design: the bed swells to the large crowd as a player "reaches
// last prize" and the crazy loop joins at game point (one prize left); the design does not say how
// the two differ, so the swell comes one prize earlier.
export const LARGE_BED_PRIZES = 2;
export const GAME_POINT_PRIZES = 1;

export const BED_KEYS = Object.freeze({ small: 'crowd-amb-small', large: 'crowd-amb-large' });
export const CRAZY_KEY = 'crowd-crazy';
export const SWELL_KEY = 'to-large';

const SIGNATURE_ENTRIES = new Set(['mega', 'tera']);

const side = (plan, self, opp) => (plan?.user === 'self' ? self : plan?.user === 'opp' ? opp : null);

function damageReaction(plan) {
  const hit = classifyHitOnce(plan);
  return hit?.kind === 'hit' && (hit.amount >= BIG_HIT_DAMAGE || hit.weakness) ? 'surprise' : null;
}

const chance = (key, rng) => (rng() < SMALL_REACTION_CHANCE ? key : null);

// effect -> (plan, rng) -> reaction pool key | null. `evolve-scene` is `evolve` after index.js
// renames it for the scene's score, so both name the same moment.
const REACTION_FOR_EFFECT = {
  knockout: (plan) => side(plan, 'cheer-disappoint', plan?.ruleBoxes > 0 ? 'cheer-large' : 'cheer-medium'),
  damage: damageReaction,
  enter: (plan) => (SIGNATURE_ENTRIES.has(signatureEntryKind(plan?.soundCard)) ? 'additional-reactions' : null),
  'gx-used': () => 'additional-reactions',
  'vstar-used': () => 'additional-reactions',
  evolve: (_plan, rng) => chance('small-reactions', rng),
  'evolve-scene': (_plan, rng) => chance('small-reactions', rng),
  'ability-banner': (_plan, rng) => chance('small-reactions', rng),
  'game-over': (plan) => side(plan, 'cheer-large', 'cheer-disappoint'),
};

/** The crowd reaction pool one fx plan triggers, or null for none. `rng` decides the 50 % rows. */
export function crowdReactionFor(effect, plan, rng = Math.random) {
  if (!Object.hasOwn(REACTION_FOR_EFFECT, effect)) return null;
  return REACTION_FOR_EFFECT[effect](plan, rng);
}

/**
 * The bed a board implies. Prize piles are dealt at setup, so any pile means the battle is on;
 * the larger crowd and the crazy loop follow the fewest prizes either player has left.
 * @param {Array<object|null|undefined>} playerViews `view.you` / `view.them`
 * @returns {{bed: 'small'|'large'|null, crazy: boolean}}
 */
export function bedStateFor(playerViews) {
  const counts = (playerViews ?? [])
    .map((playerView) => playerView?.zones?.prizes?.length ?? 0)
    .filter((count) => count > 0);
  if (counts.length === 0) return { bed: null, crazy: false };
  const fewest = Math.min(...counts);
  return { bed: fewest <= LARGE_BED_PRIZES ? 'large' : 'small', crazy: fewest <= GAME_POINT_PRIZES };
}

/**
 * @param {{startLoop: Function, playSample: Function, enabled: () => boolean}} deps
 *   `enabled` is false when sound is muted or the Crowd toggle is off.
 */
export function createCrowdBed({ startLoop, playSample, enabled }) {
  let state = { bed: null, crazy: false };
  let hidden = false;
  let finished = false;
  let bed = null; // { name: 'small'|'large', handle }
  let crazy = null;
  let swelledTo = null; // the bed name the swell last announced

  const stop = (handle, opts) => {
    try {
      handle?.stop(opts);
    } catch {
      /* a loop that already ended is fine */
    }
  };

  const stopAll = (opts) => {
    stop(bed?.handle, opts);
    stop(crazy, opts);
    bed = null;
    crazy = null;
  };

  const start = (key) => startLoop(key, { gain: CUES[key].gain, bus: CUES[key].bus });

  // A loop whose cue is not decoded yet returns null: the next sync or refresh retries it.
  const reconcile = () => {
    const wanted = !hidden && !finished && enabled() ? state : { bed: null, crazy: false };
    if (bed && bed.name !== wanted.bed) {
      stop(bed.handle);
      bed = null;
    }
    if (wanted.bed && !bed) {
      const handle = start(BED_KEYS[wanted.bed]);
      if (handle) {
        const swell = wanted.bed === 'large' && swelledTo === 'small';
        bed = { name: wanted.bed, handle };
        swelledTo = wanted.bed;
        if (swell) playSample(SWELL_KEY, { gain: CUES[SWELL_KEY].gain, bus: CUES[SWELL_KEY].bus });
      }
    }
    if (crazy && !wanted.crazy) {
      stop(crazy);
      crazy = null;
    }
    if (wanted.crazy && !crazy) crazy = start(CRAZY_KEY);
  };

  return {
    /** The bed state of the board just applied; starts and stops the loops to match. */
    sync(next) {
      state = { bed: next?.bed ?? null, crazy: Boolean(next?.crazy) };
      if (!state.bed) {
        finished = false; // no prize piles: a new game, re-arm after a game-over fade
        swelledTo = null;
      }
      reconcile();
    },
    /** Re-evaluate after a setting changed, keeping the remembered state. */
    refresh: reconcile,
    /** Tab hidden stops the loops; visible resumes them if the state still holds. */
    setHidden(value) {
      hidden = Boolean(value);
      reconcile();
    },
    /** Game over: fade the beds out and ignore syncs until a new game. */
    finish() {
      finished = true;
      stopAll({ fadeSeconds: GAME_OVER_FADE_SECONDS });
    },
    /** Room teardown: forget everything. */
    reset() {
      finished = false;
      state = { bed: null, crazy: false };
      swelledTo = null;
      stopAll();
    },
    running: () => ({ bed: bed?.name ?? null, crazy: crazy !== null }),
  };
}
