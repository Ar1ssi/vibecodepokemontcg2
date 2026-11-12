// Design 087: two players set up a game, one clicks "Export full log", and the downloaded
// NDJSON must hold all three parties (server + both clients), a replayable command journal,
// and both client snapshots. Run against a SERVER_AUTHORITATIVE=1 server with the e2e bridge:
//   node server/server.js            (another shell)
//   node scripts/e2e/log-export-test.mjs
// PTCG_LOG_OUT=<path> keeps the export (used to refresh scripts/__tests__/fixtures/log-export.ndjson).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `log-export-${Date.now()}`;
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const pageErrors = [];

async function openClient(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(`${name}: ${err.message}`));
  page.on('dialog', (dialog) => dialog.accept('e2e export note'));
  // The page loads the Socket.IO client from a CDN; offline runs get the server's own copy.
  await page.route('https://cdn.socket.io/**', async (route) => {
    try {
      await route.continue();
    } catch {
      /* handled by the fallback below */
    }
  });
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!(await waitFor(page, () => typeof window.io === 'function', 4000))) {
    await page.unroute('https://cdn.socket.io/**');
    // The first load's "io is not defined" belongs to the blocked CDN, not to the app.
    for (let i = pageErrors.length - 1; i >= 0; i--) if (pageErrors[i].startsWith(`${name}:`)) pageErrors.splice(i, 1);
    await page.route('https://cdn.socket.io/**', async (route) => {
      const local = await page.request.get(`${BASE}/socket.io/socket.io.js`);
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: await local.text() });
    });
    await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  await page.evaluate((p) => window.__ptcg.loadFixtureDeck(p), name);
  await page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, name]);
  await waitFor(page, () => window.__ptcg.counters().twoPlayer === true);
  await page.click('#p2Button');
  return page;
}

