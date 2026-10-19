// Design 074 slice D2: dragging cards on the three.js board. Spawns its own authoritative server
// (e2e bridge armed), joins a solo room at `?board=3d` with a deck of Basics and Energy, deals
// both seats, then drags with Playwright's real mouse from `scene.rects()` centres to zone
// footprints (`scene.zoneRects()`) and cards: a Basic to the empty Active Spot and the Bench, an
// Energy onto the Active, the Active onto a Bench card (retreat), a drop on empty table and an
// Escape mid-drag (both fly back, nothing sent), and a far-seat card moved in solo.
// Usage: pnpm test:board3d-drag   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const FACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const ENERGY = 'Basic Fire Energy';
// e2e-mode.mjs fixture rows ([quantity, name, type, image, number, set, tcgId]): set 'e2e'
// skips live enrichment. Ten Basics and ten Energy, so a 7-card hand nearly always holds both.
const deckRows = (prefix) => [
  ...Array.from({ length: 10 }, (_, i) => ['1', `${prefix} ${i + 1}`, 'Pokémon', FACE, String(i + 1).padStart(3, '0'), 'e2e', `e2e-${prefix}-${i + 1}`]),
  ['10', ENERGY, 'Energy', FACE, '101', 'e2e', `e2e-${prefix}-fire`],
];

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PTCG_E2E: '1', SERVER_AUTHORITATIVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const res = await fetch(base);
      if (res.ok) return { base, child };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not start on ${base}:\n${output}`);
}

async function waitFor(page, fn, timeout = 25000, arg) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for ${fn.toString().slice(0, 80)} (last=${JSON.stringify(last)})`);
}

/** The scene's cards on one side's zone with their names (from the mirror imgs), and its rects. */
const board = (page) =>
  page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const placements = scene?.inspect().model?.placements ?? [];
    const nameOf = (p) => {
      const host = document.getElementById(p.side === 'self' ? 'selfBoard' : 'oppBoard');
      return host.shadowRoot.querySelector(`img[data-instance-id="${p.instanceId}"]`)?.card?.name ?? '';
    };
    return {
      cards: placements.map((p) => ({ id: p.instanceId, side: p.side, zone: p.zone, role: p.role, name: nameOf(p) })),
      rects: scene?.rects() ?? {},
      zones: scene?.zoneRects() ?? {},
    };
  });

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const cmdCount = (page) => page.evaluate(() => window.__ptcg.cmdLog.length);
const cmdsSince = (page, from) => page.evaluate((n) => window.__ptcg.cmdLog.slice(n), from);

/** A real mouse drag: press at `from`, move in steps to `to`, release. `beforeUp` runs mid-air. */
async function dragCard(page, from, to, { beforeUp = null } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y - 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(250);
  if (beforeUp) await beforeUp();
  await page.mouse.up();
}

/**
 * Waits until no card is held, held after a drop, or tweening on the scene clock. That clock
 * moves only with drawn frames, which headless SwiftShader can space a second apart, so a
 * fixed sleep can read a card mid-flight.
 */
const sceneSettled = (page) =>
  waitFor(
    page,
    async () => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const scene = getBoardScene();
      const info = scene?.inspect();
      return Boolean(info) && info.lifted === null && info.held === null && !info.cards.update(scene.clock.now());
    },
    10000
  );

/**
 * Polls a card's rect until it is back on `rest` (within 1 px; up to 8 s). Headless SwiftShader
 * can go a second without a frame, and the scene clock only moves with frames, so a fixed wait
 * or a "stopped moving" read can catch the fly-back before it has run.
 */
async function rectBackTo(page, id, rest) {
  const deadline = Date.now() + 8000;
  let rect = (await board(page)).rects[id] ?? null;
  while (Date.now() < deadline && !sameRect(rect, rest)) {
    await page.waitForTimeout(200);
    rect = (await board(page)).rects[id] ?? null;
  }
  return rect;
}

const sameRect = (a, b, px = 1) => Boolean(a && b) && ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= px);

