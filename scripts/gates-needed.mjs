// `pnpm gates`: says whether this branch's diff needs the full `pnpm test` and `pnpm audit:oracle`,
// so they run only when the change can affect them. `--landing` is for a merge to main. A tree
// that already passed the full suite (recorded by `pnpm test`) never needs it again.
// The decision rules live in scripts/lib/gate-plan.mjs.
import fs from 'node:fs';
import path from 'node:path';

import { changedFiles, fileAt, git } from './lib/changed-files.mjs';
import {
  MANIFEST_FILES,
  dependencyFieldsChanged,
  planGates,
} from './lib/gate-plan.mjs';
import { isTreeVerified, readGreenTrees } from './lib/green-trees.mjs';

const BASE_BRANCH = process.env.TEST_BASE ?? 'main';
const REASONS_SHOWN = 3;

function summarize(reasons) {
  const shown = reasons.slice(0, REASONS_SHOWN).join(', ');
  const hidden = reasons.length - REASONS_SHOWN;
  return hidden > 0 ? `${shown} (+${hidden} more)` : shown;
}

function readWorkingFile(repoRoot, file) {
  const absolute = path.join(repoRoot, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
}

function manifestsWithDependencyChanges(repoRoot, base, files) {
  return MANIFEST_FILES.filter(
    (file) =>
      files.includes(file) &&
      dependencyFieldsChanged(
        fileAt(base, file),
        readWorkingFile(repoRoot, file)
      )
  );
}

// Only a clean worktree has a tree that the suite ran on: the record holds HEAD's tree.
function headTreeVerified() {
  if (git(['status', '--porcelain']) !== '') return false;
  return isTreeVerified(git(['rev-parse', 'HEAD^{tree}']), readGreenTrees());
}

function main() {
  const landing = process.argv.includes('--landing');
  const files = changedFiles(BASE_BRANCH);
  if (files.length === 0 && !landing) {
    console.log(`gates: nothing changed since ${BASE_BRANCH}.`);
    return 0;
  }
  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const base = git(['merge-base', 'HEAD', BASE_BRANCH]);
  const verified = headTreeVerified();
  const { fullTests, oracle } = planGates(files, {
    landing,
    headTreeVerified: verified,
    manifestsWithDependencyChanges: manifestsWithDependencyChanges(
      repoRoot,
      base,
      files
    ),
  });
  const fullTestsLine = fullTests.needed
    ? `REQUIRED: ${summarize(fullTests.reasons)}`
    : verified
      ? 'not needed; this exact tree already passed pnpm test'
      : 'not needed; pnpm test:changed covers this diff';
  const oracleLine = oracle.needed
    ? `REQUIRED: ${summarize(oracle.reasons)}`
    : 'not needed';
  console.log(`${'pnpm test'.padEnd(20)}${fullTestsLine}`);
  console.log(`${'pnpm audit:oracle'.padEnd(20)}${oracleLine}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
