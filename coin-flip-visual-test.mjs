// Live visual check for the TCG Live-style coin-flip ceremony. Two browsers join
// a rules-mode 2P room and ready up; both must show the full-screen, dimmed
// #turnOrderCoinFlipOverlay with the same chosen coin, then fade it away.
//
// Usage:
//   SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js &
//   PTCG_URL=http://localhost:4100 node coin-flip-visual-test.mjs
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4100';
const ROOM = process.env.PTCG_ROOM || `e2e-coin-flip-${Date.now()}`;

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

async function waitFor(page, fn, timeout = 20000, label = '') {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(120);
  }
  throw new Error(`timeout waiting for ${label || fn.toString()} (last=${JSON.stringify(last)})`);
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { context, page, name };
}

const overlayState = () => {
  const overlay = document.getElementById('turnOrderCoinFlipOverlay');
  if (!overlay) return null;
  const img = overlay.querySelector('.coin-face.coin-front img');
  return {
    open: true,
    fading: overlay.classList.contains('fading'),
    src: img?.getAttribute('src') || null,
    label: overlay.querySelector('.turn-order-coin-flip-label')?.textContent || '',
  };
};

const browser = await chromium.launch({ headless: true });
let a;
let b;

try {
  a = await openClient(browser, 'A');
  b = await openClient(browser, 'B');

  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);

  // debugMode(true) disables rules; passing false re-enables them, which is what
  // makes the opening coin ceremony (not just the server flip) run.
  await a.page.evaluate(() => window.__ptcg.debugMode(false));
  await b.page.evaluate(() => window.__ptcg.debugMode(false));

  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);

  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());

  const [aSeen, bSeen] = await Promise.all([
    waitFor(a.page, overlayState, 15000, 'coin ceremony on A').then(() => true).catch(() => false),
    waitFor(b.page, overlayState, 15000, 'coin ceremony on B').then(() => true).catch(() => false),
  ]);
  T('the ceremony overlay appears on both clients after the coin call', aSeen && bSeen, `A=${aSeen} B=${bSeen}`);

  if (aSeen && bSeen) {
    const [aState, bState] = await Promise.all([
      a.page.evaluate(overlayState),
      b.page.evaluate(overlayState),
    ]);
    T('the ceremony dims the board with the turn-order label', aState.open && aState.label.length > 0, aState.label);
    T(
      'both clients render the same chosen coin',
      Boolean(aState.src) && aState.src === bState.src,
      `${aState.src} vs ${bState.src}`
    );
  }

  const [aClosed, bClosed] = await Promise.all([
    a.page.evaluate(() => !document.getElementById('turnOrderCoinFlipOverlay')),
    b.page.evaluate(() => !document.getElementById('turnOrderCoinFlipOverlay')),
  ]);
  // It may still be mid-ceremony right after the assertion; wait for the fade.
  if (!(aClosed && bClosed)) {
    await Promise.all([
      waitFor(a.page, () => !document.getElementById('turnOrderCoinFlipOverlay'), 6000, 'A overlay fade'),
      waitFor(b.page, () => !document.getElementById('turnOrderCoinFlipOverlay'), 6000, 'B overlay fade'),
    ]);
  }
  T('the ceremony fades out and removes itself', true);
} catch (err) {
  failed += 1;
  console.log('FAIL —', err.message);
} finally {
  await a?.context.close().catch(() => {});
  await b?.context.close().catch(() => {});
  await browser.close();
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
