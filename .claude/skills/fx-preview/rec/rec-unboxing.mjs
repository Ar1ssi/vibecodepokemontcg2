// Design 052 video check: the Build & Battle unboxing scene in the builder tab.
// Pass 1 records a whole box at real speed to out/unboxing[-<seed>].webm and checks rows 4
// (reload mid-pack), 13 (pool integrity) and 14 (no face before the flip midpoint).
// Pass 2 (no video) freezes each beat at start / peak / settle and writes
// <OUT>/<beat>-{start,peak,settle}.png for tear, lid, promo, pack-tear, flip-t0, flip-hit, collapse.
// Pass 3 shoots <OUT>/phone-390.png mid-pack and checks row 16 (no horizontal scroll).
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
  // Row 14 probe: when a flyer's front first gets content, how far through its flight is it?
  await page.addInitScript(() => {
    window.__faceAt = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const front = record.target;
        if (!front.classList?.contains('bb-flyer__front') || front.dataset.seen) continue;
        front.dataset.seen = '1';
        const flight = front.parentElement?.getAnimations()[0];
        const timing = flight?.effect?.getComputedTiming();
        // The front shows only once it faces the camera: the flyer's z axis points away (m33 < 0).
        const matrix = new DOMMatrix(getComputedStyle(front.parentElement).transform);
        window.__faceAt.push(
          flight ? { t: flight.currentTime / timing.duration, totalMs: timing.duration, facing: matrix.m33 < 0 } : null
        );
      }
    }).observe(document, { childList: true, subtree: true });
  });
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
const tiersOf = (page) =>
  page.evaluate(async ({ module, key }) => {
    const { hitTierFor, packSlotKind } = await import(module);
    const { BUILD_BATTLE_BOXES } = await import('/src/setup/deck-builder/core/build-battle/box-catalog.mjs');
    const { BUILD_BATTLE_SET_CARDS } = await import('/src/setup/deck-builder/core/build-battle/build-battle.generated.mjs');
    const box = BUILD_BATTLE_BOXES[0];
    const byId = new Map(BUILD_BATTLE_SET_CARDS[box.setId].map((card) => [card.id, card]));
    const { packs } = JSON.parse(localStorage.getItem(key));
    return packs.map((pack) =>
      pack.map((id, index) => hitTierFor(byId.get(id), packSlotKind(box.packModel, index, byId.get(id))))
    );
  }, { module: MODULE, key: STORAGE_KEY });

const fanIds = (page, packIndex) =>
  page.evaluate(
    (i) =>
      [...document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`)]
        .sort((a, b) => a.dataset.cardIndex - b.dataset.cardIndex)
        .map((node) => node.dataset.previewCardId),
    packIndex
  );

// Every fanned card wears foil exactly when unboxingHoloRarity says so, in that family.
const foilMismatches = (page, packIndex) =>
  page.evaluate(
    async ({ module, key, i }) => {
      const { unboxingHoloRarity, packSlotKind } = await import(module);
      const { BUILD_BATTLE_BOXES } = await import('/src/setup/deck-builder/core/build-battle/box-catalog.mjs');
      const { BUILD_BATTLE_SET_CARDS } = await import('/src/setup/deck-builder/core/build-battle/build-battle.generated.mjs');
      const box = BUILD_BATTLE_BOXES[0];
      const byId = new Map(BUILD_BATTLE_SET_CARDS[box.setId].map((card) => [card.id, card]));
      const ids = JSON.parse(localStorage.getItem(key)).packs[i];
      return [...document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`)].flatMap((node) => {
        const k = Number(node.dataset.cardIndex);
        const card = byId.get(ids[k]);
        const want = unboxingHoloRarity(card, packSlotKind(box.packModel, k, card));
        const holo = node.querySelector('.card[data-rarity]');
        const got = holo ? holo.dataset.rarity : null;
        return (want || null)?.toLowerCase() === got?.toLowerCase() ? [] : [`card ${k + 1} ${card?.rarity}: want ${want}, got ${got}`];
      });
    },
    { module: MODULE, key: STORAGE_KEY, i: packIndex }
  );

