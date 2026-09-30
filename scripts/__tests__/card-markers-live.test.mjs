import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Live drift check for the printed-marker table (I220) — opt-in via `pnpm test:live` (LIVE_TESTS=1).
const skipLive = !globalThis.fetch || process.env.LIVE_TESTS !== '1';
const GENERATOR = fileURLToPath(new URL('../generate-card-markers.mjs', import.meta.url));

test('live: card-markers.generated.mjs matches pkmncards and TCGdex', { skip: skipLive, timeout: 900_000 }, () => {
  const { TCGDEX_CACHE_DIR: _cache, ...env } = process.env;
  const run = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
