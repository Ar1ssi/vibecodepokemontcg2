// Page helpers shared by the unboxing recorders: rec-unboxing.mjs (Build & Battle, design 052/055)
// and rec-etb.mjs (Elite Trainer Box, design 057). Both drive the same scene
// (`#bbUnboxing`, native-deck-builder-unboxing.js) in the builder tab; they differ in the page, the
// storage keys and the button that opens the box, which `openFresh` takes as options.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

// Headless Chromium has no GPU: WebGL runs on SwiftShader.
export const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const NO_GL_ARGS = ['--disable-webgl', '--disable-webgl2'];
// Card art hosts: TCGdex, the Limitless promo host, and images.pokemontcg.io for the Trainer Gallery
// and SM rows TCGdex has no art for (design 054 D4).
export const CARD_HOSTS = [
  'https://assets.tcgdex.net/**',
  'https://limitlesstcg.nyc3.digitaloceanspaces.com/**',
  'https://images.pokemontcg.io/**',
];
// The ETB sleeve prop's scan (design 057 beat 5).
export const SLEEVE_HOST = 'https://pokemon-sleeve-database.com/**';

export const UNBOXING_MODULE = '/src/setup/deck-builder/core/build-battle/unboxing.mjs';
export const PACK3D_MODULE = '/src/setup/deck-builder/core/build-battle/pack3d.mjs';

/** @returns {{check: (ok: boolean, label: string, detail?: string) => void, failures: string[]}} */
export const makeCheck = (tag) => {
  const failures = [];
  const check = (ok, label, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
  };
  return { check, failures };
};

export function launchOptions(args) {
  const executablePath = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  return executablePath ? { executablePath, args } : { args };
}

/** CARD_IMG as a response body, or null when it is unset or a URL. */
export const cardImageBody = () => {
  const src = process.env.CARD_IMG;
  if (!src || /^https?:/.test(src)) return null;
  const type = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  return { body: readFileSync(src), contentType: type[extname(src).toLowerCase()] || 'image/png' };
};

/**
 * A page that logs errors and serves the card hosts: CARD_IMG for every face (`cards: 'stand-in'`,
 * a no-op when CARD_IMG is unset) or a 404 for every face (`cards: '404'`, design 052/057 row 10).
 */
export const preparePage = async (context, { baseUrl, hosts = CARD_HOSTS, cards = 'stand-in' }) => {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && console.log('console', m.text()));
  page.on('requestfailed', (r) => console.log('blocked', r.url().slice(0, 100)));
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await page.route('https://cdn.socket.io/**', (r) =>
    process.env.SIO_JS
      ? r.fulfill({ body: readFileSync(process.env.SIO_JS), contentType: 'text/javascript' })
      : r.fulfill({ status: 302, headers: { location: `${baseUrl}/socket.io/socket.io.js` } })
  );
  if (cards === '404') {
    for (const host of hosts) await page.route(host, (r) => r.fulfill({ status: 404, body: 'not found' }));
    return page;
  }
  const local = cardImageBody();
  for (const host of hosts) {
    if (local) await page.route(host, (r) => r.fulfill(local));
    else if (process.env.CARD_IMG) {
      await page.route(host, (r) => r.fulfill({ status: 302, headers: { location: process.env.CARD_IMG } }));
    }
  }
  return page;
};

/**
 * Open `url` on clean storage and press the button that opens a new box; resolves once the sealed
 * box shows. `storageKeys` are removed before a reload, so the page starts with no saved opening.
 */
export const openFresh = async (page, { url, storageKeys, openSelector, sealedSelector = '#bbUnboxing .bb-box__wrap' }) => {
  await page.goto(url);
  await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), storageKeys);
  await page.reload();
  await page.waitForSelector(`${openSelector}:not([disabled])`, { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click(openSelector);
  await page.waitForSelector(sealedSelector, { state: 'visible' });
  await page.waitForTimeout(600);
};

// A scripted click has detail 0, which every beat button accepts (tear buttons included).
export const press = (page, selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`no ${sel}`);
    node.scrollIntoView({ block: 'nearest' });
    node.click();
  }, selector);

