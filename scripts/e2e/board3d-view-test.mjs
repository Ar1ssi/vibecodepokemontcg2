// Design 074 slice C7: the three.js board renders server views in a two-player room and for a
// spectator. Spawns its own authoritative server (e2e bridge armed) on a free port, opens two
// players and a spectator at `?board=3d`, and checks each scene against `__ptcg`'s zones and the
// board mirror (board-mirror.js): mirror img counts, inline rects equal to the scene's projected
// rects, and a Basic played on one page appearing in the other page's scene.
// Usage: pnpm test:board3d   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOM = `b3d-${Date.now()}`;
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

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

async function openClient(browser, base, name) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('console', (m) => { if (m.text().includes('board3d')) console.log(`CONSOLE ${name}:`, m.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${base}/?e2e=1&board=3d`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  return { page, name };
}

const joinRoom = async (client, { spectator = false } = {}) => {
  await client.page.evaluate((on) => {
    document.getElementById('spectatorModeCheckbox').checked = on;
  }, spectator);
  await client.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, client.name]);
  await waitFor(client.page, () => window.__ptcg.counters().twoPlayer === true);
};

/**
 * One page's scene against its zones and mirror: per side, the scene's hand placements, the
 * mirror's hand imgs, `__ptcg`'s hand count, and every mirror hand img whose inline width is
 * zero or whose box is more than 1 px off the scene's projected rect.
 */
const sceneReport = (client) =>
  client.page.evaluate(async () => {
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const scene = getBoardScene();
    if (!scene) return { scene: false, active: document.body.classList.contains('board3d-active') };
    const { model, cards } = scene.inspect();
    const rects = scene.rects();
    const sides = {};
    for (const [side, host] of [['self', 'selfBoard'], ['opp', 'oppBoard']]) {
      const imgs = [...(document.getElementById(host).shadowRoot?.querySelectorAll('#hand img.card-image') ?? [])];
      const off = imgs.filter((img) => {
        const rect = rects[img.dataset.instanceId];
        const box = img.getBoundingClientRect();
        if (!(parseFloat(img.style.width) > 0) || !rect) return true;
        return ['left', 'top', 'width', 'height'].some((key) => Math.abs(box[key] - rect[key]) > 1);
      });
      sides[side] = {
        scene: (model?.placements ?? []).filter((p) => p.side === side && p.zone === 'hand').length,
        ids: (model?.placements ?? [])
          .filter((p) => p.side === side && p.zone === 'hand')
          .map((p) => p.instanceId)
          .sort((x, y) => x - y)
          .join(','),
        mirror: imgs.length,
        zone: window.__ptcg.zone(side, 'hand').count,
        off: off.map((img) => img.dataset.instanceId),
        debug: off.slice(0, 2).map((img) => ({ id: img.dataset.instanceId, width: img.style.width, box: img.getBoundingClientRect().toJSON(), rect: rects[img.dataset.instanceId] ?? null })),
      };
    }
    return {
      scene: true,
      active: document.body.classList.contains('board3d-active'),
      cards: cards.ids().length,
      sides,
    };
  });

/**
 * `mirrorSides`: the sides whose mirror hand must match. Right after the deal the opponent's
 * hand is in the scene but not yet in the mirror: the peer's relayed legacy `setupPrizes`
 * (reset.js removeImages) empties that side's containers after apply-view placed the redacted
 * hand — the iframe board shows the same gap — and the next view puts the imgs back.
 */
const checkPage = async (client, label, { mirrorSides = ['self', 'opp'] } = {}) => {
  // The scene re-syncs the mirror on the frame a tween settles; give the deal's flights time.
  await client.page.waitForTimeout(1500);
  const report = await sceneReport(client);
  T(`${label}: body.board3d-active`, report.active === true);
  T(`${label}: the scene holds at least 14 cards`, report.cards >= 14, `(${report.cards})`);
  for (const side of ['self', 'opp']) {
    const s = report.sides?.[side];
    const counts = JSON.stringify(s && { mirror: s.mirror, zone: s.zone, scene: s.scene });
    T(`${label}: ${side} hand — scene placements = zone count (≥ 7)`, Boolean(s) && s.scene === s.zone && s.zone >= 7, counts);
    if (!mirrorSides.includes(side)) continue;
    T(`${label}: ${side} hand — mirror imgs = zone count`, Boolean(s) && s.mirror === s.zone, counts);
    T(
      `${label}: ${side} hand — every mirror img sized and within 1 px of scene.rects()`,
      Boolean(s) && s.off.length === 0,
      s?.off.length ? `(off: ${s.off.join(',')}) ${JSON.stringify(s.debug)}` : ''
    );
  }
  return report;
};

const runCoinAndDeal = async (a, b) => {
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const deadline = Date.now() + 20000;
  let called = false;
  while (Date.now() < deadline && !called) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    for (const c of [a, b]) {
      if (!called && (await c.page.locator(callBtn).isVisible().catch(() => false))) {
        await c.page.locator(callBtn).dispatchEvent('click');
        called = true;
      }
    }
    if (!called) await a.page.waitForTimeout(200);
    if (!called && (await a.page.evaluate(() => window.__ptcg.observe().phase !== 'setup'))) break;
  }
  const choice = '#rulesTurnOrderChoiceOverlay button[data-turn-order-choice="first"]';
  const choiceDeadline = Date.now() + 10000;
  while (Date.now() < choiceDeadline) {
    let clicked = false;
    for (const c of [a, b]) {
      if (await c.page.locator(choice).isVisible().catch(() => false)) {
        await c.page.locator(choice).dispatchEvent('click');
        clicked = true;
      }
    }
    if (clicked) break;
    if (await a.page.evaluate(() => window.__ptcg.zone('self', 'hand').count >= 7)) break;
    await a.page.waitForTimeout(200);
  }
  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count >= 7 && window.__ptcg.zone('opp', 'hand').count >= 7, 30000);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count >= 7 && window.__ptcg.zone('opp', 'hand').count >= 7, 30000);
};

/** Plays a Basic from the actor's hand to its Active Spot; returns its instance id, or an error. */
const playBasic = (client) =>
  client.page.evaluate(async () => {
    window.__ptcg.debugMode(true);
    const options = await window.__ptcg.options('self');
    const basic = options.find((o) => o.kind === 'playBasic' && o.targetZone === 'active');
    if (!basic) return { error: 'no playBasic option', kinds: options.map((o) => o.kind) };
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const placement = getBoardScene()
      ?.inspect()
      .model?.placements.find((p) => p.side === 'self' && p.zone === 'hand' && p.index === basic.handIndex);
    const result = await window.__ptcg.act({ ...basic, user: 'self' });
    return { result, instanceId: placement?.instanceId ?? null, name: window.__ptcg.zone('self', 'active').names[0] };
  });

const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: GL_ARGS,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const a = await openClient(browser, server.base, 'Alpha');
  const b = await openClient(browser, server.base, 'Bravo');
  await joinRoom(a);
  await joinRoom(b);
  T('1. both players joined the room', true, ROOM);

  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.instanceMapSeats().length >= 2, 20000).catch(() => null);
  await runCoinAndDeal(a, b);
  T('2. both seats were dealt', true);

  await checkPage(a, '3A', { mirrorSides: ['self'] });
  await checkPage(b, '3B', { mirrorSides: ['self'] });

  // The turn player acts (setup lets only it place its Active through options()).
  const aTurn = await a.page.evaluate(() => window.__ptcg.observe().turnPlayer);
  const actor = aTurn === 'self' ? a : b;
  const observer = actor === a ? b : a;
  const played = await playBasic(actor);
  T(`4. ${actor.name} played a Basic to its Active Spot through act()`, played.result?.ok === true && played.instanceId !== null,
    JSON.stringify(played));
  const seen = await waitFor(
    observer.page,
    async (id) => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const scene = getBoardScene();
      const placement = scene?.inspect().model?.placements.find((p) => p.instanceId === id);
      return placement?.side === 'opp' && placement.zone === 'active' && scene.rects()[id] ? placement : null;
    },
    3000,
    played.instanceId
  ).catch(() => null);
  T(`5. ${observer.name}'s scene shows it in its opp Active Spot within 3 s`, Boolean(seen), `(#${played.instanceId})`);
  await checkPage(a, '5A');
  await checkPage(b, '5B');

  const s = await openClient(browser, server.base, 'Watcher');
  await joinRoom(s, { spectator: true });
  await waitFor(s.page, () => window.__ptcg.zone('self', 'hand').count >= 7 && window.__ptcg.zone('opp', 'hand').count >= 7, 20000);
  const spectator = await checkPage(s, '6S');
  const handCounts = async (client) =>
    client.page.evaluate(() => ({ self: window.__ptcg.zone('self', 'hand').count, opp: window.__ptcg.zone('opp', 'hand').count }));
  const [aHands, sHands] = [await handCounts(a), await handCounts(s)];
  T(
    '7. the spectator scene draws both players\' hands at their real sizes',
    spectator.sides?.self.scene + spectator.sides?.opp.scene === aHands.self + aHands.opp &&
      [sHands.self, sHands.opp].sort().join() === [aHands.self, aHands.opp].sort().join(),
    JSON.stringify({ spectator: sHands, alpha: aHands })
  );

  // A POV switch clears the rendered board (spectator-session.js clearRenderedBoard) and
  // redraws it from the other seat: the scene must follow.
  await s.page.click('#spectatorViewSwitch button[data-mode="p2"]');
  await s.page.waitForTimeout(600);
  const switched = await checkPage(s, '8S (P2 POV)');
  T(
    "8. after the P2 POV switch the scene's near hand is the other seat's hand",
    Boolean(switched.sides?.self.ids) && switched.sides.self.ids === spectator.sides?.opp.ids &&
      switched.sides.opp.ids === spectator.sides?.self.ids,
    JSON.stringify({ before: spectator.sides?.self.ids, after: switched.sides?.opp.ids })
  );
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
