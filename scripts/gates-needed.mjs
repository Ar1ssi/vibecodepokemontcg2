// `pnpm gates`: says whether this branch's diff needs the full `pnpm test` and `pnpm audit:oracle`,
// so they run only when the change can affect them. `--landing` is for a merge to main, which
// always needs the full suite. The decision rules live in scripts/lib/gate-plan.mjs.
import { changedFiles } from './lib/changed-files.mjs';
import { planGates } from './lib/gate-plan.mjs';

const BASE_BRANCH = process.env.TEST_BASE ?? 'main';
const REASONS_SHOWN = 3;

function summarize(reasons) {
  const shown = reasons.slice(0, REASONS_SHOWN).join(', ');
  const hidden = reasons.length - REASONS_SHOWN;
  return hidden > 0 ? `${shown} (+${hidden} more)` : shown;
}

function main() {
  const landing = process.argv.includes('--landing');
  const files = changedFiles(BASE_BRANCH);
  if (files.length === 0 && !landing) {
    console.log(`gates: nothing changed since ${BASE_BRANCH}.`);
    return 0;
  }
  const plan = planGates(files, { landing });
  const { fullTests, oracle } = plan;
  console.log(
    fullTests.needed
      ? `${'pnpm test'.padEnd(20)}REQUIRED: ${summarize(fullTests.reasons)}`
      : `${'pnpm test'.padEnd(20)}not needed; pnpm test:changed covers this diff`
  );
  console.log(
    oracle.needed
      ? `${'pnpm audit:oracle'.padEnd(20)}REQUIRED: ${summarize(oracle.reasons)}`
      : `${'pnpm audit:oracle'.padEnd(20)}not needed`
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
