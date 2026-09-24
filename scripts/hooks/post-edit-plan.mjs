import path from 'node:path';

const LINTABLE_EXTENSIONS = new Set(['.js', '.mjs']);
const IGNORED_SEGMENTS = ['node_modules', '.agent', '.claude', 'out'];

/**
 * Decides which quick checks the post-edit hook runs for one edited file.
 * Pure: file existence is injected so the plan is unit-testable.
 *
 * @param {string} filePath Absolute path of the edited file
 * @param {string} repoRoot Absolute repo root
 * @param {(p: string) => boolean} exists File-existence probe
 * @returns {{ lint: string|null, tests: string[] }} File to lint and test files to run
 */
export function planPostEditChecks(filePath, repoRoot, exists) {
  const none = { lint: null, tests: [] };
  if (!filePath || !repoRoot) return none;

  const relative = path.relative(repoRoot, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return none;

  const segments = relative.split(/[\\/]/);
  if (segments.some((segment) => IGNORED_SEGMENTS.includes(segment))) return none;
  if (!LINTABLE_EXTENSIONS.has(path.extname(filePath))) return none;

  return { lint: filePath, tests: testsFor(filePath, exists) };
}

function testsFor(filePath, exists) {
  if (filePath.endsWith('.test.mjs')) return [filePath];

  const directory = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.m?js$/, '');
  const sibling = path.join(directory, '__tests__', `${base}.test.mjs`);
  return exists(sibling) ? [sibling] : [];
}