/** Joins a fresh solo room and deals both seats; null when the near hand lacks 2 Basics + an Energy. */
async function dealSolo(browser, base, attempt) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${base}/?e2e=1&board=3d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  // The HTML5 drag path must stay silent under the flag: count every dragstart on the page.
  await page.evaluate(() => {
    window.__dragstarts = 0;
    document.addEventListener('dragstart', () => (window.__dragstarts += 1), true);
  });
  await page.evaluate((name) => window.__ptcg.joinSolo(name), `Drag-E2E-${attempt}`);
  await waitFor(page, () => window.__ptcg.soloSeat().solo === true);
  await page.evaluate(([near, far]) => {
    window.__ptcg.loadDeckList(near, undefined, 'self');
    window.__ptcg.loadDeckList(far, undefined, 'opp');
  }, [deckRows('Near'), deckRows('Far')]);
  await waitFor(page, () => {
    const loaded = window.__ptcg.instanceMapSeats();
    return loaded.includes('p1') && loaded.includes('p2');
  });
  await page.evaluate(() => window.__ptcg.debugMode(true));
  await page.evaluate(() => {
    window.__ptcg.readyUp();
  });
  await waitFor(page, () => window.__ptcg.zone('self', 'hand').count >= 7 && window.__ptcg.zone('opp', 'hand').count >= 7, 30000);
  await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const hand = (scene?.inspect().model?.placements ?? []).filter((p) => p.zone === 'hand');
    return hand.length >= 14 && hand.every((p) => scene.rects()[p.instanceId]);
  });
  // The server lets only the turn player act past the Starting Active: put that seat near.
  const turn = await waitFor(page, () => window.__ptcg.rulesState.turnPlayer, 10000);
  if (turn === 'opp') {
    await page.locator('#flipBoardButton').dispatchEvent('click');
    await waitFor(page, () => window.__ptcg.soloSeat().nearSeat === 'p2' && window.__ptcg.rulesState.turnPlayer === 'self', 15000);
  }
  await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const hand = (scene?.inspect().model?.placements ?? []).filter((p) => p.zone === 'hand');
    return hand.length >= 14 && hand.every((p) => scene.rects()[p.instanceId]);
  });
  await page.waitForTimeout(1500);
  const nearSeat = await page.evaluate(() => window.__ptcg.soloSeat().nearSeat);
  const { cards } = await board(page);
  const hand = cards.filter((c) => c.side === 'self' && c.zone === 'hand');
  const basics = hand.filter((c) => c.name !== ENERGY);
  const energy = hand.find((c) => c.name === ENERGY);
  const farBasic = cards.find((c) => c.side === 'opp' && c.zone === 'hand' && c.name && c.name !== ENERGY);
  if (basics.length >= 2 && energy && farBasic) return { page, context, basics, energy, farBasic, nearSeat };
  console.log(`deal ${attempt}: near hand ${hand.map((c) => c.name).join(', ')} — dealing again`);
  await context.close();
  return null;
}

