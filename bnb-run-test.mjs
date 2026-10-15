import { chromium } from 'playwright';
// Design 071 by hand: the Build & Battle run flow end to end on a real server — the buy-in, a started
// run, the lobby's Play arming it, the game tab's `rules-game-ended` filling the next node, and the
// legacy flow still answering on its own path. Needs a server (PTCG_URL, default :4000).
// CHROMIUM_PATH picks the browser binary.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const RUN_KEY = 'ptcg-sim.build-battle-run.v1';
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
const storedRun = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), RUN_KEY);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('page', (p) => p.on('dialog', (d) => d.accept()));
  await context.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await context.route('https://cdn.socket.io/**', (r) =>
    r.fulfill({ status: 302, headers: { location: `${BASE}/socket.io/socket.io.js` } })
  );

  const game = await context.newPage();
  game.on('pageerror', (err) => console.log('PAGEERROR game:', err.message));
  await game.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(game, () => window.__ptcg?.ready === true, 30000);
  await game.evaluate((key) => localStorage.removeItem(key), RUN_KEY);

  const openBuilder = async () => {
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      game.evaluate(() => {
        window.open('/build-and-battle', 'ptcgBuildBattle');
      }),
    ]);
    tab.on('pageerror', (err) => console.log('PAGEERROR builder:', err.message));
    await tab.waitForLoadState('domcontentloaded');
    return tab;
  };

  // Buy-in: no run yet.
  let builder = await openBuilder();
  await waitFor(builder, () => document.getElementById('bnbStartRun')?.disabled === false, 20000);
  T('the buy-in names the mode', (await builder.textContent('.bnb-title')) === 'Build & Battle Mode');
  T('the first tab reads Run', (await builder.textContent('#buildBattleTabBox')) === 'Run');
  T('Play is blocked until a run starts', await builder.evaluate(() => document.getElementById('nativeDeckBuilderPlayButton').disabled));

  // Start the run: confirm, then the box opens on the stage and a run is stored.
  await builder.click('#bnbStartRun');
  await builder.click('.bnb-dialog .bb-primary');
  const started = await waitFor(builder, (key) => JSON.parse(localStorage.getItem(key) || 'null'), 10000, RUN_KEY);
  T('Start run stores an in-progress run with no results', started?.status === 'in-progress' && started.results.length === 0);
  T('the opening plays on the stage', Boolean(await builder.$('#bbUnboxingStage')));

  // Skip the scene: finish the unboxing in storage, as a finished opening would have left it.
  await builder.evaluate(async (key) => {
    const { finishedUnboxing } = await import('/src/setup/deck-builder/core/build-battle/unboxing.mjs');
    const run = JSON.parse(localStorage.getItem(key));
    const { packs } = run.session;
    run.session.unboxing = finishedUnboxing({ packCount: packs.length, cardsPerPack: packs[0].length });
    localStorage.setItem(key, JSON.stringify(run));
  }, RUN_KEY);
  await builder.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(builder, () => Boolean(document.querySelector('.bnb-lobby')), 20000);
  T('the lobby shows 0/5 Matches', (await builder.textContent('.bnb-meter-label')) === '0/5 Matches');
  T('five nodes, the first current', await builder.evaluate(() => {
    const nodes = [...document.querySelectorAll('.bnb-node')];
    return nodes.length === 5 && nodes[0].dataset.state === 'current';
  }));
  const playReady = await waitFor(builder, () => document.querySelector('[data-bnb-play]')?.disabled === false, 10000);
  T('the box deck is valid, so lobby Play is enabled', Boolean(playReady));

  // Play arms the run and hands the deck to the game tab (the builder tab closes itself).
  await builder.click('[data-bnb-play]');
  const armed = await waitFor(game, (key) => {
    const run = JSON.parse(localStorage.getItem(key) || 'null');
    return typeof run?.armedAt === 'number' ? run : null;
  }, 10000, RUN_KEY);
  T('Play armed the run', Boolean(armed) && armed.results.length === 0);

  // The game ends on the game tab: the netcode end screen fires this event once per game.
  await game.evaluate(() => {
    document.dispatchEvent(new CustomEvent('rules-game-ended', { detail: { winner: 'p1', reason: 'e2e', isWinner: true } }));
  });
  const won = await storedRun(game);
  T('the finished game filled node 1 with a win', won?.results?.length === 1 && won.results[0] === true && won.armedAt === null, JSON.stringify(won?.results));
  await game.evaluate(() => {
    document.dispatchEvent(new CustomEvent('rules-game-ended', { detail: { winner: 'p1', reason: 'e2e', isWinner: true } }));
  });
  T('a second ending without a new Play counts nothing', (await storedRun(game))?.results?.length === 1);

  // The builder opened again shows the progress.
  if (!builder.isClosed()) await builder.close();
  builder = await openBuilder();
  await waitFor(builder, () => Boolean(document.querySelector('.bnb-lobby')), 20000);
  T('the lobby shows 1/5 Matches with a win', (await builder.textContent('.bnb-meter-label')) === '1/5 Matches' &&
    (await builder.evaluate(() => document.querySelector('.bnb-node').dataset.state)) === 'win');

  // Forfeit ends the run and shows the summary; Done returns to the buy-in.
  await builder.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Forfeit').click());
  await builder.click('.bnb-dialog .bb-primary');
  T('forfeit shows the summary', (await builder.textContent('.bnb-title')) === 'Run forfeited · 1–0');
  await builder.click('#bnbDone');
  T('Done clears the run', (await storedRun(builder)) === null && Boolean(await builder.$('#bnbStartRun')));
  await builder.close();

  // The legacy flow still answers on its own path, and the child path forwards to it.
  const legacy = await context.newPage();
  legacy.on('pageerror', (err) => console.log('PAGEERROR legacy:', err.message));
  await legacy.goto(`${BASE}/build-and-battle/legacy`, { waitUntil: 'domcontentloaded' });
  T('/build-and-battle/legacy forwards to the legacy page', new URL(legacy.url()).pathname === '/build-and-battle-legacy');
  await waitFor(legacy, () => Boolean(document.getElementById('buildBattleOpenBox')), 20000);
  T('the legacy page shows the sealed-box screen', Boolean(await legacy.$('#buildBattleOpenBox')) && !(await legacy.$('#bnbStartRun')));
  await legacy.close();
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
