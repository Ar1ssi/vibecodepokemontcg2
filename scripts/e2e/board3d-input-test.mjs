// Design 074 slice D1: real pointer input on the three.js board. Spawns its own authoritative
// server (e2e bridge armed), joins a solo room at `?board=3d`, deals both seats, then drives the
// canvas with Playwright's mouse (no synthetic DOM events) and checks that each gesture reaches
// the existing handlers through the board mirror (board-input.js): a click on a hand card, a
// click on empty table, a double-click on the own Active, a right-click context menu, the hover
// preview's dwell, and the hand card's hover lift.
// Usage: pnpm test:board3d-input   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// hover-preview-model.mjs HOVER_DWELL_MS.
const HOVER_DWELL_MS = 800;
const MENU_SLACK_PX = 40;
const MIN_LIFT_PX = 10;

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

/** Probe evaluated in the page: the scene's rects, hand ids, and what sits on top of the canvas. */
const probe = (page) =>
  page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const placements = scene?.inspect().model?.placements ?? [];
    return {
      rects: scene?.rects() ?? {},
      hand: placements.filter((p) => p.side === 'self' && p.zone === 'hand').map((p) => p.instanceId),
      active: placements.filter((p) => p.side === 'self' && p.zone === 'active').map((p) => p.instanceId),
    };
  });

const topOf = async (page, id) => (await probe(page)).rects[id]?.top ?? NaN;

/**
 * A card's projected top once it has stopped moving: unchanged across four reads spanning a
 * second (frames can be ~0.5 s apart under SwiftShader, and the scene clock moves with them).
 */
async function settledTop(page, id) {
  const deadline = Date.now() + 8000;
  const reads = [await topOf(page, id)];
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    reads.push(await topOf(page, id));
    const recent = reads.slice(-4);
    if (recent.length === 4 && Math.max(...recent) - Math.min(...recent) < 0.5) return recent[3];
  }
  return reads.at(-1);
}

/** Polls a card's top until `accept(top)` (up to 6 s); returns the last top read. */
async function topUntil(page, id, accept) {
  const deadline = Date.now() + 6000;
  let top = await topOf(page, id);
  while (Date.now() < deadline && !accept(top)) {
    await page.waitForTimeout(150);
    top = await topOf(page, id);
  }
  return top;
}

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** What the browser hit-tests at a point: true when it is the 3D board's canvas. */
const canvasAt = (page, { x, y }) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id ?? null, [x, y]);


