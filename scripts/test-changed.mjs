// `pnpm test:changed`: runs only the __tests__ files covering what this branch touched —
// commits since it forked from main, plus staged, unstaged and untracked files. Fast check for
// patches; the full `pnpm test` still gates merges to main and engine changes.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { planChangedTests } from './hooks/post-edit-plan.mjs';
import { changedFiles, git } from './lib/changed-files.mjs';

const BASE_BRANCH = process.env.TEST_BASE ?? 'main';

function main() {
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const tests = planChangedTests(changedFiles(BASE_BRANCH), repoRoot, existsSync);
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
