// Design 004 slice 6 — the playtest runner. Boots two Playwright pages, loops
// observe() -> decide() -> act() through bot/bot.mjs's never-crash scaffold, drains any
// open picker() after each action, and asserts the same per-turn invariants
// flip-gate-test.mjs checks (zero pageerror, zero cmdRejected, public-board hash parity,
// secret-zone count parity). A run that finds a bug dumps a replayable trace instead of
// just failing — a failing seed must be re-runnable from its dump.
//
// Usage:
//   node server/server.js &
//   node playtest-bot.mjs --games=50 --seed=1 [--max-turns=60] [--deck=<path.json>] [--headed]
//                          [--scorer=heuristic|coverage]
//
// --scorer picks the brain behind the never-crash scaffold (bot.mjs's OptionScorer seam):
//   heuristic (default) plays a plausible game; coverage plays a thorough one, holding back
//   turn-ending moves and preferring the least-exercised mechanic so Stadiums, abilities and
//   evolution chains actually get reached. Use coverage when the goal is finding bugs.
//
// Default deck is the built-in 20-card all-Basic fixture (client/src/setup/general/
// e2e-mode.mjs's e2eFixtureDeck) — no network fetch, so it runs anywhere `?e2e=1` does.
// `--deck` loads a custom deck (same 7-field row JSON the deck importer produces:
// [quantity, name, type, imageURL, number, set, tcgId]) via the new `loadDeckList()`
// bridge method; per design's non-goal list this never changes a gameplay file.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './bot/bot.mjs';
import { createHeuristicScorer, optionKey } from './bot/heuristic-scorer.mjs';
import { createCoverageScorer, coverageKey } from './bot/coverage-scorer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const OUT_DIR = path.join(__dirname, 'out', 'playtest');

function parseArgs(argv) {
  const opts = { games: 1, seed: 1, maxTurns: 60, deck: null, headed: false, scorer: 'heuristic' };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'games') opts.games = Number(value);
    else if (key === 'seed') opts.seed = Number(value);
    else if (key === 'max-turns') opts.maxTurns = Number(value);
    else if (key === 'deck') opts.deck = value;
    else if (key === 'headed') opts.headed = true;
    else if (key === 'scorer') opts.scorer = value;
  }
  return opts;
}

// Small deterministic PRNG (mulberry32) so a seed reproduces the same run — Math.random
// is only ever a tie-break inside the heuristic scorer, never a choice between tiers.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

async function openClient(browser, name, pageErrors) {
  const context = await browser.newContext();
  // This sandbox blocks the public socket.io CDN by egress policy — redirect to the
  // server's own bundled copy instead (same fix flip-gate-test.mjs's watch-out documents).
  await context.route('https://cdn.socket.io/**', async (route) => {
    const res = await fetch(`${BASE}/socket.io/socket.io.js`);
    route.fulfill({
      status: res.status,
      contentType: res.headers.get('content-type') || 'application/javascript',
      body: Buffer.from(await res.arrayBuffer()),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    pageErrors.push(`${name}: ${err.message}`);
    console.log(`PAGEERROR ${name}:`, err.message);
  });
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  await waitFor(page, () => {
    try {
      return window.__ptcg.zone('self', 'deck').count >= 0;
    } catch {
      return false;
    }
  });
  return { context, page, name };
}

// The same cross-client invariant flip-gate-test.mjs checks: each side's own public
// board must equal the other side's view of it, and owner-secret zones (redacted per
// recipient) must agree by count instead of content.
async function crossClientDivergence(a, b) {
  const [aSelf, aOpp, bSelf, bOpp] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.publicBoardHash('self')),
    a.page.evaluate(() => window.__ptcg.publicBoardHash('opp')),
    b.page.evaluate(() => window.__ptcg.publicBoardHash('self')),
    b.page.evaluate(() => window.__ptcg.publicBoardHash('opp')),
  ]);
  const problems = [];
  if (aSelf !== bOpp) problems.push("A's own board != B's view of A");
  if (bSelf !== aOpp) problems.push("B's own board != A's view of B");

  const [aSelfCounts, aOppCounts, bSelfCounts, bOppCounts] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.secretZoneCounts('self')),
    a.page.evaluate(() => window.__ptcg.secretZoneCounts('opp')),
    b.page.evaluate(() => window.__ptcg.secretZoneCounts('self')),
    b.page.evaluate(() => window.__ptcg.secretZoneCounts('opp')),
  ]);
  for (const zoneId of Object.keys(aSelfCounts)) {
    if (aSelfCounts[zoneId] !== bOppCounts[zoneId]) {
      problems.push(`A's ${zoneId} count ${aSelfCounts[zoneId]} != B's view ${bOppCounts[zoneId]}`);
    }
    if (bSelfCounts[zoneId] !== aOppCounts[zoneId]) {
      problems.push(`B's ${zoneId} count ${bSelfCounts[zoneId]} != A's view ${aOppCounts[zoneId]}`);
    }
  }
  return problems;
}

