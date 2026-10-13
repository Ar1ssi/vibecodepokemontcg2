// Which expensive gates a diff needs. The full `pnpm test` and `pnpm audit:oracle` (~2 min) run
// only when the diff can change what they check; `pnpm test:changed` covers everything else.
// Pure: takes repo-relative paths, so each rule is unit-testable without git.

const ENGINE_DIR = 'shared/engine/';
// Room state and sync: rules run here at runtime, so any change here can break a live game.
const ROOM_DIR = 'server/game/';
const DEPENDENCY_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'server/package.json',
  'server/package-lock.json',
]);
// The oracle's own inputs: its gate, claim lists and ratchet baseline. Its harness is matched by prefix.
const ORACLE_TOOLING_FILES = new Set([
  'scripts/audit-oracle.mjs',
  'scripts/oracle-baseline.json',
  'scripts/lib/executed-families.mjs',
]);
const ORACLE_TOOLING_PREFIX = 'scripts/lib/oracle-';

/**
 * @param {string[]} changedPaths Repo-relative changed paths (any order, duplicates allowed)
 * @param {{ landing?: boolean }} [options] `landing: true` marks a merge to main, which always needs the full suite
 * @returns {{ fullTests: Verdict, oracle: Verdict }}
 */
export function planGates(changedPaths, { landing = false } = {}) {
  const files = [
    ...new Set(changedPaths.map(toPosixPath).filter(Boolean)),
  ].sort();
  const fullTestReasons = landing ? ['landing on main'] : [];
  const oracleReasons = [];
  for (const file of files) {
    if (isFullTestTrigger(file)) fullTestReasons.push(file);
    if (isOracleTrigger(file)) oracleReasons.push(file);
  }
  return {
    fullTests: verdict(fullTestReasons),
    oracle: verdict(oracleReasons),
  };
}

/** @typedef {{ needed: boolean, reasons: string[] }} Verdict */

function verdict(reasons) {
  return { needed: reasons.length > 0, reasons };
}

function toPosixPath(file) {
  return (file ?? '').replace(/\\/g, '/');
}

// Source files only: a changed test or a __tests__ helper cannot change engine behaviour.
function isSourceCode(file) {
  return (
    /\.m?js$/.test(file) &&
    !/\.test\.m?js$/.test(file) &&
    !file.includes('/__tests__/')
  );
}

function isEngineCode(file) {
  return file.startsWith(ENGINE_DIR) && isSourceCode(file);
}

function isFullTestTrigger(file) {
  if (DEPENDENCY_FILES.has(file)) return true;
  return (
    isEngineCode(file) || (file.startsWith(ROOM_DIR) && isSourceCode(file))
  );
}

// The oracle runs engine attacks and abilities only, so room/netcode and UI changes cannot move it.
function isOracleTrigger(file) {
  if (ORACLE_TOOLING_FILES.has(file)) return true;
  return (
    isEngineCode(file) ||
    (file.startsWith(ORACLE_TOOLING_PREFIX) && isSourceCode(file))
  );
}