const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: GL_ARGS,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${server.base}/?e2e=1&board=3d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);

  await page.evaluate(() => window.__ptcg.joinSolo('Input-E2E'));
  await waitFor(page, () => window.__ptcg.soloSeat().solo === true);
  await page.evaluate(() => {
    window.__ptcg.loadFixtureDeck('Near', 'self');
    window.__ptcg.loadFixtureDeck('Far', 'opp');
  });
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
    const hand = (scene?.inspect().model?.placements ?? []).filter((p) => p.side === 'self' && p.zone === 'hand');
    return hand.length >= 7 && hand.every((p) => scene.rects()[p.instanceId]);
  });
  // Let the deal's flights settle so the rects are where the cards rest.
  await page.waitForTimeout(1200);
  T('1. a solo room was dealt on the 3D board', await page.evaluate(() => document.body.classList.contains('board3d-active')));

  const dealt = await probe(page);
  const handId = dealt.hand[Math.floor(dealt.hand.length / 2)];
  const handAt = centreOf(dealt.rects[handId]);
  T('2. the canvas is what the browser hits over a hand card', (await canvasAt(page, handAt)) === 'board3dCanvas', JSON.stringify(handAt));

  // (a) One click on a hand card reaches imageClick through the mirror img.
  await page.mouse.move(handAt.x, handAt.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  const clicked = await page.evaluate(async () => {
    const { mouseClick } = await import('/src/state.js');
    return { instanceId: mouseClick.cardInstanceId, zone: mouseClick.zoneId, user: mouseClick.cardUser };
  });
  T('3a. a click on a hand card identifies it (imageClick ran on its mirror img)',
    clicked.instanceId === handId && clicked.zone === 'hand' && clicked.user === 'self', JSON.stringify(clicked));

  // An empty-table point: under the canvas, with no card or pile under it.
  const empty = await page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    for (let y = 300; y < 800; y += 20) {
      for (let x = 500; x < 1400; x += 20) {
        const hit = scene.hitTest(x, y);
        // A zone's empty footprint (a drop target) is empty table to a click.
        if ((!hit || hit.plane) && document.elementFromPoint(x, y)?.id === 'board3dCanvas') return { x, y };
      }
    }
    return null;
  });
  T('4. an empty table point exists under the canvas', Boolean(empty), JSON.stringify(empty));

  // (d) Right-click on a hand card opens #cardContextMenu where the card is.
  const menuState = () =>
    page.evaluate(() => {
      const el = document.getElementById('cardContextMenu');
      const box = el.getBoundingClientRect();
      return { visible: getComputedStyle(el).display !== 'none' && box.width > 0, box: box.toJSON() };
    });
  const rightClickHandCard = async () => {
    await page.mouse.move(handAt.x, handAt.y);
    await page.mouse.click(handAt.x, handAt.y, { button: 'right' });
    await page.waitForTimeout(200);
    return menuState();
  };
  const menu = await rightClickHandCard();
  const handRect = (await probe(page)).rects[handId];
  // click-events.js anchors the menu at the card's right (or left) edge and clamps it inside the
  // viewport, so it touches the card's rect grown by the slack.
  const grown = {
    left: handRect.left - MENU_SLACK_PX,
    right: handRect.left + handRect.width + MENU_SLACK_PX,
    top: handRect.top - MENU_SLACK_PX,
    bottom: handRect.top + handRect.height + MENU_SLACK_PX,
  };
  const nearCard =
    menu.box.left >= grown.left &&
    menu.box.left <= grown.right &&
    menu.box.top <= grown.bottom &&
    menu.box.top + menu.box.height >= grown.top;
  T('5a. a right-click on a hand card shows #cardContextMenu', menu.visible, JSON.stringify(menu.box));
  T(`5b. … anchored on the card's rect ± ${MENU_SLACK_PX} px`, nearCard, JSON.stringify({ menu: menu.box, card: handRect }));

  // (b) A click on empty table reaches the page's closePopups, which hides the menu.
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  T('5c. a click on empty table runs closePopups: the menu closes', !(await menuState()).visible);
  const reopened = await rightClickHandCard();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  T('5d. reopened, Escape closes it', reopened.visible && !(await menuState()).visible);

  // (e) Hover: the preview shows after the dwell, and hides over empty table.
  // (f) The hovered hand card lifts. One move event each way: an intermediate step would hover
  // (and spread the fan around) the cards the pointer crosses on its way. Headless SwiftShader
  // draws frames irregularly and the scene clock advances with them, so the lift's 180 ms tween
  // is polled for rather than awaited by a fixed sleep.
  await page.mouse.move(empty.x, empty.y);
  const restTop = await settledTop(page, handId);
  await page.mouse.move(handAt.x, handAt.y);
  await page.waitForTimeout(HOVER_DWELL_MS + 100);
  const shown = await page.evaluate(() => document.getElementById('hoverPreview')?.classList.contains('is-shown') === true);
  T('6a. hovering a hand card shows #hoverPreview after the dwell', shown);
  const liftedTop = await topUntil(page, handId, (top) => restTop - top >= MIN_LIFT_PX);
  T(`7a. the hovered hand card lifts ≥ ${MIN_LIFT_PX} px`, restTop - liftedTop >= MIN_LIFT_PX,
    JSON.stringify({ restTop, liftedTop }));
  await page.mouse.move(empty.x, empty.y);
  await page.waitForTimeout(300);
  const hidden = await page.evaluate(() => document.getElementById('hoverPreview')?.classList.contains('is-shown') !== true);
  T('6b. moving to empty table hides it', hidden);
  const droppedTop = await topUntil(page, handId, (top) => Math.abs(top - restTop) < 2);
  T('7b. … and the hand card drops back', Math.abs(droppedTop - restTop) < 2, JSON.stringify({ restTop, droppedTop }));

  // (c) Double-click on the own Active opens the card focus; Escape closes it.
  const played = await page.evaluate(async () => {
    const before = window.__ptcg.zone('self', 'active').count;
    await window.__ptcg.playFromHand(0, 'active', 'self');
    return { before };
  });
  const activeId = await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const active = (scene?.inspect().model?.placements ?? []).find((p) => p.side === 'self' && p.zone === 'active');
    const img = active && document.getElementById('selfBoard').shadowRoot.querySelector(`img[data-instance-id="${active.instanceId}"]`);
    return active && img && scene.rects()[active.instanceId] ? active.instanceId : null;
  });
  T('8a. a hand card was played to the own Active Spot', played.before === 0 && Number.isFinite(activeId), `(#${activeId})`);
  await page.waitForTimeout(600);
  const activeAt = centreOf((await probe(page)).rects[activeId]);
  await page.mouse.dblclick(activeAt.x, activeAt.y);
  const focusOpen = await waitFor(page, () => Boolean(document.querySelector('.card-focus')), 3000).catch(() => false);
  T('8b. a double-click on the own Active opens the card focus', focusOpen);
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  const focusClosed = await waitFor(page, () => !document.querySelector('.card-focus'), 3000).catch(() => false);
  T('8c. Escape closes it', focusClosed);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
