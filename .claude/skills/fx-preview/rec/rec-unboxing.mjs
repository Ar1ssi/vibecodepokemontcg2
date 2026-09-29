// Design 052 video check: the Build & Battle unboxing scene in the builder tab (Pocket-style
// rework, 052 § Deviations). The opening plays on a fullscreen stage (#bbUnboxingStage) with the
// builder UI hidden; the packs fly out of the box, each is swiped open in order, its cards are
// swiped off one at a time (hits turn over first) and a ten-card summary closes each pack.
// Pass 1 records a whole box at real speed to out/unboxing[-<seed>].webm and checks the stage,
// pack order, rows 4 (reload mid-pack), 13 (pool integrity), 14 (every hit starts face down)
// and the hand-back to the builder (deck 40 / 40, 40 pack cards left to add).
// Pass 2 (no video) freezes beats at start / peak / settle and writes
// <OUT>/<beat>-{start,peak,settle}.png for tear, lid, promo, fly, cut, swipe, hit, summary.
// Pass 3 shoots <OUT>/phone-390-{spread,pocket}.png and checks row 16 (no horizontal scroll).
// Design 055 (3D packs): Chromium runs WebGL on SwiftShader (GL_ARGS). Pass 1 also checks the spread
// draws in WebGL, a reload at the spread returns to it, and the pocket hand-off leaves the canvas
// empty. The WebGL clock is not WAAPI, so pass 2 cannot freeze the fly or the rip in 3D; pass 4
// steps Playwright's fake clock instead and writes <OUT>/rip3d-*.png (spread, peel 30 %, rip,
// strip flight, cards rising, hand-off before/after). Pass 5 (always) checks the fallbacks: reduced
// motion (no stage rAF loop, the rip lands at once), WebGL disabled (the DOM scene), and 20
// mount/unmount cycles (no leaked WebGL context).
//
// Env: SEED (42) · BOX (a catalog box key; default phantasmal-flames) · BASE_URL (http://localhost:4100)
//      OUT (.agent/scratch/unboxing[-<box>][-<seed>])
//      CARD_IMG: a local image or URL served for every card face (sandboxes where the art hosts are blocked)
//      SIO_JS: a local socket.io.min.js (default: the server's own /socket.io/socket.io.js)
//      CHROMIUM: a browser binary (the cloud container has /opt/pw-browsers/chromium)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { extname, join } from 'node:path';

const SEED = Number(process.env.SEED ?? 42);
const BOX = process.env.BOX || 'phantasmal-flames';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
// Design 054 § Recorder: the default box keeps 052's file names; another box names its files.
const NAME_TAG = `${BOX === 'phantasmal-flames' ? '' : `-${BOX}`}${SEED === 42 ? '' : `-${SEED}`}`;
const OUT = process.env.OUT || `.agent/scratch/unboxing${NAME_TAG}`;
const VIDEO = `out/unboxing${NAME_TAG}.webm`;
const PAGE_URL = `${BASE_URL}/build-and-battle?seed=${SEED}&e2e=1&box=${encodeURIComponent(BOX)}`;
const STORAGE_KEY = 'ptcg-sim.build-battle.v1';
const VIEWPORT = { width: 1280, height: 800 };
const MODULE = '/src/setup/deck-builder/core/build-battle/unboxing.mjs';
const PACK3D_MODULE = '/src/setup/deck-builder/core/build-battle/pack3d.mjs';
const SCENE_MODULE = '/src/initialization/document-event-listeners/sidebox/native-deck-builder-unboxing.js';
// Headless Chromium has no GPU: WebGL runs on SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const NO_GL_ARGS = ['--disable-webgl', '--disable-webgl2'];
// Set cards come from TCGdex, the deck promos from Limitless.
// Card art hosts: TCGdex, the Limitless promo host, and images.pokemontcg.io for the Trainer Gallery
// and SM rows TCGdex has no art for (design 054 D4).
const CARD_HOSTS = [
  'https://assets.tcgdex.net/**',
  'https://limitlesstcg.nyc3.digitaloceanspaces.com/**',
  'https://images.pokemontcg.io/**',
];

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} [${BOX}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const cardImageBody = () => {
  const src = process.env.CARD_IMG;
  if (!src || /^https?:/.test(src)) return null;
  const type = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  return { body: readFileSync(src), contentType: type[extname(src).toLowerCase()] || 'image/png' };
};

const preparePage = async (context) => {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && console.log('console', m.text()));
  page.on('requestfailed', (r) => console.log('blocked', r.url().slice(0, 100)));
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await page.route('https://cdn.socket.io/**', (r) =>
    process.env.SIO_JS
      ? r.fulfill({ body: readFileSync(process.env.SIO_JS), contentType: 'text/javascript' })
      : r.fulfill({ status: 302, headers: { location: `${BASE_URL}/socket.io/socket.io.js` } })
  );
  const local = cardImageBody();
  for (const host of CARD_HOSTS) {
    if (local) await page.route(host, (r) => r.fulfill(local));
    else if (process.env.CARD_IMG) {
      await page.route(host, (r) => r.fulfill({ status: 302, headers: { location: process.env.CARD_IMG } }));
    }
  }
  return page;
};

