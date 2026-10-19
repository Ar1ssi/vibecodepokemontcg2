// Design 074 slice D3: selection, attach mode, affordance glow, mat pick and in-flight dimming on
// the three.js board, end to end. Spawns its own authoritative server (e2e bridge armed) on a
// port in 47xx, joins a solo room at `?board=3d`, deals both seats (the turn seat near), then
// with Playwright's real mouse and keyboard: click + `b` moves a hand Basic to the Bench (its
// mirror img's `.highlight` shows as the scene's `selected` in between); `e` on a hand Energy
// rings the Pokémon in play and a click on the Active attaches it; a playable card glows with
// its `--glow-rgb`; a mat pick outlines its candidates (`idle`), a canvas click picks one
// (`picked`), Confirm and `__ptcg.pick` resolve it and Escape cancels; a sent command dims its
// card until the next view.
// Usage: pnpm test:board3d-pick   (PTCG_URL=http://host:port reuses a running server;
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
// skips live enrichment. Fifteen Basics and five Energy: the run plays three Basics from the
// hand and needs one more left to glow as playable.
const deckRows = (prefix) => [
  ...Array.from({ length: 15 }, (_, i) => ['1', `${prefix} ${i + 1}`, 'Pokémon', FACE, String(i + 1).padStart(3, '0'), 'e2e', `e2e-${prefix}-${i + 1}`]),
  ['5', ENERGY, 'Energy', FACE, '101', 'e2e', `e2e-${prefix}-fire`],
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

/** A free port in 4700-4799. */
async function freePort() {
  const start = 4700 + Math.floor(Math.random() * 100);
  for (let i = 0; i < 100; i += 1) {
    const port = 4700 + ((start - 4700 + i) % 100);
    if (await portFree(port)) return port;
  }
  throw new Error('no free port in 4700-4799');
}

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

/** A real mouse click at a point on the canvas. */
async function clickAt(page, { x, y }) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

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

/** Joins a fresh solo room and deals both seats; null when the near hand lacks 4 Basics + an Energy. */
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
  await page.evaluate((name) => window.__ptcg.joinSolo(name), `Pick-E2E-${attempt}`);
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
  if (basics.length >= 4 && energy && farBasic) return { page, context, basics, energy, farBasic, nearSeat };
  console.log(`deal ${attempt}: near hand ${hand.map((c) => c.name).join(', ')} — dealing again`);
  await context.close();
  return null;
}

/** The scene's merged UI state of a card (`selected`, `glow`, `matPick`, `pending`). */
const uiOf = (page, id) =>
  page.evaluate(async (instanceId) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    return getBoardScene()?.inspect().uiState.get(instanceId) ?? null;
  }, id);

