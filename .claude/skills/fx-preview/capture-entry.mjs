// Plays a signature entry (tera | mega) over a card image on the real board, freezes
// animation time and screenshots evenly stepped frames. See SKILL.md in this folder.
// usage: node .claude/skills/fx-preview/capture-entry.mjs <tera|mega> [outDir] [stepMs] [durationMs]
// env:   CARD_IMG  local file or URL of the card face (required)
//        TYPE      energy type for the card, e.g. Fire (default Darkness)
//        BASE_URL  server origin (default http://localhost:4000)
//        CHROMIUM  browser executable (omit to use Playwright's own install)
//        SIO_JS    local socket.io client file, only where cdn.socket.io is unreachable
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const [
  kind = 'tera',
  outDir = `fx-${kind}-frames`,
  stepArg = '100',
  durArg = '2400',
] = process.argv.slice(2);
const {
  CARD_IMG,
  TYPE = 'Darkness',
  BASE_URL = 'http://localhost:4000',
  CHROMIUM,
  SIO_JS,
} = process.env;
if (kind !== 'tera' && kind !== 'mega')
  throw new Error(`kind must be tera or mega, got ${kind}`);
if (!CARD_IMG) throw new Error('set CARD_IMG to a card image file or URL');

const browser = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM } : {}
);
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
if (SIO_JS) {
  await page.route('https://cdn.socket.io/**', (r) =>
    r.fulfill({ path: SIO_JS, contentType: 'application/javascript' })
  );
}
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
const localImg = existsSync(CARD_IMG);
if (localImg) {
  await page.route('**/__fx-card', (r) =>
    r.fulfill({ path: path.resolve(CARD_IMG) })
  );
}
page.on('pageerror', (e) => console.log('pageerror', e.message));

await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, {
  timeout: 30000,
});
await page.waitForTimeout(800);

const clip = await page.evaluate(
  async ([kind, type, src]) => {
    const { visualRectOf } =
      await import('/src/setup/image-logic/iframe-rect.mjs');
    const fx = await import('/src/setup/netcode/mat-fx/entry.js');
    const doc = document.getElementById('selfContainer').contentDocument;
    const zone = visualRectOf(
      doc.getElementById(kind === 'mega' ? 'active' : 'bench')
    );
    const h = 110;
    const w = h * 0.716;
    const cx = kind === 'mega' ? zone.left + zone.width / 2 : zone.left + 45;
    const rect = {
      left: cx - w / 2,
      top: zone.top + (zone.height - h) / 2,
      width: w,
      height: h,
    };

    const img = document.createElement('img');
    img.src = src;
    Object.assign(img.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${w}px`,
      height: `${h}px`,
      zIndex: 2400,
      borderRadius: '4px',
    });
    document.body.appendChild(img);
    await img.decode();

    const card =
      kind === 'mega'
        ? {
            name: 'Mega ex',
            supertype: 'Pokémon',
            types: [type],
            subtypes: ['Stage 1', 'MEGA', 'ex'],
          }
        : {
            name: 'Tera ex',
            supertype: 'Pokémon',
            types: [type],
            subtypes: ['Stage 2', 'ex', 'Tera'],
          };

    // The entry schedules its own teardown with long timers; drop those so the overlay
    // survives while time is stepped by hand below.
    const realTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) =>
      ms >= 1500 ? 0 : realTimeout(fn, ms, ...rest);
    fx.playSignatureEntry(kind, rect, 1, card);
    window.setTimeout = realTimeout;
    for (const a of document.getAnimations()) a.pause();

    const pad = 410;
    return {
      x: Math.max(0, rect.left + w / 2 - pad * 1.4),
      y: Math.max(0, rect.top + h / 2 - pad),
      width: pad * 2.8,
      height: pad * 2,
    };
  },
  [kind, TYPE, localImg ? '/__fx-card' : CARD_IMG]
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let frame = 0;
for (let t = 0; t <= Number(durArg); t += Number(stepArg)) {
  await page.evaluate(
    (t) =>
      new Promise((resolve) => {
        for (const a of document.getAnimations()) a.currentTime = t;
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
    t
  );
  await page.screenshot({
    path: path.join(outDir, `f${String(frame).padStart(3, '0')}.png`),
    clip,
  });
  frame += 1;
}
await browser.close();
console.log(`captured ${frame} frames into ${outDir}`);
