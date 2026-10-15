// A Build & Battle run: TCG Live's RunStatus lifecycle (InProgress → Ended) over the opened box,
// recorded match by match (design 071). Pure apart from the storage object passed in; every storage
// call is guarded, and a storage that throws means the run lives in memory only.

import { parseSession } from '../build-battle/build-battle-session.mjs';

export const RUN_STORAGE_KEY = 'ptcg-sim.build-battle-run.v1';
const RUN_VERSION = 1;
// The client's only match count: BnBLobbyData's test fixture. The real one is server-side.
export const RUN_MATCH_COUNT = 5;
// How long the lobby's Play stays able to claim the next game's result.
export const ARMED_TTL_MS = 12 * 60 * 60 * 1000;

export const RUN_IN_PROGRESS = 'in-progress';
export const RUN_ENDED = 'ended';

/**
 * @typedef {{version: 1, status: 'in-progress'|'ended', boxKey: string, seed: number,
 *   startedAt: number, results: boolean[], endedEarly: boolean, armedAt: number|null,
 *   session: import('../build-battle/build-battle-session.mjs').Session}} Run
 * `results[i]` is true for a win. `armedAt` is set by the lobby's Play and cleared by the result
 * it claims, so one Play fills one node.
 */

const isFinished = (run) => run.results.length >= RUN_MATCH_COUNT;

/** @returns {Run} a run that has just started: nothing played, nothing armed. */
export function createRun({ session, now = Date.now() }) {
  return {
    version: RUN_VERSION,
    status: RUN_IN_PROGRESS,
    boxKey: session.boxKey,
    seed: session.seed,
    startedAt: now,
    results: [],
    endedEarly: false,
    armedAt: null,
    session,
  };
}

/** @returns {Run} the run with the box session replaced (unboxing progress, bound deck). */
export function withSession(run, session) {
  return { ...run, session };
}

const isOpen = (run) => run.status === RUN_IN_PROGRESS && !isFinished(run);

/** @returns {Run} the run with the next Play armed; unchanged once it is over. */
export function armMatch(run, now = Date.now()) {
  return isOpen(run) ? { ...run, armedAt: now } : run;
}

/** @returns {Run} the run with one more result; unchanged once it is over. */
export function recordResult(run, won) {
  if (!isOpen(run)) return run;
  const results = [...run.results, Boolean(won)];
  return {
    ...run,
    results,
    armedAt: null,
    status: results.length >= RUN_MATCH_COUNT ? RUN_ENDED : RUN_IN_PROGRESS,
  };
}

/**
 * A game reported its result. Counts only when the lobby armed a Play, recently, in a run that is
 * still open.
 * @returns {Run|null} the run with the result added, or null when nothing claims it.
 */
export function consumeArmedResult(run, won, now = Date.now()) {
  if (!isOpen(run) || typeof run.armedAt !== 'number') return null;
  if (now - run.armedAt > ARMED_TTL_MS) return null;
  return recordResult(run, won);
}

/** @returns {Run} the run ended early with its results so far; unchanged once it is over. */
export function forfeitRun(run) {
  if (run.status !== RUN_IN_PROGRESS) return run;
  return { ...run, status: RUN_ENDED, endedEarly: true, armedAt: null };
}

/**
 * @returns {{wins: number, losses: number, played: number, total: number, finished: boolean,
 *   nodes: {index: number, state: 'win'|'loss'|'current'|'upcoming'}[]}}
 */
export function runProgress(run) {
  const wins = run.results.filter(Boolean).length;
  const played = run.results.length;
  const finished = run.status === RUN_ENDED || isFinished(run);
  const nodes = Array.from({ length: RUN_MATCH_COUNT }, (_, index) => {
    if (index < played) return { index, state: run.results[index] ? 'win' : 'loss' };
    return { index, state: index === played && !finished ? 'current' : 'upcoming' };
  });
  return {
    wins,
    losses: played - wins,
    played,
    total: RUN_MATCH_COUNT,
    finished,
    nodes,
  };
}

const isTimestamp = (value) => Number.isFinite(value) && value >= 0;

/** @returns {Run|null} the stored run, or null for anything this version cannot trust. */
export function parseRun(json) {
  let value;
  try {
    value = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || value.version !== RUN_VERSION) return null;
  if (value.status !== RUN_IN_PROGRESS && value.status !== RUN_ENDED) return null;
  const { results } = value;
  if (
    !Array.isArray(results) ||
    results.length > RUN_MATCH_COUNT ||
    !results.every((result) => typeof result === 'boolean')
  )
    return null;
  if (!isTimestamp(value.startedAt) || typeof value.endedEarly !== 'boolean') return null;
  if (value.armedAt !== null && !isTimestamp(value.armedAt)) return null;
  const session = parseSession(JSON.stringify(value.session ?? null));
  if (!session || session.boxKey !== value.boxKey || session.seed !== value.seed) return null;
  // A run that played every match is over whatever its stored status says.
  const status = results.length >= RUN_MATCH_COUNT ? RUN_ENDED : value.status;
  return {
    version: RUN_VERSION,
    status,
    boxKey: value.boxKey,
    seed: value.seed,
    startedAt: value.startedAt,
    results: [...results],
    endedEarly: value.endedEarly,
    armedAt: status === RUN_IN_PROGRESS ? value.armedAt : null,
    session,
  };
}

/** @returns {Run|null} */
export function loadRun(storage) {
  try {
    const json = storage?.getItem?.(RUN_STORAGE_KEY);
    return json ? parseRun(json) : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} false when the run could not be stored (memory only). */
export function saveRun(storage, run) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} false when the storage refused the removal. */
export function clearRun(storage) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(RUN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
