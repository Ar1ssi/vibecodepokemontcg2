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
//
// Env: SEED (42) · BASE_URL (http://localhost:4100) · OUT (.agent/scratch/unboxing[-<seed>])
//      CARD_IMG: a local image or URL served for every TCGdex card face (sandboxes where TCGdex is blocked)
//      SIO_JS: a local socket.io.min.js (default: the server's own /socket.io/socket.io.js)
//      CHROMIUM: a browser binary (the cloud container has /opt/pw-browsers/chromium)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { extname, join } from 'node:path';

const SEED = Number(process.env.SEED ?? 42);
const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
const OUT = process.env.OUT || `.agent/scratch/unboxing${SEED === 42 ? '' : `-${SEED}`}`;
const VIDEO = `out/unboxing${SEED === 42 ? '' : `-${SEED}`}.webm`;
const PAGE_URL = `${BASE_URL}/build-and-battle?seed=${SEED}&e2e=1`;
const STORAGE_KEY = 'ptcg-sim.build-battle.v1';
const VIEWPORT = { width: 1280, height: 800 };
const MODULE = '/src/setup/deck-builder/core/build-battle/unboxing.mjs';
// Set cards come from TCGdex, the deck promos from Limitless.
const CARD_HOSTS = ['https://assets.tcgdex.net/**', 'https://limitlesstcg.nyc3.digitaloceanspaces.com/**'];

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
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
  await page.waitForSelector('#buildBattleOpenBox', { state: 'visible', timeout: 30000 });
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

const hitsFaceDown = [];

// One card: a hit turns over first (and must start face down), then the card is swiped off.
const swipeOne = async (page, packIndex, tiers, { drag = false } = {}) => {
  const k = await topIndex(page);
  if (tiers[packIndex][k] >= 2) {
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

const tearPack = async (page, packIndex, { drag = false } = {}) => {
  const top = `.bb-bigpack[data-pack="${packIndex}"] .bb-pack__top`;
  if (drag) await dragTear(page, top);
  else await press(page, top);
  await waitView(page, 'pocket');
  await page.waitForTimeout(900);
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

  for (const packIndex of [0, 1, 2, 3]) {
    await tearPack(page, packIndex, { drag: packIndex === 0 });
    if (packIndex === 0) {
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
  }
  check(hitsFaceDown.length > 0 && hitsFaceDown.every(Boolean), 'row 14 every hit starts face down until tapped', `${hitsFaceDown.length} hits`);
  await press(page, '[data-control="build"]');
  await page.waitForFunction(() => !document.getElementById('bbUnboxingStage'), null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  check(JSON.stringify((await session(page)).packs) === packsAtOpen, 'row 13 the scene never rewrote session.packs');
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
    back.pool && back.ui === 'visible' && back.deck === '40' && back.left === 40,
    'UI returns on the Pool tab with the 40-card box deck loaded and the 40 pack cards left to add',
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
  await strip(page, 'fly', async () => {}, {
    phase: '.bb-bigpack__fly',
    peakMs: ms.PACK_FLY_MS * 0.5 + ms.PACK_FLY_STAGGER_MS,
    settleMs: 600,
  });
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
  await strip(page, 'cut', () => press(page, `.bb-bigpack[data-pack="${hitPack}"] .bb-pack__top`), {
    phase: '.bb-pocket__stack',
    peakMs: ms.POCKET_CUT_MS / 2,
    settleMs: 900,
  });
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

const browser = await chromium.launch(
  process.env.CHROMIUM || existsSync('/opt/pw-browsers/chromium') ? { executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' } : {}
);
mkdirSync('out', { recursive: true });
try {
  const plan = await recordVideo(browser);
  if (process.env.STRIPS !== '0') {
    await recordStrips(browser, plan);
    await recordPhone(browser);
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `FAILED: ${failures.join('; ')}` : 'ok');
process.exitCode = failures.length ? 1 : 0;
