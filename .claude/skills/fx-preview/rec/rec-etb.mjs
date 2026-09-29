// Design 057 video check: the Elite Trainer Box opening in the Standard builder tab. The box opens
// from the Shelf (#etbOpen-<key>) onto the same fullscreen stage as Build & Battle (052/055): shrink
// wrap, a lift-off lid, a 16-item tray (promo pouch, props, the nine-pack fan), the nine packs flying
// into a 3D spread, each pack ripped and swiped in the pocket, and the hand-off to the Collection tab.
// Pass 1 records the whole box at real speed to out/etb[-<seed>].webm and checks rows 6 (reload
// mid-pack resumes in 3D, no leaked context), 15 (summary ids equal session.packs; the collection
// equals the packs plus the promo), 16 (every hit starts face down) and the nine packs' bounds.
// Pass 2 (skip with STRIPS=0) writes <OUT>/<beat>-{start,peak,settle}.png: DOM beats are frozen
// with WAAPI seeks, the WebGL fly and rip are stepped on Playwright's fake clock.
// Pass 3 checks row 14 at 390 px (no horizontal scroll at the tray and the spread).
// Pass 4 checks the fallbacks: no WebGL (the DOM scene plays to the collection, with the DOM cut
// strip), reduced motion (every beat lands at once), FX off (no WebGL context) and row 10 (card
// hosts answering 404: the card back with the card's name).
//
// Env: ETB (phantasmal-flames-etb) · SEED (42) · BASE_URL (http://localhost:4100)
//      OUT (.agent/scratch/etb[-<etb>][-<seed>]) · STRIPS=0 skips passes 2 and 3
//      CARD_IMG: a local image or URL served for every card face and the sleeve scan (sandboxes
//      where the art hosts are blocked); the faces are then a stand-in
//      SIO_JS: a local socket.io.min.js · CHROMIUM: a browser binary
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import {
  CARD_HOSTS,
  COUNT_STAGE_RAF,
  FREEZE,
  GL_ARGS,
  NO_GL_ARGS,
  PACK3D_MODULE,
  SLEEVE_HOST,
  UNBOXING_MODULE,
  canvasDrawsNothing,
  canvasEmptiesWithin,
  clockStepper,
  dragTear,
  launchOptions,
  makeCheck,
  makeStrips,
  moduleNumbers,
  openFresh,
  pauseClockSoon,
  preparePage as prepareDrivenPage,
  press,
  renderMode,
  ripOnSteppedClock,
  summaryIds,
  swipeOne,
  topFlipped,
  topIndex,
  waitIdle,
  waitRender,
  waitView,
} from './lib/unboxing-drive.mjs';

const ETB = process.env.ETB || 'phantasmal-flames-etb';
const SEED = Number(process.env.SEED ?? 42);
const BASE_URL = process.env.BASE_URL || 'http://localhost:4100';
const NAME_TAG = `${ETB === 'phantasmal-flames-etb' ? '' : `-${ETB}`}${SEED === 42 ? '' : `-${SEED}`}`;
const OUT = process.env.OUT || `.agent/scratch/etb${NAME_TAG}`;
const VIDEO = `out/etb${NAME_TAG}.webm`;
const PAGE_URL = `${BASE_URL}/deck-builder?etb=${encodeURIComponent(ETB)}&seed=${SEED}&e2e=1`;
const COLLECTION_KEY = 'ptcg-sim.collection.v1';
const SESSION_KEY = 'ptcg-sim.etb.v1';
const VIEWPORT = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const HOSTS = [...CARD_HOSTS, SLEEVE_HOST];
const ETB_DIR = '/src/setup/deck-builder/core/elite-trainer-box';
const BOX_DATA = '/src/setup/deck-builder/core/build-battle/box-data.mjs';
const PACK_MODELS_MODULE = '/src/setup/deck-builder/core/build-battle/pack-models.mjs';
// Row 6 (design 057): "pack 5 with 3 revealed".
const RELOAD_PACK = 4;
const RELOAD_SEEN = 3;

const { check, failures } = makeCheck(`etb ${SEED}`);
const { shoot, strip } = makeStrips(OUT);

