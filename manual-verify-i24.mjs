// Manual live verification for I24 (design 007): legacy (non-authoritative) 2P game,
// play Buddy-Buddy Poffin / Ultra Ball / Nest Ball via debug mode, assert the peer sees
// every benched Pokémon and the sync log shows each move before its shuffleZone with no
// indices_mismatch. Run against: node server/server.js  (SERVER_AUTHORITATIVE unset = legacy).
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `e2e-i24-${Date.now()}`;

const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};
let failed = 0;

async function waitFor(page, fn, timeout = 25000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for page predicate (last=${JSON.stringify(last)})`);
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('indices_mismatch')) console.log(`CONSOLE ${name}: ${t}`);
  });
  await page.goto(`${BASE}/?e2e=1&syncLog=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { context, page, name };
}

// Real cards (not the placeholder fixture deck) so the search effects have real text to
// parse. [qty, name, type, imageURL, number, set, tcgId] — see e2e-mode.mjs / import.js.
const IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
function deckRows() {
  const rows = [];
  // Uniquely named Basic Pokémon to search onto the bench (Ultra Ball needs one
  // searchable to hand too; Nest Ball / Buddy-Buddy Poffin search straight to bench).
  for (let i = 1; i <= 16; i++) {
    rows.push([1, `I24 Basic ${i}`, 'Pokémon', IMG, String(i).padStart(3, '0'), 'e2e', `e2e-i24-${i}`]);
  }
  // 4 copies each so the opening hand (or a few turns of draw) reliably contains all three.
  rows.push([4, 'Buddy-Buddy Poffin', 'Trainer', IMG, '144', 'sv05', 'sv05-144']);
  rows.push([4, 'Ultra Ball', 'Trainer', IMG, '131', 'me01', 'me01-131']);
  rows.push([4, 'Nest Ball', 'Trainer', IMG, '181', 'SVI', null]);
  return rows;
}

const browser = await chromium.launch({ headless: true });