// A real pointer drag across 70 % of the target: the tear gesture the scene is built around.
export const dragTear = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 4, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(box.x + 4 + (box.width * 0.7 * step) / 12, y + step * 0.5);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
};

// A real pointer swipe of the top pocket card to the left, half its width.
export const dragSwipe = async (page, selector = '.bb-pcard.is-top') => {
  const box = await page.locator(selector).boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + box.width / 2 - step * box.width * 0.05, y + step);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
};

/**
 * Resolves once no finite script animation runs: the scene refuses a beat while an entrance holds
 * it (a DOM fly of nine packs takes ~1.6 s), so a scripted tap waits for this first.
 * @returns {Promise<boolean>} false when something still ran after `timeout`
 */
export const waitIdle = (page, timeout = 10000) =>
  page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== 'running' ||
              a instanceof CSSAnimation ||
              a instanceof CSSTransition ||
              !Number.isFinite(a.effect?.getComputedTiming().endTime)
          ),
      null,
      { timeout }
    )
    .then(() => true)
    .catch(() => false);

export const waitView = (page, view, timeout = 8000) =>
  page.waitForFunction((v) => document.getElementById('bbUnboxing')?.dataset.view === v, view, { timeout });

export const renderMode = (page) => page.evaluate(() => document.getElementById('bbUnboxing')?.dataset.render);
// SwiftShader compiles the pack shaders on the CPU: after a reload that competes with every card
// image, the stage can take well over 10 s to come up (a GPU takes a fraction of that).
export const waitRender = (page, mode) =>
  page
    .waitForFunction((m) => document.getElementById('bbUnboxing')?.dataset.render === m, mode, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);

// The canvas draws nothing when hiding it leaves the screenshot byte-identical.
export const canvasDrawsNothing = async (page) => {
  const withCanvas = await page.screenshot();
  // The WebGL canvas and its floor-reflection layer both count.
  const hidden = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('.bb-gl, .bb-gl-mirror')];
    layers.forEach((layer) => (layer.style.visibility = 'hidden'));
    return layers.length > 0;
  });
  const without = await page.screenshot();
  if (hidden) {
    await page.evaluate(() =>
      document.querySelectorAll('.bb-gl, .bb-gl-mirror').forEach((layer) => (layer.style.visibility = ''))
    );
  }
  return withCanvas.equals(without);
};

// SwiftShader can run the falling pack's last frames late; the canvas must be empty soon after.
export const canvasEmptiesWithin = async (page, ms) => {
  for (let waited = 0; waited <= ms; waited += 400) {
    if (await canvasDrawsNothing(page)) return true;
    await page.waitForTimeout(400);
  }
  return false;
};

/** Every exported number of a page module (the scene's timings). */
export const moduleNumbers = (page, module) =>
  page.evaluate(async (path) => {
    const m = await import(path);
    return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number'));
  }, module);

// ── The pocket ─────────────────────────────────────────────────────────────────────────
export const summaryIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.bb-summary__card')]
      .sort((a, b) => a.dataset.cardIndex - b.dataset.cardIndex)
      .map((node) => node.dataset.previewCardId)
  );

export const topIndex = (page) =>
  page.evaluate(() => {
    const top = document.querySelector('.bb-pcard.is-top');
    return top ? Number(top.dataset.cardIndex) : null;
  });

// Is the top card showing its back? The flip's z axis points away from the camera (m33 < 0).
export const topFaceDown = (page) =>
  page.evaluate(() => {
    const flip = document.querySelector('.bb-pcard.is-top .bb-pcard__flip');
    return !!flip && new DOMMatrix(getComputedStyle(flip).transform).m33 < 0;
  });

export const topFlipped = (page) =>
  page.evaluate(() => !!document.querySelector('.bb-pcard.is-top')?.classList.contains('is-flipped'));

/**
 * One card: a hit turns over first (and must start face down: pushed onto `hitsFaceDown`), then
 * the card is swiped off. A hit the hit strip already turned over is only swiped.
 * @param {number[]} packTiers the hit tier of each card in the open pack
 */