const parseLines = (text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line));

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'Alpha');
  const b = await openClient(browser, 'Bravo');
  await a.click('#p2SetupButton');
  await b.click('#p2SetupButton');
  await waitFor(a, () => window.__ptcg.picker().open === true);
  await waitFor(a, () => !document.getElementById('turnOrderCoinFlipOverlay'));

  // Each player picks a starting Active: a real moveCard command with a clientSeq to trace.
  for (const page of [a, b]) {
    if (await waitFor(page, () => window.__ptcg.picker().open === true, 6000)) {
      await page.evaluate(() => window.__ptcg.pick([0]));
      await waitFor(page, () => window.__ptcg.picker().open !== true, 6000);
    }
  }

  await waitFor(a, () => window.__ptcgLog?.ship?.().connected === true);
  await waitFor(b, () => window.__ptcgLog?.ship?.().connected === true);
  T('1. both clients ship their log', await a.evaluate(() => window.__ptcgLog.ship().connected));

  await a.evaluate(() => window.__ptcgLog.mark('e2e mark'));
  const downloadPromise = a.waitForEvent('download', { timeout: 20000 });
  const result = await a.evaluate(() => window.__ptcgLog.export({ note: 'e2e export note' }));
  const download = await downloadPromise;
  const file = await download.path();
  T('2. the export came from the server', result.ok === true && result.mode === 'server', `(mode: ${result.mode})`);
  T('3. file name', /^ptcg-log_.+_\d{8}-\d{6}\.ndjson$/.test(download.suggestedFilename()), `(${download.suggestedFilename()})`);

  const records = parseLines(readFileSync(file, 'utf8'));
  const header = records[0];
  const kinds = (k) => records.filter((r) => r.k === k);
  const timeline = kinds('e');
  const sources = new Set(timeline.map((e) => e.src));
  const clientSources = [...sources].filter((s) => s.startsWith('c:'));

  T('4. header first, with the note', header.k === 'header' && header.note === 'e2e export note');
  T('5. timeline has the server and both clients', sources.has('server') && clientSources.length === 2,
    `(sources: ${[...sources].join(', ')})`);
  T('6. header lists three sources, both snapshots ok',
    header.sources.length === 3 && header.sources.filter((s) => s.snapshot === 'ok').length === 2,
    `(${header.sources.map((s) => `${s.src}:${s.snapshot ?? '-'}`).join(' ')})`);
  T('7. both seats are named', header.sources.filter((s) => s.seat === 'p1' || s.seat === 'p2').length === 2);
  T('8. the timeline is sorted by ts', timeline.every((e, i) => i === 0 || timeline[i - 1].ts <= e.ts));
  T('9. journal has rebase and cmd records',
    kinds('journal').some((r) => r.rec.k === 'rebase') && kinds('journal').some((r) => r.rec.k === 'cmd'));
  T('10. state ring exported without commandLog',
    kinds('state').length > 0 && kinds('state').every((r) => r.state.commandLog === undefined));
  T('11. two snapshots carrying the applied view',
    kinds('snap').length === 2 && kinds('snap').every((s) => s.netcode?.lastAppliedView));
  T('12. the mark is on the timeline', timeline.some((e) => e.cat === 'user' && e.ev === 'mark'));
  T('13. engine entries carry sv', timeline.some((e) => e.cat === 'engine' && e.ev === 'applied' && Number.isInteger(e.sv)));
  T('14. each client logged a view apply',
    clientSources.every((src) => timeline.some((e) => e.src === src && e.cat === 'view' && e.ev === 'apply')));
  T('14b. a starting-Active move reached the engine with its clientSeq',
    timeline.some((e) => e.src === 'server' && e.cat === 'engine' && e.d?.type === 'moveCard' && Number.isInteger(e.cs)));
  T('15. no gaps and nothing dropped',
    header.sources.every((s) => (s.gaps ?? []).length === 0 && (s.dropped ?? 0) === 0));
  const announced = await waitFor(b, () => window.__ptcg.chatTail(20).some((m) => /exported the match log/.test(m)));
  T('16. the other player saw the export announcement', Boolean(announced));

  const cli = (args) => {
    try {
      return { ok: true, out: execFileSync('node', ['tools/log.mjs', ...args, file], { cwd: REPO_ROOT, encoding: 'utf8' }) };
    } catch (err) {
      return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };
  const replay = cli(['replay']);
  T('17. the journal replays with no divergence', replay.ok && /0 divergences/.test(replay.out), `(${replay.out.trim().split('\n').pop()})`);
  const moved = timeline.find((e) => e.src === 'server' && e.cat === 'engine' && e.d?.type === 'moveCard' && Number.isInteger(e.cs));
  const trace = cli(['trace', '--cs', `${moved?.seat}#${moved?.cs}`]);
  const traced = (pattern) => trace.out.search(pattern);
  T('17b. the CLI traces that move from the client emit through the engine to both renders',
    trace.ok && traced(/socket\/out\.cmd/) >= 0 && traced(/socket\/out\.cmd/) < traced(/engine\/applied/) &&
      traced(/engine\/applied/) < traced(/view\/apply/) && (trace.out.match(/view\/apply/g) ?? []).length === 2,
    `(${trace.out.trim().split('\n').pop()})`);
  const summary = cli(['summary']);
  T('18. the CLI summary names three sources', summary.ok && (summary.out.match(/^\s+(server|c:[0-9a-f]{8})\b/gm) ?? []).length === 3);

  // Server unreachable: the export falls back to this client's own ring and snapshot.
  await b.evaluate(async () => (await import('/src/state.js')).socket.disconnect());
  const localDownloadPromise = b.waitForEvent('download', { timeout: 20000 });
  const localResult = await b.evaluate(() => window.__ptcgLog.export({ note: 'offline' }));
  const localDownload = await localDownloadPromise;
  const localRecords = parseLines(readFileSync(await localDownload.path(), 'utf8'));
  T('20. with no server the export is local-only', localResult.mode === 'local' &&
    /^ptcg-log_local_\d{8}-\d{6}\.ndjson$/.test(localDownload.suggestedFilename()), `(${localDownload.suggestedFilename()})`);
  T('21. the local file has a partial header, a snapshot and this client\'s timeline',
    localRecords[0].partial === 'local-only' && localRecords[1].k === 'snap' &&
      localRecords.filter((r) => r.k === 'e').length > 50 &&
      localRecords.filter((r) => r.k === 'e').every((r) => r.src === localRecords[0].sources[0].src));

  T('19. zero page errors', pageErrors.length === 0, pageErrors.join('; '));
  if (process.env.PTCG_LOG_OUT) copyFileSync(file, process.env.PTCG_LOG_OUT);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