const revealed = (page, packIndex) =>
  page.evaluate((i) => document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`).length, packIndex);

// Click the stack once and wait for that card to land in the fan.
const flipOne = async (page, packIndex, tier) => {
  const before = await revealed(page, packIndex);
  await press(page, `.bb-reveal[data-pack="${packIndex}"] .bb-stack`);
  await page.waitForFunction(
    ([i, n]) => document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`).length > n,
    [packIndex, before],
    { timeout: 6000 }
  );
  await page.waitForTimeout(tier >= 2 ? 500 : 140);
};

const waitStage = (page, stage) =>
  page.waitForFunction((s) => document.getElementById('bbUnboxing')?.dataset.stage === s, stage, { timeout: 6000 });

// ── Pass 1: the whole box on video, plus rows 4, 13 and 14 ─────────────────────────────
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

  await dragTear(page, '.bb-box__wrap');
  await page.waitForTimeout(700);
  if ((await session(page)).unboxing.wrapTorn !== true) await press(page, '.bb-box__wrap');
  await page.waitForTimeout(500);
  await press(page, '.bb-box__open');
  await waitStage(page, 'opened');
  await page.waitForTimeout(1200);
  await press(page, '.bb-deck');
  await waitStage(page, 'deckShown');
  await page.waitForTimeout(1800);

  // Pack order: the plain packs first, the one holding the box's best hit last.
  const best = tiers.map((pack) => Math.max(...pack));
  const order = [0, 1, 2, 3].sort((a, b) => best[a] - best[b] || a - b);
  for (const [n, packIndex] of order.entries()) {
    const top = `.bb-pack[data-pack="${packIndex}"] .bb-pack__top`;
    if (n === 0) await dragTear(page, top);
    else await press(page, top);
    await page.waitForSelector(`.bb-reveal[data-pack="${packIndex}"] .bb-stack`);
    await page.waitForTimeout(700);

    if (n === 0) {
      for (let k = 0; k < 3; k += 1) await flipOne(page, packIndex, tiers[packIndex][k]);
      await page.waitForTimeout(400);
      await page.reload();
      await page.waitForSelector(`.bb-reveal[data-pack="${packIndex}"] .bb-stack`, { timeout: 30000 });
      await page.waitForTimeout(600);
      const counts = await page.evaluate(
        (i) => ({
          fan: document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`).length,
          stack: document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-stack__card`).length,
        }),
        packIndex
      );
      check(counts.fan === 3 && counts.stack === 7, 'row 4 reload mid-pack remounts 3 in the fan, 7 on the stack', JSON.stringify(counts));
    }
    const isLast = n === order.length - 1;
    if (n === 1) {
      await press(page, '[data-control="reveal-all"]');
      await page.waitForFunction((i) => document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`).length === 10, packIndex, { timeout: 15000 });
    } else {
      const lastToClick = isLast ? 9 : 10;
      for (let k = await revealed(page, packIndex); k < lastToClick; k += 1) {
        await flipOne(page, packIndex, tiers[packIndex][k]);
      }
    }
    const saved = (await session(page)).packs[packIndex];
    const shown = await fanIds(page, packIndex);
    check(
      shown.every((id, k) => id === saved[k]) && shown.length === (isLast ? 9 : 10),
      `row 13 pack ${packIndex + 1} fan ids match session.packs in order`,
      `${shown.length} shown`
    );
    const foil = await foilMismatches(page, packIndex);
    check(foil.length === 0, `foil pack ${packIndex + 1}: holo family per card matches unboxingHoloRarity`, foil.join('; '));
    if (isLast) {
      await press(page, `.bb-reveal[data-pack="${packIndex}"] .bb-stack`);
      await waitStage(page, 'done');
      await page.waitForTimeout(1600);
    } else {
      await page.waitForTimeout(500);
    }
  }
  check(JSON.stringify((await session(page)).packs) === packsAtOpen, 'row 13 the scene never rewrote session.packs');
  const poolShown = await page.evaluate(() => !document.getElementById('buildBattlePoolPanel')?.hidden);
  check(poolShown, 'collapse hands over to the Pool tab');

  const faceAt = await page.evaluate(() => window.__faceAt);
  const phases = await page.evaluate(async (module) => {
    const { cardRevealPhases } = await import(module);
    return [0, 2].map((tier) => cardRevealPhases(tier));
  }, MODULE);
  const flipMidFor = (totalMs) => phases.find((p) => p.totalMs === totalMs)?.flipMid;
  // The face node is added on a timer and the flight runs on the animation clock, which starts a
  // frame or more later; the node may land early as long as the card still shows its back.
  const shownEarly = faceAt.filter((f) => !f || (f.facing && f.t < flipMidFor(f.totalMs) - 0.01));
  const lead = Math.max(...faceAt.map((f) => (f ? (flipMidFor(f.totalMs) - f.t) * f.totalMs : 0)));
  check(
    faceAt.length > 0 && shownEarly.length === 0,
    'row 14 no card face shown before the flip midpoint',
    `${faceAt.length} reveals probed; face node lands up to ${Math.round(lead)} ms of flight before the midpoint, card back still toward the camera`
  );
  const video = page.video();
  await context.close();
  renameSync(await video.path(), VIDEO);
  console.log('video', VIDEO);
  return { tiers, order };
};

// ── Pass 2: frozen frames at each beat's start / peak / settle ─────────────────────────
const FREEZE = () => {
  window.__beat = {
    mark() {
      this.before = new Set(document.getAnimations());
      this.t0 = document.timeline.currentTime;
      this.starts = new Map();
    },
    // A chained phase (the promo after the unwrap, the collapse after the last card) starts on
    // its own animation's clock: wait for it, then time the strip from it.
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
      const list = document.getAnimations().filter((a) => !this.before.has(a));
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

const shoot = async (page, clipSelector, file) => {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), clipSelector);
  const box = await page.locator(clipSelector).first().boundingBox();
  const pad = 24;
  const clip = box && {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(VIEWPORT.width - Math.max(0, box.x - pad), box.width + pad * 2),
    height: Math.min(VIEWPORT.height - Math.max(0, box.y - pad), box.height + pad * 2),
  };
  await page.screenshot({ path: join(OUT, file), ...(clip ? { clip } : { fullPage: true }) });
};

/**
 * Trigger one beat and write its three frames. Real time runs to `peakMs` before the peak seek,
 * so timer-driven steps (the card face at the flip midpoint) have happened when it is shot.
 */
const strip = async (page, name, trigger, { clip, peakMs, settleMs = 300, settleClip = clip, phase }) => {
  await page.evaluate(() => window.__beat.mark());
  await trigger();
  if (phase) await page.evaluate((sel) => window.__beat.startAt(sel), phase);
  const started = Date.now();
  await page.evaluate(() => window.__beat.seek(0));
  await shoot(page, clip, `${name}-start.png`);
  const wait = peakMs + 40 - (Date.now() - started);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.evaluate((ms) => window.__beat.seek(ms), peakMs);
  await shoot(page, clip, `${name}-peak.png`);
  await page.evaluate(() => window.__beat.resume());
  await page.waitForTimeout(settleMs);
  await shoot(page, settleClip, `${name}-settle.png`);
  console.log('strip', name);
};

const recordStrips = async (browser, { tiers, order }) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(FREEZE);
  const page = await preparePage(context);
  await openFreshBox(page);
  const phase = await page.evaluate(async (module) => {
    const m = await import(module);
    return { t0: m.cardRevealPhases(0), hit: m.cardRevealPhases(2), m: Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number')) };
  }, MODULE);
  const ms = phase.m;
  const top = '.bb-scene__top';

  await strip(page, 'tear', () => press(page, '.bb-box__wrap'), { clip: top, peakMs: ms.WRAP_TEAR_MS * 0.2 });
  await strip(page, 'lid', () => press(page, '.bb-box__open'), { clip: top, peakMs: ms.LID_OPEN_MS / 2, settleMs: ms.TRAY_TOTAL_MS + 200 });
  await strip(page, 'promo', () => press(page, '.bb-deck'), { clip: top, phase: '.bb-promo__lift', peakMs: ms.PROMO_LIFT_MS / 2, settleMs: ms.PROMO_LIFT_MS / 2 + 300 });

  const flat = order.flatMap((packIndex) => tiers[packIndex].map((tier, cardIndex) => ({ packIndex, cardIndex, tier })));
  const hit = flat.reduce((a, b) => (b.tier > a.tier ? b : a));
  const hitPack = hit.packIndex;
  const hitRow = `.bb-reveal[data-pack="${hitPack}"]`;
  await strip(page, 'pack-tear', () => press(page, `.bb-pack[data-pack="${hitPack}"] .bb-pack__top`), {
    clip: top,
    settleClip: '#bbUnboxing',
    peakMs: ms.PACK_TEAR_MS / 2,
    settleMs: ms.PACK_SPILL_MS + 300,
  });
  await page.waitForTimeout(300);
  const flipPeak = (p) => p.liftMs + p.flipMs * 0.75;
  const plain = tiers[hitPack].findIndex((tier) => tier === 0);
  for (let k = 0; k < hit.cardIndex; k += 1) {
    if (k === plain) {
      await strip(page, 'flip-t0', () => press(page, `${hitRow} .bb-stack`), { clip: hitRow, peakMs: flipPeak(phase.t0), settleMs: 300 });
    } else {
      await flipOne(page, hitPack, tiers[hitPack][k]);
    }
  }
  const hitPeak = Math.round(phase.hit.totalMs * 0.55);
  await strip(page, `flip-hit-t${hit.tier}`, () => press(page, `${hitRow} .bb-stack`), { clip: hitRow, peakMs: hitPeak, settleMs: 300 });
  console.log('hit', JSON.stringify(hit));

  // Finish the box quickly; the collapse is frozen on the last card of the last pack.
  // "Reveal all" acts on the pack mid-reveal, so each pack is finished before the next is torn.
  const revealAllOf = async (packIndex) => {
    await press(page, '[data-control="reveal-all"]');
    await page.waitForFunction((i) => document.querySelectorAll(`.bb-reveal[data-pack="${i}"] .bb-fan__card`).length === 10, packIndex, { timeout: 15000 });
    await page.waitForTimeout(300);
  };
  await revealAllOf(hitPack);
  const rest = order.filter((i) => i !== hitPack);
  const lastPack = rest.at(-1);
  for (const packIndex of rest) {
    await press(page, `.bb-pack[data-pack="${packIndex}"] .bb-pack__top`);
    await page.waitForSelector(`.bb-reveal[data-pack="${packIndex}"] .bb-stack`);
    await page.waitForTimeout(700);
    if (packIndex !== lastPack) await revealAllOf(packIndex);
  }
  for (let k = 0; k < 9; k += 1) await flipOne(page, lastPack, tiers[lastPack][k]);
  const row = `.bb-reveal[data-pack="${lastPack}"]`;
  await strip(page, 'collapse', () => press(page, `${row} .bb-stack`), {
    clip: '.bb-scene__reveals',
    settleClip: '#bbUnboxing',
    phase: '.bb-reveal',
    peakMs: ms.FAN_COLLAPSE_MS / 2,
    settleMs: 600,
  });
  await context.close();
};

// ── Pass 3: phone width (row 16), mid-pack, one full-page frame ──────────────────────────
const recordPhone = async (browser) => {
  const width = 390;
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await preparePage(context);
  await openFreshBox(page);
  await press(page, '.bb-box__wrap');
  await page.waitForTimeout(600);
  await press(page, '.bb-box__open');
  await waitStage(page, 'opened');
  await page.waitForTimeout(1000);
  await press(page, '.bb-deck');
  await waitStage(page, 'deckShown');
  await page.waitForTimeout(1200);
  await press(page, '.bb-pack[data-pack="0"] .bb-pack__top');
  await page.waitForSelector('.bb-reveal[data-pack="0"] .bb-stack');
  await page.waitForTimeout(700);
  for (let k = 0; k < 3; k += 1) await flipOne(page, 0, 0);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  check(scrollWidth <= width, 'row 16 no horizontal scroll at 390 px', `scrollWidth ${scrollWidth}`);
  await page.screenshot({ path: join(OUT, 'phone-390.png'), fullPage: true });
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
