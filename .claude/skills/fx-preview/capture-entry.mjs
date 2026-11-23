// Plays a signature entry (tera | mega) on a real card of the e2e board, on a frozen scene clock,
// and screenshots it at stepped times, cropped round the card at 2× density. See SKILL.md here.
// usage: node .claude/skills/fx-preview/capture-entry.mjs <tera|mega> [outDir] [stepMs] [durationMs]
// env:   CARD_IMG  local file or URL of the card face (required)
//        TYPE      energy type of the card, e.g. Fire (default Darkness)
//        SIDE      self (default) | opp: whose Active Pokémon plays it
//        TIMES     comma-separated ms to shoot instead of the stepped range
//        PAD       crop half-size round the card, in card heights (default 1.7)
//        BASE_URL  server origin (default http://localhost:4000)
//        GPU       1 = the machine's own GPU (ANGLE d3d11) instead of SwiftShader: fast, for iterating
//        CHROMIUM  browser executable (omit to use Playwright's own install; CHROMIUM_PATH works too)
//        SIO_JS    local socket.io client file, only where cdn.socket.io is unreachable
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromiumPath, launchOptions, openBoard } from './board-mode.mjs';

const [kind = 'tera', outDir = `fx-${kind}-frames`, stepArg = '100', durArg = '2600'] = process.argv.slice(2);
const { CARD_IMG, TYPE = 'Darkness', SIDE = 'self', TIMES = '', PAD = '1.7', BASE_URL = 'http://localhost:4000', GPU, SIO_JS } = process.env;
if (kind !== 'tera' && kind !== 'mega') throw new Error(`kind must be tera or mega, got ${kind}`);
if (!CARD_IMG) throw new Error('set CARD_IMG to a card image file or URL');

const launch = GPU === '1'
  ? { ...(chromiumPath() ? { executablePath: chromiumPath() } : {}), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] }
  : launchOptions();
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`));
if (SIO_JS) await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
const localImg = existsSync(CARD_IMG);
if (localImg) await page.route('**/__fx-card', (r) => r.fulfill({ path: path.resolve(CARD_IMG) }));

await openBoard(page, BASE_URL);

const rect = await page.evaluate(
  async ([kind, type, src, side]) => {
    const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
    const { rectForInstance } = await import('/src/setup/image-logic/mat-fx.mjs');
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const subtypes = kind === 'mega' ? ['Stage 1', 'MEGA', 'ex'] : ['Stage 2', 'ex', 'Tera'];
    const star = (instanceId) => ({ instanceId, name: kind === 'mega' ? 'Mega ex' : 'Tera ex', src, supertype: 'Pokémon', subtypes, types: [type], rarity: 'Double Rare', hp: '310' });
    const plain = (instanceId) => ({ instanceId, name: 'Plain', src, supertype: 'Pokémon', subtypes: ['Stage 1'], types: ['Water'], rarity: 'Uncommon', hp: '90' });
    const mine = side !== 'opp';
    applyView(
      {
        stateVersion: 99,
        you: { playerId: 'p1', zones: { active: [mine ? star(101) : plain(101)], bench: [plain(102), plain(103)], hand: [], deck: { count: 30 } } },
        them: { playerId: 'p2', zones: { active: [mine ? plain(201) : star(201)], bench: [plain(202)], hand: [], deck: { count: 30 } } },
      },
      [],
      {}
    );
    await new Promise((r) => setTimeout(r, 2500));
    const scene = getBoardScene();
    const clock = scene.inspect().canvas.getAnimations()[0];
    clock.pause();
    // Stepping time takes far longer than an effect's own backstops: hold the long timers back.
    const realTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => (ms >= 1000 ? 0 : realTimeout(fn, ms, ...rest));
    const id = mine ? 101 : 201;
    const fx = await import('/src/setup/netcode/mat-fx/entry.js');
    const start = scene.clock.now();
    const before = new Set(document.getAnimations());
    const played = fx.playSignatureEntry(kind, id, getCardRegistry().get(id).card);
    const dom = document.getAnimations().filter((animation) => !before.has(animation) && animation !== clock);
    for (const animation of dom) animation.pause();
    window.__entry = { scene, clock, start, dom };
    // The scene's textures load on first ask: let them arrive before time is stepped.
    await new Promise((r) => realTimeout(r, 900));
    const r = rectForInstance(id, getCardRegistry());
    return { played, left: r.left, top: r.top, width: r.width, height: r.height };
  },
  [kind, TYPE, localImg ? '/__fx-card' : CARD_IMG, SIDE]
);
if (rect.played === false) throw new Error('the entry did not play (no scene draws the card)');

const pad = rect.height * Number(PAD);
const x = Math.max(0, Math.round(rect.left + rect.width / 2 - pad));
const y = Math.max(0, Math.round(rect.top + rect.height / 2 - pad));
const clip = { x, y, width: Math.round(Math.min(1280 - x, 2 * pad)), height: Math.round(Math.min(800 - y, 2 * pad)) };

const seek = (ms) =>
  page.evaluate(async (t) => {
    const p = window.__entry;
    p.clock.currentTime = p.start + t;
    for (const animation of p.dom) animation.currentTime = t;
    p.scene.render();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, ms);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const times = TIMES
  ? TIMES.split(',').map(Number).filter(Number.isFinite)
  : Array.from({ length: Math.floor(Number(durArg) / Number(stepArg)) + 1 }, (_, i) => i * Number(stepArg));
for (const ms of times) {
  await seek(ms);
  await page.screenshot({ path: path.join(outDir, `t${String(ms).padStart(4, '0')}.png`), clip });
}
if (errors.length) console.log('errors', errors.slice(0, 8));
await browser.close();
console.log(`captured ${times.length} frames into ${outDir}`);