const preparePage = (context, cards = 'stand-in') => prepareDrivenPage(context, { baseUrl: BASE_URL, hosts: HOSTS, cards });
const openFreshEtb = (page) =>
  openFresh(page, { url: PAGE_URL, storageKeys: [COLLECTION_KEY, SESSION_KEY], openSelector: `#etbOpen-${ETB}` });

const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

// Counts the canvases a page asked for a WebGL context (an init script).
const COUNT_GL_CONTEXTS = () => {
  window.__glContexts = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/i.test(String(type)) && !this.__glCounted) {
      this.__glCounted = true;
      window.__glContexts += 1;
    }
    return getContext.call(this, type, ...rest);
  };
};

/** The ETB row, its promo and the scene timings, read from the page's own modules. */
const etbFacts = (page) =>
  page.evaluate(
    async ({ dir, key, unboxing }) => {
      const { getEtb } = await import(`${dir}/etb-catalog.mjs`);
      const { ETB_PROMOS } = await import(`${dir}/etb-promos.generated.mjs`);
      const { trayRiseMs } = await import(unboxing);
      const etb = getEtb(key);
      return {
        promoId: etb.promoId,
        promoName: ETB_PROMOS[key]?.name ?? null,
        packCount: etb.packCount,
        // The ETB tray: 7 props then the packs (design 057 § Scene beat 3).
        trayCount: 7 + etb.packCount,
        trayMs: trayRiseMs(7 + etb.packCount),
      };
    },
    { dir: ETB_DIR, key: ETB, unboxing: UNBOXING_MODULE }
  );

/** The hit tier of every card of the saved session's packs, as the scene's `classOf` sees it. */
const tiersOf = (page) =>
  page.evaluate(
    async ({ unboxing, dir, key, boxData, packModels }) => {
      const { hitTierFor, packSlotKind } = await import(unboxing);
      const { getEtb } = await import(`${dir}/etb-catalog.mjs`);
      const { loadSetData } = await import(boxData);
      const { cardClass, resolvePackModel } = await import(packModels);
      const saved = JSON.parse(localStorage.getItem(key));
      const etb = getEtb(saved.etbKey);
      const { cards, setInfo } = await loadSetData(etb.setId);
      const byId = new Map(cards.map((card) => [card.id, card]));
      const packModel = resolvePackModel(etb.packModelKey, cards, setInfo);
      return saved.packs.map((pack) =>
        pack.map((id, index) => {
          const card = byId.get(id);
          return hitTierFor(card, packSlotKind(packModel, index, card), cardClass(card, etb.era, setInfo));
        })
      );
    },
    { unboxing: UNBOXING_MODULE, dir: ETB_DIR, key: SESSION_KEY, boxData: BOX_DATA, packModels: PACK_MODELS_MODULE }
  );

/** Row 15: the stored collection's card counts equal the multiset of the packs plus the promo. */
const collectionMatches = async (page, packs, promoId) => {
  const collection = await stored(page, COLLECTION_KEY);
  const want = {};
  for (const id of [...packs.flat(), promoId]) want[id] = (want[id] || 0) + 1;
  const got = collection?.cards || {};
  const ids = [...new Set([...Object.keys(want), ...Object.keys(got)])];
  const diff = ids.filter((id) => want[id] !== got[id]).map((id) => `${id}: want ${want[id] ?? 0}, got ${got[id] ?? 0}`);
  const total = Object.values(got).reduce((sum, n) => sum + n, 0);
  return {
    ok: diff.length === 0 && collection?.products?.length === 1,
    detail: JSON.stringify({ total, unique: Object.keys(got).length, products: collection?.products?.length ?? 0, diff: diff.slice(0, 3) }),
    total,
  };
};

const packBounds = (page) =>
  page.evaluate(() => {
    const rects = [...document.querySelectorAll('.bb-spread .bb-bigpack')].map((n) => n.getBoundingClientRect());
    return {
      count: rects.length,
      focus: Number(document.querySelector('.bb-spread')?.dataset.focus),
      minLeft: Math.round(Math.min(...rects.map((r) => r.left))),
      maxRight: Math.round(Math.max(...rects.map((r) => r.right))),
      width: innerWidth,
    };
  });
const packsInside = (b) => b.count > 0 && b.minLeft >= 0 && b.maxRight <= b.width;

const scrollWidths = (page) =>
  page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    stage: document.querySelector('.bb-stage')?.scrollWidth ?? null,
  }));

