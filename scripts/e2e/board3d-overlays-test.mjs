// Design 074 slice D4: the HTML overlays over the three.js board. Spawns its own authoritative
// server (e2e bridge armed, port 48xx), joins a solo room at `?board=3d`, deals both seats, and
// drives the canvas with Playwright's real mouse: the card focus (flight from the mesh rect, hand
// lowered, mesh hidden, auto-close when a picker opens), the discard viewer, the zone list popups
// (Lost Zone viewer, deck viewer, look panel) as visible clickable panels inside the mirror's
// shadow roots, the attachments view, the Stadium's context menu and the hover preview.
// Usage: pnpm test:board3d-overlays   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const PORT_RANGE = [4840, 4899];
const FACE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const ENERGY = 'Basic Fire Energy';
const STADIUM = 'E2E Stadium';
// hover-preview-model.mjs HOVER_DWELL_MS.
const HOVER_DWELL_MS = 800;
const MENU_SLACK_PX = 40;
const FLIGHT_SLACK_PX = 2;
const HAND_DOWN_SLACK_PX = 20;
// e2e-mode.mjs fixture rows ([quantity, name, type, image, number, set, tcgId]): set 'e2e' skips
// live enrichment. The Stadium's row type is what the engine's isStadiumCard reads (`card.type`).
const deckRows = (prefix) => [
  ...Array.from({ length: 10 }, (_, i) => ['1', `${prefix} ${i + 1}`, 'Pokémon', FACE, String(i + 1).padStart(3, '0'), 'e2e', `e2e-${prefix}-${i + 1}`]),
  ['6', ENERGY, 'Energy', FACE, '101', 'e2e', `e2e-${prefix}-fire`],
  ['4', STADIUM, 'Stadium', FACE, '201', 'e2e', `e2e-${prefix}-stadium`],
];

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

async function pickPort() {
  for (let port = PORT_RANGE[0]; port <= PORT_RANGE[1]; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error(`no free port in ${PORT_RANGE.join('-')}`);
}

async function startServer() {
  const port = await pickPort();
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
  process.kill(child.pid, 'SIGKILL');
  throw new Error(`server did not start on ${base}:\n${output}`);
}

const stopServer = (child) => {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
};

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

/** The scene's rects and near/far placements, the mirror's uiState view of one card. */
const probe = (page) =>
  page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const info = scene?.inspect();
    const placements = info?.model?.placements ?? [];
    const of = (side, zone) => placements.filter((p) => p.side === side && p.zone === zone).map((p) => p.instanceId);
    return {
      rects: scene?.rects() ?? {},
      hand: of('self', 'hand'),
      active: of('self', 'active'),
      bench: of('self', 'bench'),
      hidden: [...(info?.uiState?.entries() ?? [])].filter(([, s]) => s?.hidden).map(([id]) => id),
      stadium: info?.model?.stadium?.instanceId ?? null,
      handPose: info?.handPose ?? null,
    };
  });

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const within = (rect, point, slack = 0) =>
  point.x >= rect.left - slack && point.x <= rect.left + rect.width + slack &&
  point.y >= rect.top - slack && point.y <= rect.top + rect.height + slack;

/** Index of the first near-hand card whose name passes `accept`, or -1. */
const handIndex = (page, pattern) =>
  page.evaluate((source) => window.__ptcg.zone('self', 'hand').names.findIndex((n) => new RegExp(source).test(n)), pattern);

async function playFromHand(page, pattern, dest) {
  const index = await handIndex(page, pattern);
  if (index < 0) return false;
  await page.evaluate(([i, d]) => window.__ptcg.playFromHand(i, d, 'self'), [index, dest]);
  return true;
}

/** Waits until the card scene settles: the same rect for `id` across four reads over ~1 s. */
async function settledRect(page, id) {
  const deadline = Date.now() + 8000;
  const reads = [];
  while (Date.now() < deadline) {
    reads.push((await probe(page)).rects[id] ?? null);
    const recent = reads.slice(-4);
    if (recent.length === 4 && recent.every(Boolean) &&
      recent.every((r) => Math.abs(r.left - recent[0].left) < 0.5 && Math.abs(r.top - recent[0].top) < 0.5)) {
      return recent[3];
    }
    await page.waitForTimeout(250);
  }
  return reads.at(-1);
}

