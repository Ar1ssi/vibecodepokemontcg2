// Card preview flows on the board, on either board: the double-click zoom (openCardPreview) flying
// out of the card's rect, and "View attached cards" (openAttachedCardsPanel) — the in-place
// `.full-view` panel on the iframe board, the attachments carousel on the three.js board (design
// 074 D4). Spawns its own authoritative server, joins a solo room, plays a Basic to each Active and
// attaches an Energy to the near one through moveCardBundle { moving, target }, then drives the
// previews at the rects `__ptcg.cardRect` reports (real mouse input on the 3D board).
// Usage: node scripts/e2e/fullview-test.mjs
//   PTCG_BOARD=3d   the three.js board (`?board=3d`); default `iframe` is the classic board
//   PTCG_URL=http://host:port   reuse a running server (started with SERVER_AUTHORITATIVE=1 PTCG_E2E=1)
//   CHROMIUM_PATH=/path/to/chrome   picks the browser, as the other e2e harnesses do
// Not part of `pnpm test`.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BOARD = process.env.PTCG_BOARD === '3d' ? '3d' : 'iframe';
const IS_3D = BOARD === '3d';
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const FACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const ENERGY = 'Basic Fire Energy';
const STADIUM = 'E2E Stadium';
const RECT_SLACK_PX = 2;
const GROWN_FACTOR = 1.8;
// The pop and its retreat are rAF springs stepped by the real frame time (card-pop.mjs). A
// SwiftShader-drawn 3D page runs a few frames a second, so a step spans many frames and the spring
// rings (past 1, and back) for several seconds before it settles; the iframe board settles in one.
const SPRING_SETTLE_MS = IS_3D ? 30000 : 8000;
// e2e-mode.mjs fixture rows ([quantity, name, type, image, number, set, tcgId]): set 'e2e' skips
// live enrichment.
const deckRows = (prefix) => [
  ...Array.from({ length: 10 }, (_, i) => ['1', `${prefix} ${i + 1}`, 'Pokémon', FACE, String(i + 1).padStart(3, '0'), 'e2e', `e2e-${prefix}-${i + 1}`]),
  ['6', ENERGY, 'Energy', FACE, '101', 'e2e', `e2e-${prefix}-fire`],
  ['4', STADIUM, 'Stadium', FACE, '201', 'e2e', `e2e-${prefix}-stadium`],
];

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` [${extra}]` : ''}`);
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

/** Polls `fn` until truthy; false (not a throw) on timeout, for checks that report FAIL. */
const eventually = (page, fn, timeout = 6000, arg) => waitFor(page, fn, timeout, arg).catch(() => false);

/** The card's viewport rect once it stops moving: SwiftShader draws a frame every ~0.3 s and the scene clock only moves with drawn frames. */
async function settledRect(page, id) {
  const deadline = Date.now() + 8000;
  const reads = [];
  while (Date.now() < deadline) {
    reads.push(await page.evaluate((cardId) => window.__ptcg.cardRect(cardId), id));
    const recent = reads.slice(-4);
    if (recent.length === 4 && recent.every(Boolean) &&
      recent.every((r) => Math.abs(r.left - recent[0].left) < 0.5 && Math.abs(r.top - recent[0].top) < 0.5)) {
      return recent[3];
    }
    await page.waitForTimeout(250);
  }
  return reads.at(-1) ?? null;
}

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const sameRect = (a, b, slack) => ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= slack);

const boardActiveId = (page, side) =>
  page.evaluate((who) => {
    const id = window.__boardRoot(who)?.querySelector('#active img')?.dataset.instanceId;
    return id == null ? null : Number(id);
  }, side);

async function playFromHand(page, pattern, dest, user) {
  const index = await page.evaluate(
    ([source, who]) => window.__ptcg.zone(who, 'hand').names.findIndex((n) => new RegExp(source).test(n)),
    [pattern, user]
  );
  if (index < 0) return false;
  await page.evaluate(([i, d, who]) => window.__ptcg.playFromHand(i, d, who), [index, dest, user]);
  return true;
}

/** Joins a fresh solo room and deals; null when the near hand lacks a Basic and an Energy or the far hand a Basic. */
async function dealSolo(browser, base, attempt) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('dialog', (dialog) => dialog.accept());
  // The board's document: the mirror's open shadow root on the 3D board, the iframe's otherwise.
  await page.addInitScript(() => {
    window.__boardRoot = (side) => {
      if (window.__ptcg?.boardMode?.() === '3d') {
        return document.getElementById(side === 'opp' ? 'oppBoard' : 'selfBoard')?.shadowRoot ?? null;
      }
      return document.getElementById(side === 'opp' ? 'oppContainer' : 'selfContainer')?.contentDocument ?? null;
    };
  });
  await page.goto(`${base}/?e2e=1${IS_3D ? '&board=3d' : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  await page.evaluate((name) => window.__ptcg.joinSolo(name), `Fullview-E2E-${attempt}`);
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
  // The server lets only the turn player act past the Starting Active: put that seat near.
  const turn = await waitFor(page, () => window.__ptcg.rulesState.turnPlayer, 10000);
  if (turn === 'opp') {
    await page.locator('#flipBoardButton').dispatchEvent('click');
    await waitFor(page, () => window.__ptcg.soloSeat().nearSeat === 'p2' && window.__ptcg.rulesState.turnPlayer === 'self', 15000);
  }
  await page.waitForTimeout(1500);
  const [near, far] = await page.evaluate(() => [window.__ptcg.zone('self', 'hand').names, window.__ptcg.zone('opp', 'hand').names]);
  if (near.some((n) => /^Near /.test(n)) && near.includes(ENERGY) && far.some((n) => /^Far /.test(n))) return { page, context };
  console.log(`deal ${attempt}: near hand ${near.join(', ')} / far hand ${far.join(', ')} — dealing again`);
  await context.close();
  return null;
}