const openFreshBox = async (page) => {
  await page.goto(PAGE_URL);
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await page.waitForSelector('#buildBattleOpenBox:not([disabled])', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click('#buildBattleOpenBox');
  await page.waitForSelector('#bbUnboxing .bb-box__wrap', { state: 'visible' });
  await page.waitForTimeout(600);
};

// A scripted click has detail 0, which every beat button accepts (tear buttons included).
const press = (page, selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`no ${sel}`);
    node.scrollIntoView({ block: 'nearest' });
    node.click();
  }, selector);

// A real pointer drag across 70 % of the target: the tear gesture the scene is built around.
const dragTear = async (page, selector) => {
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

const session = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
// The saved box's card data, as the tab loads it (design 054: per-box modules on demand).
const BOX_DATA = '/src/setup/deck-builder/core/build-battle/box-data.mjs';
const PACK_MODELS_MODULE = '/src/setup/deck-builder/core/build-battle/pack-models.mjs';

const tiersOf = (page) =>
  page.evaluate(async ({ module, key, boxData, packModels }) => {
    const { hitTierFor, packSlotKind } = await import(module);
    const { loadBoxData } = await import(boxData);
    const { cardClass, resolvePackModel } = await import(packModels);
    const saved = JSON.parse(localStorage.getItem(key));
    const { box, cards, setInfo } = await loadBoxData(saved.boxKey);
    const byId = new Map(cards.map((card) => [card.id, card]));
    const packModel = resolvePackModel(box.packModelKey, cards, setInfo);
    return saved.packs.map((pack) =>
      pack.map((id, index) => {
        const card = byId.get(id);
        return hitTierFor(card, packSlotKind(packModel, index, card), cardClass(card, box.era, setInfo));
      })
    );
  }, { module: MODULE, key: STORAGE_KEY, boxData: BOX_DATA, packModels: PACK_MODELS_MODULE });


const summaryIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.bb-summary__card')]
      .sort((a, b) => a.dataset.cardIndex - b.dataset.cardIndex)
      .map((node) => node.dataset.previewCardId)
  );

// Every summary card wears foil exactly when unboxingHoloRarity says so, in that family.
const foilMismatches = (page, packIndex) =>
  page.evaluate(
    async ({ module, key, i, boxData, packModels }) => {
      const { unboxingHoloRarity, packSlotKind } = await import(module);
      const { loadBoxData } = await import(boxData);
      const { resolvePackModel } = await import(packModels);
      const saved = JSON.parse(localStorage.getItem(key));
      const { box, cards, setInfo } = await loadBoxData(saved.boxKey);
      const byId = new Map(cards.map((card) => [card.id, card]));
      const packModel = resolvePackModel(box.packModelKey, cards, setInfo);
      const ids = saved.packs[i];
      return [...document.querySelectorAll('.bb-summary__card')].flatMap((node) => {
        const k = Number(node.dataset.cardIndex);
        const card = byId.get(ids[k]);
        const want = unboxingHoloRarity(card, packSlotKind(packModel, k, card));
        const holo = node.querySelector('.card[data-rarity]');
        const got = holo ? holo.dataset.rarity : null;
        return (want || null)?.toLowerCase() === got?.toLowerCase() ? [] : [`card ${k + 1} ${card?.rarity}: want ${want}, got ${got}`];
      });
    },
    { module: MODULE, key: STORAGE_KEY, i: packIndex, boxData: BOX_DATA, packModels: PACK_MODELS_MODULE }
  );