/** A zone list popup's state, read inside the mirror shadow root getZone resolves it in. */
const panelState = (page, user, id) =>
  page.evaluate(async ([who, zoneId]) => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    const zone = getZone(who, zoneId);
    const panel = zone.element;
    const root = panel.getRootNode();
    const box = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const imgs = [...panel.querySelectorAll('img')].map((img) => {
      const r = img.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      return { alt: img.alt, width: r.width, height: r.height, centre: c, top: root.elementFromPoint(c.x, c.y) === img };
    });
    const button = panel.querySelector('button.zone-button:not([style*="display: none"])');
    const buttonBox = button?.getBoundingClientRect();
    const buttonAt = buttonBox && { x: buttonBox.left + buttonBox.width / 2, y: buttonBox.top + buttonBox.height / 2 };
    return {
      inMirror: root !== document && Boolean(root.host?.closest('#boardMirror')),
      arrayCount: zone.getCount(),
      shown: style.display !== 'none' && style.opacity === '1' && box.width > 0 && box.height > 0,
      box: { left: box.left, top: box.top, width: box.width, height: box.height },
      background: style.backgroundColor,
      imgs,
      buttonId: button?.id ?? null,
      buttonAt,
      buttonOnTop: Boolean(buttonAt) && root.elementFromPoint(buttonAt.x, buttonAt.y) === button,
    };
  }, [user, id]);

