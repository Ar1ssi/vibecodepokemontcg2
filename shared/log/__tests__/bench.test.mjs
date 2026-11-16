import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createLogger } from '../logger.mjs';
import { createRing } from '../ring.mjs';
import { LIMITS } from '../log-schema.mjs';

const CALLS = 50000;
const BUDGET_MS = 500;

function timeOnce() {
  const ring = createRing(LIMITS.clientRing);
  let clock = 0;
  // 17 ms per call keeps one cat|ev under the 60-per-second flood gate (1 ms per call would trip it).
  const logger = createLogger({ now: () => (clock += 17), sink: (entry) => ring.push(entry) });
  const detail = { applied: true, ms: 3.2, events: ['cardMoved'], you: { added: 0, moved: 1 } };

  const start = performance.now();
  for (let i = 0; i < CALLS; i++) logger.debug('view', 'apply', detail, { sv: i });
  const elapsed = performance.now() - start;
  assert.equal(ring.size() + ring.dropped(), CALLS);
  assert.equal(logger.suppressed().flooded, 0);
  return elapsed;
}

test('50 000 log.debug calls into a real ring finish under 500 ms, none flooded or lost', (t) => {
  // Best of three: the budget is about the code, not about what else the machine is doing
  // while the whole suite runs in parallel.
  const runs = [timeOnce(), timeOnce(), timeOnce()];
  t.diagnostic(`${CALLS} calls: ${runs.map((ms) => ms.toFixed(1)).join(' / ')} ms`);
  const best = Math.min(...runs);
  assert.ok(best < BUDGET_MS, `${best.toFixed(1)} ms >= ${BUDGET_MS} ms`);
});
