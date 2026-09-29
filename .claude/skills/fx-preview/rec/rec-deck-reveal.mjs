// Design 059 check: deck reveals through the real client pipeline. Each beat pushes
// a server-shaped view + events through applyView with the production advisory hooks
// (handleBeforeApply / handleAdvisoryEvent), so planning, queueing, hand hiding and
// the scene all run as they do in a game. Beats: your 1-card reveal (Ultra Ball),
// the opponent's 2-card reveal (Earthen Vessel), then your hidden search (Quick
// Search: no reveal event, so no scene). Card faces are drawn on a canvas: no network.
// usage: PORT=4100 pnpm start, then node .claude/skills/fx-preview/rec/rec-deck-reveal.mjs
// env: BASE_URL (default http://localhost:4100), CHROMIUM, OUT (default .agent/scratch/deck-reveal),
//      SIO_JS (a local socket.io.min.js when cdn.socket.io is unreachable; see SKILL.md)
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

const { BASE_URL = 'http://localhost:4100', CHROMIUM, OUT = '.agent/scratch/deck-reveal', SIO_JS } = process.env;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: path.join(OUT, 'vid'), size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
if (SIO_JS) {
  await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
}
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);

await page.evaluate(async () => {
  const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
  const { handleBeforeApply, handleAdvisoryEvent } = await import('/src/setup/netcode/advisory-animations.js');
  const { visualRectOf } = await import('/src/setup/image-logic/iframe-rect.mjs');
  const { imageAnchor } = await import('/src/setup/deck-constructor/hydrate-holo.js');
  const face = (label, hue) => {
    const c = document.createElement('canvas');
    c.width = 245;
    c.height = 342;
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${hue} 70% 45%)`;
    g.fillRect(0, 0, 245, 342);
    g.fillStyle = '#fff';
    g.fillRect(14, 14, 217, 150);
    g.fillStyle = '#111';
    g.font = 'bold 26px sans-serif';
    g.fillText(label, 20, 200);
    return c.toDataURL('image/png');
  };
  const card = (instanceId, name, hue) => ({
    instanceId,
    name,
    src: face(name, hue),
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    types: ['Colorless'],
    hp: '70',
  });
  const mine = [card(101, 'Pikachu', 50), card(102, 'Eevee', 30), card(103, 'Snorlax', 200)];
  const revealed = card(131, 'Raichu', 20);
  const hidden = card(133, 'Rare Candy', 280);
  const theirReveal = [card(231, 'Psychic Energy', 290), card(232, 'Psychic Energy 2', 300)];
  const zones = (hand, deckCount, extra = {}) => ({
    active: [extra.active],
    bench: [],
    hand,
    deck: { count: deckCount },
    discard: [],
    prizes: [],
    lostZone: [],
    board: [],
  });
  let version = 500;
  const state = {
    you: [...mine],
    them: [{ instanceId: 201 }, { instanceId: 202 }, { instanceId: 203 }],
    youDeck: 40,
    themDeck: 40,
  };
  const push = (events) =>
    applyView(
      {
        stateVersion: ++version,
        you: { playerId: 'p1', zones: zones(state.you, state.youDeck, { active: card(1, 'Active', 120) }) },
        them: { playerId: 'p2', zones: zones(state.them, state.themDeck, { active: card(2, 'Rival', 0) }) },
      },
      events,
      { onBeforeApply: handleBeforeApply, onAdvisoryEvent: handleAdvisoryEvent }
    );
  push([]);
  const selfDoc = document.getElementById('selfContainer').contentDocument;
  const oppDoc = document.getElementById('oppContainer').contentDocument;
  const centerOf = (r) => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) });
  const frameRect = (doc, el) => {
    const f = doc === selfDoc ? document.getElementById('selfContainer') : document.getElementById('oppContainer');
    const fr = f.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: fr.left + r.left, top: fr.top + r.top, width: r.width, height: r.height };
  };
  // The real hand card's on-screen spot (iframe turn included), as the scene measures it.
  const handAt = (id) => {
    const el = getCardRegistry().get(id)?.element;
    return el?.isConnected ? centerOf(visualRectOf(imageAnchor(el))) : null;
  };
  const trace = (ms, watch = []) => {
    const samples = [];
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0;
        const cards = [...document.querySelectorAll('.fx-deck-reveal .fx-opp-play__card')];
        samples.push({ t: Math.round(t), cards: cards.map((c) => centerOf(c.getBoundingClientRect())), hands: watch.map(handAt) });
        if (t < ms) requestAnimationFrame(tick);
        else resolve(samples);
      };
      tick();
    });
  };
  const hiddenIds = () =>
    [...document.querySelectorAll('.draw-flight-source'), ...selfDoc.querySelectorAll('.draw-flight-source'), ...oppDoc.querySelectorAll('.draw-flight-source')].map(
      (el) => el.dataset?.instanceId || el.querySelector?.('img')?.dataset?.instanceId
    );
  window.__reveal = {
    self() {
      state.you = [...mine, revealed];
      state.youDeck = 39;
      push([
        { type: 'cardMoved', instanceId: 131, from: 'deck', to: 'hand', playerId: 'p1' },
        { type: 'cardsRevealed', playerId: 'p1', cards: [{ instanceId: 131, name: 'Raichu', src: revealed.src }] },
        { type: 'deckShuffled', playerId: 'p1' },
      ]);
      return { hidden: hiddenIds(), deck: centerOf(frameRect(selfDoc, selfDoc.getElementById('deckCover'))) };
    },
    opp() {
      state.them = [...state.them, { instanceId: 231 }, { instanceId: 232 }];
      state.themDeck = 38;
      push([
        { type: 'cardMoved', instanceId: 231, from: 'deck', to: 'hand', playerId: 'p2' },
        { type: 'cardMoved', instanceId: 232, from: 'deck', to: 'hand', playerId: 'p2' },
        {
          type: 'cardsRevealed',
          playerId: 'p2',
          cards: theirReveal.map((c) => ({ instanceId: c.instanceId, name: c.name, src: c.src })),
        },
      ]);
      return { hidden: hiddenIds(), deck: centerOf(frameRect(oppDoc, oppDoc.getElementById('deckCover'))) };
    },
    // The revealed card has a hand card's art, so the hand stacks them and re-lays out mid-scene.
    stack() {
      const twin = { ...mine[0], instanceId: 151 };
      state.you = [...state.you, twin];
      state.youDeck -= 1;
      push([
        { type: 'cardMoved', instanceId: 151, from: 'deck', to: 'hand', playerId: 'p1' },
        { type: 'cardsRevealed', playerId: 'p1', cards: [{ instanceId: 151, name: twin.name, src: twin.src }] },
      ]);
    },
    hiddenSearch() {
      state.you = [...state.you, hidden];
      state.youDeck = 38;
      push([{ type: 'cardMoved', instanceId: 133, from: 'deck', to: 'hand', playerId: 'p1' }, { type: 'deckShuffled', playerId: 'p1' }]);
      return { hidden: hiddenIds(), overlays: document.querySelectorAll('.fx-deck-reveal').length };
    },
    handSpot(user, instanceId) {
      const doc = user === 'self' ? selfDoc : oppDoc;
      const img = doc.querySelector(`img[data-instance-id="${instanceId}"]`);
      return img ? centerOf(frameRect(doc, img)) : null;
    },
    trace,
    overlays: () => document.querySelectorAll('.fx-deck-reveal').length,
    hiddenIds,
    // Frozen pass: a fresh reveal whose animations are paused and stepped by hand.
    // Long timers (backstops) are held back meanwhile, so nothing tears down mid-strip.
    freeze(user) {
      const realTimeout = window.setTimeout;
      window.__realTimeout = realTimeout;
      window.setTimeout = (fn, ms, ...rest) => (ms >= 1500 ? 0 : realTimeout(fn, ms, ...rest));
      if (user === 'self') {
        const extra = card(141, 'Zapdos', 60);
        state.you = [...state.you, extra];
        state.youDeck -= 1;
        push([
          { type: 'cardMoved', instanceId: 141, from: 'deck', to: 'hand', playerId: 'p1' },
          { type: 'cardsRevealed', playerId: 'p1', cards: [{ instanceId: 141, name: 'Zapdos', src: extra.src }] },
        ]);
      } else {
        const extra = card(241, 'Gardevoir', 320);
        state.them = [...state.them, { instanceId: 241 }];
        state.themDeck -= 1;
        push([
          { type: 'cardMoved', instanceId: 241, from: 'deck', to: 'hand', playerId: 'p2' },
          { type: 'cardsRevealed', playerId: 'p2', cards: [{ instanceId: 241, name: 'Gardevoir', src: extra.src }] },
        ]);
      }
    },
    seek(ms) {
      const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.fx-deck-reveal'));
      for (const a of anims) {
        a.pause();
        a.currentTime = ms;
      }
      return anims.length;
    },
    thaw() {
      document.getAnimations().forEach((a) => a.effect?.target?.closest?.('.fx-deck-reveal') && a.finish());
      window.setTimeout = window.__realTimeout;
    },
  };
});

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const report = {};

// Beat 1: your reveal. Frames: leaving the deck, at the reveal spot, landed.
report.self = await page.evaluate(() => window.__reveal.self());
const selfTrace = page.evaluate(() => window.__reveal.trace(1700, [131]));
await page.waitForTimeout(120);
await shot('self-1-leaving-deck');
await page.waitForTimeout(600);
await shot('self-2-reveal-spot');
report.selfTrace = await selfTrace;
await page.waitForTimeout(200);
await shot('self-3-in-hand');
report.selfAfter = {
  overlays: await page.evaluate(() => window.__reveal.overlays()),
  hidden: await page.evaluate(() => window.__reveal.hiddenIds()),
  hand: await page.evaluate(() => window.__reveal.handSpot('self', 131)),
};

// Beat 2: the opponent reveals two cards.
report.opp = await page.evaluate(() => window.__reveal.opp());
const oppTrace = page.evaluate(() => window.__reveal.trace(2400, [231, 232]));
await page.waitForTimeout(140);
await shot('opp-1-leaving-deck');
await page.waitForTimeout(900);
await shot('opp-2-reveal-spot');
await page.waitForTimeout(1000);
await shot('opp-3-into-hand');
report.oppTrace = await oppTrace;
await page.waitForTimeout(300);
await shot('opp-4-landed');
report.oppAfter = {
  overlays: await page.evaluate(() => window.__reveal.overlays()),
  hidden: await page.evaluate(() => window.__reveal.hiddenIds()),
  hands: await page.evaluate(() => [window.__reveal.handSpot('opp', 231), window.__reveal.handSpot('opp', 232)]),
};

// Beat 3: your revealed card joins a stack, so its hand spot moves during the hold.
await page.evaluate(() => window.__reveal.stack());
report.stackTrace = await page.evaluate(() => window.__reveal.trace(1700, [151]));
await page.waitForTimeout(300);

// Beat 4: a hidden search plays no reveal.
report.hiddenSearch = await page.evaluate(() => window.__reveal.hiddenSearch());
await page.waitForTimeout(400);
report.hiddenSearch.overlaysLater = await page.evaluate(() => window.__reveal.overlays());

// Frozen strips: the key moments of one card per side, tiled into one sheet each.
const STRIP_MS = { self: [0, 130, 260, 520, 1000, 1200, 1270, 1420], opp: [0, 130, 260, 520, 1500, 1800, 1870, 2020] };
for (const user of ['self', 'opp']) {
  await page.evaluate((u) => window.__reveal.freeze(u), user);
  await page.waitForFunction(() => document.querySelectorAll('.fx-deck-reveal').length > 0, null, { timeout: 2000 });
  const frames = [];
  for (const ms of STRIP_MS[user]) {
    await page.evaluate((t) => window.__reveal.seek(t), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 970, height: 720 } });
    frames.push({ ms, data: png.toString('base64') });
  }
  await page.evaluate(() => window.__reveal.thaw());
  await page.waitForTimeout(300);
  const sheet = await ctx.newPage();
  await sheet.setViewportSize({ width: 1940, height: 740 });
  await sheet.setContent(
    `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(4,485px);gap:0">${frames
      .map(
        (f) =>
          `<figure style="margin:0;position:relative"><img style="width:485px;height:360px;display:block" src="data:image/png;base64,${f.data}"><figcaption style="position:absolute;left:6px;top:4px;color:#ff0;font:bold 18px sans-serif">${f.ms} ms</figcaption></figure>`
      )
      .join('')}</body>`
  );
  await sheet.screenshot({ path: path.join(OUT, `strip-${user}.png`) });
  await sheet.close();
}

const video = page.video();
await ctx.close();
renameSync(await video.path(), path.join(OUT, 'deck-reveal.webm'));
await browser.close();

const firstWith = (samples) => samples.find((s) => s.cards.length > 0);
const lastWith = (samples) => [...samples].reverse().find((s) => s.cards.length > 0);
const midAt = (samples, t) => samples.find((s) => s.t >= t && s.cards.length > 0);
console.log(
  JSON.stringify(
    {
      errors,
      self: {
        deck: report.self.deck,
        hiddenOnQueue: report.self.hidden,
        start: firstWith(report.selfTrace),
        atSpot: midAt(report.selfTrace, 800),
        end: lastWith(report.selfTrace),
        after: report.selfAfter,
      },
      opp: {
        deck: report.opp.deck,
        hiddenOnQueue: report.opp.hidden,
        start: firstWith(report.oppTrace),
        atSpot: midAt(report.oppTrace, 1200),
        end: lastWith(report.oppTrace),
        after: report.oppAfter,
      },
      stack: { start: firstWith(report.stackTrace), end: lastWith(report.stackTrace) },
      hiddenSearch: report.hiddenSearch,
    },
    null,
    1
  )
);
