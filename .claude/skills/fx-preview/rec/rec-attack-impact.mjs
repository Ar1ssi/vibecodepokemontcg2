// Design 068: contact sheets of TCG Live's attack-impact prefabs. For each type it opens the
// lab page (client/src/dev/attack-fx-lab.html) in sheet mode — one card per time, each effect
// frozen there — and screenshots it. WebGL runs on SwiftShader, as rec-unboxing.mjs does.
// env: TYPES (comma list; default all 11), VARIANT (Small | Medium | Large, _C for Bench; default Medium),
//      TIMES (seconds, comma list), SEED, LIGHT=1 (light table), FAR=1 (far seat's card),
//      BASE_URL (default http://localhost:4100), CHROMIUM, OUT (default .agent/scratch/impact)
// Exit code 1 when a page error, a console warning from the stage, or a missing sheet is seen.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ALL_TYPES = ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'fairy', 'colorless'];
const { BASE_URL = 'http://localhost:4100', CHROMIUM, VARIANT = 'Medium', TIMES = '0.03,0.1,0.2,0.35,0.55,0.8,1.2,1.8', SEED = '7', LIGHT, FAR } = process.env;
const TYPES = (process.env.TYPES || ALL_TYPES.join(',')).split(',').map((type) => type.trim()).filter(Boolean);
const OUT = process.env.OUT || '.agent/scratch/impact';
const VIEWPORT = { width: 1880, height: 960 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'warning' || message.type() === 'error') problems.push(`${message.type()}: ${message.text().slice(0, 600)}`);
});

for (const type of TYPES) {
  const query = new URLSearchParams({ sheet: '1', type, variant: VARIANT, times: TIMES, seed: SEED });
  if (LIGHT === '1') query.set('light', '1');
  if (FAR === '1') query.set('far', '1');
  await page.goto(`${BASE_URL}/src/dev/attack-fx-lab.html?${query}`);
  const outcome = await page
    .waitForFunction(() => window.__impactLab && (window.__impactLab.sheetReady || window.__impactLab.sheetError), null, { timeout: 60000 })
    .then(() => page.evaluate(() => window.__impactLab.sheetError || 'ok'))
    .catch((error) => `timeout: ${error.message.split('\n')[0]}`);
  if (outcome !== 'ok') {
    problems.push(`${type} ${VARIANT}: ${outcome}`);
    continue;
  }
  await page.waitForTimeout(250);
  const file = path.join(OUT, `${type}-${VARIANT}${LIGHT === '1' ? '-light' : ''}${FAR === '1' ? '-far' : ''}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
for (const problem of problems) console.log(problem);
process.exit(problems.length > 0 ? 1 : 0);
