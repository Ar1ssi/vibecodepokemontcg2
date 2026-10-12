// Design 069: contact sheet of the TCG Live card foil, one card per shader family, each drawn at three
// virtual tilts (−1, 0, +1 on both axes) through the real buildHoloCard → mountTcglFoil path on the app page.
// Checks: every view reaches `live` (none `fallback`), the silhouette (alpha) is identical across tilts (the
// mesh is shaded tilted but rasterized face-on, O4), and no foil error reaches the console.
// WebGL runs on SwiftShader, as the other capture scripts do.
// env: BASE_URL (default http://localhost:4100), CHROMIUM, OUT (default .agent/scratch/tcgl-foil), WIDTH (card px)
// Exit code 1 on any failed check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const { BASE_URL = 'http://localhost:4100', CHROMIUM, WIDTH = '150' } = process.env;
const OUT = process.env.OUT || '.agent/scratch/tcgl-foil';
const TILTS = [-1, 0, 1];
// Pixels whose silhouette may differ between tilts (antialiased edge noise), as a share of the card.
const SILHOUETTE_TOLERANCE = 0.002;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 2400 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  const text = message.text();
  if ((message.type() === 'warning' || message.type() === 'error') && /foil|THREE|WebGL|shader/i.test(text)) {
    problems.push(`${message.type()}: ${text.slice(0, 600)}`);
  }
});

await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
const families = await page.evaluate(
  async ({ tilts, width }) => {
    const holo = await import('/src/setup/deck-builder/core/holo.mjs');
    const { loadFoilManifest } = await import('/src/setup/foil/tcgl-foil-store.js');
    const parsed = await loadFoilManifest();
    if (!parsed) throw new Error('foil manifest did not load');
    const firstPerShader = new Map();
    for (const [key, record] of parsed.records) if (!firstPerShader.has(record.shader)) firstPerShader.set(record.shader, key);
    const sheet = document.createElement('div');
    sheet.id = 'tcgl-foil-sheet';
    sheet.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:#202428;overflow:auto;display:grid;' +
      `grid-template-columns:repeat(9, ${width}px);gap:10px 6px;padding:10px;align-content:start;`;
    document.body.appendChild(sheet);
    // A blank image with the 63 × 88 card shape stands in for our scan; the foil canvas draws the TCG Live front.
    const blank = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="630" height="880"/>')}`;
    const families = [];
    for (const [shader, key] of [...firstPerShader].sort()) {
      for (const tilt of tilts) {
        const wrapper = holo.buildHoloCard(blank, holo.TCGL_FOIL_RARITY, { cardId: key, manifest: parsed });
        wrapper.classList.add('tcgl-foil-shot');
        wrapper.style.cssText = `width:${width}px;--card-aspect:0.7159;`;
        wrapper.__foilTilt = { tiltX: tilt, tiltY: tilt };
        wrapper.title = `${shader.split('/').pop()} ${key} tilt ${tilt}`;
        sheet.appendChild(wrapper);
      }
      families.push({ shader, key });
    }
    return families;
  },
  { tilts: TILTS, width: Number(WIDTH) }
);
console.log(`${families.length} shader families`);

const settled = await page
  .waitForFunction(
    () => [...document.querySelectorAll('.tcgl-foil-shot')].every((w) => ['live', 'fallback'].includes(w.dataset.tcglFoil)),
    null,
    { timeout: 180000, polling: 500 }
  )
  .then(() => true)
  .catch(() => false);
if (!settled) problems.push('timeout: views still loading after 180 s');
await page.waitForTimeout(500);

const report = await page.evaluate((tolerance) => {
  const wrappers = [...document.querySelectorAll('.tcgl-foil-shot')];
  const out = [];
  for (let i = 0; i < wrappers.length; i += 3) {
    const group = wrappers.slice(i, i + 3);
    const states = group.map((w) => w.dataset.tcglFoil);
    const masks = group.map((w) => {
      const canvas = w.querySelector('canvas.tcgl-foil');
      if (!canvas) return null;
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const mask = new Uint8Array(canvas.width * canvas.height);
      for (let p = 0; p < mask.length; p += 1) mask[p] = data[p * 4 + 3] > 127 ? 1 : 0;
      return { mask, w: canvas.width, h: canvas.height, filled: mask.reduce((n, v) => n + v, 0) };
    });
    let mismatch = null;
    const flat = masks[1];
    if (flat && masks.every((m) => m && m.w === flat.w && m.h === flat.h)) {
      mismatch = Math.max(
        ...[masks[0], masks[2]].map((m) => {
          let diff = 0;
          for (let p = 0; p < m.mask.length; p += 1) if (m.mask[p] !== flat.mask[p]) diff += 1;
          return diff / m.mask.length;
        })
      );
      if (flat.filled < flat.mask.length * 0.8) mismatch = Math.max(mismatch, 1);
    }
    out.push({ title: group[1].title, states, mismatch, ok: states.every((s) => s === 'live') && mismatch != null && mismatch <= tolerance });
  }
  return out;
}, SILHOUETTE_TOLERANCE);

for (const row of report) {
  console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.title} states=${row.states.join(',')} silhouette-diff=${row.mismatch}`);
  if (!row.ok) problems.push(`${row.title}: ${row.states.join(',')} silhouette-diff=${row.mismatch}`);
}
const file = path.join(OUT, 'foil-sheet.png');
await page.locator('#tcgl-foil-sheet').screenshot({ path: file });
console.log(file);
await browser.close();
for (const problem of problems) console.log(problem);
process.exit(problems.length > 0 ? 1 : 0);