async function setupGame(browser, room, deckRows, pageErrors) {
  const a = await openClient(browser, 'A', pageErrors);
  const b = await openClient(browser, 'B', pageErrors);

  await a.page.evaluate(([r, user]) => window.__ptcg.joinRoom(r, user), [room, 'BOT-A']);
  await b.page.evaluate(([r, user]) => window.__ptcg.joinRoom(r, user), [room, 'BOT-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);

  if (deckRows) {
    await a.page.evaluate((rows) => window.__ptcg.loadDeckList(rows), deckRows);
    await b.page.evaluate((rows) => window.__ptcg.loadDeckList(rows), deckRows);
  } else {
    await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('BotA'));
    await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('BotB'));
  }
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 1);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 1);

  // Hold off the first turn until TCGdex enrichment has settled. Without this the bot can
  // act on cards with no hp/attacks/stage/subtypes, and options() silently under-reports —
  // no attack, no evolve, no Trainer classification — so it passes its way to the turn cap.
  // Bounded: enrichment is network-bound and the fixture deck stamps its own stats (so it
  // needs none). A timeout is not fatal; play proceeds on whatever resolved, matching
  // build-deck.js's own "partial data beats none" handling.
  await Promise.all(
    [a, b].map(async (client) => {
      const ready = await client.page
        .evaluate(
          () =>
            Promise.race([
              window.__ptcg.cardDataReady(),
              new Promise((resolve) => setTimeout(() => resolve('timeout'), 60000)),
            ]),
        )
        .catch(() => 'error');
      if (ready !== true) {
        console.log(`  note: ${client.name} card data not fully enriched (${ready})`);
      }
    })
  );

  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  await waitFor(a.page, () => window.__ptcg.zone('self', 'prizes').count === 6);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'prizes').count === 6);

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const overlayDeadline = Date.now() + 15000;
  let called = false;
  while (Date.now() < overlayDeadline && !called) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    for (const client of [a, b]) {
      if (await client.page.locator(callBtn).isVisible().catch(() => false)) {
        await client.page.locator(callBtn).click();
        called = true;
        break;
      }
    }
    if (!called) await a.page.waitForTimeout(200);
  }
  if (!called) throw new Error('coin call overlay never opened');

  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count === 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count === 7);

  // Design 004 targets the legacy client path by default (SERVER_AUTHORITATIVE unset),
  // where turnPlayer is decided by a peer-to-peer coin flip and broadcast directly
  // (rules-bridge.js's runTurnOrderCoinFlip) rather than confirmed by a pushed server
  // view — turnState().fromServer never becomes true in this mode, unlike flip-gate-
  // test.mjs's SERVER_AUTHORITATIVE=1 harness. requestView()/fromServer only matter
  // under that other mode, so the sync point here is turnNumber ticking up instead.
  await a.page.evaluate(() => window.__ptcg.requestView());
  await b.page.evaluate(() => window.__ptcg.requestView());
  await waitFor(a.page, () => window.__ptcg.turnState().turnNumber >= 1);
  await waitFor(b.page, () => window.__ptcg.turnState().turnNumber >= 1);

  // Each page's turnPlayer starts out as its own local default ('self') until the peer's
  // turnOrderCoinFlip broadcast (rules-bridge.js) actually lands — a race, not a real
  // desync, if read too early (both sides can briefly agree they go first). Wait for the
  // two pages to actually disagree (one 'self', the other 'opp') before treating turn
  // order as settled.
  const deadline = Date.now() + 10000;
  for (;;) {
    const [aTP, bTP] = await Promise.all([
      a.page.evaluate(() => window.__ptcg.turnState().turnPlayer),
      b.page.evaluate(() => window.__ptcg.turnState().turnPlayer),
    ]);
    if (aTP !== bTP) break;
    if (Date.now() > deadline) throw new Error(`turn order never settled (both report '${aTP}')`);
    await a.page.waitForTimeout(150);
  }

  return { a, b };
}

