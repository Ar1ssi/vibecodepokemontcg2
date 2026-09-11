// Regression: leaving a room mid-game while the opponent stays, then rejoining
// the SAME room, must not resurrect the old game on the leaver's board.
// Reported live on Render (server-authoritative): the rejoiner saw
// "YOUR TURN — main phase", a dealt hand and prizes without pressing Set Up,
// plus repeated "The game may be out of sync" warnings.
// Needs a server (PTCG_URL, default :4000). Run it with SERVER_AUTHORITATIVE=1
// to match production; the out-of-sync heartbeat only runs in that mode.
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = `rj-${Date.now()}`;
const DESYNC_TEXT = 'The game may be out of sync';
// Two sync-check heartbeats (SYNC_CHECK_INTERVAL_MS = 30000) plus the 5s peer-log timeout.
const WARNING_WINDOW_MS = Number(process.env.RJ_WARNING_WINDOW_MS || 70000);

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

async function waitFor(page, fn, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  return { page, context, name };
}

const joinRoom = async (client, room) => {
  await client.page.evaluate(([r, u]) => window.__ptcg.joinRoom(r, u), [room, client.name]);
  await waitFor(client.page, () => window.__ptcg.counters().twoPlayer === true);
};

// Read the mode the server told this client on join, not whether a view has
// happened to arrive yet (views are only pushed in response to commands).
const isAuthoritative = (client) =>
  client.page.evaluate(async () =>
    Boolean((await import('/src/state.js')).systemState.serverAuthoritative)
  );

const desyncWarnings = (client) =>
  client.page.evaluate(
    (text) => (document.getElementById('p2Chatbox')?.textContent || '').split(text).length - 1,
    DESYNC_TEXT
  );

const snapshot = (client) =>
  client.page.evaluate(() => {
    const obs = window.__ptcg.observe();
    return {
      phase: obs.phase,
      turnPlayer: obs.turnPlayer,
      fromServer: obs.fromServer,
      hand: window.__ptcg.zone('self', 'hand').count,
      prizes: window.__ptcg.zone('self', 'prizes').count,
      hudHidden: document.getElementById('rulesTurnHUD')?.hidden !== false,
    };
  });

// Real decklists send quantity as a string ("2", "4"), exactly like the live
// sync log. The built-in fixture uses '1' on every row, which hid a server bug
// that loaded one card per row whatever the quantity. 5 rows x '4' = 20 cards.
const loadQuantityDeck = (client, prefix) =>
  client.page.evaluate(async (p) => {
    const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
    const rows = e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]);
    window.__ptcg.loadDeckList(rows);
  }, prefix);

const startGame = async (a, b) => {
  await loadQuantityDeck(a, 'Alpha');
  await loadQuantityDeck(b, 'Bravo');
  const aDeck = await waitFor(a.page, () => {
    const n = window.__ptcg.zone('self', 'deck').count;
    return n >= 20 ? n : 0;
  });
  const bDeck = await waitFor(b.page, () => {
    const n = window.__ptcg.zone('self', 'deck').count;
    return n >= 20 ? n : 0;
  });
  // Client-side count only. The server's own deck size is covered by the
  // loadDeck string-quantity unit test in server/game/__tests__/room.test.mjs;
  // probing it from here needs a pre-setup requestView, which disturbs the
  // coin-flip flow, and views redact the deck anyway.
  T('0a. string-quantity decks are full size on both boards', aDeck === 20 && bDeck === 20,
    `(A=${aDeck}, B=${bDeck})`);
  return playSetup(a, b);
};