const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: GL_ARGS,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  let dealt = null;
  for (let attempt = 1; attempt <= 4 && !dealt; attempt += 1) dealt = await dealSolo(browser, server.base, attempt);
  T('1. a solo room was dealt with two Basics and an Energy in the near hand', Boolean(dealt));
  if (!dealt) throw new Error('no usable deal');
  const { page, basics, energy, farBasic, nearSeat } = dealt;
  const farSeat = nearSeat === 'p1' ? 'p2' : 'p1';
  console.log(`near seat ${nearSeat} (the turn player), far seat ${farSeat}`);

  // (g) First, while the far seat may still place its Starting Active: its card moves in solo,
  // sent as the far seat.
  let state = await board(page);
  let before = await cmdCount(page);
  await dragCard(page, centreOf(state.rects[farBasic.id]), centreOf(state.zones['opp:active']));
  const farActive = await waitFor(page, () => window.__ptcg.zone('opp', 'active').count === 1, 6000).catch(() => false);
  const farCmd = (await cmdsSince(page, before)).at(-1);
  T(`2. a far-seat hand card dragged to its Active Spot moves, as seat ${farSeat}`, farActive && farCmd?.seat === farSeat, JSON.stringify(farCmd));

  // (a) A Basic onto the empty Active Spot.
  await sceneSettled(page);
  state = await board(page);
  before = await cmdCount(page);
  await dragCard(page, centreOf(state.rects[basics[0].id]), centreOf(state.zones['self:active']));
  const active = await waitFor(page, () => window.__ptcg.zone('self', 'active').count === 1, 6000).catch(() => false);
  T('2a. hand Basic → empty Active Spot: the Active Spot holds it', active, JSON.stringify(await cmdsSince(page, before)));

  // (b) A Basic onto the Bench.
  await sceneSettled(page);
  state = await board(page);
  before = await cmdCount(page);
  await dragCard(page, centreOf(state.rects[basics[1].id]), centreOf(state.zones['self:bench']));
  const bench = await waitFor(page, () => window.__ptcg.zone('self', 'bench').count === 1, 6000).catch(() => false);
  T('2b. hand Basic → Bench: the Bench holds it', bench, JSON.stringify(await cmdsSince(page, before)));

  // (c) An Energy onto the Active card attaches to it.
  await sceneSettled(page);
  state = await board(page);
  before = await cmdCount(page);
  await dragCard(page, centreOf(state.rects[energy.id]), centreOf(state.rects[basics[0].id]));
  const attached = await waitFor(page, () => window.__ptcg.observe().self.active?.attachedEnergy?.length === 1, 6000).catch(() => false);
  const attachCmd = (await cmdsSince(page, before)).at(-1);
  T('2c. hand Energy → the Active card: an attach to that card went out', attachCmd?.type === 'attachCard' && attachCmd.payload?.targetInstanceId === basics[0].id,
    JSON.stringify(attachCmd));
  T('2c2. … and the Active holds the Energy', attached, JSON.stringify(await page.evaluate(() => window.__ptcg.observe().self.active)));

  // (d) The Active onto the Bench card retreats (the router's call), whatever the server rules.
  await sceneSettled(page);
  state = await board(page);
  before = await cmdCount(page);
  await dragCard(page, centreOf(state.rects[basics[0].id]), centreOf(state.rects[basics[1].id]));
  await page.waitForTimeout(1500);
  const retreatCmds = await cmdsSince(page, before);
  const rejections = await page.evaluate(() => window.__ptcg.cmdRejections.map((r) => r.reason ?? r.code ?? JSON.stringify(r)));
  if (rejections.length) console.log('server rejections:', rejections.join(' | '));
  T('2d. Active → a Bench card sends retreat', retreatCmds.some((cmd) => cmd.type === 'retreat'), JSON.stringify(retreatCmds));

  // (e) Released over empty table: nothing sent, the card flies back to its slot.
  await sceneSettled(page);
  state = await board(page);
  const handCard = state.cards.find((c) => c.side === 'self' && c.zone === 'hand');
  const empty = await page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    for (let y = 300; y < 800; y += 20) {
      for (let x = 400; x < 1500; x += 20) {
        if (!scene.hitTest(x, y) && document.elementFromPoint(x, y)?.id === 'board3dCanvas') return { x, y };
      }
    }
    return null;
  });
  T('3a. an empty table point exists', Boolean(empty), JSON.stringify(empty));
  const rest = state.rects[handCard.id];
  before = await cmdCount(page);
  await dragCard(page, centreOf(rest), empty);
  const afterDrop = await rectBackTo(page, handCard.id, rest);
  T('3b. a drop on empty table sends nothing', (await cmdCount(page)) === before);
  T('3c. … and the card is back at its rect within 1 px', sameRect(rest, afterDrop), JSON.stringify({ rest, afterDrop }));

  // (f) Escape mid-drag: same.
  before = await cmdCount(page);
  let liftedMidAir = null;
  await dragCard(page, centreOf(rest), centreOf(state.zones['self:bench']), {
    beforeUp: async () => {
      liftedMidAir = await page.evaluate(async () => (await import('/src/setup/board3d/board3d.js')).getBoardInput()?.activeDrag());
      await page.keyboard.press('Escape');
    },
  });
  const afterEscape = await rectBackTo(page, handCard.id, rest);
  T('4a. the card was held mid-drag', liftedMidAir === handCard.id, String(liftedMidAir));
  T('4b. Escape mid-drag sends nothing', (await cmdCount(page)) === before);
  T('4c. … and the card is back at its rect within 1 px', sameRect(rest, afterEscape), JSON.stringify({ rest, afterEscape }));

  T('6. the HTML5 drag path never fired (no dragstart)', (await page.evaluate(() => window.__dragstarts)) === 0);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