// ── Driving the box ─────────────────────────────────────────────────────────────────────
const tearWrap = async (page, { drag = false } = {}) => {
  if (drag) {
    await dragTear(page, '.bb-box__wrap');
    await page.waitForTimeout(700);
  }
  if ((await stored(page, SESSION_KEY)).unboxing.wrapTorn !== true) await press(page, '.bb-box__wrap');
  await page.waitForSelector('.bb-box__open', { timeout: 8000 });
  await page.waitForTimeout(300);
};

const liftLid = async (page, facts) => {
  await press(page, '.bb-box__open');
  await page.waitForSelector('.etb-tray', { timeout: 8000 });
  await page.waitForTimeout(facts.trayMs + 300);
};

const openPouch = async (page) => {
  await press(page, '.etb-pouch');
  await page.waitForSelector('.bb-promo__lift', { timeout: 8000 });
  // Lift 620 + hold 900 + settle 360 ms, then a beat.
  await page.waitForTimeout(2200);
};

const takePacksOut = async (page) => {
  await press(page, '.etb-packs');
  await waitView(page, 'spread', 15000);
  await page.waitForSelector('.bb-spread:not(.is-landing)', { timeout: 15000 });
  await waitIdle(page);
  await page.waitForTimeout(600);
};

// The rip (3D) or cut (DOM) of one pack, up to the pocket with its stack handed to the DOM.
const tearPack = async (page, packIndex, { drag = false } = {}) => {
  const top = `.bb-bigpack[data-pack="${packIndex}"] .bb-pack__top`;
  await page.waitForSelector(top, { timeout: 15000 });
  await waitIdle(page);
  if (drag) await dragTear(page, top);
  else await press(page, top);
  await waitView(page, 'pocket', 15000);
  await page.waitForSelector('.bb-pocket:not(.is-awaiting-3d)', { timeout: 15000 });
  await page.waitForTimeout(600);
};

const revealAll = async (page) => {
  await press(page, '[data-control="reveal-all"]');
  await page.waitForSelector('.bb-summary', { timeout: 60000 });
  await page.waitForTimeout(700);
};

const nextPack = async (page) => {
  await press(page, '[data-control="next-pack"]');
  await waitView(page, 'spread', 15000);
  await page.waitForTimeout(900);
};

