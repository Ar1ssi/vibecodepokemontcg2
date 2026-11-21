import { chromium } from 'playwright';
// Design 090: the homebrew clock — the pre-deal toggle, then both banks once play starts.
// Needs a server (PTCG_URL, default :4000). OUT=<dir> saves screenshots.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = `hbc-${Date.now()}`;
const OUT = process.env.OUT || '';
let failed = 0;
const T = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`); if (!cond) failed += 1; };
async function waitFor(page, fn, timeout = 15000, arg) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) { last = await page.evaluate(fn, arg); if (last) return last; await page.waitForTimeout(150); }
  return last;
}
async function openClient(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (d) => d.accept());
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ status: 302, headers: { location: `${BASE}/socket.io/socket.io.js` } }));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  return { page, context, name };
}
const joinRoom = async (c) => { await c.page.click('#p2Button'); await c.page.evaluate(([r, u]) => window.__ptcg.joinRoom(r, u), [ROOM, c.name]); await waitFor(c.page, () => window.__ptcg.counters().twoPlayer === true); };
const panel = (c) => c.page.evaluate(() => {
  const p = document.getElementById('homebrewClockPanel');
  return {
    hidden: p.hidden,
    mode: p.dataset.mode || '',
    checked: p.querySelector('[data-homebrew-clock-toggle]')?.checked ?? null,
    rows: [...p.querySelectorAll('.homebrew-clock-row')].map((r) => ({ name: r.querySelector('.homebrew-clock-name').textContent, time: r.querySelector('.homebrew-clock-time').textContent, running: r.dataset.running === 'true' })),
  };
});
const chat = (c) => c.page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '');
const shot = (c, n) => (OUT ? c.page.screenshot({ path: `${OUT}/${n}.png` }) : null);
// The fixture deck with its first card swapped for a homebrew one (customhb-578, Arceus ex).
const loadDeck = (c, prefix, homebrew) => c.page.evaluate(async ([p, hb]) => {
  const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
  const rows = e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]);
  if (hb) rows[0][6] = 'customhb-578';
  window.__ptcg.loadDeckList(rows, 'tcg');
}, [prefix, homebrew]);
const deckCount = (c) => waitFor(c.page, () => { const n = window.__ptcg.zone('self', 'deck').count; return n >= 20 ? n : 0; });
const readyAndCall = async (a, b) => {
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const deadline = Date.now() + 15000; let called = false;
  while (Date.now() < deadline && !called) {
    for (const c of [a, b]) {
      if (!called && (await c.page.locator(callBtn).isVisible().catch(() => false))) { await c.page.locator(callBtn).click(); called = true; }
    }
    if (!called) await a.page.waitForTimeout(200);
    if (!called && (await a.page.evaluate(() => window.__ptcg.observe().phase !== 'setup'))) break;
  }
  // The coin winner's go-first prompt, then each seat's Starting Active.
  for (const c of [a, b]) {
    const first = c.page.getByText('Go first', { exact: false });
    if (await first.isVisible().catch(() => false)) await first.click().catch(() => {});
  }
  for (const c of [a, b]) {
    await waitFor(c.page, () => window.__ptcg.picker().open === true, 15000);
    await waitFor(c.page, () => !document.getElementById('turnOrderCoinFlipOverlay'));
    await c.page.evaluate(() => window.__ptcg.pick([0]));
  }
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const a = await openClient(browser, 'Ash');
  const b = await openClient(browser, 'Gary');
  await joinRoom(a);
  await joinRoom(b);
  const toggleOn = () => document.querySelector('#homebrewClockPanel [data-homebrew-clock-toggle]')?.checked === true;
  T('both seats see the toggle, on by default',
    Boolean(await waitFor(a.page, toggleOn)) && Boolean(await waitFor(b.page, toggleOn)),
    JSON.stringify([await panel(a), await panel(b)]));
  await shot(a, '1-toggle');

  await a.page.click('#homebrewClockPanel [data-homebrew-clock-toggle]');
  T('turning it off reaches both seats', Boolean(await waitFor(b.page, () => document.querySelector('#homebrewClockPanel [data-homebrew-clock-toggle]')?.checked === false)));
  T('chat names who turned it off', (await chat(b)).includes('Ash turned the homebrew clock off'));
  await b.page.click('#homebrewClockPanel [data-homebrew-clock-toggle]');
  T('turning it back on reaches both seats', Boolean(await waitFor(a.page, () => document.querySelector('#homebrewClockPanel [data-homebrew-clock-toggle]')?.checked === true)));

  await loadDeck(a, 'Alpha', true); await loadDeck(b, 'Bravo', true);
  await deckCount(a); await deckCount(b);
  await readyAndCall(a, b);
  const running = await waitFor(a.page, () => document.getElementById('homebrewClockPanel').dataset.mode === 'clock', 20000);
  T('once play starts both seats see the clocks', Boolean(running) && Boolean(await waitFor(b.page, () => document.getElementById('homebrewClockPanel').dataset.mode === 'clock')), JSON.stringify(await panel(a)));
  const before = await panel(a);
  T('own row first, banks start at 6:00', before.rows[0]?.name === 'You' && before.rows.every((r) => /^(6:00|5:5\d)$/.test(r.time)), JSON.stringify(before.rows));
  T('exactly one clock runs', before.rows.filter((r) => r.running).length === 1);
  await a.page.waitForTimeout(2200);
  const after = await panel(a);
  const ticking = after.rows.find((r) => r.running);
  T('the running clock counts down', ticking && ticking.time !== '6:00', JSON.stringify(after.rows));
  await shot(a, '2-clocks');
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
