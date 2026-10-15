// Which expensive gates a diff needs. The full `pnpm test` and `pnpm audit:oracle` (~2 min) run
// only when the diff can change what they check; `pnpm test:changed` covers everything else.
// Pure: takes repo-relative paths and the facts the caller read from git, so each rule is
// unit-testable without a repository.

const ENGINE_DIR = 'shared/engine/';
// Room state and sync: rules run here at runtime, so any change here can break a live game.
const ROOM_DIR = 'server/game/';
// A lockfile change alters what gets installed, whatever the edit looks like.
const LOCKFILES = new Set(['pnpm-lock.yaml', 'server/package-lock.json']);
export const MANIFEST_FILES = ['package.json', 'server/package.json'];
// The manifest fields that change what gets installed or how. Scripts, name and version do not.
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
  'resolutions',
  'pnpm',
  'workspaces',
];
// The oracle's own inputs: its gate, claim lists and ratchet baseline. Its harness is matched by prefix.
const ORACLE_TOOLING_FILES = new Set([
  'scripts/audit-oracle.mjs',
  'scripts/oracle-baseline.json',
  'scripts/lib/executed-families.mjs',
]);
const ORACLE_TOOLING_PREFIX = 'scripts/lib/oracle-';

/**
 * @param {string[]} changedPaths Repo-relative changed paths (any order, duplicates allowed)
 * @param {object} [options]
 * @param {boolean} [options.headTreeVerified] HEAD's tree already passed the full suite (clean worktree only)
 * @param {string[]} [options.manifestsWithDependencyChanges] Manifests whose dependency fields changed
 * @returns {{ fullTests: Verdict, oracle: Verdict }}
 */
export function planGates(
  changedPaths,
  { headTreeVerified = false, manifestsWithDependencyChanges = [] } = {}
) {
  const files = [
    ...new Set(changedPaths.map(toPosixPath).filter(Boolean)),
  ].sort();
  const dependencyManifests = new Set(
    manifestsWithDependencyChanges.map(toPosixPath)
  );
  const fullTestReasons = [];
  const oracleReasons = [];
  // A tree the full suite already passed needs no second run, whatever the diff touches.
  if (!headTreeVerified) {
    for (const file of files) {
      if (isFullTestTrigger(file, dependencyManifests))
        fullTestReasons.push(file);
    }
  }
  for (const file of files) {
    if (isOracleTrigger(file)) oracleReasons.push(file);
  }
  return {
    fullTests: verdict(fullTestReasons),
    oracle: verdict(oracleReasons),
  };
}

/**
 * Whether a manifest edit changed anything that affects installed packages. Missing text means
 * the file was added or deleted; unparseable text counts as changed, so the gate fails safe.
 *
 * @param {string|null} beforeText Manifest text at the base branch, or null if absent
 * @param {string|null} afterText Manifest text now, or null if absent
 * @returns {boolean}
 */
export function dependencyFieldsChanged(beforeText, afterText) {
  if (beforeText === afterText) return false;
  const before = parseManifest(beforeText);
  const after = parseManifest(afterText);
  if (!before || !after) return true;
  return DEPENDENCY_FIELDS.some(
    (field) =>
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
  );
}

/** @typedef {{ needed: boolean, reasons: string[] }} Verdict */

function verdict(reasons) {
  return { needed: reasons.length > 0, reasons };
}

function toPosixPath(file) {
  return (file ?? '').replace(/\\/g, '/');
}

function parseManifest(text) {
  if (text == null) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function isFullTestTrigger(file, dependencyManifests) {
  if (LOCKFILES.has(file) || dependencyManifests.has(file)) return true;
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