const seeCollection = async (page) => {
  await press(page, '[data-control="build"]');
  await page.waitForSelector('#etbCollectionPanel:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(() => !document.getElementById('bbUnboxingStage'), null, { timeout: 8000 });
  await page.waitForTimeout(1200);
};

// ── Pass 1: the whole box on video ─────────────────────────────────────────────────────
const recordVideo = async (browser) => {
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: '.agent/scratch/vid', size: VIEWPORT } });
  const page = await preparePage(context);
  const errors = [];
  const glWarnings = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => /Too many active WebGL contexts/i.test(m.text()) && glWarnings.push(m.text()));
  await openFreshEtb(page);
  const facts = await etbFacts(page);
  const opened = await stored(page, SESSION_KEY);
  const collectionAtOpen = JSON.stringify(await stored(page, COLLECTION_KEY));
  const tiers = await tiersOf(page);
  console.log('tiers', JSON.stringify(tiers));

  const stage = await page.evaluate(() => ({
    stage: !!document.getElementById('bbUnboxingStage'),
    uiHidden: !!document.querySelector('.db-live.bb-unboxing-active'),
    lid: document.getElementById('bbUnboxing')?.dataset.lid,
  }));
  check(stage.stage && stage.uiHidden && stage.lid === 'lift', 'stage: fullscreen, the builder UI hidden, a lift-off lid', JSON.stringify(stage));
  check(
    opened.etbKey === ETB && opened.seed === SEED && opened.packs.length === facts.packCount,
    `the session holds the asked box and seed, ${facts.packCount} packs`,
    `${opened.etbKey} seed ${opened.seed}`
  );

  await tearWrap(page, { drag: true });
  await liftLid(page, facts);
  const trayItems = await page.evaluate(() => document.querySelectorAll('.etb-tray .bb-tray__item').length);
  check(trayItems === facts.trayCount, 'the tray rises every item (props, then the pack fan)', `${trayItems} items`);

  await openPouch(page);
  const promo = await page.evaluate(() => document.querySelector('.bb-promo__lift')?.dataset.previewCardId);
  check(promo === facts.promoId, 'the pouch holds the box promo', promo);

  // Props: sleeves turn over; dice and coin roll twice (each throw reseeds); the guide goes on and
  // off again (on, See collection would open Browse Sets instead); the code card turns over.
  await press(page, '.etb-prop--sleeves');
  await page.waitForTimeout(900);
  const sleeveLine = await page.evaluate(() => document.querySelector('.etb-prop--sleeves .bb-tray__label')?.textContent);
  check(/ sleeves · in your sleeves now$/.test(sleeveLine || ''), 'the sleeves turn over with their line', sleeveLine);
  for (let roll = 0; roll < 2; roll += 1) {
    await press(page, '.etb-prop--dice');
    await page.waitForTimeout(1000);
  }
  await press(page, '.etb-prop--guide');
  await page.waitForTimeout(500);
  const guideOn = await page.evaluate(() => document.querySelector('.etb-prop--guide')?.getAttribute('aria-pressed'));
  await press(page, '.etb-prop--guide');
  await page.waitForTimeout(500);
  const guideOff = await page.evaluate(() => document.querySelector('.etb-prop--guide')?.getAttribute('aria-pressed'));
  check(guideOn === 'true' && guideOff === 'false', 'the guide goes on and off again', `${guideOn} → ${guideOff}`);
  await press(page, '.etb-prop--code');
  await page.waitForTimeout(900);

  check(await waitRender(page, '3d'), '055: the stage draws in WebGL before the packs leave', await renderMode(page));
  await takePacksOut(page);
  const spread = await packBounds(page);
  check(spread.count === facts.packCount && spread.focus === 0 && packsInside(spread), 'the nine packs sit inside the viewport at focus 0', JSON.stringify(spread));
  check((await renderMode(page)) === '3d', "the spread draws in 3D (#bbUnboxing[data-render='3d'])", await renderMode(page));

  const hitsFaceDown = [];
  for (let packIndex = 0; packIndex < facts.packCount; packIndex += 1) {
    if (packIndex === 4) {
      const queue = await packBounds(page);
      check(queue.focus === 4 && packsInside(queue), 'the queue sits inside the viewport at focus 4', JSON.stringify(queue));
    }
    await tearPack(page, packIndex, { drag: packIndex === 0 });
    if (packIndex === 0) check(await canvasEmptiesWithin(page, 2000), '055 hand-off: the pocket is DOM and the canvas draws nothing');
    if (packIndex === RELOAD_PACK) {
      for (let k = 0; k < RELOAD_SEEN; k += 1) await swipeOne(page, tiers[packIndex], { hitsFaceDown });
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForSelector('.bb-pcard.is-top', { timeout: 40000 });
      const back3d = await waitRender(page, '3d');
      await page.waitForTimeout(800);
      const resumed = await page.evaluate(() => ({
        seen: document.querySelectorAll('.bb-pocket__thumb').length,
        top: Number(document.querySelector('.bb-pcard.is-top')?.dataset.cardIndex),
        stage: !!document.getElementById('bbUnboxingStage'),
        canvases: document.querySelectorAll('.bb-gl').length,
      }));
      check(
        back3d && resumed.seen === RELOAD_SEEN && resumed.top === RELOAD_SEEN && resumed.stage && resumed.canvases === 1 && glWarnings.length === 0,
        `row 6 reload in pack ${RELOAD_PACK + 1} with ${RELOAD_SEEN} seen: resumes there in 3D, one canvas, no context warning`,
        JSON.stringify({ render: await renderMode(page), ...resumed, warnings: glWarnings.length })
      );
    }
    // Packs with a hit, the first pack and the reloaded one are swiped card by card (row 16 needs
    // each hit on top, face down); the rest use Reveal all.
    const swipeAll = packIndex === 0 || packIndex === RELOAD_PACK || tiers[packIndex].some((tier) => tier >= 2);
    if (swipeAll) {
      let first = true;
      while (!(await page.$('.bb-summary'))) {
        await swipeOne(page, tiers[packIndex], { drag: packIndex === 0 && first, hitsFaceDown });
        first = false;
      }
      await page.waitForTimeout(900);
    } else {
      await revealAll(page);
    }
    const shown = await summaryIds(page);
    check(
      shown.join() === opened.packs[packIndex].join(),
      `row 15 pack ${packIndex + 1} summary ids match session.packs in order`,
      `${shown.length} shown${swipeAll ? '' : ' (Reveal all)'}`
    );
    if (packIndex < facts.packCount - 1) await nextPack(page);
  }
  check(
    hitsFaceDown.every(Boolean),
    'row 16 every hit starts face down until tapped',
    hitsFaceDown.length ? `${hitsFaceDown.length} hits` : 'no hits in this box and seed'
  );
  const done = await page.evaluate(() => ({
    hint: document.querySelector('.bb-hint')?.textContent,
    controls: [...document.querySelectorAll('.bb-controls button')].map((n) => n.dataset.control).join(),
  }));
  check(/^Everything is in your collection: \d+ cards · /.test(done.hint || '') && done.controls === 'build,open-another', 'done: the summary line, See collection and Open another', JSON.stringify(done));
  const saved = await stored(page, SESSION_KEY);
  check(JSON.stringify(saved.packs) === JSON.stringify(opened.packs), 'row 15 the scene never rewrote session.packs');

  await seeCollection(page);
  const after = await page.evaluate(() => ({
    panel: document.getElementById('etbCollectionPanel')?.textContent.replace(/\s+/g, ' ').slice(0, 60),
    canvases: document.querySelectorAll('.bb-gl').length,
    ui: !document.querySelector('.db-live.bb-unboxing-active'),
  }));
  const collection = await collectionMatches(page, opened.packs, facts.promoId);
  check(collection.ok, 'row 15 the collection holds exactly the packs plus the promo', collection.detail);
  check(JSON.stringify(await stored(page, COLLECTION_KEY)) === collectionAtOpen, 'row 15 the scene never wrote the collection (it is written at Open)');
  check(
    after.ui && after.canvases === 0 && after.panel?.includes(`${collection.total} cards`) && (await stored(page, SESSION_KEY)) === null,
    'See collection: the Collection tab shows the box, no canvas left, the session cleared',
    JSON.stringify(after)
  );
  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  renameSync(await video.path(), VIDEO);
  console.log('video', VIDEO);
  return { tiers, facts };
};