/** Joins a fresh solo room and deals; null when the near hand lacks 4 Basics (Active, discard, Lost Zone, Bench), an Energy and a Stadium. */
async function dealSolo(browser, base, attempt) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${base}/?e2e=1&board=3d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  await page.evaluate((name) => window.__ptcg.joinSolo(name), `Overlays-E2E-${attempt}`);
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
  await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const hand = (scene?.inspect().model?.placements ?? []).filter((p) => p.side === 'self' && p.zone === 'hand');
    return hand.length >= 7 && hand.every((p) => scene.rects()[p.instanceId]);
  });
  await page.waitForTimeout(1500);
  const names = await page.evaluate(() => window.__ptcg.zone('self', 'hand').names);
  const basics = names.filter((n) => /^Near |^Far /.test(n)).length;
  if (basics >= 4 && names.includes(ENERGY) && names.includes(STADIUM)) return { page, context };
  console.log(`deal ${attempt}: near hand ${names.join(', ')} — dealing again`);
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
  for (let attempt = 1; attempt <= 8 && !dealt; attempt += 1) dealt = await dealSolo(browser, server.base, attempt);
  T('1. a solo room was dealt on the 3D board with 4 Basics, an Energy and a Stadium in the near hand', Boolean(dealt));
  if (!dealt) throw new Error('no usable deal');
  const { page } = dealt;
  const BASIC = '^(Near|Far) ';
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));

  // (a) Card focus from the Active mesh.
  await playFromHand(page, BASIC, 'active');
  const activeId = await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const active = (scene?.inspect().model?.placements ?? []).find((p) => p.side === 'self' && p.zone === 'active');
    const img = active && document.getElementById('selfBoard').shadowRoot.querySelector(`img[data-instance-id="${active.instanceId}"]`);
    return active && img && scene.rects()[active.instanceId] ? active.instanceId : null;
  });
  const activeRect = await settledRect(page, activeId);
  const mirrorRect = await page.evaluate(async (id) => {
    const { viewportRectOf } = await import('/src/setup/image-logic/card-pop.mjs');
    return viewportRectOf(document.getElementById('selfBoard').shadowRoot.querySelector(`img[data-instance-id="${id}"]`));
  }, activeId);
  const sameRect = ['left', 'top', 'width', 'height'].every((k) => Math.abs(mirrorRect[k] - activeRect[k]) <= 1);
  T('2. viewportRectOf(the Active\'s mirror img) is the scene\'s rect for it', sameRect, JSON.stringify({ mirrorRect, activeRect }));

  // Record the flight's first keyframe the moment the focus host starts animating.
  await page.evaluate(() => {
    window.__focusFlight = null;
    const observer = new MutationObserver(() => {
      const host = document.querySelector('.card-focus__card');
      const flight = host?.getAnimations().find((a) => a.effect?.getKeyframes()[0]?.transform);
      if (!flight || window.__focusFlight) return;
      const to = host.getBoundingClientRect();
      window.__focusFlight = { transform: flight.effect.getKeyframes()[0].transform, to: { left: parseFloat(host.style.left), top: parseFloat(host.style.top), width: parseFloat(host.style.width), height: parseFloat(host.style.height) }, measured: to.toJSON() };
      observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
  });
  const activeAt = centreOf(activeRect);
  await page.mouse.dblclick(activeAt.x, activeAt.y);
  T('3a. a double-click on the Active mesh opens .card-focus', await eventually(page, () => Boolean(document.querySelector('.card-focus'))));
  const flight = await eventually(page, () => window.__focusFlight);
  let flightStart = null;
  if (flight) {
    const m = flight.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/);
    if (m) {
      const [tx, ty, scale] = m.slice(1).map(Number);
      const cx = flight.to.left + flight.to.width / 2 + tx;
      const cy = flight.to.top + flight.to.height / 2 + ty;
      flightStart = { cx, cy, width: flight.to.width * scale };
    }
  }
  const sceneCentre = centreOf(activeRect);
  T(`3b. its flying card starts on the mesh's screen rect (centre and width ± ${FLIGHT_SLACK_PX} px)`,
    Boolean(flightStart) && Math.abs(flightStart.cx - sceneCentre.x) <= FLIGHT_SLACK_PX &&
      Math.abs(flightStart.cy - sceneCentre.y) <= FLIGHT_SLACK_PX && Math.abs(flightStart.width - activeRect.width) <= FLIGHT_SLACK_PX,
    JSON.stringify({ flightStart, scene: activeRect }));
  const lowered = await eventually(page, async ([slack]) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const rects = scene.rects();
    const hand = (scene.inspect().model?.placements ?? []).filter((p) => p.side === 'self' && p.zone === 'hand');
    return hand.length > 0 && scene.inspect().handPose === 'lowered' &&
      hand.every((p) => !rects[p.instanceId] || rects[p.instanceId].top >= innerHeight - slack);
  }, 6000, [HAND_DOWN_SLACK_PX]);
  T(`3c. the own hand lowers below the viewport (every hand rect top ≥ innerHeight − ${HAND_DOWN_SLACK_PX})`, lowered);
  // H2: the focused card IS its mesh, lifted to the focus rect (not hidden under an HTML copy).
  T('3d. the Active mesh is lifted to the focus while the focus is open', await eventually(page, async (id) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const info = getBoardScene().inspect();
    return info.focusLifted === id && info.uiState.get(id)?.hidden !== true;
  }, 6000, activeId));
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  T('3e. Escape closes the focus', await eventually(page, () => !document.querySelector('.card-focus')));
  const raised = await eventually(page, async ([slack]) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const rects = scene.rects();
    const hand = (scene.inspect().model?.placements ?? []).filter((p) => p.side === 'self' && p.zone === 'hand');
    return scene.inspect().handPose === 'normal' && hand.some((p) => rects[p.instanceId] && rects[p.instanceId].top < innerHeight - slack);
  }, 6000, [HAND_DOWN_SLACK_PX]);
  T('3f. … the hand comes back up', raised);
  T('3g. … and the Active mesh is released to its slot', await eventually(page, async (id) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const info = getBoardScene().inspect();
    return info.focusLifted === null && info.uiState.get(id)?.hidden !== true;
  }, 6000, activeId));

  // Row 21: a picker opening while the focus is open closes it (card-focus.mjs watchForPickers).
  await page.mouse.dblclick(activeAt.x, activeAt.y);
  await eventually(page, () => Boolean(document.querySelector('.card-focus')));
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const { openCarouselViewer } = await import('/src/setup/image-logic/card-picker.js');
    await openCarouselViewer({ title: 'Probe', candidates: [{ name: 'Probe', image: { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' } }], initialIndex: 0 });
  });
  const autoClosed = await eventually(page, () => !document.querySelector('.card-focus') && Boolean(document.getElementById('cardPickerOverlay')));
  T('3h. a picker opening over the focus closes it (row 21 auto-close)', autoClosed);
  T('3i. … and releases the Active mesh', await eventually(page, async (id) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    return getBoardScene().inspect().uiState.get(id)?.hidden !== true && getBoardScene().inspect().handPose === 'normal';
  }, 6000, activeId));
  await page.keyboard.press('Escape');
  await eventually(page, () => !document.getElementById('cardPickerOverlay'));

  // (d) Attachments: Energy on the Active → the focus shows it, its Stack button opens the carousel.
  // An attach names its target Pokémon (what a drag onto the Active sends, board-input.js).
  await page.evaluate(async ([energy, targetId]) => {
    const { moveCardBundle } = await import('/src/actions/move-card-bundle/move-card-bundle.js');
    const host = ['selfBoard', 'oppBoard'].find((id) => document.getElementById(id).classList.contains('self'));
    const img = [...document.getElementById(host).shadowRoot.querySelectorAll('#hand img[data-instance-id]')]
      .find((el) => el.alt === energy);
    const index = window.__ptcg.zone('self', 'hand').names.indexOf(energy);
    moveCardBundle('self', 'self', 'hand', 'active', index, 0, 'move', true, null,
      { moving: Number(img.dataset.instanceId), target: targetId });
  }, [ENERGY, activeId]);
  const attached = await eventually(page, async (id) => {
    const root = document.getElementById('selfBoard').shadowRoot;
    const img = root.querySelector(`img[data-instance-id="${id}"]`);
    const { resolvePreviewCard } = await import('/src/setup/image-logic/preview-card.mjs');
    return (resolvePreviewCard(null, img)?.attachedCards ?? []).some((c) => c.name === 'Basic Fire Energy');
  }, 8000, activeId);
  T('4a. an Energy was attached to the Active', attached);
  await page.waitForTimeout(800);
  await page.mouse.dblclick(activeAt.x, activeAt.y);
  await eventually(page, () => Boolean(document.querySelector('.card-focus')));
  const stack = await eventually(page, () => {
    const count = document.querySelector('.card-focus__stack-count')?.textContent;
    return count ? { count, energies: document.querySelectorAll('.card-focus__energies img').length } : null;
  });
  T('4b. the focus lists the attachment (Stack count 1, one Energy token)', stack?.count === '1' && stack?.energies === 1, JSON.stringify(stack));
  await page.locator('.card-focus__stack').click();
  const carousel = await eventually(page, () => {
    const overlay = document.getElementById('cardPickerOverlay');
    if (!overlay || document.querySelector('.card-focus')) return null;
    return [...overlay.querySelectorAll('img.discard-pile-card')].map((img) => img.alt);
  });
  T('4c. its Stack button opens the attachments carousel listing the Energy', Array.isArray(carousel) && carousel.includes(ENERGY), JSON.stringify(carousel));
  await page.keyboard.press('Escape');
  await eventually(page, () => !document.getElementById('cardPickerOverlay'));
  // Right-click → "View attached cards" (openAttachedCardsPanel): the carousel, never `.full-view`.
  const panelRoute = await page.evaluate(async (id) => {
    const root = document.getElementById('selfBoard').shadowRoot;
    const img = root.querySelector(`img[data-instance-id="${id}"]`);
    const { resolvePreviewCard } = await import('/src/setup/image-logic/preview-card.mjs');
    const { openAttachedCardsPanel } = await import('/src/setup/image-logic/full-view.js');
    const opened = openAttachedCardsPanel(img, resolvePreviewCard(null, img));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const overlay = document.getElementById('cardPickerOverlay');
    return {
      opened,
      fullView: Boolean(root.querySelector('.full-view')),
      slides: overlay ? [...overlay.querySelectorAll('img.discard-pile-card')].map((el) => el.alt) : null,
    };
  }, activeId);
  T('4d. openAttachedCardsPanel opens the carousel (with the Energy) and mutates no board DOM',
    panelRoute.opened && !panelRoute.fullView && panelRoute.slides?.includes(ENERGY), JSON.stringify(panelRoute));
  await page.keyboard.press('Escape');
  await eventually(page, () => !document.getElementById('cardPickerOverlay'));

  // (b) Discard a card, click the discard pile on the canvas → the discard viewer shows it.
  await playFromHand(page, BASIC, 'discard');
  await eventually(page, () => window.__ptcg.zone('self', 'discard').count >= 1, 8000);
  await page.waitForTimeout(800);
  const discardRect = (await probe(page)).rects['pile:self:discard'];
  const discardAt = discardRect && centreOf(discardRect);
  T('5a. the near discard pile has a screen rect', Boolean(discardAt), JSON.stringify(discardRect));
  if (discardAt) {
    await page.mouse.click(discardAt.x, discardAt.y);
    const viewer = await eventually(page, () => {
      const overlay = document.getElementById('cardPickerOverlay');
      if (!overlay) return null;
      const shown = getComputedStyle(overlay).display !== 'none' && overlay.getBoundingClientRect().width > 0;
      const imgs = [...overlay.querySelectorAll('img.discard-pile-card')].map((img) => {
        const r = img.getBoundingClientRect();
        return { alt: img.alt, width: r.width, height: r.height };
      });
      return { shown, imgs };
    });
    T('5b. the discard viewer opens in a visible panel with the card as a visible <img>',
      viewer?.shown && viewer.imgs.some((img) => /^(Near|Far) /.test(img.alt) && img.width > 0 && img.height > 0), JSON.stringify(viewer));
    await page.keyboard.press('Escape');
    T('5c. Escape closes it', await eventually(page, () => !document.getElementById('cardPickerOverlay')));
  }

  // (b') A zone list popup with cards: the Lost Zone viewer, a panel inside the mirror root.
  await playFromHand(page, BASIC, 'lostZone');
  T('6. a card went to the near Lost Zone', await eventually(page, () => window.__ptcg.zone('self', 'lostZone').count >= 1, 8000));
  await page.waitForTimeout(800);
  const lostRect = (await probe(page)).rects['pile:self:lostZone'];
  const lostAt = lostRect && centreOf(lostRect);
  const lostHit = lostAt && (await page.evaluate(async ([x, y]) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const hit = getBoardScene().hitTest(x, y);
    return document.elementFromPoint(x, y)?.id === 'board3dCanvas' ? hit : null;
  }, [lostAt.x, lostAt.y]));
  if (lostHit?.zone === 'lostZone' && lostHit.pile) {
    await page.mouse.click(lostAt.x, lostAt.y);
  } else {
    // The pile is not the top thing at its centre (this layout tucks it under the Prizes): send
    // the click board-input.js sends for a pile hit, on the pile's mirror cover <img>.
    console.log(`note: the canvas Lost Zone pile is covered at its centre (${JSON.stringify(lostHit)}); clicking its mirror cover as board-input.js does`);
    const dispatched = await page.evaluate(async ([x, y]) => {
      const { getZone } = await import('/src/setup/zones/get-zone.js');
      const cover = getZone('self', 'lostZone').elementCover?.querySelector('img');
      if (!cover) return false;
      cover.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
      return true;
    }, [lostAt.x, lostAt.y]);
    T('6r. the Lost Zone pile has a mirror cover <img> to click', dispatched);
  }
  const lost = await eventually(page, async () => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    return getComputedStyle(getZone('self', 'lostZone').element).display !== 'none';
  }) && (await panelState(page, 'self', 'lostZone'));
  T('6a. the Lost Zone viewer shows as a visible, styled panel inside the mirror root', Boolean(lost?.shown) && lost.inMirror && lost.background !== 'rgba(0, 0, 0, 0)', JSON.stringify(lost && { box: lost.box, background: lost.background, inMirror: lost.inMirror }));
  T('6b. … its card is a visible <img> on top at its own centre (not at a projected rect)',
    Boolean(lost?.imgs?.length) && lost.imgs.every((img) =>
      /^(Near|Far) /.test(img.alt) && img.width > 0 && img.height > 0 && img.top && within(lost.box, img.centre)), JSON.stringify(lost?.imgs));
  T('6c. … its Close button is hit-testable', lost?.buttonId === 'closeLostZoneButton' && lost.buttonOnTop, JSON.stringify({ id: lost?.buttonId, onTop: lost?.buttonOnTop }));
  if (lost?.buttonAt) await page.mouse.click(lost.buttonAt.x, lost.buttonAt.y);
  T('6d. a real click on Close hides it', await eventually(page, async () => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    return getComputedStyle(getZone('self', 'lostZone').element).display === 'none';
  }, 4000));

  // (c) `v`: the deck viewer panel of the player's own deck (keybinds.js: the initiator's #deck).
  // It lists the cards its zone holds (the client's own deck copy: the server view sends the
  // deck as a count only, design 002 O4-A), each a visible <img> laid out by the panel.
  await page.mouse.move(5, viewport.height / 2);
  const deckUser = await page.evaluate(async () => (await import('/src/state.js')).systemState.initiator);
  await page.keyboard.press('v');
  const deck = await eventually(page, async (who) => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    return getComputedStyle(getZone(who, 'deck').element).display !== 'none';
  }, 4000, deckUser) && (await panelState(page, deckUser, 'deck'));
  T('7a. `v` shows the deck viewer as a visible panel inside the mirror root', Boolean(deck?.shown) && deck.inMirror, JSON.stringify(deck && deck.box));
  T('7b. … with one visible <img> on top per card its zone holds',
    Boolean(deck) && deck.imgs.length === deck.arrayCount && deck.imgs.every((img) => img.width > 0 && img.height > 0 && img.top && within(deck.box, img.centre)),
    `(${deck?.imgs?.length} imgs, zone holds ${deck?.arrayCount})`);
  T('7c. … with its Shuffle button on top', deck?.buttonId === 'shuffleDeckButton' && deck.buttonOnTop, JSON.stringify({ id: deck?.buttonId }));
  const closeAt = await page.evaluate(async (who) => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    const r = getZone(who, 'deck').element.getRootNode().getElementById('closeDeckButton').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, deckUser);
  await page.mouse.click(closeAt.x, closeAt.y);
  T('7d. a real click on Close hides it', await eventually(page, async (who) => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    return getComputedStyle(getZone(who, 'deck').element).display === 'none';
  }, 4000, deckUser));

  // (c') The look panel (#viewCards), shown the way deck-actions.js viewDeck shows it.
  await page.evaluate(async () => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    getZone('self', 'viewCards').element.style.display = 'block';
  });
  const look = await panelState(page, 'self', 'viewCards');
  const header = await page.evaluate(async () => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    const root = getZone('self', 'viewCards').element.getRootNode();
    const el = root.getElementById('viewCardsHeader');
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, onTop: root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el };
  });
  T('7e. the look panel (#viewCards) shows as a visible panel with its header and buttons on top',
    look.shown && header.width > 0 && header.onTop && look.buttonOnTop, JSON.stringify({ box: look.box, header, button: look.buttonId }));
  await page.evaluate(async () => {
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    getZone('self', 'viewCards').element.style.display = 'none';
  });

  // (e) The Stadium's context menu anchors on the scene's Stadium rect.
  await playFromHand(page, `^${STADIUM}$`, 'stadium');
  const stadiumId = await eventually(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    return scene.inspect().model?.stadium?.instanceId ?? null;
  }, 8000);
  if (!stadiumId) {
    T('8a. a Stadium was played', false);
  } else {
    await page.waitForTimeout(800);
    const stadiumRect = await settledRect(page, stadiumId);
    const at = centreOf(stadiumRect);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    const menu = await eventually(page, () => {
      const el = document.getElementById('cardContextMenu');
      const box = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && box.width > 0 ? box.toJSON() : null;
    }, 3000);
    const grown = {
      left: stadiumRect.left - MENU_SLACK_PX,
      right: stadiumRect.left + stadiumRect.width + MENU_SLACK_PX,
      top: stadiumRect.top - MENU_SLACK_PX,
      bottom: stadiumRect.top + stadiumRect.height + MENU_SLACK_PX,
    };
    const near = Boolean(menu) && menu.left >= grown.left && menu.left <= grown.right &&
      menu.top <= grown.bottom && menu.top + menu.height >= grown.top;
    T('8a. a right-click on the Stadium mesh shows #cardContextMenu', Boolean(menu), JSON.stringify(menu));
    T(`8b. … anchored on the scene's Stadium rect ± ${MENU_SLACK_PX} px`, near, JSON.stringify({ menu, stadium: stadiumRect }));
    await page.keyboard.press('Escape');
  }

  // (f) Hover preview on a bench card.
  await playFromHand(page, BASIC, 'bench');
  const benchId = await eventually(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    const bench = (scene.inspect().model?.placements ?? []).find((p) => p.side === 'self' && p.zone === 'bench');
    return bench && scene.rects()[bench.instanceId] ? bench.instanceId : null;
  }, 8000);
  T('9a. a Basic was benched', Boolean(benchId));
  if (benchId) {
    const benchRect = await settledRect(page, benchId);
    await page.mouse.move(5, viewport.height / 2);
    await page.waitForTimeout(300);
    const benchAt = centreOf(benchRect);
    await page.mouse.move(benchAt.x, benchAt.y);
    await page.waitForTimeout(HOVER_DWELL_MS + 100);
    T('9b. hovering the bench card shows #hoverPreview after the dwell', await eventually(page,
      () => document.getElementById('hoverPreview')?.classList.contains('is-shown') === true, 3000));
  }
  T('10. the legacy #fullImage overlay never appeared', await page.evaluate(() => !document.getElementById('fullImage')));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  stopServer(server.child);
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
