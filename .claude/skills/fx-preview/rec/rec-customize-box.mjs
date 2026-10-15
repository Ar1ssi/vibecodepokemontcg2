// Design 071 video check: the deck box in the builder's Customize tab (WebGL on SwiftShader).
// Records the stage settling on the Deck Box view, a drag-to-turn, then Card Sleeve and back, to
// out/customize-box.webm, and writes stills to <OUT>/box-{rest,dragged}.png.
//
// Env: BASE_URL (http://localhost:4100) · OUT (.agent/scratch/customize-box)
//      CHROMIUM: a browser binary (the cloud container has /opt/pw-browsers/chromium)
//      SIO_JS: a local socket.io.min.js (default: the server's own /socket.io/socket.io.js)
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
const OUT = process.env.OUT || '.agent/scratch/customize-box';
const VIDEO = 'out/customize-box.webm';
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

mkdirSync(OUT, { recursive: true });
mkdirSync('out', { recursive: true });

const browser = await chromium.launch({
  args: GL_ARGS,
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
if (process.env.SIO_JS) {
  await page.route('**/cdn.socket.io/**', (route) => route.fulfill({ path: process.env.SIO_JS, contentType: 'text/javascript' }));
}
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));

await page.goto(`${BASE_URL}/deck-builder?e2e=1`);
await page.click('#nativeDeckBuilderTabCustomize');
const stage = page.locator('#nativeDeckBuilderCustomizeStage');
await stage.waitFor({ state: 'visible' });
await page.locator('#nativeDeckBuilderCustomizeStage canvas.customize-object-canvas').waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
await stage.screenshot({ path: join(OUT, 'box-rest.png') });

const box = await stage.boundingBox();
const y = box.y + box.height / 2;
await page.mouse.move(box.x + box.width / 2, y);
await page.mouse.down();
for (let step = 1; step <= 20; step++) await page.mouse.move(box.x + box.width / 2 + step * 8, y);
await page.mouse.up();
await page.waitForTimeout(800);
await stage.screenshot({ path: join(OUT, 'box-dragged.png') });

await page.click('#nativeDeckBuilderCustomizeSwitcher [data-view="sleeve"]');
await page.waitForTimeout(1500);
await page.click('#nativeDeckBuilderCustomizeSwitcher [data-view="box"]');
await page.waitForTimeout(1500);

const video = page.video();
await context.close();
renameSync(await video.path(), VIDEO);
await browser.close();
console.log(`wrote ${VIDEO} and ${OUT}/box-{rest,dragged}.png`);