// ── Pass 2: frozen frames at each beat's start / peak / settle ─────────────────────────
// WAAPI beats freeze with window.__beat; the WebGL fly and rip step Playwright's fake clock, which
// runs at real speed until paused.
const recordStrips = async (browser, { tiers, facts }) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(FREEZE);
  const page = await preparePage(context);
  await page.clock.install();
  await openFreshEtb(page);
  const ms = await moduleNumbers(page, UNBOXING_MODULE);
  const ms3d = await moduleNumbers(page, PACK3D_MODULE);
  const step = clockStepper(page);

  await strip(page, 'wrap', () => press(page, '.bb-box__wrap'), { peakMs: ms.WRAP_TEAR_MS * 0.4, settleMs: 500 });

  // The lid lifts off, then the tray rises on its own clock (a chained phase).
  await page.waitForSelector('.bb-box__open', { timeout: 8000 });
  await page.evaluate(() => window.__beat.mark());
  await press(page, '.bb-box__open');
  await page.evaluate(() => window.__beat.seek(0));
  await shoot(page, 'lid-start.png');
  await page.waitForTimeout(ms.LID_LIFT_MS / 2);
  await page.evaluate((t) => window.__beat.seek(t), ms.LID_LIFT_MS / 2);
  await shoot(page, 'lid-peak.png');
  await page.evaluate((t) => window.__beat.seek(t), ms.LID_LIFT_MS);
  await shoot(page, 'lid-settle.png');
  await page.evaluate(() => window.__beat.resume());
  await page.evaluate(() => window.__beat.startAt('.etb-tray .bb-tray__item'));
  const trayStarted = Date.now();
  await page.evaluate(() => window.__beat.seek(0));
  await shoot(page, 'tray-start.png');
  await page.waitForTimeout(Math.max(0, facts.trayMs / 2 - (Date.now() - trayStarted)));
  await page.evaluate((t) => window.__beat.seek(t), facts.trayMs / 2);
  await shoot(page, 'tray-peak.png');
  await page.evaluate(() => window.__beat.resume());
  await page.waitForTimeout(300);
  await shoot(page, 'tray-settle.png');
  console.log('strip', 'lid, tray');

  // The promo's peak is the crest of its tier 2 flare: fired at the lift's midpoint, the flare bell
  // (hitFlipPose) peaks 0.55 of HIT_FLIP_MS later.
  await strip(page, 'promo', () => press(page, '.etb-pouch'), {
    phase: '.bb-promo__lift',
    peakMs: ms.PROMO_LIFT_MS * 0.5 + ms.HIT_FLIP_MS * 0.55,
    settleMs: ms.PROMO_HOLD_MS + 560,
    clip: '.bb-promo',
    pad: 120,
  });
  await shoot(page, 'tray-promo.png');
  await strip(page, 'dice', () => press(page, '.etb-prop--dice'), { peakMs: ms.DICE_MS / 2, settleMs: 400, clip: '.etb-prop--dice', pad: 90 });
  await strip(page, 'coin', () => press(page, '.etb-prop--dice'), { peakMs: ms.COIN_FLIP_MS / 2, settleMs: 400, clip: '.etb-prop--dice', pad: 90 });
  await press(page, '.etb-prop--sleeves');
  await press(page, '.etb-prop--code');
  await page.waitForTimeout(1000);
  await shoot(page, 'props.png');

  // The nine packs fly into the spread on the WebGL clock.
  if (!(await waitRender(page, '3d'))) {
    check(false, 'pass 2: the stage draws in WebGL', await renderMode(page));
    await context.close();
    return;
  }
  await pauseClockSoon(page);
  await press(page, '.etb-packs');
  await step(32);
  await shoot(page, 'spread-start.png');
  await step(ms.PACK_FLY_MS * 0.5 + ms.PACK_FLY_STAGGER_MS * 4 - 32);
  await shoot(page, 'spread-peak.png');
  for (let i = 0; i < 400 && (await page.$('.bb-spread.is-landing, .bb-scene__top')); i += 1) await step(16);
  await step(64);
  await shoot(page, 'spread-settle.png');
  await page.clock.resume();
  console.log('strip', 'spread');

  // The pack holding the box's best card is ripped on the stepped clock, then its hit flips.
  const best = tiers.map((pack) => Math.max(...pack));
  const hitPack = best.indexOf(Math.max(...best));
  for (let packIndex = 0; packIndex < hitPack; packIndex += 1) {
    await tearPack(page, packIndex);
    await revealAll(page);
    await nextPack(page);
  }
  await page.waitForSelector('.bb-spread:not(.is-landing)', { timeout: 15000 });
  const ripName = { spread: 'start', rip: 'peak', 'handoff-after': 'settle' };
  const { handedOff } = await ripOnSteppedClock(page, { ms: ms3d, shoot, file: (key) => `rip-${ripName[key] || key}.png` });
  await page.clock.resume();
  check(handedOff, `pass 2: the stepped rip of pack ${hitPack + 1} hands off to the DOM pocket`);
  console.log('strip', 'rip');
  await page.waitForTimeout(600);

  const hitsFaceDown = [];
  const packTiers = tiers[hitPack];
  const hitCard = packTiers.indexOf(best[hitPack]);
  if (best[hitPack] >= 2) {
    while ((await topIndex(page)) < hitCard) await swipeOne(page, packTiers, { hitsFaceDown });
    await shoot(page, 'hit-waiting.png');
    // A tap while the card is still settling is queued, so the strip times the flip's own clock.
    await strip(page, 'hit', () => press(page, '.bb-pcard.is-top'), {
      phase: '.bb-pcard.is-top .bb-pcard__flip',
      peakMs: ms.HIT_FLIP_MS * 0.55,
      settleMs: 500,
    });
  } else {
    console.log('hit', 'none: no card of tier 2 or more in this box and seed');
  }
  // The last card leaves on the strip's trigger; the summary deals in on its own clock.
  const lastCard = packTiers.length - 1;
  while ((await topIndex(page)) < lastCard) await swipeOne(page, packTiers, { hitsFaceDown });
  if (packTiers[lastCard] >= 2 && !(await topFlipped(page))) {
    await press(page, '.bb-pcard.is-top');
    await page.waitForFunction(() => document.querySelector('.bb-pcard.is-top')?.classList.contains('is-flipped'), null, { timeout: 6000 });
    await page.waitForTimeout(500);
  }
  await strip(page, 'summary', () => press(page, '.bb-pcard.is-top'), {
    phase: '.bb-summary__card',
    peakMs: ms.SWIPE_AWAY_MS / 2 + ms.SUMMARY_STAGGER_MS * 5,
    settleMs: 900,
  });
  console.log('hit', JSON.stringify({ pack: hitPack + 1, card: hitCard + 1, tier: best[hitPack] }));
  await context.close();
};

