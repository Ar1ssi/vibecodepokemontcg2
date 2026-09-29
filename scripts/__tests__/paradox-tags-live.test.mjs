import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Live drift check for the Ancient/Future table (design 058) — opt-in via `pnpm test:live` (LIVE_TESTS=1).
const skipLive = !globalThis.fetch || process.env.LIVE_TESTS !== '1';
const GENERATOR = fileURLToPath(new URL('../generate-paradox-tags.mjs', import.meta.url));

test('live: paradox-tags.generated.mjs matches pokemontcg.io and TCGdex', { skip: skipLive, timeout: 600_000 }, () => {
  const { TCGDEX_CACHE_DIR: _cache, ...env } = process.env;
  const run = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