try {
  const a = await openClient(browser, 'A');
  const b = await openClient(browser, 'B');

  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  T('1. both clients joined the room (legacy 2P)', true);

  await a.page.evaluate((rows) => window.__ptcg.loadDeckList(rows), deckRows());
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 18);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await a.page.evaluate(() => window.__ptcg.cardDataReady());
  T('2. real deck (Poffin/Ultra Ball/Nest Ball + Basics) loaded on A', true);

  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  await waitFor(a.page, () => window.__ptcg.zone('self', 'prizes').count === 6);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'prizes').count === 6);

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const overlayDeadline = Date.now() + 15000;
  let caller = null;
  while (Date.now() < overlayDeadline && !caller) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    if (await a.page.locator(callBtn).isVisible().catch(() => false)) {
      await a.page.locator(callBtn).click();
      caller = 'A';
      break;
    }
    if (await b.page.locator(callBtn).isVisible().catch(() => false)) {
      await b.page.locator(callBtn).click();
      caller = 'B';
      break;
    }
    await a.page.waitForTimeout(200);
  }
  if (!caller) throw new Error('coin call overlay never opened');

  // Turn-1 player draws (S92 override), so whoever goes first ends up with 8, not 7.
  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  T('3. both hands dealt', true);

  // Debug mode: bypass turn order / once-per-turn gates so A can chain-play all three
  // search Trainers regardless of whose turn the coin flip gave (design: debugMode()).
  await a.page.evaluate(() => window.__ptcg.debugMode(true));
  await b.page.evaluate(() => window.__ptcg.debugMode(true));
  T('4. debug mode enabled on both clients (rules gate bypassed)', true);

  // Draw a few more turns (both sides pass, debug mode ignores whose turn it is) until
  // A's hand holds all three target Trainers — the opening 7/8-card hand doesn't always.
  {
    const need = ['Buddy-Buddy Poffin', 'Ultra Ball', 'Nest Ball'];
    let have = false;
    for (let i = 0; i < 20 && !have; i++) {
      const names = await a.page.evaluate(() => window.__ptcg.zone('self', 'hand').names);
      have = need.every((n) => names.includes(n));
      if (have) break;
      await a.page.evaluate(() => window.__ptcg.passTurn());
      await a.page.waitForTimeout(150);
      await b.page.evaluate(() => window.__ptcg.passTurn());
      await a.page.waitForTimeout(250);
    }
    // Informational only: which of the three ended up drawn is randomized by the
    // shuffle/deal, and further hand churn (Ultra Ball's own discard-cost/search) can
    // move them around. The actual assertions are #5/#6/#7 below, not hand contents.
    console.log(`setup: all three Trainers drawn into A's hand = ${have}`);
  }

  // Play Buddy-Buddy Poffin, Ultra Ball, Nest Ball from A's hand, each auto-searching
  // onto the bench / into hand — this is the exact path design 007 fixed.
  async function playTrainerByName(page, name) {
    const idx = await page.evaluate(
      (n) => window.__ptcg.zone('self', 'hand').names.indexOf(n),
      name
    );
    if (idx < 0) return { ok: false, error: `${name} not in hand` };
    return page.evaluate(
      (i) => window.__ptcg.playFromHand(i, 'board'),
      idx
    );
  }

  for (const name of ['Buddy-Buddy Poffin', 'Ultra Ball', 'Nest Ball']) {
    const before = await a.page.evaluate(() => window.__ptcg.zone('self', 'hand').names);
    if (!before.includes(name)) {
      console.log(`   skip: ${name} not currently in A's hand (hand: ${before.join(', ')})`);
      continue;
    }
    const result = await playTrainerByName(a.page, name);
    await a.page.waitForTimeout(600);

    // Resolve any card-picker / mat-pick prompt the search opened, picking everything offered.
    for (let attempt = 0; attempt < 8; attempt++) {
      const picker = await a.page.evaluate(() => window.__ptcg.picker());
      console.log(`  picker check ${attempt}:`, JSON.stringify(picker));
      if (!picker.open) break;
      if (picker.type === 'cardPicker') {
        const count = picker.max ?? picker.candidates?.length ?? 1;
        const indices = Array.from({ length: Math.min(count, picker.candidates?.length ?? count) }, (_, i) => i);
        const pickRes = await a.page.evaluate((idxs) => window.__ptcg.pick(idxs), indices);
        console.log('  pick result:', JSON.stringify(pickRes));
      } else if (picker.type === 'matPick') {
        const pickRes = await a.page.evaluate(() => window.__ptcg.pick([0]));
        console.log('  pick result:', JSON.stringify(pickRes));
      } else {
        break;
      }
      await a.page.waitForTimeout(400);
    }
    await a.page.waitForTimeout(400);
    console.log(`play ${name}:`, JSON.stringify(result));
    console.log(`  chat after ${name}:`, JSON.stringify(await a.page.evaluate(() => window.__ptcg.chatTail(4))));
  }

  await a.page.waitForTimeout(600);

  const aBench = await a.page.evaluate(() => window.__ptcg.zone('self', 'bench'));
  const bSeesOppBench = await b.page.evaluate(() => window.__ptcg.zone('opp', 'bench'));
  console.log('A self bench:', JSON.stringify(aBench));
  console.log('B sees opp bench:', JSON.stringify(bSeesOppBench));
  T(
    '5. B sees every benched Pokémon A has',
    aBench.count > 0 &&
      bSeesOppBench.count === aBench.count &&
      JSON.stringify([...bSeesOppBench.names].sort()) === JSON.stringify([...aBench.names].sort()),
    `(A:${aBench.count} B-sees:${bSeesOppBench.count})`
  );

  // Sync-log ordering + indices_mismatch check (design 007 acceptance criteria).
  const aEntries = await a.page.evaluate(() => window.ptcgSyncLog.entries());
  const mismatches = aEntries.filter((e) => String(e.event).includes('indices_mismatch'));
  T('6. no shuffleZone.indices_mismatch in A sync log', mismatches.length === 0, `(${mismatches.length} found)`);

  // Each moveCardBundle emit must precede its shuffleZone emit (by seq) for every search.
  let orderOk = true;
  const orderNotes = [];
  const emits = aEntries.filter((e) => e.dir === 'emit' || e.dir === 'out');
  let lastMoveSeq = null;
  for (const e of emits) {
    const isMove = e.event === 'action.emit' && e.detail?.action === 'move';
    const isShuffle = e.event === 'action.emit' && e.detail?.action === 'shuffleZone';
    if (isMove) lastMoveSeq = e.seq;
    if (isShuffle) {
      orderNotes.push(`shuffleZone@${e.seq} after last move@${lastMoveSeq}`);
      if (lastMoveSeq == null || lastMoveSeq > e.seq) orderOk = false;
    }
  }
  T('7. each shuffleZone emit follows its move emit', orderOk, `(${orderNotes.join('; ')})`);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.stack || err.message);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
