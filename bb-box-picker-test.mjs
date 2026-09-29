import { chromium } from 'playwright';
// Design 054 § Builder tab, by hand rows 1, 5, 6, 9, 14, 15, 22, 25 and 29: the box picker, `?box=`, the
// load and load-error states, and the starting deck of each box kind. Needs a server (PTCG_URL,
// default :4000). CHROMIUM_PATH picks the browser binary.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const STORAGE_KEY = 'ptcg-sim.build-battle.v1';
let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};
async function waitFor(page, fn, timeout = 15000, arg) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg).catch(() => null);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  return last;
}
const picker = (page) =>
  page.evaluate(() => ({
    era: document.querySelector('#buildBattleEra .bb-era-chip[aria-pressed="true"]')?.dataset.era ?? null,
    box: document.getElementById('buildBattleBox')?.value ?? null,
    options: [...document.querySelectorAll('#buildBattleBox option')].map((option) => option.value),
    title: document.querySelector('#buildBattleBoxPanel .bb-title')?.textContent ?? null,
    note: document.getElementById('buildBattleBoxNote')?.textContent ?? null,
    open: document.getElementById('buildBattleOpenBox')?.disabled ?? null,
    opened: Boolean(document.getElementById('buildBattleNewBox')),
  }));
const deckCount = (page) =>
  page.evaluate(() => document.querySelector('.native-deck-builder-pane-side')?.innerText.match(/\b(\d+)\s*\/\s*40\b/)?.[1] ?? null);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('page', (p) => p.on('dialog', (d) => d.accept()));
  await context.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await context.route('https://cdn.socket.io/**', (r) =>
    r.fulfill({ status: 302, headers: { location: `${BASE}/socket.io/socket.io.js` } })
  );
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  const fresh = async (query) => {
    await page.goto(`${BASE}/build-and-battle?e2e=1${query}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(page, () => document.getElementById('buildBattleOpenBox')?.disabled === false, 20000);
  };

  // Row 1: an unknown `?box=` falls back to the default box, its era pressed.
  await fresh('&box=nope');
  let state = await picker(page);
  T('row 1 ?box=nope opens the default box on its era', state.box === 'phantasmal-flames' && state.era === 'me', JSON.stringify(state));

  // `?box=` names a box: that box, the era's boxes in the select, in release order.
  await fresh('&box=mega-evolution');
  state = await picker(page);
  T(
    '?box=mega-evolution selects it; the select lists the era in release order',
    state.box === 'mega-evolution' && state.options[0] === 'mega-evolution' && state.options.includes('phantasmal-flames'),
    JSON.stringify(state)
  );

  // Row 29: the select is a keyboard control; changing it loads that box and keeps focus there.
  await page.focus('#buildBattleBox');
  await page.keyboard.press('ArrowDown');
  await waitFor(page, () => document.getElementById('buildBattleOpenBox')?.disabled === false);
  state = await picker(page);
  const focused = await page.evaluate(() => document.activeElement?.id);
  T('row 29 the box select moves by keyboard and keeps focus', state.box === 'phantasmal-flames' && focused === 'buildBattleBox', JSON.stringify({ state, focused }));
  T('the picked box goes into the URL', new URL(page.url()).searchParams.get('box') === 'phantasmal-flames', page.url());

  // Row 5: a set module that fails to load shows the error; the picker stays usable; no session.
  await page.route('**/core/build-battle/sets/me03.generated.mjs', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await page.selectOption('#buildBattleBox', 'perfect-order');
  await waitFor(page, () => /Could not load/.test(document.getElementById('buildBattleBoxNote')?.textContent || ''));
  state = await picker(page);
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  T(
    'row 5 a failed load says so, Open stays off, the picker is usable, no session',
    /Could not load Perfect Order Build & Battle Box/.test(state.note) && state.open === true && state.options.length > 0 && stored === null,
    JSON.stringify(state)
  );
  await page.selectOption('#buildBattleBox', 'chaos-rising');
  await waitFor(page, () => document.getElementById('buildBattleOpenBox')?.disabled === false);
  state = await picker(page);
  T('row 5 another box still loads after the failure', state.box === 'chaos-rising' && state.open === false, JSON.stringify(state));
  await page.unroute('**/core/build-battle/sets/me03.generated.mjs');

  // Row 6: while a box loads, Open is off; a slow load renders only once it settles.
  await page.route('**/core/build-battle/boxes/pitch-black.generated.mjs', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await r.continue();
  });
  await page.selectOption('#buildBattleBox', 'pitch-black');
  state = await picker(page);
  T('row 6 Open is off while the box loads', state.open === true && /Loading Pitch Black/.test(state.note), JSON.stringify(state));
  await waitFor(page, () => document.getElementById('buildBattleOpenBox')?.disabled === false, 10000);
  state = await picker(page);
  T('row 6 the box is ready once its data is in', state.box === 'pitch-black' && state.open === false, JSON.stringify(state));
  await page.unroute('**/core/build-battle/boxes/pitch-black.generated.mjs');

  // Row 22: once a box is open the picker is gone; New box brings it back on the same box.
  await page.click('#buildBattleOpenBox');
  await page.waitForSelector('#bbUnboxing [data-control="skip"]', { timeout: 15000 });
  await page.click('#bbUnboxing [data-control="skip"]');
  await waitFor(page, () => !document.getElementById('bbUnboxingStage'), 10000);
  await page.waitForTimeout(500);
  state = await picker(page);
  T('row 22 an opened box has no picker', state.opened && state.box === null, JSON.stringify(state));
  const opened = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  T('the session is the picked box', opened?.boxKey === 'pitch-black', opened?.boxKey);
  T('rows 14 + 15 a fixed-decks box starts the editor at 40 / 40', (await deckCount(page)) === '40');
  await page.click('#buildBattleTabBox');
  await page.click('#buildBattleNewBox');
  await waitFor(page, () => Boolean(document.getElementById('buildBattleOpenBox')));
  state = await picker(page);
  T('row 22 New box returns to the picker on the same box', state.box === 'pitch-black', JSON.stringify(state));

  // A reload with a saved box resumes it whatever `?box=` says.
  await page.click('#buildBattleOpenBox');
  await waitFor(page, (key) => Boolean(localStorage.getItem(key)), 10000, STORAGE_KEY);
  await page.goto(`${BASE}/build-and-battle?e2e=1&box=mega-evolution`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => Boolean(document.getElementById('buildBattleNewBox')), 20000);
  const resumed = await page.evaluate(() => document.querySelector('#buildBattleBoxPanel .bb-title')?.textContent);
  T('a saved box resumes over ?box=', /^Pitch Black Build & Battle Box · /.test(resumed || ''), resumed);

  // Row 14: an Evolution-deck box (Scarlet & Violet) starts the editor at its 23 + 17 = 40.
  await fresh('&box=temporal-forces');
  state = await picker(page);
  T('?box=temporal-forces opens on the Scarlet & Violet era', state.box === 'temporal-forces' && state.era === 'sv', JSON.stringify(state));
  await page.click('#buildBattleOpenBox');
  await page.waitForSelector('#bbUnboxing [data-control="skip"]', { timeout: 15000 });
  await page.click('#bbUnboxing [data-control="skip"]');
  await waitFor(page, () => !document.getElementById('bbUnboxingStage'), 10000);
  await page.waitForTimeout(500);
  const evolution = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const energy = (evolution?.energy || []).reduce((sum, [, qty]) => sum + qty, 0);
  T(
    'row 14 the session holds both groups, the Evolution pack and its Energy to 40',
    evolution?.groupKeys?.[0] === evolution?.deckKey && evolution.evolutionPack.length + energy === 40,
    JSON.stringify({ groupKeys: evolution?.groupKeys, pack: evolution?.evolutionPack?.length, energy: evolution?.energy })
  );
  T('row 14 an Evolution-deck box starts the editor at 40 / 40', (await deckCount(page)) === '40');

  // Row 15: an Evolution-pack box (Sword & Shield) starts the editor at its 23 cards, no Energy.
  await fresh('&box=sword-shield');
  state = await picker(page);
  T('?box=sword-shield opens on the Sword & Shield era', state.box === 'sword-shield' && state.era === 'swsh', JSON.stringify(state));
  await page.click('#buildBattleOpenBox');
  await page.waitForSelector('#bbUnboxing [data-control="skip"]', { timeout: 15000 });
  await page.click('#bbUnboxing [data-control="skip"]');
  await waitFor(page, () => !document.getElementById('bbUnboxingStage'), 10000);
  await page.waitForTimeout(500);
  const pack = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  T(
    'row 15 the session holds both groups and a 23-card Evolution pack, no Energy',
    pack?.groupKeys?.[0] === pack?.deckKey && pack.evolutionPack.length === 23 && pack.energy === null,
    JSON.stringify({ groupKeys: pack?.groupKeys, pack: pack?.evolutionPack?.length, energy: pack?.energy })
  );
  T('row 15 an Evolution-pack box starts the editor at 23 / 40', (await deckCount(page)) === '23');

  // Row 9: one chip per era, oldest first; `?box=` on an XY kit presses the XY chip.
  await fresh('&box=evolutions');
  state = await picker(page);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#buildBattleEra .bb-era-chip')].map((chip) => chip.dataset.era));
  T('row 9 five era chips in release order', JSON.stringify(chips) === JSON.stringify(['xy', 'sm', 'swsh', 'sv', 'me']), JSON.stringify(chips));
  T(
    '?box=evolutions opens the XY era with its three kits',
    state.box === 'evolutions' && state.era === 'xy' && JSON.stringify(state.options) === JSON.stringify(['fates-collide', 'steam-siege', 'evolutions']),
    JSON.stringify(state)
  );

  // Row 25: me02's vendored pack files fail to load → each pack shows the procedural front instead.
  await page.route('**/assets/build-battle/packs/**', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await fresh('&box=phantasmal-flames');
  await page.click('#buildBattleOpenBox');
  await page.waitForSelector('#bbUnboxing .bb-box__wrap', { state: 'visible', timeout: 15000 });
  const press = (selector) => page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
  await press('.bb-box__wrap');
  await page.waitForTimeout(800);
  await press('.bb-box__open');
  await page.waitForTimeout(1500);
  await press('.bb-deck');
  await waitFor(page, () => document.getElementById('bbUnboxing')?.dataset.view === 'spread', 15000);
  await page.waitForTimeout(1200);
  const fronts = await page.evaluate(() => ({
    procedural: document.querySelectorAll('.bb-pack__art.bb-packfront').length,
    images: document.querySelectorAll('img.bb-pack__art').length,
  }));
  T('row 25 missing vendored pack files fall back to procedural fronts', fronts.procedural > 0 && fronts.images === 0, JSON.stringify(fronts));
  await page.unroute('**/assets/build-battle/packs/**');
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exitCode = failed ? 1 : 0;
