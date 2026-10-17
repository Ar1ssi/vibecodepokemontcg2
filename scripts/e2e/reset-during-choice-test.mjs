// Regression: the multiplayer Reset button must stay clickable while a pending-choice
// overlay (the starting-active picker) is open, including after View Board turns that
// overlay see-through. The overlay used to cover the whole window, side menu included,
// so Reset silently swallowed every click. Run against a SERVER_AUTHORITATIVE=1 server.
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `reset-choice-${Date.now()}`;

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

async function waitFor(page, fn, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

async function openClient(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  await page.evaluate((p) => window.__ptcg.loadFixtureDeck(p), name);
  await page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, name]);
  await waitFor(page, () => window.__ptcg.counters().twoPlayer === true);
  await page.click('#p2Button');
  return page;
}

// The element a real click at the button's centre would land on.
const resetHitTarget = (page) =>
  page.evaluate(() => {
    const rect = document.getElementById('p2ResetButton').getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit?.id || hit?.className || 'nothing';
  });

const pickerOpen = (page) => page.evaluate(() => window.__ptcg.picker().open);
const phase = (page) => page.evaluate(() => window.__ptcg.observe().phase);

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'Alpha');
  const b = await openClient(browser, 'Bravo');
  await a.click('#p2SetupButton');
  await b.click('#p2SetupButton');
  await waitFor(a, () => window.__ptcg.picker().open === true);
  // The opening coin ceremony briefly covers everything and then removes itself.
  await waitFor(a, () => !document.getElementById('turnOrderCoinFlipOverlay'));

  T('1. starting-active picker is open', await pickerOpen(a));
  T('2. Reset is reachable with the picker open', (await resetHitTarget(a)) === 'p2ResetButton',
    `(hit: ${await resetHitTarget(a)})`);

  await a.getByText('View Board', { exact: true }).click();
  T('3. Reset is reachable after View Board', (await resetHitTarget(a)) === 'p2ResetButton',
    `(hit: ${await resetHitTarget(a)})`);

  await a.click('#p2ResetButton', { timeout: 3000 });
  await waitFor(a, () => window.__ptcg.observe().phase === 'setup');
  await waitFor(b, () => window.__ptcg.observe().phase === 'setup');
  T('4. clicking Reset returns both players to setup',
    (await phase(a)) === 'setup' && (await phase(b)) === 'setup');
  T('5. Reset closed both pickers', !(await pickerOpen(a)) && !(await pickerOpen(b)));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
