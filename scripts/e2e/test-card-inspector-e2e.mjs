// Design 067 card focus + design 069 hover preview, in a two-player authoritative room.
// Usage: pnpm test:inspector   (spawns its own server on a free port)
//   PTCG_BOARD=3d   the three.js board (`?board=3d`, design 074): cards are read through
//                   `__ptcg.cardRect` and the board mirror's shadow roots instead of the iframes;
//                   default `iframe` is the classic board
//   PTCG_URL=http://host:port   reuse a running server (started with SERVER_AUTHORITATIVE=1)
//   CHROMIUM_PATH=/path/to/chrome   picks the browser, as the other e2e harnesses do
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOM = process.env.PTCG_ROOM || `e2e-inspector-${Date.now()}`;
const BOARD = process.env.PTCG_BOARD === '3d' ? '3d' : 'iframe';
const IS_3D = BOARD === '3d';
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// SwiftShader draws a frame every ~0.3 s and the scene clock moves only with drawn frames.
const SETTLE_TIMEOUT_MS = 8000;

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

const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

let failed = 0;

async function waitFor(page, fn, timeout = 25000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for page predicate (last=${JSON.stringify(last)})`);
}

async function openClient(browser, name, server) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('[vite]') && !text.includes('Download the React DevTools') && !text.includes('cloudflareinsights')) {
      console.log(`[CONSOLE ${name}]`, text);
    }
  });
  // The board's document: the mirror's open shadow root on the 3D board, the iframe's document
  // otherwise. Installed before any script runs so page.evaluate callbacks can use it at once.
  await page.addInitScript(() => {
    window.__boardRoot = (side) => {
      if (window.__ptcg?.boardMode?.() === '3d') {
        return document.getElementById(side === 'opp' ? 'oppBoard' : 'selfBoard')?.shadowRoot ?? null;
      }
      return document.getElementById(side === 'opp' ? 'oppContainer' : 'selfContainer')?.contentDocument ?? null;
    };
  });
  await page.goto(`${server.base}/?e2e=1${IS_3D ? '&board=3d' : '&board=iframe'}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { context, page, name };
}

