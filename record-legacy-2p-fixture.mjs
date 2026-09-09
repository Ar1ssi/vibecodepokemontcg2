// Design 002 slice 3.5 — records a real 2-player legacy trace (self-initiated actions +
// per-step client boardHash) for the offline server-truth replay harness
// (server/game/__tests__/replay-harness.test.mjs). Not part of `pnpm test`; run manually
// against a live server to refresh the fixture. Must run with SERVER_AUTHORITATIVE=1 —
// that's what makes the client wait for and use the server's 'dealOrder' (I17) instead of
// a local shuffle; without it the fixture won't exercise the fix the harness checks for:
//   SERVER_AUTHORITATIVE=1 node server/server.js &
//   node record-legacy-2p-fixture.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `e2e-record-${Date.now()}`;

async function waitFor(page, fn, timeout = 25000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for page predicate (last=${JSON.stringify(last)})`);
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { page, name };
}

const browser = await chromium.launch({ headless: true });
const fixture = { roomId: ROOM, players: {} };

try {
  const a = await openClient(browser, 'A');
  const b = await openClient(browser, 'B');

  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);

  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);

  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  await waitFor(a.page, () => window.__ptcg.zone('self', 'prizes').count === 6);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'prizes').count === 6);

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const overlayDeadline = Date.now() + 15000;
  let caller = null;
  while (Date.now() < overlayDeadline && !caller) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    if (await a.page.locator(callBtn).isVisible().catch(() => false)) {
      await a.page.locator(callBtn).click();
      caller = 'A';
      break;
    }
    if (await b.page.locator(callBtn).isVisible().catch(() => false)) {
      await b.page.locator(callBtn).click();
      caller = 'B';
      break;
    }
    await a.page.waitForTimeout(200);
  }
  if (!caller) throw new Error('coin call overlay never opened');

  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count === 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count === 7);

  const aTurn = await a.page.evaluate(() => window.__ptcg.counters().turnPlayer);
  const actor = aTurn === 'self' ? a : b;
  await actor.page.evaluate(() => window.__ptcg.playFromHand(0, 'active'));
  await a.page.waitForTimeout(300); // let the pushAction relay settle before reading logs

  for (const [label, client] of [
    ['A', a],
    ['B', b],
  ]) {
    fixture.players[label] = await client.page.evaluate(() => ({
      stepLog: window.__ptcg.stepLog,
      finalHash: window.__ptcg.boardHash('self'),
    }));
  }

  const outPath = path.join(
    __dirname,
    'server/game/__tests__/fixtures/legacy-2p-recorded.json'
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log('Recorded fixture ->', outPath);
  console.log('A steps:', fixture.players.A.stepLog.length, 'B steps:', fixture.players.B.stepLog.length);
} finally {
  await browser.close();
}