export const swipeOne = async (page, packTiers, { drag = false, hitsFaceDown }) => {
  const k = await topIndex(page);
  if (packTiers[k] >= 2 && !(await topFlipped(page))) {
    hitsFaceDown.push(await topFaceDown(page));
    await press(page, '.bb-pcard.is-top');
    await page.waitForFunction(() => document.querySelector('.bb-pcard.is-top')?.classList.contains('is-flipped'), null, { timeout: 6000 });
    await page.waitForTimeout(500);
  }
  if (drag) await dragSwipe(page);
  else await press(page, '.bb-pcard.is-top');
  const last = k === packTiers.length - 1;
  await page.waitForFunction(
    ([n, done]) =>
      done ? !!document.querySelector('.bb-summary') : Number(document.querySelector('.bb-pcard.is-top')?.dataset.cardIndex) === n,
    [k + 1, last],
    { timeout: 6000 }
  );
  await page.waitForTimeout(packTiers[k + 1] >= 1 ? 420 : 160);
};

// ── Frozen WAAPI frames (strips) ───────────────────────────────────────────────────────
// Installed with context.addInitScript: `window.__beat` pauses and seeks every animation a beat
// started, so a frame is exact whatever the machine's speed.
export const FREEZE = () => {
  window.__beat = {
    mark() {
      this.before = new Set(document.getAnimations());
      this.t0 = document.timeline.currentTime;
      this.starts = new Map();
    },
    // A chained phase (the promo after the unwrap, the fly after the promo) starts on its own
    // animation's clock: wait for it, then time the strip from it. Animations running before the
    // beat's mark() are not the phase.
    async startAt(selector, timeoutMs = 10000) {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        const animation = document.querySelector(selector)?.getAnimations().find((a) => !this.before.has(a));
        if (animation) {
          await animation.ready.catch(() => {});
          this.t0 = animation.startTime ?? document.timeline.currentTime;
          return;
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      throw new Error(`the phase ${selector} never started (was the trigger refused while the scene was busy?)`);
    },
    async fresh() {
      const list = document.getAnimations().filter((a) => !this.before.has(a) && !(a instanceof CSSAnimation));
      await Promise.all(list.map((a) => a.ready.catch(() => {})));
      for (const a of list) if (!this.starts.has(a)) this.starts.set(a, a.startTime ?? this.t0);
      return list;
    },
    // Every animation this beat started, frozen at `ms` after the trigger.
    async seek(ms) {
      for (const a of await this.fresh()) {
        a.pause();
        const end = a.effect.getComputedTiming().endTime;
        a.currentTime = Math.max(0, Math.min(this.t0 + ms - this.starts.get(a), Number.isFinite(end) ? end : Infinity));
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    async resume() {
      const list = await this.fresh();
      list.forEach((a) => a.playState === 'paused' && a.play());
      const finite = list.filter((a) => Number.isFinite(a.effect.getComputedTiming().endTime));
      await Promise.all(finite.map((a) => a.finished.catch(() => {})));
    },
  };
};

/**
 * `shoot` and `strip` writing into `outDir`. `clip` (a selector) crops a strip's frames to that
 * element plus `pad` px, for a beat too small to read in a full-page frame.
 */
export const makeStrips = (outDir) => {
  const clipOf = async (page, selector, pad) => {
    const box = selector ? await page.locator(selector).first().boundingBox() : null;
    if (!box) return undefined;
    const viewport = page.viewportSize();
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    return {
      x,
      y,
      width: Math.min(viewport.width - x, box.width + pad * 2),
      height: Math.min(viewport.height - y, box.height + pad * 2),
    };
  };
  const shoot = async (page, file, { clip, pad = 60 } = {}) =>
    page.screenshot({ path: join(outDir, file), clip: await clipOf(page, clip, pad) });

  /**
   * Trigger one beat and write its three frames. Real time runs to `peakMs` before the peak seek,
   * so timer-driven steps have happened when it is shot.
   */
  const strip = async (page, name, trigger, { peakMs, settleMs = 300, phase, clip, pad }) => {
    await page.evaluate(() => window.__beat.mark());
    await trigger();
    if (phase) await page.evaluate((sel) => window.__beat.startAt(sel), phase);
    const started = Date.now();
    await page.evaluate(() => window.__beat.seek(0));
    await shoot(page, `${name}-start.png`, { clip, pad });
    const wait = peakMs + 40 - (Date.now() - started);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.evaluate((ms) => window.__beat.seek(ms), peakMs);
    await shoot(page, `${name}-peak.png`, { clip, pad });
    await page.evaluate(() => window.__beat.resume());
    await page.waitForTimeout(settleMs);
    await shoot(page, `${name}-settle.png`, { clip, pad });
    console.log('strip', name);
  };
  return { shoot, strip };
};

// ── The WebGL clock (design 055) ───────────────────────────────────────────────────────
// Playwright's fake clock drives requestAnimationFrame and performance.now, so a paused clock
// stepped with runFor lands each WebGL frame exactly where the poses put it. Needs
// `page.clock.install()` before the page loads.
/**
 * Pause the fake clock ~100 ms ahead of the page's now. Under SwiftShader load the round trip can
 * outrun that margin ("Cannot fast-forward to the past"), so a late target is retried from a fresh now.
 */
export const pauseClockSoon = async (page, aheadMs = 100) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + aheadMs * attempt);
      return;
    } catch (error) {
      if (attempt >= 5 || !/fast-forward to the past/.test(error.message)) throw error;
    }
  }
};

