import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Live TCGdex drift check — opt-in via `pnpm test:live` (LIVE_TESTS=1).
const skipLive = !globalThis.fetch || process.env.LIVE_TESTS !== '1';
const GENERATOR = fileURLToPath(new URL('../generate-build-battle-box.mjs', import.meta.url));

test('live: build-battle.generated.mjs matches TCGdex', { skip: skipLive }, () => {
  const run = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