// Both players press Set Up and resolve the coin call; resolves truthy once the
// first player has a running game with a dealt hand.
const playSetup = async (a, b) => {
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const deadline = Date.now() + 15000;
  let called = false;
  while (Date.now() < deadline && !called) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    for (const c of [a, b]) {
      if (!called && (await c.page.locator(callBtn).isVisible().catch(() => false))) {
        await c.page.locator(callBtn).click();
        called = true;
      }
    }
    if (!called) await a.page.waitForTimeout(200);
    // In server-authoritative mode the server may already have picked the
    // starter (dealOrder carries it), so no call overlay appears at all.
    if (!called && (await a.page.evaluate(() => window.__ptcg.observe().phase !== 'setup'))) break;
  }

  return waitFor(
    a.page,
    () => window.__ptcg.observe().phase !== 'setup' && window.__ptcg.zone('self', 'hand').count >= 7
  );
};

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'RjA');
  const b = await openClient(browser, 'RjB');

  await joinRoom(a, ROOM);
  await joinRoom(b, ROOM);
  T('0. precondition: a game is running', Boolean(await startGame(a, b)));
  const before = await snapshot(a);
  console.log('   A before leave:', JSON.stringify(before));
  const authoritative = await isAuthoritative(a);
  console.log('   mode:', authoritative ? 'server-authoritative' : 'legacy');

  // A leaves mid-game; B stays seated in the room.
  await a.page.evaluate(() => document.getElementById('leaveRoomButton').click());
  await a.page.waitForTimeout(800);
  await joinRoom(a, ROOM);
  await a.page.waitForTimeout(2500);

  const after = await snapshot(a);
  console.log('   A after rejoin:', JSON.stringify(after));
  const bAfter = await snapshot(b);
  console.log('   B after A rejoined:', JSON.stringify(bAfter));
  T('1. rejoiner is back in setup', after.phase === 'setup', `(phase=${after.phase})`);
  T('2. rejoiner sees no turn HUD', after.hudHidden);
  T('3. rejoiner has no hand dealt', after.hand === 0, `(hand=${after.hand})`);
  T('4. rejoiner has no prizes set', after.prizes === 0, `(prizes=${after.prizes})`);
  // Authoritative only: the server ended the game when A left, so B's board and
  // rules session must be fresh too. Legacy keeps B's own board (unchanged).
  if (authoritative) {
    T('4b. opponent is back in setup', bAfter.phase === 'setup', `(phase=${bAfter.phase})`);
    T('4c. opponent has no hand or prizes', bAfter.hand === 0 && bAfter.prizes === 0,
      `(hand=${bAfter.hand}, prizes=${bAfter.prizes})`);
    T('4d. opponent sees no turn HUD', bAfter.hudHidden);
    // The fresh game must still be playable. The view redacts the deck to
    // { count }, so prove the reload by dealing a new game from it instead.
    // A real player's deck follows them between rooms; the e2e fixture is not a
    // saved deck, so the rejoiner reloads it the way a player would.
    await loadQuantityDeck(a, 'Alpha');
    await a.page.waitForTimeout(800);
    const replayed = await playSetup(a, b);
    const aRe = await snapshot(a);
    const bRe = await snapshot(b);
    console.log('   A after new setup:', JSON.stringify(aRe));
    console.log('   B after new setup:', JSON.stringify(bRe));
    const playable = Boolean(replayed) &&
      aRe.prizes === 6 && bRe.prizes === 6 && aRe.hand >= 7 && bRe.hand >= 7;
    T('4e. a new game can be set up after the reset', playable,
      `(A hand=${aRe.hand} prizes=${aRe.prizes}, B hand=${bRe.hand} prizes=${bRe.prizes})`);
    if (!playable) {
      for (const c of [a, b]) {
        const dbg = await c.page.evaluate(() => ({
          cmdLog: (window.__ptcg.cmdLog || []).slice(-8).map((e) => `${e.clientSeq}:${e.type}`),
          rejections: (window.__ptcg.cmdRejections || []).slice(-5),
          lastRulesEvent: window.__ptcg.lastRulesEvent,
        }));
        console.log(`   debug ${c.name}:`, JSON.stringify(dbg));
      }
    }
  }

  // Count server 'desync' events on both clients for the rest of the run: with
  // hashes computed from the same view on both sides there should be none.
  for (const c of [a, b]) {
    await c.page.evaluate(async () => {
      const { socket } = await import('/src/state.js');
      window.__desyncZones = [];
      socket.on('desync', (data) => window.__desyncZones.push(data?.zoneId ?? null));
    });
  }

  await a.page.waitForTimeout(WARNING_WINDOW_MS);
  const aWarn = await desyncWarnings(a);
  const bWarn = await desyncWarnings(b);
  T('5. no "out of sync" warning on the rejoiner', aWarn === 0, `(count=${aWarn})`);
  T('6. no "out of sync" warning on the opponent', bWarn === 0, `(count=${bWarn})`);

  if (authoritative) {
    const zones = await Promise.all([a, b].map((c) => c.page.evaluate(() => window.__desyncZones)));
    T('7. no server desync reports during play', zones.every((z) => z.length === 0),
      `(A=${JSON.stringify(zones[0])}, B=${JSON.stringify(zones[1])})`);

    // Force a real mismatch and check the recovery path: the client must pull
    // a fresh server view, never ask the peer for its legacy action log.
    const emitted = await a.page.evaluate(async () => {
      const { socket, systemState } = await import('/src/state.js');
      const sent = [];
      const originalEmit = socket.emit.bind(socket);
      socket.emit = (event, ...args) => {
        sent.push(event);
        return originalEmit(event, ...args);
      };
      originalEmit('syncCheck', { roomId: systemState.roomId, zones: { hand: 'bogus' } });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      socket.emit = originalEmit;
      return sent;
    });
    T('8. a real desync recovers via requestView, not the peer log',
      emitted.includes('requestView') && !emitted.includes('requestPeerLog'),
      `(emitted=${JSON.stringify(emitted)})`);
  }
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