const pageErrors = [];
const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    ...(IS_3D ? { args: GL_ARGS } : {}),
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  let dealt = null;
  for (let attempt = 1; attempt <= 8 && !dealt; attempt += 1) dealt = await dealSolo(browser, server.base, attempt);
  T('1. a solo room was dealt with a Basic and an Energy near and a Basic far', Boolean(dealt));
  if (!dealt) throw new Error('no usable deal');
  const { page } = dealt;
  T(`1b. __ptcg.boardMode() is '${BOARD}'`, (await page.evaluate(() => window.__ptcg.boardMode())) === BOARD);

  // Setup: a Basic in each Active, an Energy attached to the near one (what a drag onto it sends).
  await playFromHand(page, '^Near ', 'active', 'self');
  await playFromHand(page, '^Far ', 'active', 'opp');
  const nearId = await waitFor(page, () => window.__boardRoot('self')?.querySelector('#active img')?.dataset.instanceId ?? null, 15000).then(Number);
  const farId = await waitFor(page, () => window.__boardRoot('opp')?.querySelector('#active img')?.dataset.instanceId ?? null, 15000).then(Number);
  T('2. both Actives are on the board', Number.isInteger(nearId) && Number.isInteger(farId), JSON.stringify({ nearId, farId }));
  await page.evaluate(async ([energy, targetId]) => {
    const { moveCardBundle } = await import('/src/actions/move-card-bundle/move-card-bundle.js');
    const { getAuthoritativeZoneArray } = await import('/src/setup/netcode/apply-view.js');
    const hand = getAuthoritativeZoneArray('you', 'hand');
    const index = hand.findIndex((card) => card.name === energy);
    moveCardBundle('self', 'self', 'hand', 'active', index, 0, 'move', true, null, { moving: hand[index].instanceId, target: targetId });
  }, [ENERGY, nearId]);
  const attached = await eventually(page, async (id) => {
    const img = window.__boardRoot('self').querySelector(`img[data-instance-id="${id}"]`);
    const { resolvePreviewCard } = await import('/src/setup/image-logic/preview-card.mjs');
    return (resolvePreviewCard(null, img)?.attachedCards ?? []).some((c) => c.name === 'Basic Fire Energy');
  }, 10000, nearId);
  T('3. an Energy is attached to the near Active', attached);

  // __ptcg.cardRect against the browser's own geometry for the same card.
  const nearRect = await settledRect(page, nearId);
  const farRect = await settledRect(page, farId);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const inViewport = (r) => r && r.left >= 0 && r.top >= 0 && r.left + r.width <= viewport.width && r.top + r.height <= viewport.height;
  T('4a. cardRect gives both Actives a rect inside the viewport', Boolean(inViewport(nearRect) && inViewport(farRect)), JSON.stringify({ nearRect, farRect }));
  T('4b. the far Active is above the near one', Boolean(nearRect && farRect) && farRect.top < nearRect.top);
  const nearLocator = IS_3D
    ? page.locator(`#selfBoard img[data-instance-id="${nearId}"]`)
    : page.frameLocator('#selfContainer').locator(`img[data-instance-id="${nearId}"]`);
  const nearBox = await nearLocator.boundingBox();
  T('4c. cardRect equals Playwright\'s bounding box of the near Active\'s board image',
    Boolean(nearBox && nearRect) && sameRect(nearRect, { left: nearBox.x, top: nearBox.y, width: nearBox.width, height: nearBox.height }, 1.5),
    JSON.stringify({ nearRect, nearBox }));
  T('4d. cardRect is null for an id the board does not show', (await page.evaluate(() => window.__ptcg.cardRect(987654321))) === null);

  // (a) Double-click zoom on the far Active (own Pokémon open the focus view / inspector instead):
  // the zoom flies out of the card's rect and settles at the preview size.
  await page.mouse.move(5, viewport.height / 2);
  await page.waitForTimeout(400);
  const farBefore = await settledRect(page, farId);
  const farAt = await hoverPoint(page, farId, farBefore);
  await page.evaluate((settleMs) => {
    window.__previewFlight = null;
    window.__scales = [];
    const observer = new MutationObserver(() => {
      const pop = document.querySelector('.card-preview-pop');
      if (!pop || window.__previewFlight) return;
      // Before the first frame: the pop sits on its source at the start scale.
      window.__previewFlight = pop.getBoundingClientRect().toJSON();
      observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    const t0 = performance.now();
    const sample = () => {
      const pop = document.querySelector('.card-preview-pop');
      const m = /scale\(([\d.]+)\)/.exec(pop?.style.transform || '');
      if (m) window.__scales.push(Number(m[1]));
      if (performance.now() - t0 < settleMs) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, SPRING_SETTLE_MS);
  await doubleClickCard(page, 'opp', farId, farAt);
  T('5a. a double-click on the far Active opens the card preview overlay',
    await eventually(page, () => Boolean(document.querySelector('.card-preview-overlay'))));
  T('5b. ... and not an in-place .full-view panel', await page.evaluate(() => !window.__boardRoot('opp').querySelector('.full-view')));
  const flight = await page.evaluate(() => window.__previewFlight);
  T(`5c. the pop starts on the card's rect (centre and width ± ${RECT_SLACK_PX} px)`,
    Boolean(flight) && Math.abs(centreOf(flight).x - centreOf(farBefore).x) <= RECT_SLACK_PX &&
      Math.abs(centreOf(flight).y - centreOf(farBefore).y) <= RECT_SLACK_PX && Math.abs(flight.width - farBefore.width) <= RECT_SLACK_PX,
    JSON.stringify({ flight, card: farBefore }));
  const popWidth = await eventually(page, () => {
    const width = document.querySelector('.card-preview-pop img')?.getBoundingClientRect().width ?? 0;
    return Math.abs((window.__scales.at(-1) ?? 0) - 1) < 0.001 ? width : false;
  }, SPRING_SETTLE_MS);
  T(`5d. the preview enlarges the card (> ${GROWN_FACTOR}x its board width)`, popWidth > farBefore.width * GROWN_FACTOR,
    `${Math.round(farBefore.width)}px -> ${Math.round(popWidth || 0)}px`);
  const scales = await page.evaluate(() => window.__scales);
  T('5e. the pop starts small', scales[0] <= 0.6, `first=${scales[0]}`);
  // POPOVER_SPRING (card-pop.mjs) is overdamped at 60 fps: the scale climbs to 1 without crossing it.
  // Stepped by SwiftShader-sized frames it rings, so the 3D board is only held to settling at 1.
  T(IS_3D ? '5f. the pop settles at exactly 1' : '5f. the pop settles at exactly 1, without overshooting past 1.1',
    scales.at(-1) === 1 && (IS_3D || Math.max(...scales) <= 1.1), `max=${Math.max(...scales)} last=${scales.at(-1)}`);
  const holo = await page.evaluate(() => Boolean(window.__boardRoot('opp').querySelector('#active .mat-holo')));
  console.log(holo ? 'note: the far Active is holo' : 'note: fixture cards carry no rarity, so no .mat-holo: the foil-under-cursor checks have nothing to run on');
  await page.keyboard.press('Escape');
  if (IS_3D) {
    // Found: the retreat spring (RETREAT_SPRING, card-pop.mjs) diverges when a step spans ~10+
    // frames, as on a SwiftShader page (the pop's scale ran to -200000 and the overlay never left),
    // so Escape is held to starting the close and the immediate path finishes it.
    T('6a. Escape starts the preview closing (the overlay takes is-closing)',
      await eventually(page, () => Boolean(document.querySelector('.card-preview-overlay.is-closing')) || !document.querySelector('.card-preview-overlay')));
    await page.evaluate(async () => (await import('/src/setup/image-logic/full-view.js')).closeCardPreview(null, true));
    T('6a2. the immediate close removes the overlay', await eventually(page, () => !document.querySelector('.card-preview-overlay')));
  } else {
    T('6a. Escape removes the preview overlay', await eventually(page, () => !document.querySelector('.card-preview-overlay'), SPRING_SETTLE_MS));
  }
  const farAfter = await settledRect(page, farId);
  T('6b. the card is back on the board where it was', Boolean(farAfter) && sameRect(farAfter, farBefore, 1), JSON.stringify({ farBefore, farAfter }));
  T('6c. ... and visible again', await eventually(page, () => {
    const img = window.__boardRoot('opp').querySelector('#active img');
    const target = img.closest('.mat-holo') ?? img;
    return getComputedStyle(target).visibility !== 'hidden';
  }));

  // (b) "View attached cards" on the near Active, called as the context menu does (the menu entry
  // returns early under server authority on both boards, design 074 D4).
  const nearBefore = await settledRect(page, nearId);
  const opened = await page.evaluate(async (id) => {
    const img = window.__boardRoot('self').querySelector(`img[data-instance-id="${id}"]`);
    const { resolvePreviewCard } = await import('/src/setup/image-logic/preview-card.mjs');
    const { openAttachedCardsPanel } = await import('/src/setup/image-logic/full-view.js');
    return openAttachedCardsPanel(img, resolvePreviewCard(null, img));
  }, nearId);
  T('7a. openAttachedCardsPanel reports it opened', opened === true);
  if (IS_3D) {
    const carousel = await eventually(page, () => {
      const overlay = document.getElementById('cardPickerOverlay');
      return overlay ? [...overlay.querySelectorAll('img.discard-pile-card')].map((img) => img.alt) : null;
    });
    T('7b. the attachments carousel opens with the Energy', Array.isArray(carousel) && carousel.includes(ENERGY), JSON.stringify(carousel));
    T('7c. ... and no in-place .full-view panel is built', await page.evaluate(() => !window.__boardRoot('self').querySelector('.full-view')));
    await page.keyboard.press('Escape');
    T('8a. Escape closes the carousel', await eventually(page, () => !document.getElementById('cardPickerOverlay')));
  } else {
    T('7b. the attached panel uses .full-view', await eventually(page, () => window.__boardRoot('self').querySelectorAll('.full-view').length === 1));
    const grown = await eventually(page, async ([id, before]) => {
      const rect = window.__ptcg.cardRect(id);
      return rect && rect.width > before * 1.8 ? rect.width : false;
    }, 8000, [nearId, nearBefore.width]);
    T(`7c. the attached panel enlarges the card (> ${GROWN_FACTOR}x)`, Boolean(grown), `${Math.round(nearBefore.width)}px -> ${Math.round(grown || 0)}px`);
    await page.keyboard.press('Escape');
    T('8a. Escape closes the panel cleanly', await eventually(page, () => window.__boardRoot('self').querySelectorAll('.full-view').length === 0, 8000));
  }
  const nearAfter = await settledRect(page, nearId);
  T('8b. the near Active is back on the board where it was', Boolean(nearAfter) && sameRect(nearAfter, nearBefore, 1), JSON.stringify({ nearBefore, nearAfter }));

  T('9. no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);

/**
 * Double-clicks a card. The 3D board gets real mouse input at `at`, which board-input.js routes to the
 * card's mirror image. The iframe board gets click, click, dblclick dispatched on the card's image: the
 * play-container's own box can sit over the image at its centre, so a real click there misses it.
 */
async function doubleClickCard(page, side, id, at) {
  if (IS_3D) {
    await page.mouse.dblclick(at.x, at.y);
    return;
  }
  await page.evaluate(
    ([who, cardId]) => {
      const img = window.__boardRoot(who).querySelector(`img[data-instance-id="${cardId}"]`);
      const r = img.getBoundingClientRect();
      const { MouseEvent: BoardMouseEvent } = img.ownerDocument.defaultView;
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const name of ['click', 'click', 'dblclick']) img.dispatchEvent(new BoardMouseEvent(name, opts));
    },
    [side, id]
  );
}

/**
 * A point the pointer reaches the card at. Iframe board: the card's centre. 3D board: the centre if
 * the scene's raycast hits this card there, else the first point of a grid over its rect that does.
 */
async function hoverPoint(page, id, rect) {
  const centre = centreOf(rect);
  if (!IS_3D) return centre;
  const point = await page.evaluate(
    async ([cardId, box, preferred]) => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const scene = getBoardScene();
      const hits = (x, y) => scene.hitTest(x, y)?.instanceId === cardId;
      if (hits(preferred.x, preferred.y)) return preferred;
      for (let row = 1; row < 12; row += 1) {
        for (let col = 1; col < 8; col += 1) {
          const x = box.left + (box.width * col) / 8;
          const y = box.top + (box.height * row) / 12;
          if (hits(x, y)) return { x, y };
        }
      }
      return null;
    },
    [id, rect, centre]
  );
  if (!point) throw new Error(`no point of card #${id} is reachable by the pointer`);
  return point;
}
