// Design 073 video check on the three.js board: both deck boxes lying in the blurred band beside the
// mat, then the opening deal (each box flies onto its owner's half, stands up, opens, streams its cards
// onto the deck spot, shuts and flies home). Puts a mat with art on both halves and a deck on each side
// (the opponent's in the 151 ETB box), writes <OUT>/rest.png, records the deal to <OUT>/deal.webm, and
// writes <OUT>/after.png. The deal is skipped in e2e mode on purpose, so the script disarms e2e and
// calls playOpeningDeal() directly (the real flow is Set Up / Set Up Both).
//
// usage: PORT=4100 pnpm start   (worktree server; SERVER_AUTHORITATIVE on, e2e bridge armed)
//        node .claude/skills/fx-preview/rec/rec-deck-box.mjs
// env:   BASE_URL (http://localhost:4100) · OUT (.agent/scratch/deck-box) · W, H (1600 × 900)
//        MAT (custom-mega-lucario-edge-to-edge) · OPP_BOX (db_151_sv3-5_etb) · CHROMIUM / CHROMIUM_PATH
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchOptions, openBoard } from '../board-mode.mjs';

const {
  BASE_URL = 'http://localhost:4100',
  OUT = '.agent/scratch/deck-box',
  MAT = 'custom-mega-lucario-edge-to-edge',
  OPP_BOX = 'db_151_sv3-5_etb',
} = process.env;
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 900);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
const page = await context.newPage();
await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
page.on('pageerror', (error) => console.log('pageerror', error.message));
page.on('console', (message) => message.type() === 'error' && console.log('console', message.text()));

await openBoard(page, BASE_URL);
await page.evaluate(
  async ({ matId, oppBox }) => {
    const { MATS_CATALOG } = await import('/src/setup/deck-builder/core/mats-catalog.mjs');
    const mat = MATS_CATALOG.find((entry) => entry.id === matId) ?? null;
    for (const target of ['self', 'opp']) document.dispatchEvent(new CustomEvent('playmat-changed', { detail: { target, mat } }));
    await window.__fxBoard.pushView({ self: { deck: 53 }, opp: { deck: 53 } });
    document.dispatchEvent(new CustomEvent('deck-box-changed', { detail: { target: 'opp', deckBoxId: oppBox } }));
  },
  { matId: MAT, oppBox: OPP_BOX }
);
await page.waitForFunction(
  async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    return Boolean(getBoardScene()?.inspect().scene.getObjectByName('board3d-deck-boxes'));
  },
  null,
  { timeout: 20000 }
);
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
await page.waitForFunction(() => window.__dealDone === true, null, { timeout: 60000 });
console.log('deal ms', Date.now() - started);
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, 'after.png') });

const video = page.video();
await context.close();
renameSync(await video.path(), join(OUT, 'deal.webm'));
await browser.close();
console.log('ok', OUT);
