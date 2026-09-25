// `pnpm test:live`: runs the network-dependent TCGdex smoke tests that the default suite skips.
// Sets LIVE_TESTS here instead of in package.json so it works in cmd, PowerShell and sh alike.
import { spawnSync } from 'node:child_process';

const LIVE_TEST_FILES = ['shared/engine/rules/__tests__/card-identity-live.test.mjs'];

const run = spawnSync(process.execPath, ['--test', ...LIVE_TEST_FILES], {
  stdio: 'inherit',
  env: { ...process.env, LIVE_TESTS: '1' },
});
process.exitCode = run.status ?? 1;