const topIndex = (page) =>
  page.evaluate(() => {
    const top = document.querySelector('.bb-pcard.is-top');
    return top ? Number(top.dataset.cardIndex) : null;
  });

// Is the top card showing its back? The flip's z axis points away from the camera (m33 < 0).
const topFaceDown = (page) =>
  page.evaluate(() => {
    const flip = document.querySelector('.bb-pcard.is-top .bb-pcard__flip');
    return !!flip && new DOMMatrix(getComputedStyle(flip).transform).m33 < 0;
  });

const topFlipped = (page) =>
  page.evaluate(() => !!document.querySelector('.bb-pcard.is-top')?.classList.contains('is-flipped'));

const hitsFaceDown = [];

// One card: a hit turns over first (and must start face down), then the card is swiped off. A hit
// the hit strip already turned over is only swiped.
const swipeOne = async (page, packIndex, tiers, { drag = false } = {}) => {
  const k = await topIndex(page);
  if (tiers[packIndex][k] >= 2 && !(await topFlipped(page))) {
    hitsFaceDown.push(await topFaceDown(page));
    await press(page, '.bb-pcard.is-top');
    await page.waitForFunction(() => document.querySelector('.bb-pcard.is-top')?.classList.contains('is-flipped'), null, { timeout: 6000 });
    await page.waitForTimeout(500);
  }
  if (drag) {
    const box = await page.locator('.bb-pcard.is-top').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(box.x + box.width / 2 - step * box.width * 0.05, y + step);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  } else {
    await press(page, '.bb-pcard.is-top');
  }
  const last = k === 9;
  await page.waitForFunction(
    ([n, done]) =>
      done ? !!document.querySelector('.bb-summary') : Number(document.querySelector('.bb-pcard.is-top')?.dataset.cardIndex) === n,
    [k + 1, last],
    { timeout: 6000 }
  );
  await page.waitForTimeout(tiers[packIndex][k + 1] >= 1 ? 420 : 160);
};

const waitView = (page, view) =>
  page.waitForFunction((v) => document.getElementById('bbUnboxing')?.dataset.view === v, view, { timeout: 8000 });

const openToSpread = async (page, { drag = false } = {}) => {
  if (drag) {
    await dragTear(page, '.bb-box__wrap');
    await page.waitForTimeout(700);
  }
  if ((await session(page)).unboxing.wrapTorn !== true) await press(page, '.bb-box__wrap');
  await page.waitForTimeout(500);
  await press(page, '.bb-box__open');
  await page.waitForTimeout(1300);
  await press(page, '.bb-deck');
  await waitView(page, 'spread');
  await page.waitForTimeout(1400);
};

// The 3D rip hands the stack to the DOM pocket once it settles (`.is-awaiting-3d` until then).
const tearPack = async (page, packIndex, { drag = false } = {}) => {
  const top = `.bb-bigpack[data-pack="${packIndex}"] .bb-pack__top`;
  if (drag) await dragTear(page, top);
  else await press(page, top);
  await waitView(page, 'pocket');
  await page.waitForSelector('.bb-pocket:not(.is-awaiting-3d)', { timeout: 10000 });
  await page.waitForTimeout(900);
};

