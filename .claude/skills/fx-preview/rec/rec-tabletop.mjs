// Design 073 check: the tabletop opening on the standalone bench (`/unboxing`). Pass 1 drives one
// box through every beat with the scene's own api (`doNext`, what the primary button does), saves a
// frame per settled beat to <OUT>/NN-<beat>.png, and checks: no page or console errors; every pack's
// cards come out as its pool cards, in order (A7, pool integrity); the box ends opened with every
// pack torn. Pass 2 reloads in the middle of a pack and checks the same card is back in hand
// (row 4). Pass 3 opens the box with WebGL off and checks the DOM scene takes over (A8).
//
// Env: SEED (42) · BOX (a catalog box key; default phantasmal-flames) · BASE_URL (http://localhost:4100)
//      OUT (.agent/scratch/tabletop[-<box>][-<seed>]) · CHROMIUM (a browser binary; the cloud
//      container has /opt/pw-browsers/chromium)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SEED = Number(process.env.SEED ?? 42);
const BOX = process.env.BOX || 'phantasmal-flames';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
const NAME_TAG = `${BOX === 'phantasmal-flames' ? '' : `-${BOX}`}${SEED === 42 ? '' : `-${SEED}`}`;
const OUT = process.env.OUT || `.agent/scratch/tabletop${NAME_TAG}`;
const PAGE_URL = `${BASE_URL}/unboxing?box=${encodeURIComponent(BOX)}&seed=${SEED}`;
const VIEWPORT = { width: 1280, height: 800 };
// Headless Chromium has no GPU: WebGL runs on SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const NO_GL_ARGS = ['--disable-webgl', '--disable-webgl2'];
const BEAT_TIMEOUT_MS = 180000;

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${BOX} #${SEED}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const launch = (args) => {
  const executablePath = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return chromium.launch({ executablePath, args });
};

const watchErrors = (page, errors) => {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
};

const sceneReady = (page) =>
  page.waitForFunction(
    () => {
      const api = document.querySelector('.tt-root')?.tabletop;
      const loading = document.querySelector('.tt-loading');
      return api && (!loading || loading.hidden) && !api.busy;
    },
    null,
    { timeout: BEAT_TIMEOUT_MS }
  );

const settled = (page) =>
  page.waitForFunction(() => !document.querySelector('.tt-root')?.tabletop?.busy, null, { timeout: BEAT_TIMEOUT_MS });

const api = (page, expression) => page.evaluate(expression);

// The pool the page opens for this box and seed, computed in the page from the same modules.
const expectedPacks = (page) =>
  page.evaluate(
    async ({ boxKey, seed }) => {
      const { getBuildBattleBox } = await import('/src/setup/deck-builder/core/build-battle/box-catalog.mjs');
      const { loadBoxData } = await import('/src/setup/deck-builder/core/build-battle/box-data.mjs');
      const { openBox } = await import('/src/setup/deck-builder/core/build-battle/pack-opening.mjs');
      const { createRng } = await import('/shared/engine/rng.mjs');
      const box = getBuildBattleBox(boxKey);
      const { setInfo, cards, data } = await loadBoxData(box.key);
      return openBox({ box, data, cards, setInfo, rng: createRng(seed) }).packs;
    },
    { boxKey: BOX, seed: SEED }
  );

async function openFresh(page) {
  await page.goto(`${PAGE_URL}&fresh=1`);
  await sceneReady(page);
}

// ── Pass 1: the whole box, beat by beat ─────────────────────────────────────
async function passWholeBox(browser) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  watchErrors(page, errors);
  await openFresh(page);
  const packs = await expectedPacks(page);
  const seen = packs.map(() => []);
  let shot = 0;
  const snap = async (beat) => {
    await page.screenshot({ path: join(OUT, `${String(shot).padStart(2, '0')}-${beat}.png`) });
    shot += 1;
  };
  await snap('sealed');
  for (let step = 0; step < 200; step += 1) {
    const before = await api(page, () => {
      const t = document.querySelector('.tt-root').tabletop;
      return { done: t.view().done, label: document.querySelector('.tt-btn--primary')?.textContent || '' };
    });
    if (before.done && /build|see what/i.test(before.label)) break;
    const held = await api(page, () => document.querySelector('.tt-root').tabletop.held);
    if (held) {
      const front = held.ids[held.position];
      if (front && !['code', 'energy'].includes(front)) seen[held.logical].push(front);
    }
    await api(page, () => document.querySelector('.tt-root').tabletop.doNext());
    await page.waitForTimeout(100);
    await settled(page);
    const label = before.label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'beat';
    if (label !== 'next-card') await snap(label);
  }
  // A card counts as seen when it was the front card as the reveal moved past it.
  const view = await api(page, () => document.querySelector('.tt-root').tabletop.view());
  check(view.done, 'the box ends opened', JSON.stringify({ done: view.done }));
  packs.forEach((ids, logical) => {
    const shown = seen[logical];
    check(
      shown.length === ids.length && shown.every((id, k) => id === ids[k]),
      `pack ${logical + 1} shows its pool cards in order`,
      `${shown.length}/${ids.length}`
    );
  });
  check(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
  await page.close();
}

// ── Pass 2: a reload mid-pack resumes the same card ─────────────────────────
async function passReloadMidPack(browser) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  watchErrors(page, errors);
  await openFresh(page);
  let held = null;
  for (let step = 0; step < 40 && !(held && held.position >= 4); step += 1) {
    await api(page, () => document.querySelector('.tt-root').tabletop.doNext());
    await page.waitForTimeout(100);
    await settled(page);
    held = await api(page, () => document.querySelector('.tt-root').tabletop.held);
  }
  check(Boolean(held), 'a pack is in hand before the reload');
  await page.goto(PAGE_URL);
  await sceneReady(page);
  const after = await api(page, () => document.querySelector('.tt-root').tabletop.held);
  check(
    after?.logical === held?.logical && after?.ids[after.position] === held?.ids[held.position],
    'the reload puts the same card back in hand',
    `${held?.ids[held?.position]} → ${after?.ids[after?.position]}`
  );
  await page.screenshot({ path: join(OUT, 'reload-mid-pack.png') });
  check(errors.length === 0, 'no errors across the reload', errors.slice(0, 3).join(' | '));
  await page.close();
}

// ── Pass 3: without WebGL the DOM scene opens the box ───────────────────────
async function passNoWebgl() {
  const browser = await launch(NO_GL_ARGS);
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${PAGE_URL}&fresh=1`);
  const fellBack = await page
    .waitForFunction(() => !document.querySelector('.tt-root') && /needs WebGL 2/.test(document.body.innerText), null, {
      timeout: 30000,
    })
    .then(() => true)
    .catch(() => false);
  const message = await page.evaluate(() => document.body.innerText.slice(0, 160));
  check(fellBack, 'with WebGL off the bench says so instead of mounting the tabletop', message.replace(/\s+/g, ' '));
  await page.screenshot({ path: join(OUT, 'no-webgl.png') });
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await launch(GL_ARGS);
try {
  await passWholeBox(browser);
  await passReloadMidPack(browser);
} finally {
  await browser.close();
}
await passNoWebgl();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
