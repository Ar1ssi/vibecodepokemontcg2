// `pnpm test:changed`: runs only the __tests__ files covering what this branch touched —
// commits since it forked from main, plus staged, unstaged and untracked files. Fast check for
// patches; the full `pnpm test` still gates merges to main and engine changes.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { planChangedTests } from './hooks/post-edit-plan.mjs';

const BASE_BRANCH = process.env.TEST_BASE ?? 'main';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim();
}

function lines(text) {
  return text ? text.split('\n').filter(Boolean) : [];
}

function changedFiles() {
  const base = git(['merge-base', 'HEAD', BASE_BRANCH]);
  return [
    ...lines(git(['diff', '--name-only', base, 'HEAD'])),
    ...lines(git(['diff', '--name-only', 'HEAD'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard'])),
  ];
}

function main() {
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const tests = planChangedTests(changedFiles(), repoRoot, existsSync);
  if (tests.length === 0) {
    console.log(`test:changed: no mapped __tests__ files for changes since ${BASE_BRANCH}.`);
    return 0;
  }
  console.log(`test:changed: ${tests.length} file(s)`);
  for (const file of tests) console.log(`  ${path.relative(repoRoot, file)}`);
  const run = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', cwd: repoRoot });
  return run.status ?? 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