async function getObservation(page) {
  return page.evaluate(async () => ({
    ...window.__ptcg.observe(),
    options: await window.__ptcg.options(),
  }));
}

// Answers whichever modal picker() reports with the bot's simplest legal reply: heads
// for a coin, the first candidate for a mat-pick, and the first `min` candidates (or 1)
// for a card picker. Never guesses at a kind picker() doesn't report — that is treated
// as an unhandled overlay and surfaced as a wedge rather than looped on forever.
async function drainPicker(client) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await client.page.evaluate(() => window.__ptcg.picker());
    if (!state.open) return { drained: true };
    if (state.type === 'coinCall' || state.type === 'coinEffect') {
      await client.page.evaluate(() => window.__ptcg.pick([], 'heads'));
    } else if (state.type === 'matPick') {
      await client.page.evaluate(() => window.__ptcg.pick([0]));
    } else if (state.type === 'cardPicker') {
      const count = Math.max(state.min || 0, 1);
      const indices = (state.candidates || []).slice(0, count).map((c) => c.index);
      await client.page.evaluate((idx) => window.__ptcg.pick(idx), indices);
    } else {
      return { drained: false, state };
    }
    await client.page.waitForTimeout(50);
  }
  const stillOpen = await client.page.evaluate(() => window.__ptcg.picker());
  return { drained: !stillOpen.open, state: stillOpen };
}

async function readCmdRejectedCounts(a, b) {
  const [aCount, bCount] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.cmdRejectedCount),
    b.page.evaluate(() => window.__ptcg.cmdRejectedCount),
  ]);
  return { a: aCount, b: bCount };
}

function dumpFailure({ seed, gameIndex, turn, reason, detail, observation, chosen, stepLog, cmdRejections, boards }) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${seed}-${gameIndex}-${turn}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      { seed, gameIndex, turn, reason, detail, observation, chosen, stepLog, cmdRejections, boards },
      null,
      2
    )
  );
  return file;
}

async function closeGame({ a, b }) {
  await Promise.all([a?.context.close(), b?.context.close()].filter(Boolean));
}

const MAX_ACTIONS_PER_TURN = 60;

