// Design 074 slice G3: the three.js board is the only board. A page boots it with no query, and
// the retired `?board=iframe` query is ignored: it boots the same board.
// Usage: pnpm test:board3d-boot   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const PORT_RANGE = [4900, 4959];

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
    env: { ...process.env, PORT: String(port), PTCG_E2E: '1' },
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

/** Boots one page and reports which board it runs and what the page shows. */
async function boot(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  // The 3D board starts after the page's own boot (an async import) and only then reports '3d'.
  const state = await waitFor(page, () => {
    const active = document.body.classList.contains('board3d-active');
    if (!active) return null;
    const host = document.getElementById('board3dHost');
    return {
      mode: window.__ptcg.boardMode(),
      active,
      hostShown: !host.hidden && getComputedStyle(host).display !== 'none',
      canvas: Boolean(host.querySelector('canvas')),
    };
  }, 30000).catch(() => page.evaluate(() => ({ mode: window.__ptcg.boardMode(), active: false, timeout: true })));
  await context.close();
  return state;
}

const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    args: GL_ARGS,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  const plain = await boot(browser, `${server.base}/?e2e=1`);
  T('1a. ?e2e=1 → the 3D board runs', plain.mode === '3d' && plain.active === true, JSON.stringify(plain));
  T('1b. … the canvas host shows', plain.hostShown === true && plain.canvas === true);

  const retired = await boot(browser, `${server.base}/?e2e=1&board=iframe`);
  T('2a. ?board=iframe is ignored → the 3D board runs', retired.mode === '3d' && retired.active === true, JSON.stringify(retired));
  T('2b. … the canvas host shows', retired.hostShown === true && retired.canvas === true);

  // H3: the TCG Live camera preset looks straight down, so the far seat's zones project as tall
  // as the near seat's; the 12° tilt shrinks the far ones. The setting re-projects at once.
  const presets = await (async () => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
    await page.goto(`${server.base}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitFor(page, () => window.__ptcg?.ready === true && document.body.classList.contains('board3d-active'), 60000);
    const heights = () =>
      page.evaluate(async () => {
        const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
        const rects = getBoardScene()?.zoneRects() ?? {};
        return { near: rects['self:active']?.height ?? null, far: rects['opp:active']?.height ?? null };
      });
    const tilted = await waitFor(page, async () => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const rects = getBoardScene()?.zoneRects() ?? {};
      return rects['self:active'] && rects['opp:active'] ? true : null;
    }, 30000).then(heights);
    await page.evaluate(async () => {
      const { setCameraPreset } = await import('/src/setup/image-logic/fx-settings.js');
      setCameraPreset('tcgl');
    });
    const topDown = await waitFor(page, async ([before]) => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const rects = getBoardScene()?.zoneRects() ?? {};
      const far = rects['opp:active']?.height;
      return far && Math.abs(far - before) > 0.5 ? true : null;
    }, 15000, [tilted.far]).then(heights).catch(() => null);
    await page.evaluate(async () => {
      const { setCameraPreset } = await import('/src/setup/image-logic/fx-settings.js');
      setCameraPreset('tilt12');
    });
    const back = await waitFor(page, async ([before]) => {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      const far = (getBoardScene()?.zoneRects() ?? {})['opp:active']?.height;
      return far && Math.abs(far - before) < 0.5 ? true : null;
    }, 15000, [tilted.far]).then(heights).catch(() => null);
    await context.close();
    return { tilted, topDown, back };
  })();
  T('4a. tilt12: the far Active projects shorter than the near one', presets.tilted.near > presets.tilted.far * 1.02, JSON.stringify(presets.tilted));
  T('4b. setCameraPreset(\'tcgl\') re-projects at once: far and near Active heights within 1 %',
    Boolean(presets.topDown) && Math.abs(presets.topDown.near - presets.topDown.far) <= presets.topDown.near * 0.01, JSON.stringify(presets.topDown));
  T('4c. back to tilt12 restores the tilted projection', Boolean(presets.back) && Math.abs(presets.back.far - presets.tilted.far) < 0.5, JSON.stringify(presets.back));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  stopServer(server.child);
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