export const clockStepper = (page) => async (totalMs, frame = 16) => {
  const total = Math.round(totalMs);
  for (let run = 0; run < total; run += frame) await page.clock.runFor(Math.min(frame, total - run));
};

/**
 * The 3D rip of the focused pack on a paused fake clock, from a real drag: the spread, the peel at
 * 30 %, on past the 40 % rip point, the strip's flight, the cards rising, then stepped until the DOM
 * pocket takes over. `file(key)` names each frame; keys are spread, peel-30, rip, strip-flight,
 * cards-rising, handoff-before (the last frame still awaiting the stack) and handoff-after.
 * Leaves the clock paused. @returns {Promise<{handedOff: boolean}>}
 */
export const ripOnSteppedClock = async (page, { ms, shoot, file }) => {
  const step = clockStepper(page);
  await pauseClockSoon(page);
  await step(64);
  await shoot(page, file('spread'));

  // A real drag from the left edge: stop at 30 % for the peel, then on past the 40 % rip point.
  const box = await page.locator('.bb-bigpack.is-focus .bb-pack__top').boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + 4;
  const dragTo = async (from, to) => {
    for (let share = from; share <= to + 1e-9; share += 0.05) {
      await page.mouse.move(x0 + box.width * share, y);
      await step(16);
    }
  };
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await dragTo(0.05, 0.3);
  await step(ms.GRAB_LEVEL_MS);
  await shoot(page, file('peel-30'));
  await dragTo(0.35, 0.5);
  await page.mouse.up();
  await step(ms.RIP_FINISH_MS);
  await shoot(page, file('rip'));
  await step(ms.STRIP_FLIGHT_MS * 0.5);
  await shoot(page, file('strip-flight'));
  await step(ms.STRIP_FLIGHT_MS * (ms.CARDS_RISE_AT - 0.5) + ms.CARDS_RISE_MS * 0.6);
  await shoot(page, file('cards-rising'));

  // Step until the DOM pocket takes over; the last awaiting frame is "before".
  let handedOff = false;
  for (let i = 0; i < 500 && !handedOff; i += 1) {
    const s = await page.evaluate(() => ({
      view: document.getElementById('bbUnboxing')?.dataset.view,
      awaiting: !!document.querySelector('.bb-pocket.is-awaiting-3d'),
    }));
    handedOff = s.view === 'pocket' && !s.awaiting;
    if (s.awaiting) await shoot(page, file('handoff-before'));
    if (!handedOff) await step(8, 8);
  }
  await step(32);
  await shoot(page, file('handoff-after'));
  return { handedOff };
};

// Counts requestAnimationFrame calls made from the stage module (an init script).
export const COUNT_STAGE_RAF = () => {
  window.__stageRaf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    if (/native-deck-builder-pack3d\.js/.test(new Error().stack || '')) window.__stageRaf += 1;
    return raf(callback);
  };
};