// What one game actually exercised: distinct mechanics (coverageKey) and a per-kind
// histogram across both sides. Printed per game so a "coverage" run is readable at a
// glance — an all-PASS run that only ever played Basics is not a meaningful soak.
function summarizeCoverage(exercised) {
  const keys = [...exercised.a, ...exercised.b];
  const kinds = {};
  for (const key of keys) {
    const kind = key.split(':')[0];
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return { distinct: new Set(keys).size, actions: keys.length, kinds };
}

async function playOneGame({ browser, seed, gameIndex, maxTurns, deckRows, scorerName }) {
  const room = `e2e-playtest-${seed}-${gameIndex}-${Date.now()}`;
  const pageErrors = [];
  const stepLog = [];
  const makeScorer =
    scorerName === 'coverage' ? createCoverageScorer : createHeuristicScorer;
  const scorers = {
    a: makeScorer({ rng: mulberry32(seed * 1000003 + gameIndex * 2 + 1) }),
    b: makeScorer({ rng: mulberry32(seed * 1000003 + gameIndex * 2 + 2) }),
  };
  // Mechanics already exercised THIS GAME, per side — the coverage scorer ranks on these.
  // Per-side, not shared: each bot only ever sees its own board, so a key from the other
  // side's hand would be meaningless to it.
  const exercised = { a: [], b: [] };
  const fallbacks = [];

  let clients;
  try {
    clients = await setupGame(browser, room, deckRows, pageErrors);
  } catch (err) {
    return { result: 'fail', reason: 'setup-error', detail: err.message, gameIndex };
  }
  const { a, b } = clients;

  const fail = async (reason, detail, observation, chosen, turn) => {
    const rejections = await Promise.all([
      a.page.evaluate(() => window.__ptcg.cmdRejections),
      b.page.evaluate(() => window.__ptcg.cmdRejections),
    ]);
    // Both sides' public zones as each client sees them. A divergence dump without
    // these says only THAT the boards disagree, never HOW — which is most of the
    // diagnosis. Cheap, and only read on the failure path.
    const boards = {};
    try {
      const [aSelf, aOpp, bSelf, bOpp] = await Promise.all([
        a.page.evaluate(() => window.__ptcg.publicZones('self')),
        a.page.evaluate(() => window.__ptcg.publicZones('opp')),
        b.page.evaluate(() => window.__ptcg.publicZones('self')),
        b.page.evaluate(() => window.__ptcg.publicZones('opp')),
      ]);
      Object.assign(boards, { aSelf, aOpp, bSelf, bOpp });
      // Last chat lines from both clients. A mirror action silently rejected by the
      // rules gate leaves a ⛔ line here and nowhere else, so without this a no-op
      // replay is indistinguishable from one that never ran.
      const [aChat, bChat] = await Promise.all([
        a.page.evaluate(() => [...document.querySelectorAll('#chatbox p')].slice(-12).map((n) => n.textContent)),
        b.page.evaluate(() => [...document.querySelectorAll('#chatbox p')].slice(-12).map((n) => n.textContent)),
      ]);
      Object.assign(boards, { aChat, bChat });
    } catch (err) {
      boards.error = String(err?.message || err);
    }
    const file = dumpFailure({
      seed,
      gameIndex,
      turn,
      reason,
      detail,
      observation: observation || null,
      chosen: chosen || null,
      stepLog,
      cmdRejections: { a: rejections[0], b: rejections[1] },
      boards,
    });
    await closeGame({ a, b });
    return {
      result: 'fail',
      reason,
      detail,
      gameIndex,
      turn,
      dump: file,
      coverage: summarizeCoverage(exercised),
    };
  };

  try {
    let lastTurnNumber = 0;
    let turnActionCount = 0;
    let steps = 0;
    // Kept so the failure paths that have no observation of their own in hand (pageerror,
    // both softlocks, the in-turn wedge) still dump the last board the bot actually saw —
    // a dump without one is not replayable, which is this slice's acceptance bar.
    let lastObservation = null;
    let lastChosen = null;
    // Guard 3 (heuristic-scorer.mjs): Trainers that resolved to no state change this turn.
    // Cleared on every turn change, so a card blocked by a once-per-turn rule gets retried.
    let triedThisTurn = new Set();
    const maxSteps = Math.max(maxTurns, 1) * MAX_ACTIONS_PER_TURN;

    while (true) {
      steps += 1;
      if (pageErrors.length) {
        return await fail('pageerror', pageErrors.join('; '), lastObservation, lastChosen, lastTurnNumber);
      }
      const ended = await a.page.evaluate(() => window.__ptcg.gameEndedInfo);
      if (ended) {
        await closeGame({ a, b });
        return {
          result: 'pass',
          gameIndex,
          turns: lastTurnNumber,
          winner: ended.winner,
          coverage: summarizeCoverage(exercised),
        };
      }
      if (steps > maxSteps) {
        return await fail(
          'softlock',
          `exceeded ${maxSteps} total actions without the game ending`,
          lastObservation,
          lastChosen,
          lastTurnNumber
        );
      }

      const aTurnState = await a.page.evaluate(() => window.__ptcg.turnState());
      if (aTurnState.turnNumber !== lastTurnNumber) {
        lastTurnNumber = aTurnState.turnNumber;
        turnActionCount = 0;
        triedThisTurn = new Set();
        if (lastTurnNumber > maxTurns) {
          return await fail(
            'softlock',
            `exceeded --max-turns=${maxTurns}`,
            lastObservation,
            lastChosen,
            lastTurnNumber
          );
        }
      }
      turnActionCount += 1;
      if (turnActionCount > MAX_ACTIONS_PER_TURN) {
        return await fail(
          'wedge',
          `no turn progress after ${MAX_ACTIONS_PER_TURN} actions within turn ${lastTurnNumber}`,
          lastObservation,
          lastChosen,
          lastTurnNumber
        );
      }

      const isA = aTurnState.turnPlayer === 'self';
      const active = isA ? a : b;
      const idle = isA ? b : a;
      const scorer = isA ? scorers.a : scorers.b;

      const observation = await getObservation(active.page);
      observation.triedThisTurn = [...triedThisTurn];
      observation.exercised = isA ? exercised.a : exercised.b;
      lastObservation = observation;
      const chosen = decide(observation, scorer, {
        onFallback: (why, detail) => fallbacks.push({ turn: lastTurnNumber, why, detail: String(detail ?? '') }),
      });
      lastChosen = chosen;
      const actResult = await active.page.evaluate((option) => window.__ptcg.act(option), chosen);
      if (actResult.ok) {
        (isA ? exercised.a : exercised.b).push(coverageKey(chosen, observation));
      }
      stepLog.push({ turn: lastTurnNumber, player: isA ? 'a' : 'b', chosen, actResult });

      // A Trainer still in hand after act() reported success resolved to nothing this client
      // can execute (an unimplemented effect). Mark it so the scorer stops re-picking it —
      // otherwise one inert card eats the turn's whole action budget and the run reports a
      // wedge that says nothing about the game.
      if (chosen.kind === 'playTrainer') {
        const handAfter = await active.page.evaluate(
          () => window.__ptcg.zone('self', 'hand').count
        );
        if (handAfter === (observation.self?.hand || []).length) {
          triedThisTurn.add(optionKey(chosen, observation));
        }
      }
      if (!actResult.ok) {
        // act() reports { ok: false } with no error whenever the underlying client action
        // simply returned false (e2e-api.js), so `detail` would otherwise be undefined and
        // the dump would not say which move failed.
        return await fail(
          'act-failed',
          actResult.error || `${chosen.kind} returned false (no error reported)`,
          observation,
          chosen,
          lastTurnNumber
        );
      }

      for (const client of [active, idle]) {
        const { drained, state } = await drainPicker(client);
        if (!drained) {
          return await fail(
            'wedge',
            `unresolved picker on ${client.name}: ${JSON.stringify(state)}`,
            observation,
            chosen,
            lastTurnNumber
          );
        }
      }

      const rejected = await readCmdRejectedCounts(a, b);
      if (rejected.a > 0 || rejected.b > 0) {
        return await fail('cmd-rejected', JSON.stringify(rejected), observation, chosen, lastTurnNumber);
      }

      // A just-applied action's socket broadcast to the other client is async — checking
      // the instant after act() resolves can catch a real one-sided update mid-flight, not
      // an actual desync (S82's I29 was exactly this: the harness's own poll timing, not
      // an engine bug). Retry briefly before treating a divergence as a finding.
      let problems = await crossClientDivergence(a, b);
      for (let retry = 0; problems.length && retry < 20; retry += 1) {
        await active.page.waitForTimeout(150);
        problems = await crossClientDivergence(a, b);
      }
      if (problems.length) {
        return await fail('divergence', problems.join('; '), observation, chosen, lastTurnNumber);
      }
    }
  } catch (err) {
    return await fail('exception', err.message, lastObservation, lastChosen, lastTurnNumber);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const deckRows = opts.deck ? JSON.parse(readFileSync(path.resolve(opts.deck), 'utf8')) : null;
  const browser = await chromium.launch({
    headless: !opts.headed,
    executablePath: '/opt/pw-browsers/chromium',
  });

  const results = [];
  try {
    for (let gameIndex = 0; gameIndex < opts.games; gameIndex += 1) {
      const result = await playOneGame({
        browser,
        seed: opts.seed,
        gameIndex,
        maxTurns: opts.maxTurns,
        deckRows,
        scorerName: opts.scorer,
      });
      results.push(result);
      const label = result.result === 'pass' ? 'PASS' : `FAIL (${result.reason})`;
      console.log(`game ${gameIndex + 1}/${opts.games}: ${label}${result.dump ? ` -> ${result.dump}` : ''}`);
      if (result.coverage) {
        const { distinct, actions, kinds } = result.coverage;
        console.log(
          `  coverage: ${distinct} distinct mechanics over ${actions} actions — ` +
            Object.entries(kinds)
              .sort((x, y) => y[1] - x[1])
              .map(([kind, count]) => `${kind}:${count}`)
              .join(' ')
        );
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.result === 'fail');
  console.log(`${failed.length ? 'FAILED' : 'ALL PASS'} — ${results.length - failed.length}/${results.length} games passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