// ── Pass 3: phone width (row 14) ────────────────────────────────────────────────────────
const recordPhone = async (browser, { facts }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await preparePage(context);
  await openFreshEtb(page);
  await tearWrap(page);
  await liftLid(page, facts);
  const atTray = await scrollWidths(page);
  check(atTray.doc === PHONE.width && (atTray.stage === null || atTray.stage <= PHONE.width), 'row 14 no horizontal scroll at 390 px: the tray', JSON.stringify(atTray));
  await shoot(page, 'phone-390-tray.png');
  await openPouch(page);
  await takePacksOut(page);
  const atSpread = await scrollWidths(page);
  const bounds = await packBounds(page);
  check(atSpread.doc === PHONE.width && (atSpread.stage === null || atSpread.stage <= PHONE.width), 'row 14 no horizontal scroll at 390 px: the spread', JSON.stringify(atSpread));
  check(bounds.count === facts.packCount && packsInside(bounds), 'row 14 the nine packs sit inside 390 px', JSON.stringify(bounds));
  await shoot(page, 'phone-390-spread.png');
  await context.close();
};

// ── Pass 4: fallbacks ───────────────────────────────────────────────────────────────────
// No WebGL: the DOM scene plays the whole box to the Collection tab; pack 1's cut is a strip.
const checkNoWebgl = async ({ facts }) => {
  const browser = await chromium.launch(launchOptions(NO_GL_ARGS));
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await context.addInitScript(FREEZE);
    const page = await preparePage(context);
    await openFreshEtb(page);
    const ms = await moduleNumbers(page, UNBOXING_MODULE);
    const opened = await stored(page, SESSION_KEY);
    await tearWrap(page);
    await liftLid(page, facts);
    await openPouch(page);
    await takePacksOut(page);
    const dom = await page.evaluate(() => ({
      render: document.getElementById('bbUnboxing')?.dataset.render,
      canvas: !!document.querySelector('.bb-gl'),
    }));
    check(dom.render === 'dom' && !dom.canvas, 'no WebGL: the DOM scene, no canvas', JSON.stringify(dom));
    mkdirSync(OUT, { recursive: true });
    await waitIdle(page);
    await strip(page, 'cut', () => press(page, '.bb-bigpack[data-pack="0"] .bb-pack__top'), {
      phase: '.bb-pocket__stack',
      peakMs: ms.POCKET_CUT_MS / 2,
      settleMs: 900,
    });
    for (let packIndex = 0; packIndex < facts.packCount; packIndex += 1) {
      if (packIndex > 0) await tearPack(page, packIndex);
      await revealAll(page);
      if (packIndex < facts.packCount - 1) await nextPack(page);
    }
    await seeCollection(page);
    const collection = await collectionMatches(page, opened.packs, facts.promoId);
    check(collection.ok, 'no WebGL: the box plays to the Collection tab, the collection is the packs plus the promo', collection.detail);
    await context.close();
  } finally {
    await browser.close();
  }
};