const renderMode = (page) => page.evaluate(() => document.getElementById('bbUnboxing')?.dataset.render);
// SwiftShader compiles the pack shaders on the CPU: after a reload that competes with every card
// image, the stage can take well over 10 s to come up (a GPU takes a fraction of that).
const waitRender = (page, mode) =>
  page
    .waitForFunction((m) => document.getElementById('bbUnboxing')?.dataset.render === m, mode, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);

// The canvas draws nothing when hiding it leaves the screenshot byte-identical.
const canvasDrawsNothing = async (page) => {
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
const canvasEmptiesWithin = async (page, ms) => {
  for (let waited = 0; waited <= ms; waited += 400) {
    if (await canvasDrawsNothing(page)) return true;
    await page.waitForTimeout(400);
  }
  return false;
};

// ── Pass 1: the whole box on video ─────────────────────────────────────────────────────
const recordVideo = async (browser) => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: '.agent/scratch/vid', size: VIEWPORT },
  });
  const page = await preparePage(context);
  await openFreshBox(page);
  const tiers = await tiersOf(page);
  const packsAtOpen = JSON.stringify((await session(page)).packs);
  console.log('tiers', JSON.stringify(tiers));

  const uiHidden = await page.evaluate(
    () =>
      !!document.getElementById('bbUnboxingStage') &&
      getComputedStyle(document.querySelector('.native-deck-builder-inner')).visibility === 'hidden'
  );
  check(uiHidden, 'stage: the opening is fullscreen and the builder UI is hidden');
  await openToSpread(page, { drag: true });
  const spread = await page.evaluate(() => ({
    packs: document.querySelectorAll('.bb-spread .bb-bigpack').length,
    tearable: [...document.querySelectorAll('.bb-bigpack .bb-pack__top')].map((node) => node.closest('.bb-bigpack').dataset.pack),
  }));
  check(spread.packs === 4 && spread.tearable.join() === '0', 'the four packs fill the screen and only pack 1 can be opened', JSON.stringify(spread));
  check(await waitRender(page, '3d'), '055: the spread draws in WebGL (data-render=3d)', await renderMode(page));

  for (const packIndex of [0, 1, 2, 3]) {
    await tearPack(page, packIndex, { drag: packIndex === 0 });
    if (packIndex === 0) {
      check(await canvasEmptiesWithin(page, 2000), '055 hand-off: the pocket is DOM and the canvas draws nothing');
      for (let k = 0; k < 3; k += 1) await swipeOne(page, 0, tiers, { drag: k === 0 });
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForSelector('.bb-pcard.is-top', { timeout: 30000 });
      await page.waitForTimeout(600);
      const counts = await page.evaluate(() => ({
        seen: document.querySelectorAll('.bb-pocket__thumb').length,
        top: Number(document.querySelector('.bb-pcard.is-top')?.dataset.cardIndex),
        stage: !!document.getElementById('bbUnboxingStage'),
      }));
      check(counts.seen === 3 && counts.top === 3 && counts.stage, 'row 4 reload mid-pack: 3 seen, card 4 on top, still fullscreen', JSON.stringify(counts));
    }
    if (packIndex === 1) {
      await press(page, '[data-control="reveal-all"]');
      await page.waitForSelector('.bb-summary', { timeout: 30000 });
    } else {
      while (!(await page.$('.bb-summary'))) await swipeOne(page, packIndex, tiers);
    }
    await page.waitForTimeout(900);
    const saved = (await session(page)).packs[packIndex];
    const shown = await summaryIds(page);
    check(shown.join() === saved.join(), `row 13 pack ${packIndex + 1} summary ids match session.packs in order`, `${shown.length} shown`);
    const foil = await foilMismatches(page, packIndex);
    check(foil.length === 0, `foil pack ${packIndex + 1}: holo family per card matches unboxingHoloRarity`, foil.join('; '));
    if (packIndex < 3) {
      await press(page, '[data-control="next-pack"]');
      await waitView(page, 'spread');
      await page.waitForTimeout(700);
    }
    if (packIndex === 0) {
      await page.reload();
      await waitView(page, 'spread');
      const back3d = await waitRender(page, '3d');
      const focus = await page.evaluate(() => document.querySelector('.bb-spread')?.dataset.focus);
      check(back3d && focus === '1', '055 row 13 reload at the spread: back in WebGL on pack 2', `${await renderMode(page)} focus ${focus}`);
      await page.waitForTimeout(700);
    }
  }
  // Some boxes and seeds open no tier-2+ card at all; then there is nothing to check.
  check(
    hitsFaceDown.every(Boolean),
    'row 14 every hit starts face down until tapped',
    hitsFaceDown.length ? `${hitsFaceDown.length} hits` : 'no hits in this box and seed'
  );
  await press(page, '[data-control="build"]');
  await page.waitForFunction(() => !document.getElementById('bbUnboxingStage'), null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  const saved = await session(page);
  check(JSON.stringify(saved.packs) === packsAtOpen, 'row 13 the scene never rewrote session.packs');
  check(saved.boxKey === BOX, 'the opened box is the one asked for', saved.boxKey);
  // The editor starts on the box's own deck: 40 cards, or a 23-card Evolution pack (design 054 rows 14–15).
  const startingDeck = saved.evolutionPack && !saved.energy ? saved.evolutionPack.length : 40;
  const back = await page.evaluate(() => ({
    pool: !document.getElementById('buildBattlePoolPanel')?.hidden,
    ui: getComputedStyle(document.querySelector('.native-deck-builder-inner')).visibility,
    deck: document.querySelector('.native-deck-builder-pane-side')?.innerText.match(/\b(\d+)\s*\/\s*40\b/)?.[1],
    left: [...document.querySelectorAll('#buildBattlePoolPanel .bb-pool-card:not(.is-unlimited)')].reduce(
      (sum, tile) => sum + (Number.parseInt(tile.querySelector('.bb-pool-badge')?.textContent, 10) || 0),
      0
    ),
  }));
  check(
    back.pool && back.ui === 'visible' && back.deck === String(startingDeck) && back.left === 40,
    `UI returns on the Pool tab with the ${startingDeck}-card box deck loaded and the 40 pack cards left to add`,
    JSON.stringify(back)
  );
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  renameSync(await video.path(), VIDEO);
  console.log('video', VIDEO);
  return { tiers };
};

