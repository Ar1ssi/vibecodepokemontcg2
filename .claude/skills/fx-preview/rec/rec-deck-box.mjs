// Design 073 video check: both deck boxes resting in the blurred band beside the mat, then the opening
// deal (each box flies onto its owner's half, opens, deals the deck onto the deck spot, flies home open).
// Loads the e2e fixture deck for you and a second for the opponent (shown in the 151 ETB box), writes
// <OUT>/rest.png, records the deal to <OUT>/deal.webm, and writes <OUT>/after.png.
// The deal is skipped in e2e mode on purpose, so the script disarms e2e once the decks are loaded and
// calls playOpeningDeal() directly (the real flow is Set Up / Set Up Both).
//
// Env: BASE_URL (http://localhost:4100) · OUT (.agent/scratch/deck-box) · W, H (1600 × 900)
//      CHROMIUM: a browser binary (the cloud container has /opt/pw-browsers/chromium)
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
const OUT = process.env.OUT || '.agent/scratch/deck-box';
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 900);
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: GL_ARGS });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
const page = await context.newPage();
await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
page.on('pageerror', (error) => console.log('pageerror', error.message));
page.on('console', (message) => message.type() === 'error' && console.log('console', message.text()));

await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 60000 });
await page.evaluate(async () => {
  window.__ptcg.loadFixtureDeck('E2E');
  const { loadDeckData } = await import('/src/setup/deck-constructor/import.js');
  const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
  loadDeckData('opp', e2eFixtureDeck('OPP'));
  document.dispatchEvent(new CustomEvent('deck-box-changed', { detail: { target: 'opp', deckBoxId: 'db_151_sv3-5_etb' } }));
});
await page.waitForFunction(() => document.getElementById('deckBoxStage'), null, { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'rest.png') });

const started = Date.now();
await page.evaluate(async () => {
  window.__PTCG_E2E_ALLOWED = false;
  const { playOpeningDeal } = await import('/src/setup/netcode/mat-fx/deck-box.js');
  window.__dealDone = false;
  playOpeningDeal().then(() => {
    window.__dealDone = true;
  });
});
await page.waitForFunction(() => window.__dealDone === true, null, { timeout: 30000 });
console.log('deal ms', Date.now() - started);
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'after.png') });

const video = page.video();
await context.close();
renameSync(await video.path(), join(OUT, 'deal.webm'));
await browser.close();
console.log('ok', OUT);