mkdirSync(new URL('../../out/', import.meta.url), { recursive: true });
const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
const browser = await chromium.launch({
  headless: true,
  ...(IS_3D ? { args: GL_ARGS } : {}),
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

try {
  const a = await openClient(browser, 'A', server);
  const b = await openClient(browser, 'B', server);

  // 1. Join room
  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'Player-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'Player-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  T('1. Both clients joined 2P room', true);

  // 2. Load decks
  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => (window.__ptcg?.systemState?.selfDeckData?.length || 0) >= 20);
  await waitFor(b.page, () => (window.__ptcg?.systemState?.selfDeckData?.length || 0) >= 20);
  T('2. Decks loaded for both players', true);

  // 3. Ready up
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  await waitFor(a.page, () => window.__ptcg.zone('self', 'prizes').count === 6);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'prizes').count === 6);

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const overlayDeadline = Date.now() + 15000;
  let caller = null;
  while (Date.now() < overlayDeadline && !caller) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    if (await a.page.locator(callBtn).isVisible().catch(() => false)) {
      await a.page.locator(callBtn).click();
      caller = 'A';
      break;
    }
    if (await b.page.locator(callBtn).isVisible().catch(() => false)) {
      await b.page.locator(callBtn).click();
      caller = 'B';
      break;
    }
    await a.page.waitForTimeout(200);
  }
  console.log('Coin caller page:', caller);

  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  T('3. Opening hands and prizes dealt', true);

  // Determine which player acts
  const aTurn = await a.page.evaluate(() => window.__ptcg.counters().turnPlayer);
  const actor = aTurn === 'self' ? a : b;
  const observer = actor === a ? b : a;
  console.log(`Active actor is Client ${actor.name} (turnPlayer: ${aTurn})`);

  console.log(`${actor.name} placing active card...`);
  await actor.page.evaluate(async () => {
    const { getAuthoritativeZoneArray, hasAuthoritativeView } = await import('./src/setup/netcode/apply-view.js');
    if (hasAuthoritativeView()) {
      const { emitCmd } = await import('./src/setup/netcode/cmd-emitter.js');
      const { socket, systemState } = await import('./src/state.js');
      const hand = getAuthoritativeZoneArray('you', 'hand');
      const card = hand[0];
      if (card?.instanceId != null) {
        await emitCmd({
          socket,
          roomId: systemState.roomId,
          type: 'moveCard',
          payload: { instanceId: card.instanceId, from: 'hand', to: 'active' },
        });
        return;
      }
    }
    await window.__ptcg.playFromHand(0, 'active');
  });
  await waitFor(actor.page, () => window.__ptcg.zone('self', 'active').count === 1);
  T('4. Active Pokémon in play on active actor', true);

  await actor.page.waitForTimeout(500);

  // Stamp Charmander stats on active card
  await actor.page.evaluate(() => {
    const stamped = window.__boardRoot('self')?.querySelector('#active img')?.card;
    if (stamped) {
      stamped.hp = 70;
      stamped.types = ['Fire'];
      stamped.attacks = [
        { name: 'Ember', cost: ['Fire'], damage: '30', text: 'Discard a {R} Energy from this Pokémon.' },
        { name: 'Scratch', cost: ['Colorless'], damage: '10', text: '' },
      ];
      stamped.weakness = { type: 'Water', value: 2 };
      stamped.resistance = null;
      stamped.retreatCost = ['Colorless'];
    }
  });

  // The board image of `selector` ('#active img', '#hand img') on `side`, as an instance id list.
  const boardIds = (side, selector) =>
    actor.page.evaluate(
      ([who, sel]) => [...window.__boardRoot(who).querySelectorAll(sel)].map((img) => Number(img.dataset.instanceId)),
      [side, selector]
    );
  const activeId = (await boardIds('self', '#active img'))[0];
  T('4b. the own Active has an instance id', Number.isInteger(activeId));
  console.log(`Board mode: ${BOARD}, own Active #${activeId}`);

  // The card's viewport rect once it stops moving: the 3D scene's clock only advances with drawn
  // frames, so a rect read right after a state change can still be mid-tween.
  const settledCardRect = async (id) => {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    const reads = [];
    while (Date.now() < deadline) {
      reads.push(await actor.page.evaluate((cardId) => window.__ptcg.cardRect(cardId), id));
      const recent = reads.slice(-4);
      if (recent.length === 4 && recent.every(Boolean) &&
        recent.every((r) => Math.abs(r.left - recent[0].left) < 0.5 && Math.abs(r.top - recent[0].top) < 0.5)) {
        return recent[3];
      }
      await actor.page.waitForTimeout(250);
    }
    return reads.at(-1) ?? null;
  };
  const activeCentre = async () => {
    const rect = await settledCardRect(activeId);
    return rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  // Polls `fn` in the page until it is truthy; false on timeout.
  const eventually = async (fn, arg, timeout = 6000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await actor.page.evaluate(fn, arg)) return true;
      await actor.page.waitForTimeout(150);
    }
    return false;
  };

  // Design 067: a click on your own Active opens the TCG Live focus view, not the carousel. The
  // events go to the card's board image (the mirror's twin on the 3D board, where board-input.js
  // re-dispatches the canvas gestures to the same node), made in that image's own window.
  const clickActive = (events) =>
    actor.page.evaluate((names) => {
      const img = window.__boardRoot('self').querySelector('#active img');
      const r = img.getBoundingClientRect();
      const { MouseEvent: BoardMouseEvent } = img.ownerDocument.defaultView;
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const name of names) img.dispatchEvent(new BoardMouseEvent(name, opts));
    }, events);
  const focusOpen = () => actor.page.evaluate(() => Boolean(document.querySelector('.card-focus')));
  // A browse carousel only: the fixture game can already have a server choice picker
  // (`card-picker-choose`) open, which is not what these steps are about.
  const carouselVisible = () =>
    actor.page.evaluate(() => {
      const overlay = document.querySelector('#cardPickerOverlay:not(.card-picker-choose)');
      return Boolean(overlay && getComputedStyle(overlay).display !== 'none');
    });
  // card-focus.mjs lowerHand: `hand-lowered` on the self iframe's root, or on the mirror's host
  // plus the scene's hand pose on the 3D board, where both must agree.
  const handState = () =>
    actor.page.evaluate(async () => {
      const root = window.__boardRoot('self');
      const marked = (root.documentElement ?? root.host).classList.contains('hand-lowered');
      if (window.__ptcg.boardMode() !== '3d') return { lowered: marked, raised: !marked };
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const pose = getBoardScene().inspect().handPose;
      return { lowered: marked && pose === 'lowered', raised: !marked && pose === 'normal' };
    });
  const handLowered = async () => (await handState()).lowered;
  const handRaised = async () => {
    for (let i = 0; i < 40; i += 1) {
      if ((await handState()).raised) return true;
      await actor.page.waitForTimeout(150);
    }
    return false;
  };
  // card-focus.mjs hideSource: the board image (or its holo wrapper) goes visibility:hidden; on the
  // 3D board the mirror then reports the card hidden to the scene, which hides the mesh.
  const sourceState = () =>
    actor.page.evaluate(async () => {
      const img = window.__boardRoot('self').querySelector('#active img');
      const target = img.closest('.mat-holo') ?? img;
      const dom = getComputedStyle(target).visibility === 'hidden';
      if (window.__ptcg.boardMode() !== '3d') return { dom, scene: dom };
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      return { dom, scene: getBoardScene().inspect().uiState.get(Number(img.dataset.instanceId))?.hidden === true };
    });
  const sourceHidden = async () => {
    const state = await sourceState();
    return state.dom && state.scene;
  };
  const sourceVisible = async () => {
    for (let i = 0; i < 40; i += 1) {
      const state = await sourceState();
      if (!state.dom && !state.scene) return true;
      await actor.page.waitForTimeout(150);
    }
    return false;
  };
  const waitGone = async () => {
    for (let i = 0; i < 20; i += 1) {
      if (!(await focusOpen())) return true;
      await actor.page.waitForTimeout(50);
    }
    return false;
  };

  // 5. Single click opens the focus view
  console.log('Testing single click on own active card...');
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  T('5. Click on own active opens the focus view', await focusOpen());
  T('5b. ...and not the carousel', !(await carouselVisible()));
  T('5c. Flight finished: backdrop open class set', await actor.page.evaluate(() => document.querySelector('.card-focus')?.classList.contains('card-focus--open')));
  T(`5d. The hand is lowered ${IS_3D ? 'in the scene and on the mirror host' : 'in the self frame'}`, await handLowered());
  T('5e. The source card is hidden while focused', await sourceHidden());

  // 5f. A human-paced double-click: two REAL clicks 250 ms apart. On the iframe board the first lands
  // in the mat's iframe and the second in the main document, so the browser reports a click count of
  // 1 for each: only timing can tell them apart. The second click must not close the view.
  await actor.page.keyboard.press('Escape');
  T('5f-pre. Escape closes the focus view', await waitGone());
  // The fixture game leaves a server choice picker (`card-picker-choose`) open over the mat, which
  // would take real mouse clicks meant for the Active. Hide it for the real-input steps.
  await actor.page.evaluate(() =>
    document.querySelector('#cardPickerOverlay.card-picker-choose')?.style.setProperty('display', 'none', 'important')
  );
  const { x: cx, y: cy } = await activeCentre();
  await actor.page.mouse.click(cx, cy);
  await actor.page.waitForTimeout(250);
  await actor.page.mouse.click(cx, cy);
  await actor.page.waitForTimeout(700);
  const dblCount = await actor.page.locator('.card-focus').count();
  const dblCarousel = await carouselVisible();
  T(
    '5f. A real double-click on own active leaves exactly one focus view and no carousel',
    dblCount === 1 && !dblCarousel,
    `focus=${dblCount} carousel=${dblCarousel}`
  );
  // A single real click on the backdrop after the double-click window still closes it.
  await actor.page.waitForTimeout(600);
  await actor.page.mouse.click(8, 8);
  T('5f-post. A later single click on the backdrop closes it', await waitGone());

  // 5g. Synthetic click, click, dblclick events reach the card itself: the already-open guard must
  // keep the focus and never fall through to the old carousel route.
  await clickActive(['click', 'click', 'dblclick']);
  await actor.page.waitForTimeout(800);
  T(
    '5g. Synthetic double-click events leave one focus view and no carousel',
    (await actor.page.locator('.card-focus').count()) === 1 && !(await carouselVisible())
  );

  // 6. Pose: the card sits on the pose derived from the game's camera, with chrome sized to it
  const pose = await actor.page.evaluate(async () => {
    const { focusRect, perspectiveFor } = await import('./src/setup/rules/card-focus-geometry.mjs');
    const host = document.querySelector('.card-focus__card');
    const chrome = document.querySelector('.card-focus .ptcg-chrome');
    const rect = host.getBoundingClientRect();
    const expected = focusRect({ width: window.innerWidth, height: window.innerHeight });
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      expected,
      perspective: parseFloat(getComputedStyle(document.querySelector('.card-focus__stage')).perspective),
      expectedPerspective: perspectiveFor(window.innerHeight),
      u: parseFloat(chrome?.style.getPropertyValue('--u')),
      chromeWidth: chrome ? parseFloat(chrome.style.width) : 0,
    };
  });
  console.log('Pose:', JSON.stringify(pose));
  const within = (a, b, tol) => Math.abs(a - b) <= tol;
  T(
    '6. Card rect equals the derived focus pose',
    ['left', 'top', 'width', 'height'].every((k) => within(pose.rect[k], pose.expected[k], 2))
  );
  T('6b. Stage perspective follows the 20-degree camera', within(pose.perspective, pose.expectedPerspective, 1));
  T('6c. Chrome is sized to the unscaled card (--u = width / 100)', within(pose.u * 100, pose.rect.width, 2) && within(pose.chromeWidth, pose.rect.width, 3));

  const inspectorData = await actor.page.evaluate(() => {
    const insp = document.querySelector('.card-focus .ptcg-inspector');
    if (!insp) return null;
    return {
      hp: insp.querySelector('.ptcg-hp')?.textContent,
      atks: [...insp.querySelectorAll('.ptcg-atk')].map((el) => ({
        name: el.querySelector('.ptcg-atk__name')?.textContent,
        receded: el.classList.contains('ptcg-atk--recede'),
        usable: el.classList.contains('ptcg-atk--usable'),
        type: el.dataset.ptcgType,
        hasDmg: Boolean(el.querySelector('.ptcg-atk__dmg')),
      })),
      stats: insp.querySelector('.ptcg-stats')?.textContent,
      retreatType: insp.querySelector('.ptcg-stat[data-ptcg-retreat]')?.dataset.ptcgType,
    };
  });
  console.log('Focus data (0 energy):', JSON.stringify(inspectorData));
  T('7. Every attack panel is greyed and unusable with 0 energy', inspectorData && inspectorData.atks.length === 2 && inspectorData.atks.every((a) => a.receded && !a.usable));
  T('7b. Panels carry the Fire sprite set (data-ptcg-type)', inspectorData && inspectorData.atks.every((a) => a.type === 'fire') && inspectorData.retreatType === 'fire');

  // 7c. Layout proportions measured off TCG Live's own overlay (design 067): the list is bottom-anchored,
  // 105% of the card wide starting 2.5% in; the strip sits under it and repeats weakness/resistance; the
  // HP pill overhangs the card's right edge; the HUD stands left of the card.
  const layout = await actor.page.evaluate(() => {
    const box = (sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      host: box('.card-focus__card'),
      chrome: box('.card-focus .ptcg-chrome'),
      stack: box('.card-focus .ptcg-stack--focus'),
      strip: box('.card-focus .ptcg-stats--focus'),
      hp: box('.card-focus .ptcg-hp'),
      hud: box('.card-focus__hud'),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      stripText: document.querySelector('.card-focus .ptcg-stats--focus')?.textContent ?? '',
      weakness: document.querySelector('.card-focus .ptcg-wr__row .ptcg-wr__n')?.textContent ?? null,
    };
  });
  const W = layout.host.width;
  console.log('Layout:', JSON.stringify({ W, stack: layout.stack, strip: layout.strip }));
  // TCG Live's own layout, in game units (card mesh 6.397 wide): the list and the bar float 1.6 units
  // in front of the card, so their on-screen boxes are their layout boxes scaled about the viewport
  // centre by the camera perspective (FOV 20 degrees). The chrome box is what the CSS anchors to (it
  // follows the scan's own box; a real card's chrome box equals the host's).
  const tu = layout.chrome.width / 6.397;
  const perspective = layout.viewport.height / 2 / Math.tan((10 * Math.PI) / 180);
  const lift = perspective / (perspective - 1.6 * tu);
  const liftX = (x) => layout.viewport.width / 2 + (x - layout.viewport.width / 2) * lift;
  const liftY = (y) => layout.viewport.height / 2 + (y - layout.viewport.height / 2) * lift;
  T(
    '7c. The list is the 6.3-unit window, 0.1485 units in from the card edge, lifted off the card',
    within(layout.stack.left, liftX(layout.chrome.left + 0.1485 * tu), 3) &&
      within(layout.stack.right, liftX(layout.chrome.left + 6.4485 * tu), 3)
  );
  T('7d. The list is anchored 1.05 units above the chrome bottom', within(layout.stack.bottom, liftY(layout.chrome.bottom - 1.05 * tu), 3));
  T(
    '7e. The bar hangs under the list: 0.43 units above the card bottom, 0.7 tall',
    within(layout.strip.bottom, liftY(layout.chrome.bottom - 0.43 * tu), 3) && within(layout.strip.height, 0.7 * tu * lift, 3)
  );
  T('7f. The strip repeats weakness and resistance (the print is covered)', /weakness/.test(layout.stripText) && /resistance/.test(layout.stripText) && layout.weakness === '×2', layout.stripText.trim().replace(/\s+/g, ' '));
  T('7g. The HP pill overhangs the card edge, the HUD stands left of it', layout.hp.right > layout.host.right + 0.01 * W && layout.hud.right < layout.host.left);

  await actor.page.screenshot({ path: 'out/e2e-focus-open.png' });
  console.log('Screenshot saved: out/e2e-focus-open.png');

  // 8. Escape closes with fly-back; the hand and the source card come back
  await actor.page.keyboard.press('Escape');
  T('8. Escape closes the focus view', await waitGone());
  T('8b. The hand is raised again', await handRaised());
  T('8c. The source card is visible again', await sourceVisible());

  // 9. Backdrop click closes (after the double-click arm delay); the close button closes
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.mouse.click(8, 8);
  T('9. Clicking the backdrop closes the focus view', await waitGone());
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.locator('.card-focus__close').click();
  T('9b. The close button closes the focus view', await waitGone());

  // 10. Attach 1 Fire Energy -> attacks become payable; the Stack button opens the carousel
  console.log('Attaching 1 Fire Energy to active...');
  await actor.page.evaluate(() => {
    const stamped = window.__boardRoot('self')?.querySelector('#active img')?.card;
    if (stamped) {
      if (!stamped.attachedCards) stamped.attachedCards = [];
      const energyCard = {
        name: 'Basic Fire Energy',
        type: 'Energy',
        image: { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
        energyType: 'Fire',
      };
      stamped.attachedCards.push(energyCard);
    }
  });
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  const withEnergy = await actor.page.evaluate(() => ({
    atks: [...document.querySelectorAll('.card-focus .ptcg-atk')].map((el) => ({
      receded: el.classList.contains('ptcg-atk--recede'),
      usable: el.classList.contains('ptcg-atk--usable'),
    })),
    stack: document.querySelector('.card-focus__stack-count')?.textContent ?? null,
    energies: document.querySelectorAll('.card-focus__energy').length,
  }));
  console.log('Focus data (1 Fire Energy attached):', JSON.stringify(withEnergy));
  T('10. Ember and Scratch are payable once Fire Energy is attached', withEnergy.atks.length === 2 && withEnergy.atks.every((a) => a.usable && !a.receded));
  T('10b. The HUD shows the Stack button with the attached count', withEnergy.stack === '1');
  T('10b2. The attached Fire Energy stands under the card as one large token', withEnergy.energies === 1);

  await actor.page.screenshot({ path: 'out/e2e-focus-payable.png' });
  console.log('Screenshot saved: out/e2e-focus-payable.png');

  // 10c. With a payable attack under the cursor, a real double-click on the Active must not fire it:
  // the Active's slot is under the landed card, so the second click lands on an attack panel.
  await actor.page.keyboard.press('Escape');
  await waitGone();
  const { x: px, y: py } = await activeCentre();
  let secondClick = { x: px, y: py };
  if (!IS_3D) {
    await actor.page.mouse.click(px, py);
    // A slow double-click: the list has finished revealing, the 500 ms guard has not passed.
    await actor.page.waitForTimeout(350);
  } else {
    // The 3D board's Active sits beside the focus card, so there the second click is aimed at the
    // lowest payable panel (the list reveals upward, so it is hit-testable first). SwiftShader
    // draws frames so far apart that the card is not even visible inside the 500 ms guard (it is
    // hidden until its flight starts, one frame after the open), so the page's clock is held at
    // the open and then moved 350 ms on: the guard is what is tested, not the frame rate.
    await actor.page.evaluate(() => {
      window.__realNow = performance.now.bind(performance);
      window.__heldNow = window.__realNow();
      performance.now = () => window.__heldNow;
    });
    await actor.page.mouse.click(px, py);
    secondClick = await waitFor(
      actor.page,
      () => {
        if (!document.querySelector('.card-focus--open')) return null;
        const r = [...document.querySelectorAll('.card-focus .ptcg-atk--usable')].at(-1)?.getBoundingClientRect();
        const at = r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        return at && document.elementFromPoint(at.x, at.y)?.closest('.ptcg-atk--usable') ? at : null;
      },
      12000
    ).catch(() => null);
    await actor.page.evaluate(() => {
      window.__heldNow += 350;
    });
  }
  const onUsablePanel = Boolean(secondClick) && await actor.page.evaluate(
    ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.ptcg-atk--usable')),
    [secondClick.x, secondClick.y]
  );
  T('10c-pre. The second click of the double-click would land on a payable attack panel', onUsablePanel, JSON.stringify(secondClick));
  if (secondClick) await actor.page.mouse.click(secondClick.x, secondClick.y);
  if (IS_3D) await actor.page.evaluate(() => { performance.now = window.__realNow; });
  await actor.page.waitForTimeout(700);
  T('10c. ...and it does not fire the attack: the focus view is still open', await focusOpen());

  await actor.page.locator('.card-focus__stack').click();
  await actor.page.waitForTimeout(800);
  const slideCount = await actor.page.locator('.card-picker-stage .card-picker-slide').count();
  T('11. Stack closes the focus and opens the carousel with the attached card', !(await focusOpen()) && slideCount >= 2, `slides=${slideCount}`);
  const energySlideHasChrome = await actor.page.evaluate(() => {
    const slides = document.querySelectorAll('.card-picker-stage .card-picker-slide');
    return !!slides[0]?.querySelector('.ptcg-inspector');
  });
  T('12. The attached Energy slide has no inspector chrome', energySlideHasChrome === false);
  await actor.page.keyboard.press('Escape');
  await actor.page.waitForTimeout(500);

  // 13. Click a payable attack with REAL input (locator.click), not el.click(): a programmatic click
  // dispatches no pointerdown, so pointer-capture regressions hide. The focus closes at once.
  console.log('Testing attack click execution...');
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.locator('.ptcg-atk.ptcg-atk--usable').first().click();
  T('13. Clicking a payable attack closes the focus view at once', await waitGone());
  T('13b. ...and the hand is raised again', await handRaised());

  // 14. Edge rows: resize, close mid-flight, a picker appearing, turn change. The attack in step 13
  // may have ended the turn, so each case opens its own focus when it can.
  const reopen = async () => {
    await clickActive(['click']);
    await actor.page.waitForTimeout(700);
    // The flight is WAAPI on the page's own timeline, which a SwiftShader-starved 3D page ticks late.
    if (IS_3D) {
      await eventually(() => {
        const flights = (document.querySelector('.card-focus__card')?.getAnimations() ?? []).filter((a) =>
          a.effect?.getKeyframes().some((k) => k.transform)
        );
        return flights.length > 0 && flights.every((a) => a.playState === 'finished');
      }, undefined, 10000);
    }
    return focusOpen();
  };
  if (await reopen()) {
    const widthBefore = await actor.page.evaluate(() => document.querySelector('.card-focus__card').getBoundingClientRect().width);
    await actor.page.setViewportSize({ width: 1100, height: 700 });
    await actor.page.waitForTimeout(400);
    // The resize event reaches a SwiftShader-starved 3D page late; the iframe board answers at once.
    if (IS_3D) await eventually((before) => document.querySelector('.card-focus__card').getBoundingClientRect().width !== before, widthBefore, 8000);
    const resized = await actor.page.evaluate(async () => {
      const { focusRect } = await import('./src/setup/rules/card-focus-geometry.mjs');
      const r = document.querySelector('.card-focus__card').getBoundingClientRect();
      const e = focusRect({ width: window.innerWidth, height: window.innerHeight });
      const chrome = document.querySelector('.card-focus .ptcg-chrome');
      return {
        ok: ['left', 'top', 'width', 'height'].every((k, i) => Math.abs([r.left, r.top, r.width, r.height][i] - e[k]) <= 2),
        uMatches: Math.abs(parseFloat(chrome.style.getPropertyValue('--u')) * 100 - r.width) <= 2,
        measured: { left: r.left, top: r.top, width: r.width, height: r.height },
        expected: e,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    T('14. Resize while open re-fits the card to the new pose', resized.ok, resized.ok ? '' : JSON.stringify(resized));
    T('14b. ...and re-places the chrome (--u follows the new width)', resized.uMatches);
    await actor.page.setViewportSize({ width: 1440, height: 900 });
    await actor.page.waitForTimeout(300);
    await actor.page.keyboard.press('Escape');
    await waitGone();
  } else {
    T('14. Edge rows skipped: focus did not reopen', false);
  }

  if (await reopen()) {
    await actor.page.evaluate(() => document.dispatchEvent(new CustomEvent('rules-turn-began')));
    T('14c. A turn change closes the focus view at once', await waitGone());
    T('14d. ...and the hand is raised again', await handRaised());
  }

  if (await reopen()) {
    await actor.page.evaluate(() => {
      const banner = document.createElement('div');
      banner.className = 'mat-pick-banner';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 600);
    });
    T('14e. A mat-pick banner appearing closes the focus view (the picker must stay reachable)', await waitGone());
  }

  // Close while the flight is still running: no error, nothing left behind.
  await clickActive(['click']);
  await actor.page.waitForTimeout(60);
  await actor.page.keyboard.press('Escape');
  T('14f. Escape mid-flight closes cleanly', await waitGone());
  T('14g. ...and restores the hand and the source card', (await handRaised()) && (await sourceVisible()));

  // 15. Design 069: TCG Live hover preview. 1920×1080 so the default mat leaves a ~200 px blurred band.
  console.log('Testing the hover preview...');
  await actor.page.setViewportSize({ width: 1920, height: 1080 });
  await actor.page.waitForTimeout(500);
  const hoverState = () =>
    actor.page.evaluate(() => {
      const host = document.getElementById('hoverPreview');
      if (!host?.classList.contains('is-shown')) return null;
      const box = host.getBoundingClientRect();
      const src = host.querySelector('img')?.getAttribute('src') ?? '';
      return { src: src.replace(/\/(low|high)\.webp$/, ''), mode: host.dataset.mode, right: box.right };
    });
  const artOf = (side, selector, index = 0) =>
    actor.page.evaluate(
      ([who, sel, i]) => {
        const img = window.__boardRoot(who).querySelectorAll(sel)[i];
        const src = img?.card?.src || img?.getAttribute('src') || '';
        return src.replace(/\/(low|high)\.webp$/, '');
      },
      [side, selector, index]
    );
  // A point on the card that the pointer really reaches it at. Iframe board: the horizontal centre,
  // a quarter down (the hand fan overlaps its cards). 3D board: the same point if the scene's
  // raycast hits this card there, else the first point of a grid over its rect that does.
  const hoverPointOn = async (id) => {
    const rect = await settledCardRect(id);
    if (!rect) throw new Error(`no rect for card #${id}`);
    const base = { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height * 0.25, 40) };
    if (!IS_3D) return base;
    const point = await actor.page.evaluate(
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
      [id, rect, base]
    );
    if (!point) throw new Error(`no point of card #${id} is reachable by the pointer`);
    return point;
  };
  const hoverOver = async (side, selector, index = 0) => {
    const id = (await boardIds(side, selector))[index];
    const point = await hoverPointOn(id);
    await actor.page.mouse.move(point.x, point.y);
  };
  const parkPointer = async () => {
    await actor.page.mouse.move(1900, 20);
    await actor.page.waitForTimeout(400);
  };

  await parkPointer();
  await hoverOver('self', '#active img');
  await actor.page.waitForTimeout(400);
  T('15a. No preview before the 0.8 s dwell', (await hoverState()) === null);
  await actor.page.waitForTimeout(600);
  const activeHover = await hoverState();
  T('15b. Hovering your Active for 0.8 s shows its card', activeHover?.src === (await artOf('self', '#active img')), JSON.stringify(activeHover));
  if (IS_3D) {
    // The canvas has no letterboxed mat art and so no gutter probe (hover-preview-dom.mjs
    // appendProbe is iframe-only): the preview sits at the board's edge, mirrored to the right
    // when it would cover the hovered card.
    const activeRect = await settledCardRect(activeId);
    const preview = await actor.page.evaluate(() => document.getElementById('hoverPreview').getBoundingClientRect().toJSON());
    const overlaps =
      preview.left < activeRect.left + activeRect.width && activeRect.left < preview.right &&
      preview.top < activeRect.top + activeRect.height && activeRect.top < preview.bottom;
    T(
      '15c. At the board edge, clear of the hovered card (no gutter band on the canvas)',
      /^edge/.test(activeHover?.mode ?? '') && !overlaps,
      `mode=${activeHover?.mode} preview=${JSON.stringify(preview)} card=${JSON.stringify(activeRect)}`
    );
  } else {
    // The mat art's left edge in page pixels, through the same iframe mapping the board FX use.
    const probeLeft = await actor.page.evaluate(async () => {
      const { viewportRectOf } = await import('./src/setup/image-logic/card-pop.mjs');
      const lefts = ['selfContainer', 'oppContainer'].map((id) => {
        const probe = document.getElementById(id)?.contentDocument?.querySelector('.hover-gutter-probe');
        return probe ? viewportRectOf(probe).left : Infinity;
      });
      return Math.min(...lefts);
    });
    T(
      '15c. In the blurred band, left of the mat art',
      activeHover?.mode === 'band' && activeHover.right <= probeLeft + 1,
      `mode=${activeHover?.mode} right=${activeHover?.right} probeLeft=${probeLeft}`
    );
  }

  const handCount = (await boardIds('self', '#hand img')).length;
  if (handCount >= 2) {
    await parkPointer();
    await hoverOver('self', '#hand img', 0);
    await actor.page.waitForTimeout(900);
    T('15d. A hand card previews after the dwell', (await hoverState())?.src === (await artOf('self', '#hand img', 0)));
    await hoverOver('self', '#hand img', 1);
    await actor.page.waitForTimeout(60);
    T('15e. Sweeping to the next hand card swaps at once', (await hoverState())?.src === (await artOf('self', '#hand img', 1)));
    await actor.page.mouse.down();
    await actor.page.waitForTimeout(30);
    T('15f. Mouse-down hides it', (await hoverState()) === null);
    await actor.page.mouse.up();
  } else {
    T('15d-f. Hand steps skipped: fewer than two hand cards', false);
  }

  if ((await boardIds('opp', '#hand img')).length > 0) {
    await parkPointer();
    await hoverOver('opp', '#hand img', 0);
    await actor.page.waitForTimeout(900);
    T('15g. The opponent\'s face-down hand never previews', (await hoverState()) === null);
  }

  await actor.page.evaluate(() => document.getElementById('hoverPreviewCheckbox')?.click());
  await parkPointer();
  await hoverOver('self', '#active img');
  await actor.page.waitForTimeout(900);
  T('15h. With "Card hover preview" unticked nothing shows', (await hoverState()) === null);
  await actor.page.evaluate(() => document.getElementById('hoverPreviewCheckbox')?.click());
  await parkPointer();

} catch (err) {
  failed += 1;
  console.error('TEST ERROR:', err);
} finally {
  await browser.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