// Reduced motion: each beat lands at once; the 3D spread is still (no stage rAF loop at rest).
const checkReducedMotion = async (browser, { facts }) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(() => localStorage.setItem('ptcg-reduce-motion', '1'));
  await context.addInitScript(COUNT_STAGE_RAF);
  const page = await preparePage(context);
  await openFreshEtb(page);
  const landing = {};
  const timed = async (name, trigger, landed) => {
    const started = Date.now();
    await trigger();
    await page.waitForFunction(landed, null, { timeout: 8000 }).catch(() => {});
    landing[name] = Date.now() - started;
  };
  await timed('wrap', () => press(page, '.bb-box__wrap'), () => !!document.querySelector('.bb-box__open'));
  await timed('lid', () => press(page, '.bb-box__open'), () => document.querySelectorAll('.etb-tray .bb-tray__item').length > 0);
  await timed('promo', () => press(page, '.etb-pouch'), () => !!document.querySelector('.bb-promo__lift'));
  await timed('packs', () => press(page, '.etb-packs'), () => !!document.querySelector('.bb-spread:not(.is-landing)'));
  const settled = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running' && !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length
  );
  check(Object.values(landing).every((t) => t < 1500) && settled === 0, 'reduced motion: wrap, lid, promo and packs each land at once', JSON.stringify({ ...landing, running: settled }));
  const gl = await waitRender(page, '3d');
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__stageRaf);
  await page.waitForTimeout(1000);
  const loops = (await page.evaluate(() => window.__stageRaf)) - before;
  check(gl && loops < 3, 'reduced motion: static 3D packs, no stage rAF loop at rest', `${loops} stage rAF calls in 1 s`);
  await dragTear(page, '.bb-bigpack.is-focus .bb-pack__top');
  const landed = await page
    .waitForSelector('.bb-pocket:not(.is-awaiting-3d)', { timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  check(landed, 'reduced motion: the rip lands on the pocket at once');
  await page.waitForTimeout(300);
  await shoot(page, 'reduced-after-rip.png');
  check(await canvasDrawsNothing(page), 'reduced motion: after the hand-off the canvas draws nothing');
  await context.close();
};

// FX off (the stored ptcg-fx-off setting): the scene plays in the DOM and never asks for WebGL.
const checkFxOff = async (browser, { facts }) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(() => localStorage.setItem('ptcg-fx-off', '1'));
  await context.addInitScript(COUNT_GL_CONTEXTS);
  const page = await preparePage(context);
  await openFreshEtb(page);
  await tearWrap(page);
  await liftLid(page, facts);
  await openPouch(page);
  await takePacksOut(page);
  await page.waitForTimeout(3000);
  const off = await page.evaluate(() => ({
    render: document.getElementById('bbUnboxing')?.dataset.render,
    canvases: document.querySelectorAll('.bb-gl').length,
    contexts: window.__glContexts,
  }));
  check(off.render === 'dom' && off.canvases === 0 && off.contexts === 0, 'FX off: the DOM spread, 0 WebGL contexts', JSON.stringify(off));
  await context.close();
};