// ── Pass 2: frozen frames at each beat's start / peak / settle ─────────────────────────
const FREEZE = () => {
  window.__beat = {
    mark() {
      this.before = new Set(document.getAnimations());
      this.t0 = document.timeline.currentTime;
      this.starts = new Map();
    },
    // A chained phase (the promo after the unwrap, the fly after the promo) starts on its own
    // animation's clock: wait for it, then time the strip from it.
    async startAt(selector) {
      for (;;) {
        const animation = document.querySelector(selector)?.getAnimations()[0];
        if (animation) {
          await animation.ready.catch(() => {});
          this.t0 = animation.startTime ?? document.timeline.currentTime;
          return;
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
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

const shoot = (page, file) => page.screenshot({ path: join(OUT, file) });

/**
 * Trigger one beat and write its three frames. Real time runs to `peakMs` before the peak seek,
 * so timer-driven steps have happened when it is shot.
 */
const strip = async (page, name, trigger, { peakMs, settleMs = 300, phase }) => {
  await page.evaluate(() => window.__beat.mark());
  await trigger();
  if (phase) await page.evaluate((sel) => window.__beat.startAt(sel), phase);
  const started = Date.now();
  await page.evaluate(() => window.__beat.seek(0));
  await shoot(page, `${name}-start.png`);
  const wait = peakMs + 40 - (Date.now() - started);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.evaluate((ms) => window.__beat.seek(ms), peakMs);
  await shoot(page, `${name}-peak.png`);
  await page.evaluate(() => window.__beat.resume());
  await page.waitForTimeout(settleMs);
  await shoot(page, `${name}-settle.png`);
  console.log('strip', name);
};

const recordStrips = async (browser, { tiers }) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(FREEZE);
  const page = await preparePage(context);
  await openFreshBox(page);
  const ms = await page.evaluate(async (module) => {
    const m = await import(module);
    return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number'));
  }, MODULE);

  await strip(page, 'tear', () => press(page, '.bb-box__wrap'), { peakMs: ms.WRAP_TEAR_MS * 0.2 });
  await strip(page, 'lid', () => press(page, '.bb-box__open'), { peakMs: ms.LID_OPEN_MS / 2, settleMs: ms.TRAY_TOTAL_MS + 200 });
  await strip(page, 'promo', () => press(page, '.bb-deck'), { phase: '.bb-promo__lift', peakMs: ms.PROMO_LIFT_MS / 2, settleMs: 100 });
  // The 3D fly and rip run on the WebGL clock, which WAAPI seeks cannot freeze: pass 4 shoots them.
  const gl = (await renderMode(page)) === '3d';
  if (gl) {
    await waitView(page, 'spread');
    await page.waitForSelector('.bb-spread:not(.is-landing)', { timeout: 10000 });
    await page.waitForTimeout(400);
    await shoot(page, 'fly-3d-landed.png');
  } else {
    await strip(page, 'fly', async () => {}, {
      phase: '.bb-bigpack__fly',
      peakMs: ms.PACK_FLY_MS * 0.5 + ms.PACK_FLY_STAGGER_MS,
      settleMs: 600,
    });
  }
  // The pack holding the box's best card is opened for the swipe and hit strips.
  const best = tiers.map((pack) => Math.max(...pack));
  const hitPack = best.indexOf(Math.max(...best));
  for (let packIndex = 0; packIndex < hitPack; packIndex += 1) {
    await tearPack(page, packIndex);
    await press(page, '[data-control="reveal-all"]');
    await page.waitForSelector('.bb-summary', { timeout: 30000 });
    await page.waitForTimeout(600);
    await press(page, '[data-control="next-pack"]');
    await waitView(page, 'spread');
    await page.waitForTimeout(700);
  }
  if (gl) {
    await tearPack(page, hitPack);
  } else {
    await strip(page, 'cut', () => press(page, `.bb-bigpack[data-pack="${hitPack}"] .bb-pack__top`), {
      phase: '.bb-pocket__stack',
      peakMs: ms.POCKET_CUT_MS / 2,
      settleMs: 900,
    });
  }
  await strip(page, 'swipe', () => press(page, '.bb-pcard.is-top'), { peakMs: ms.SWIPE_AWAY_MS / 2, settleMs: 300 });
  const hitCard = tiers[hitPack].indexOf(best[hitPack]);
  while ((await topIndex(page)) < hitCard) await swipeOne(page, hitPack, tiers);
  await shoot(page, 'hit-waiting.png');
  await strip(page, `hit-t${best[hitPack]}`, () => press(page, '.bb-pcard.is-top'), { peakMs: ms.HIT_FLIP_MS * 0.55, settleMs: 400 });
  while (!(await page.$('.bb-summary'))) await swipeOne(page, hitPack, tiers);
  await page.waitForTimeout(1200);
  await shoot(page, 'summary.png');
  console.log('hit', JSON.stringify({ pack: hitPack, card: hitCard, tier: best[hitPack] }));
  await context.close();
};

// ── Pass 3: phone width (row 16) ────────────────────────────────────────────────────────
const recordPhone = async (browser) => {
  const width = 390;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await preparePage(context);
  await openFreshBox(page);
  const tiers = await tiersOf(page);
  await openToSpread(page);
  await page.screenshot({ path: join(OUT, 'phone-390-spread.png') });
  await tearPack(page, 0);
  for (let k = 0; k < 3; k += 1) await swipeOne(page, 0, tiers);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollWidth <= width, 'row 16 no horizontal scroll at 390 px', `scrollWidth ${scrollWidth}`);
  await page.screenshot({ path: join(OUT, 'phone-390-pocket.png') });
  await context.close();
};

// ── Pass 4: the 3D rip on a stepped clock (design 055) ──────────────────────────────────
// Playwright's fake clock drives requestAnimationFrame and performance.now, so a paused clock
// stepped with runFor lands each WebGL frame exactly where the poses put it.
const recordRip3d = async (browser) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await preparePage(context);
  await page.clock.install();
  await openFreshBox(page);
  await openToSpread(page);
  if (!(await waitRender(page, '3d'))) {
    check(false, '055 pass 4: the spread draws in WebGL', await renderMode(page));
    await context.close();
    return;
  }
  await page.waitForSelector('.bb-spread:not(.is-landing)', { timeout: 10000 });
  const ms = await page.evaluate(async (module) => {
    const m = await import(module);
    return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number'));
  }, PACK3D_MODULE);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  const step = async (totalMs, frame = 16) => {
    const total = Math.round(totalMs);
    for (let run = 0; run < total; run += frame) await page.clock.runFor(Math.min(frame, total - run));
  };
  await step(64);
  await shoot(page, 'rip3d-spread.png');

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
  await shoot(page, 'rip3d-peel-30.png');
  await dragTo(0.35, 0.5);
  await page.mouse.up();
  await step(ms.RIP_FINISH_MS);
  await shoot(page, 'rip3d-rip.png');
  await step(ms.STRIP_FLIGHT_MS * 0.5);
  await shoot(page, 'rip3d-strip-flight.png');
  await step(ms.STRIP_FLIGHT_MS * (ms.CARDS_RISE_AT - 0.5) + ms.CARDS_RISE_MS * 0.6);
  await shoot(page, 'rip3d-cards-rising.png');

  // Step until the DOM pocket takes over; the last awaiting frame is "before".
  let handedOff = false;
  for (let i = 0; i < 500 && !handedOff; i += 1) {
    const s = await page.evaluate(() => ({
      view: document.getElementById('bbUnboxing')?.dataset.view,
      awaiting: !!document.querySelector('.bb-pocket.is-awaiting-3d'),
    }));
    handedOff = s.view === 'pocket' && !s.awaiting;
    if (s.awaiting) await shoot(page, 'rip3d-handoff-before.png');
    if (!handedOff) await step(8, 8);
  }
  await step(32);
  await shoot(page, 'rip3d-handoff-after.png');
  check(handedOff, '055 pass 4: the stepped rip hands off to the DOM pocket');
  check(await canvasDrawsNothing(page), '055 pass 4: after the hand-off the canvas draws nothing');
  console.log('strip', 'rip3d');
  await context.close();
};

// ── Pass 5: fallbacks (design 055 rows 1, 6, 14) ────────────────────────────────────────
// Counts requestAnimationFrame calls made from the stage module.
const COUNT_STAGE_RAF = () => {
  window.__stageRaf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    if (/native-deck-builder-pack3d\.js/.test(new Error().stack || '')) window.__stageRaf += 1;
    return raf(callback);
  };
};

const checkReducedMotion = async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(() => localStorage.setItem('ptcg-reduce-motion', '1'));
  await context.addInitScript(COUNT_STAGE_RAF);
  const page = await preparePage(context);
  await openFreshBox(page);
  await openToSpread(page);
  const gl = await waitRender(page, '3d');
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__stageRaf);
  await page.waitForTimeout(1000);
  const loops = (await page.evaluate(() => window.__stageRaf)) - before;
  check(gl && loops < 3, '055 row 6 reduced motion: static 3D packs, no stage rAF loop at rest', `${loops} stage rAF calls in 1 s`);
  await dragTear(page, '.bb-bigpack.is-focus .bb-pack__top');
  const landed = await page
    .waitForSelector('.bb-pocket:not(.is-awaiting-3d)', { timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  check(landed, '055 row 6 reduced motion: the rip lands on the pocket at once');
  await page.waitForTimeout(300);
  await shoot(page, 'reduced-after-rip.png');
  check(await canvasDrawsNothing(page), '055 row 6 reduced motion: after the hand-off the canvas draws nothing');
  await context.close();
};

const checkNoWebgl = async () => {
  const browser = await chromium.launch(launchOptions(NO_GL_ARGS));
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await preparePage(context);
    await openFreshBox(page);
    await openToSpread(page);
    await page.waitForTimeout(1500);
    const dom = await page.evaluate(() => ({
      render: document.getElementById('bbUnboxing')?.dataset.render,
      canvas: !!document.querySelector('.bb-gl'),
    }));
    check(dom.render === 'dom' && !dom.canvas, '055 row 1 no WebGL: the DOM scene, no canvas', JSON.stringify(dom));
    await tearPack(page, 0, { drag: true });
    check((await topIndex(page)) === 0, '055 row 1 no WebGL: the DOM tear lands on the pocket');
    await context.close();
  } finally {
    await browser.close();
  }
};

