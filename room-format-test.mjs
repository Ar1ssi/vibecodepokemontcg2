import { chromium } from 'playwright';
// Design 053: two players agree on the room's format, and the deal holds them to it.
// Needs a server (PTCG_URL, default :4000); run it with SERVER_AUTHORITATIVE=1 to match
// production — the legacy relay server cannot tell when cards are dealt, so row 6 needs it.
// OUT=<dir> saves a screenshot per step; CHROMIUM_PATH picks the browser binary.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = `rf-${Date.now()}`;
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
const panel = (c) => c.page.evaluate(() => { const p = document.getElementById('roomFormatPanel'); return { hidden: p.hidden, mode: p.dataset.mode || '', text: p.querySelector('.room-format-text')?.textContent || '', buttons: [...p.querySelectorAll('button')].map((b) => b.dataset.roomFormatButton) }; });
const waitMode = (c, mode) => waitFor(c.page, (m) => document.getElementById('roomFormatPanel').dataset.mode === m, 8000, mode);
const click = (c, id) => c.page.click(`#roomFormatPanel [data-room-format-button="${id}"]`);
const chat = (c) => c.page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '');
const shot = (c, n) => (OUT ? c.page.screenshot({ path: `${OUT}/${n}.png` }) : null);
const loadDeck = (c, prefix, format) => c.page.evaluate(async ([p, f]) => {
  const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
  const rows = e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]);
  window.__ptcg.loadDeckList(rows, f);
}, [prefix, format]);
const deckCount = (c) => waitFor(c.page, () => { const n = window.__ptcg.zone('self', 'deck').count; return n >= 20 ? n : 0; });
const playSetup = async (a, b) => {
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
  return waitFor(a.page, () => window.__ptcg.observe().phase !== 'setup' && window.__ptcg.zone('self', 'hand').count >= 7);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const a = await openClient(browser, 'Ash');
  const b = await openClient(browser, 'Gary');
  await joinRoom(a);
  await a.page.waitForTimeout(600);
  T('row 1: alone in the room, no format panel', (await panel(a)).hidden);
  await joinRoom(b);
  T('row 2: both players see the picker', Boolean(await waitMode(a, 'pick')) && Boolean(await waitMode(b, 'pick')));
  await shot(b, '1-pick');
  await click(a, 'propose-build-battle');
  T('row 3: proposer waits, opponent answers', Boolean(await waitMode(a, 'waiting')) && Boolean(await waitMode(b, 'answer')), JSON.stringify((await panel(b)).text));
  await shot(a, '2-waiting'); await shot(b, '3-answer');
  await click(b, 'propose-tcg');
  T('row 3b: counter-proposal swaps roles', Boolean(await waitMode(a, 'answer')) && Boolean(await waitMode(b, 'waiting')));
  await click(b, 'withdraw');
  T('withdraw returns both to the picker', Boolean(await waitMode(a, 'pick')) && Boolean(await waitMode(b, 'pick')));
  await click(a, 'propose-build-battle');
  await waitMode(b, 'answer');
  const popups = [];
  b.context.on('page', (p) => popups.push(p));
  await click(b, 'accept');
  T('row 3a: both agreed on Build & Battle', Boolean(await waitMode(a, 'agreed')) && Boolean(await waitMode(b, 'agreed')), JSON.stringify((await panel(a))));
  await b.page.waitForTimeout(800);
  T('accepting Build & Battle opened the box tab', popups.some((p) => p.url().includes('/build-and-battle')), JSON.stringify(popups.map((p) => p.url())));
  T('chat says the format was agreed', (await chat(a)).includes('Both players agreed: this match plays Build & Battle'));
  await shot(a, '4-agreed');

  // Row 7: a reload rejoins into the agreed state.
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(b.page, () => window.__ptcg?.ready === true, 30000);
  await joinRoom(b);
  T('row 7: rejoin shows the agreed format', Boolean(await waitMode(b, 'agreed')), JSON.stringify((await panel(b)).text));

  // Row 8: Standard decks are refused in a Build & Battle room.
  await loadDeck(a, 'Alpha', 'tcg'); await loadDeck(b, 'Bravo', 'tcg');
  await deckCount(a); await deckCount(b);
  await a.page.evaluate(() => window.__ptcg.readyUp()); await b.page.evaluate(() => window.__ptcg.readyUp());
  await a.page.waitForTimeout(2500);
  const aChat = await chat(a);
  const refused = await a.page.evaluate(() => ({ phase: window.__ptcg.observe().phase, prizes: window.__ptcg.zone('self', 'prizes').count }));
  T('row 8: Standard decks in a B&B room are not dealt', refused.prizes === 0 && refused.phase === 'setup', JSON.stringify(refused));
  T('row 8: chat names the room format', aChat.includes('This room plays Build & Battle'), aChat.slice(-220));
  await shot(a, '5-refused');

  await loadDeck(a, 'Alpha', 'build-battle'); await loadDeck(b, 'Bravo', 'build-battle');
  await a.page.waitForTimeout(1200);
  await playSetup(a, b);
  const prizes = await Promise.all([a, b].map((c) => c.page.evaluate(() => window.__ptcg.zone('self', 'prizes').count)));
  T('Build & Battle decks deal 4 Prizes each', prizes[0] === 4 && prizes[1] === 4, JSON.stringify(prizes));
  await a.page.waitForTimeout(800);
  T('row 6: after the deal the panel offers no switch', (await panel(a)).buttons.length === 0, JSON.stringify(await panel(a)));
  await a.page.evaluate(async (room) => (await import('/src/state.js')).socket.emit('roomFormatAction', { roomId: room, type: 'propose', format: 'tcg' }), ROOM);
  await a.page.waitForTimeout(800);
  T('row 6: a switch sent after the deal is refused', (await chat(a)).includes('The format is fixed once the cards are dealt'));
  await shot(a, '6-dealt');
  const authoritative = await a.page.evaluate(async () => Boolean((await import('/src/state.js')).systemState.serverAuthoritative));
  console.log('mode:', authoritative ? 'server-authoritative' : 'legacy');
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