const waitUi = (page, id, accept, timeout = 4000) =>
  waitFor(
    page,
    async ([instanceId, src]) => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      // eslint-disable-next-line no-new-func
      const test = new Function('ui', `return (${src})(ui)`);
      const ui = getBoardScene()?.inspect().uiState.get(instanceId) ?? {};
      return test(ui) ? ui : null;
    },
    timeout,
    [id, accept.toString()]
  ).catch(() => null);

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
  T('1. a solo room was dealt with four Basics and an Energy in the near hand', Boolean(dealt));
  if (!dealt) throw new Error('no usable deal');
  const { page, basics, energy, farBasic } = dealt;

  // Both Starting Actives, through the e2e bridge (the drag slice covers dragging them).
  await page.evaluate(async ([nearName, farName]) => {
    await window.__ptcg.playFromHand(window.__ptcg.zone('opp', 'hand').names.indexOf(farName), 'active', 'opp');
    await window.__ptcg.playFromHand(window.__ptcg.zone('self', 'hand').names.indexOf(nearName), 'active', 'self');
  }, [basics[0].name, farBasic.name]);
  await waitFor(page, () => window.__ptcg.zone('self', 'active').count === 1 && window.__ptcg.zone('opp', 'active').count === 1, 8000);
  const activeId = await page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    return getBoardScene().inspect().model.placements.find((p) => p.side === 'self' && p.zone === 'active')?.instanceId ?? null;
  });
  T('2. both Starting Actives are in play', Number.isFinite(activeId), String(activeId));

  // (a, b) Click a hand Basic: the scene shows it selected; `b` moves it to the Bench.
  await sceneSettled(page);
  let state = await board(page);
  const benchCard = state.cards.find((c) => c.side === 'self' && c.zone === 'hand' && c.name !== ENERGY);
  await clickAt(page, centreOf(state.rects[benchCard.id]));
  const selected = await waitUi(page, benchCard.id, (ui) => ui.selected === true);
  T('3a. a canvas click on a hand Basic selects it: the scene\'s UI state has selected', Boolean(selected), JSON.stringify(selected));
  let before = await cmdCount(page);
  await page.keyboard.press('b');
  const benched = await waitFor(page, () => window.__ptcg.zone('self', 'bench').count === 1, 6000).catch(() => false);
  T('3b. … and `b` moves it to the Bench (keybinds)', benched, JSON.stringify(await cmdsSince(page, before)));
  const deselected = await waitUi(page, benchCard.id, (ui) => !ui.selected);
  T('3c. … and the selection ring is gone', Boolean(deselected));

  // (c) Attach mode: `e` on a hand Energy rings the Pokémon in play; a click on the Active attaches.
  await sceneSettled(page);
  state = await board(page);
  await clickAt(page, centreOf(state.rects[energy.id]));
  await waitUi(page, energy.id, (ui) => ui.selected === true);
  await page.keyboard.press('e');
  const ringedActive = await waitUi(page, activeId, (ui) => ui.selected === true);
  const ringedBench = await waitUi(page, benchCard.id, (ui) => ui.selected === true);
  T('4a. `e` on a hand Energy rings the Active and the Bench Pokémon', Boolean(ringedActive && ringedBench));
  before = await cmdCount(page);
  await clickAt(page, centreOf(state.rects[activeId]));
  const attached = await waitFor(page, () => window.__ptcg.observe().self.active?.attachedEnergy?.length === 1, 6000).catch(() => false);
  const attachCmd = (await cmdsSince(page, before)).find((cmd) => cmd.type === 'attachCard');
  T('4b. … a click on the Active attaches the Energy to it', attached && attachCmd?.payload?.targetInstanceId === activeId, JSON.stringify(attachCmd));
  const ringsGone = (await waitUi(page, activeId, (ui) => !ui.selected)) && (await waitUi(page, benchCard.id, (ui) => !ui.selected));
  T('4c. … and the attach rings are gone', Boolean(ringsGone));
  const focusOpen = await page.evaluate(() => Boolean(document.querySelector('.card-focus')));
  T('4d. … without opening the Active\'s card focus', !focusOpen);

  // (f) The command's card dims while it is in flight and clears on the next view.
  await sceneSettled(page);
  state = await board(page);
  const mover = state.cards.find((c) => c.side === 'self' && c.zone === 'hand' && c.name !== ENERGY) ??
    state.cards.find((c) => c.side === 'self' && c.zone === 'hand');
  await page.evaluate(async (id) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    window.__pendingPatches = [];
    const original = scene.setUiState;
    scene.setUiState = (instanceId, patch) => {
      if (instanceId === id && 'pending' in (patch || {})) window.__pendingPatches.push(patch.pending);
      return original(instanceId, patch);
    };
  }, mover.id);
  await clickAt(page, centreOf(state.rects[mover.id]));
  await waitUi(page, mover.id, (ui) => ui.selected === true);
  await page.keyboard.press('b');
  await waitFor(page, () => window.__ptcg.zone('self', 'bench').count === 2, 6000).catch(() => false);
  await page.waitForTimeout(600);
  const patches = await page.evaluate(() => window.__pendingPatches);
  T('7a. a sent command marks its card pending in the scene (cmd-pending)', patches.includes(true), JSON.stringify(patches));
  T('7b. … and the next view clears it', patches.at(-1) === false && !(await uiOf(page, mover.id))?.pending, JSON.stringify(patches));

  // (e) Mat pick over the candidates' mirror imgs (mat-picker.js, as a server choice opens it).
  await sceneSettled(page);
  state = await board(page);
  const candidates = [activeId, benchCard.id];
  const openPick = (options) =>
    page.evaluate(async ([ids, opts]) => {
      const { getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
      const { openMatPick } = await import('/src/setup/rules/mat-picker.js');
      window.__pickResult = null;
      const cards = ids.map((id) => {
        const record = getCardRegistry().get(id);
        return { instanceId: id, name: record.card.name, image: record.element };
      });
      openMatPick({
        title: 'Choose a Pokémon',
        candidates: cards,
        ...opts,
        onPick: (card) => (window.__pickResult = { pick: [card.instanceId] }),
        onConfirm: (picked) => (window.__pickResult = { confirm: picked.map((c) => c.instanceId) }),
        onCancel: () => (window.__pickResult = { cancel: true }),
      });
    }, [candidates, options]);
  const matPicks = async () => Promise.all(candidates.map(async (id) => (await uiOf(page, id))?.matPick ?? null));

  await openPick({ min: 1, max: 2 });
  const idle = await waitFor(page, async (ids) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const ui = getBoardScene().inspect().uiState;
    return ids.every((id) => ui.get(id)?.matPick === 'idle');
  }, 4000, candidates).catch(() => false);
  T('5a. a mat pick outlines both candidates in the scene (matPick idle)', idle, JSON.stringify(await matPicks()));
  const listed = await page.evaluate(() => window.__ptcg.picker());
  T('5b. __ptcg.picker() finds both candidates on the mirror roots', listed.type === 'matPick' && listed.candidates.length === 2, JSON.stringify(listed));
  await clickAt(page, centreOf(state.rects[benchCard.id]));
  const picked = await waitUi(page, benchCard.id, (ui) => ui.matPick === 'picked');
  T('5c. a canvas click on one turns it picked', Boolean(picked), JSON.stringify(await matPicks()));
  await page.locator('.mat-pick-banner button', { hasText: 'Confirm' }).click();
  const confirmed = await waitFor(page, () => window.__pickResult, 3000).catch(() => null);
  T('5d. Confirm resolves the choice with that card', JSON.stringify(confirmed) === JSON.stringify({ confirm: [benchCard.id] }), JSON.stringify(confirmed));
  const cleared = await waitFor(page, async (ids) => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const ui = getBoardScene().inspect().uiState;
    return ids.every((id) => !ui.get(id)?.matPick);
  }, 4000, candidates).catch(() => false);
  T('5e. … and the outlines clear', cleared, JSON.stringify(await matPicks()));

  await openPick({ min: 1, max: 1 });
  await waitUi(page, activeId, (ui) => ui.matPick === 'idle');
  const viaBridge = await page.evaluate(() => window.__ptcg.pick([0]));
  const bridged = await waitFor(page, () => window.__pickResult, 3000).catch(() => null);
  T('5f. __ptcg.pick clicks a mirror img and resolves a single pick', viaBridge === true && bridged?.pick?.length === 1 && candidates.includes(bridged.pick[0]), JSON.stringify(bridged));

  await openPick({ min: 1, max: 1 });
  await waitUi(page, activeId, (ui) => ui.matPick === 'idle');
  await page.keyboard.press('Escape');
  const cancelled = await waitFor(page, () => window.__pickResult, 3000).catch(() => null);
  const cancelCleared = await waitUi(page, activeId, (ui) => !ui.matPick);
  T('5g. Escape cancels the pick and clears the outlines', Boolean(cancelled?.cancel) && Boolean(cancelCleared), JSON.stringify(cancelled));

  // (d) Affordance glow: with the rules on in the own turn, a playable card glows in-scene with
  // the colour rules-bridge.js paints into `--glow-rgb`.
  // Rules back on, announced as the rules toggle announces it (rules-bridge.js).
  await page.evaluate(() => {
    window.__ptcg.debugMode(false);
    document.dispatchEvent(new CustomEvent('rules-mode-changed', { detail: { enabled: true } }));
  });
  const glow = await waitFor(page, async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const { getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
    const ui = getBoardScene().inspect().uiState;
    for (const record of getCardRegistry().values()) {
      const node = record.element?.closest?.('.has-glow') ?? (record.element?.classList.contains('has-glow') ? record.element : null);
      const painted = node ?? record.element?.parentElement?.closest?.('.mat-holo.has-glow');
      if (!painted) continue;
      const css = painted.style.getPropertyValue('--glow-rgb').trim();
      const reported = ui.get(record.instanceId)?.glow ?? null;
      return { id: record.instanceId, zone: record.zone, css, reported };
    }
    return null;
  }, 10000).catch(() => null);
  const phase = await page.evaluate(() => ({ phase: window.__ptcg.rulesState.phase, turn: window.__ptcg.rulesState.turnPlayer }));
  T('6a. a playable card glows (has-glow on its mirror node) in the own turn', Boolean(glow), JSON.stringify({ glow, phase }));
  T('6b. … and the scene reports that glow with the --glow-rgb colour', Boolean(glow) && glow.reported === (glow.css || '120, 200, 255'), JSON.stringify(glow));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