const checkMountCycles = async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await preparePage(context);
  const warnings = [];
  page.on('console', (m) => /Too many active WebGL contexts/i.test(m.text()) && warnings.push(m.text()));
  await page.goto(PAGE_URL);
  await page.waitForSelector('#buildBattleOpenBox', { state: 'visible', timeout: 30000 });
  const result = await page.evaluate(async (module) => {
    const { mountUnboxingScene } = await import(module);
    const core = '/src/setup/deck-builder/core/build-battle';
    const { getBuildBattleBox } = await import(`${core}/box-catalog.mjs`);
    const { boxSkin } = await import(`${core}/unboxing.mjs`);
    const { unboxingLabels } = await import(`${core}/build-battle-view.mjs`);
    // The vendored Phantasmal Flames box: its packs are image fronts the stage can draw.
    const box = getBuildBattleBox('phantasmal-flames');
    const look = {
      skin: boxSkin({ box }),
      labels: unboxingLabels(box, 'Phantasmal Flames'),
      seriesName: 'Mega Evolution',
      setName: 'Phantasmal Flames',
      playLevel: true,
    };
    const unboxing = { stage: 'deckShown', wrapTorn: true, packsTorn: [false, false, false, false], revealed: [0, 0, 0, 0] };
    const host = document.createElement('div');
    host.className = 'build-battle-window';
    const live = document.createElement('div');
    live.className = 'db-live';
    host.append(live);
    document.body.append(host);
    let reached3d = 0;
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const root = document.createElement('div');
      root.className = 'bb-scene bb-scene--stage';
      live.replaceChildren(root);
      const scene = mountUnboxingScene({
        root,
        getUnboxing: () => unboxing,
        dispatch: () => null,
        packs: Array.from({ length: 4 }, () => Array(10).fill(null)),
        packModel: { slots: [] },
        classOf: () => null,
        look,
        seed: 42,
        promo: null,
        onBuildDeck: () => {},
      });
      const start = performance.now();
      while (root.dataset.render !== '3d' && performance.now() - start < 3000) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      if (root.dataset.render === '3d') reached3d += 1;
      scene.unmount();
    }
    const leftover = document.querySelectorAll('.bb-gl').length;
    host.remove();
    return { reached3d, leftover };
  }, SCENE_MODULE);
  check(
    result.reached3d === 20 && result.leftover === 0 && warnings.length === 0,
    '055 row 14: 20 mount/unmount cycles each reach 3D, leave no canvas, no context warning',
    JSON.stringify({ ...result, warnings: warnings.length })
  );
  await context.close();
};

function launchOptions(args) {
  const executablePath = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  return executablePath ? { executablePath, args } : { args };
}

const browser = await chromium.launch(launchOptions(GL_ARGS));
mkdirSync('out', { recursive: true });
try {
  const plan = await recordVideo(browser);
  if (process.env.STRIPS !== '0') {
    await recordStrips(browser, plan);
    await recordPhone(browser);
    await recordRip3d(browser);
  }
  await checkReducedMotion(browser);
  await checkMountCycles(browser);
  await checkNoWebgl();
} finally {
  await browser.close();
}
console.log(failures.length ? `FAILED: ${failures.join('; ')}` : 'ok');
process.exitCode = failures.length ? 1 : 0;