// Row 10: every card host answers 404; the promo and each pack card show the card back with the name.
const checkCardFallback = async (browser, { facts }) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await preparePage(context, '404');
  await openFreshEtb(page);
  await tearWrap(page);
  await liftLid(page, facts);
  await openPouch(page);
  const promo = await page.evaluate(() => {
    const fallback = document.querySelector('.bb-promo__lift .bb-card-fallback');
    const back = fallback?.querySelector('img');
    return {
      name: fallback?.querySelector('.bb-card-fallback__name')?.textContent ?? null,
      back: !!back && back.complete && back.naturalWidth > 0,
    };
  });
  check(promo.name === facts.promoName && promo.back, 'row 10 promo art 404: the card back with its name', JSON.stringify(promo));
  await shoot(page, 'row10-promo.png');
  await takePacksOut(page);
  await tearPack(page, 0);
  await revealAll(page);
  const cells = await page.evaluate(() =>
    [...document.querySelectorAll('.bb-summary__card')].map((cell) => ({
      name: cell.querySelector('.bb-card-fallback__name')?.textContent || '',
      back: !!cell.querySelector('.bb-card-fallback img')?.naturalWidth,
    }))
  );
  const named = cells.filter((cell) => cell.name && cell.name !== 'Card' && cell.back).length;
  check(cells.length > 0 && named === cells.length, 'row 10 card art 404: every pack 1 summary card shows the back with its name', `${named} / ${cells.length}`);
  await shoot(page, 'row10-summary.png');
  await context.close();
};

const browser = await chromium.launch(launchOptions(GL_ARGS));
mkdirSync('out', { recursive: true });
mkdirSync(OUT, { recursive: true });
try {
  const plan = await recordVideo(browser);
  if (process.env.STRIPS !== '0') {
    await recordStrips(browser, plan);
    await recordPhone(browser, plan);
  }
  await checkReducedMotion(browser, plan);
  await checkFxOff(browser, plan);
  await checkCardFallback(browser, plan);
  await checkNoWebgl(plan);
} finally {
  await browser.close();
}
console.log(failures.length ? `FAILED: ${failures.join('; ')}` : 'ok');
process.exitCode = failures.length ? 1 : 0;
