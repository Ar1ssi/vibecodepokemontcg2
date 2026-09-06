#!/usr/bin/env node
/**
 * In-Simulator Trainer & Stadium Audit for Standard 2026-2027 Format.
 *
 * Boots the PTCG-sim web server and runs headless Chromium via Playwright.
 * Evaluates every Supporter, Item, Pokémon Tool, and Stadium card (all 467 prints)
 * directly inside the simulator browser environment, recording:
 *   - Automated effects (direct zone manipulations, draws, hand shuffles, discards)
 *   - Guided interactive pickers (deck search, recursion, choice pickers)
 *   - Passive & attached modifiers (Tool HP bonuses, retreat reduction, Stadium passive rules)
 *   - Announce-only guidance (chat instructions for manual card manipulation)
 *   - Broken / Unhandled / Thrown errors
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 4000;
const SERVER = `http://localhost:${SERVER_PORT}/`;
const CACHE_DIR = path.join(__dirname, '.cache', 'tcgdex-cards');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isServerRunning() {
  try {
    const res = await fetch(SERVER, { method: 'HEAD' });
    return res.ok || res.status === 200 || res.status === 304;
  } catch {
    return false;
  }
}

async function ensureServerRunning() {
  if (await isServerRunning()) return null;
  process.stderr.write('Starting server at ' + SERVER + '...\n');
  const serverProc = spawn('node', ['server/server.js'], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: true,
  });
  serverProc.unref();

  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await isServerRunning()) {
      process.stderr.write('Server is ready.\n');
      return serverProc;
    }
  }
  throw new Error('Server failed to start at ' + SERVER);
}

function loadCachedTrainers() {
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error('Cache directory not found: ' + CACHE_DIR);
  }
  const files = fs.readdirSync(CACHE_DIR);
  const trainers = [];
  for (const f of files) {
    try {
      const card = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
      if (card.category !== 'Trainer') continue;
      trainers.push({
        id: card.id,
        localId: card.localId || card.id?.split('-')[1] || '1',
        name: card.name,
        setId: card.set?.id || card.id?.split('-')[0],
        setName: card.set?.name || card.set?.id,
        trainerType: card.trainerType || 'Item',
        effect: card.effect || card.text || '',
        image: card.image ? `${card.image}/high.png` : 'https://images.pokemontcg.io/base1/58_hires.png',
      });
    } catch {
      // skip invalid file
    }
  }
  trainers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return trainers;
}

/**
 * Evaluates a single Trainer or Stadium card inside the simulator browser context.
 */
async function BROWSER_TRAINER_AUDIT_FN(entry) {
  const [
    { Card },
    { rulesState, ensureCardData, markStadiumPlayed, getStadium },
    { parseTrainerEffect, describeStep },
    { runTrainerSteps },
    { classifyStadiumEffect, applyStadiumEffect, hasRecognizedPassiveStadiumEffect, isStadiumCard, effectiveHp },
    { attachedTools, parseHpBonus, attachedSpecialEnergy },
    { getZone },
  ] = await Promise.all([
    import('/src/setup/deck-constructor/card.js'),
    import('/src/setup/rules/rules-state.mjs'),
    import('/src/setup/rules/trainer-effects.mjs'),
    import('/src/setup/rules/trainer-execution.js'),
    import('/src/setup/rules/stadium-effects.mjs'),
    import('/src/setup/rules/ability-executors.mjs'),
    import('/src/setup/zones/get-zone.js'),
  ]);

  rulesState.enabled = true;
  rulesState.turnPlayer = 'self';
  rulesState.phase = 'main';

  const placeholder = 'https://images.pokemontcg.io/base1/58_hires.png';
  const card = new Card('self', entry.name, 'Trainer', placeholder, entry.localId, null, entry.id);
  card.effect = entry.effect;
  card.trainerType = entry.trainerType;

  // Set up board zones
  const deckZone = getZone('self', 'deck');
  const handZone = getZone('self', 'hand');
  const discardZone = getZone('self', 'discard');
  const activeZone = getZone('self', 'active');
  const benchZone = getZone('self', 'bench');
  const oppBenchZone = getZone('opp', 'bench');
  const oppActiveZone = getZone('opp', 'active');
  const oppHandZone = getZone('opp', 'hand');
  const stadiumZone = getZone('self', 'stadium');

  deckZone.array.length = 0;
  handZone.array.length = 0;
  discardZone.array.length = 0;
  activeZone.array.length = 0;
  benchZone.array.length = 0;
  oppBenchZone.array.length = 0;
  oppActiveZone.array.length = 0;
  oppHandZone.array.length = 0;
  stadiumZone.array.length = 0;

  // Active Pokémon (100 HP Basic)
  const activeCard = new Card('self', 'Test Active Pokémon', 'Pokémon', placeholder, '1', null, 'active-1');
  activeCard.hp = 100;
  activeCard.types = ['Colorless'];
  activeCard.stage = 'Basic';
  activeZone.array.push(activeCard);

  // Opponent Active
  const oppActiveCard = new Card('opp', 'Opponent Active Pokémon', 'Pokémon', placeholder, '2', null, 'active-2');
  oppActiveCard.hp = 120;
  oppActiveCard.types = ['Colorless'];
  oppActiveZone.array.push(oppActiveCard);

  // Fill deck with diverse test targets
  for (let i = 0; i < 5; i++) {
    const basicPkmn = new Card('self', `Basic Test ${i}`, 'Pokémon', placeholder);
    basicPkmn.stage = 'Basic';
    basicPkmn.hp = 70;
    deckZone.array.push(basicPkmn);
  }
  for (let i = 0; i < 5; i++) {
    deckZone.array.push(new Card('self', `Basic Energy ${i}`, 'Energy', placeholder));
  }
  for (let i = 0; i < 5; i++) {
    deckZone.array.push(new Card('self', `Trainer Test ${i}`, 'Trainer', placeholder));
  }

  // Fill hand with 4 cards
  for (let i = 0; i < 4; i++) {
    handZone.array.push(new Card('self', `Hand Card ${i}`, 'Energy', placeholder));
  }

  // Fill discard with 3 cards
  for (let i = 0; i < 3; i++) {
    discardZone.array.push(new Card('self', `Discard Card ${i}`, 'Pokémon', placeholder));
  }

  // Fill opponent hand
  for (let i = 0; i < 4; i++) {
    oppHandZone.array.push(new Card('opp', `Opp Card ${i}`, 'Energy', placeholder));
  }

  const result = {
    id: entry.id,
    name: entry.name,
    setId: entry.setId,
    setName: entry.setName,
    trainerType: entry.trainerType,
    effect: entry.effect,
    status: 'works',
    executionType: 'unknown',
    steps: [],
    details: '',
  };

  try {
    if (entry.trainerType === 'Stadium') {
      const family = classifyStadiumEffect(card);
      const applied = applyStadiumEffect(card);
      const isPassive = hasRecognizedPassiveStadiumEffect(card);

      result.family = family;
      result.executed = applied.executed;
      result.results = applied.results || [];
      result.message = applied.message || '';

      if (applied.executed && applied.results.length > 0) {
        result.status = 'works';
        result.executionType = 'active-action';
        result.details = `Actionable Stadium (${family}): ${applied.results.map((r) => r.action || r.type).join(', ')}`;
      } else if (isPassive || (family !== 'unknown' && family !== 'none')) {
        result.status = 'works';
        result.executionType = 'passive-continuous';
        result.details = `Continuous passive Stadium (${family}): ${applied.message || 'passive board modifier'}`;
      } else {
        result.status = 'broken';
        result.executionType = 'unhandled';
        result.details = `Unrecognized Stadium effect: family=${family}`;
      }
    } else if (entry.trainerType === 'Tool') {
      const parsed = parseTrainerEffect(entry.effect);
      result.parsed = parsed;
      result.recognizable = parsed.recognizable;
      result.steps = parsed.steps;

      // Attach tool to Active Pokémon to test attachment & stat hooks
      card.image.attached = true;
      card.image.relative = activeCard.image;
      activeZone.array.push(card);

      const attached = attachedTools(activeCard);
      const hpBonus = parseHpBonus(card)?.bonus || 0;
      const boostedHp = effectiveHp(100, 'self', activeCard, activeZone.array);

      result.toolAttached = attached.length > 0;
      result.hpBonus = hpBonus;
      result.effectiveHp = boostedHp;

      if (!parsed.recognizable) {
        result.status = 'broken';
        result.executionType = 'unrecognizable';
        result.details = `Tool effect not parsed by trainer-effects: "${entry.effect.slice(0, 60)}"`;
      } else {
        result.status = 'works';
        result.executionType = 'attached-tool';
        const stepTypes = parsed.steps.map((s) => s.type).join(' + ') || 'passive-tool';
        result.details = `Tool (${stepTypes})${hpBonus > 0 ? ` [HP +${hpBonus}]` : ''}: ${parsed.steps.map(describeStep).join('; ') || 'attached modifier'}`;
      }
    } else {
      // Supporter or Item
      const parsed = parseTrainerEffect(entry.effect);
      result.parsed = parsed;
      result.recognizable = parsed.recognizable;
      result.steps = parsed.steps;

      if (!parsed.recognizable) {
        result.status = 'broken';
        result.executionType = 'unrecognizable';
        result.details = `Effect not recognized: "${entry.effect.slice(0, 60)}"`;
        return result;
      }

      const descriptions = parsed.steps.map((s) => {
        try {
          return describeStep(s);
        } catch (e) {
          return `[describeStep error: ${e.message}]`;
        }
      });

      const types = parsed.steps.map((s) => s.type);

      const AUTO_TYPES = new Set([
        'discardHandThenDraw',
        'shuffleHandThenDraw',
        'countShuffleDrawPlus',
        'draw',
        'drawUntil',
        'variableDraw',
        'opponentDraw',
        'ionoShuffle',
        'opponentShuffleHandDraw',
        'millSelf',
        'damageCounters',
        'applyStatus',
        'fossilItem',
        'reshufflePrizes',
        'opponentDiscardUntil',
        'eachPlayerDiscardUntil',
        'opponentCountShuffleDraw',
      ]);

      const GUIDED_TYPES = new Set([
        'searchDeck',
        'discardCost',
        'coinFlip',
        'recursion',
        'lookAtTop',
        'lookAtBottom',
        'healAmount',
        'heal',
        'shuffleFromDiscard',
        'attachFromDiscard',
        'attachMultipleFromDiscard',
        'switchOpponent',
        'switchOwn',
        'revealOpponentHandDiscard',
        'opponentHandBottom',
        'discardEnergyFromOpponent',
        'returnPokemonToHand',
        'moveEnergy',
        'moveEnergyToActive',
        'evolveStage2',
        'devolve',
        'discardTools',
        'discardFromOpponent',
        'discardToolAndSpecialEnergy',
        'massDiscardAttached',
        'swapWithDiscard',
        'revealOpponentDeckBench',
        'opponentPrizeHandSwap',
        'switchOpponentOut',
      ]);

      const isAuto = types.some((t) => AUTO_TYPES.has(t));
      const isGuided = types.some((t) => GUIDED_TYPES.has(t));
      const isPassive = types.every((t) => t === 'passive');

      try {
        runTrainerSteps(card, parsed.steps, 0, null, 'self');
      } catch (err) {
        result.status = 'broken';
        result.executionType = 'exec-error';
        result.details = `Execution threw: ${err.message}`;
        return result;
      }

      if (isAuto) {
        result.status = 'works';
        result.executionType = 'automated';
        result.details = `Auto-executed (${types.join(' + ')}): ${descriptions.join('; ')}`;
      } else if (isGuided) {
        result.status = 'works';
        result.executionType = 'guided-picker';
        result.details = `Guided UI flow (${types.join(' + ')}): ${descriptions.join('; ')}`;
      } else if (isPassive) {
        result.status = 'works';
        result.executionType = 'passive-modifier';
        result.details = `Passive turn/combat modifier (${types.join(' + ')}): ${descriptions.join('; ')}`;
      } else {
        result.status = 'partial';
        result.executionType = 'announce-only';
        result.details = `Announce-only guidance (${types.join(' + ')}): ${descriptions.join('; ')}`;
      }
    }
  } catch (err) {
    result.status = 'broken';
    result.executionType = 'throw';
    result.details = `Evaluation threw: ${err?.message || err}`;
  }

  return result;
}

async function main() {
  const serverProc = await ensureServerRunning();
  const trainers = loadCachedTrainers();

  process.stderr.write(`Loaded ${trainers.length} Trainer card prints across Standard 2026-2027 sets.\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(SERVER, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const results = [];
  const BATCH = 15;
  for (let i = 0; i < trainers.length; i += BATCH) {
    const batch = trainers.slice(i, i + BATCH);
    if (i > 0 && i % 60 === 0) {
      process.stderr.write(`  audited ${i}/${trainers.length} trainers...\n`);
    }
    for (const card of batch) {
      try {
        const row = await page.evaluate(BROWSER_TRAINER_AUDIT_FN, card);
        results.push(row);
      } catch (err) {
        results.push({
          id: card.id,
          name: card.name,
          setId: card.setId,
          setName: card.setName,
          trainerType: card.trainerType,
          effect: card.effect,
          status: 'broken',
          executionType: 'page-eval-error',
          details: String(err?.message || err),
        });
      }
      await sleep(10);
    }
  }

  await browser.close();

  // Summary aggregation
  const byType = {};
  const byStatus = {};
  const byExecType = {};

  const works = [];
  const partial = [];
  const broken = [];

  for (const r of results) {
    byType[r.trainerType] = (byType[r.trainerType] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byExecType[r.executionType] = (byExecType[r.executionType] || 0) + 1;

    if (r.status === 'works') works.push(r);
    else if (r.status === 'partial') partial.push(r);
    else broken.push(r);
  }

  // Unique card aggregation (deduping reprints)
  const uniqueByName = new Map();
  for (const r of results) {
    if (!uniqueByName.has(r.name)) {
      uniqueByName.set(r.name, {
        name: r.name,
        trainerType: r.trainerType,
        status: r.status,
        executionType: r.executionType,
        details: r.details,
        effect: r.effect,
        prints: [r.id],
      });
    } else {
      uniqueByName.get(r.name).prints.push(r.id);
    }
  }

  const uniqueCards = [...uniqueByName.values()].sort((a, b) => a.name.localeCompare(b.name));

  const outData = {
    meta: {
      auditedAt: new Date().toISOString(),
      totalPrints: results.length,
      uniqueCards: uniqueCards.length,
      byType,
      byStatus,
      byExecType,
      pctWorks: Math.round(((works.length + partial.length) / results.length) * 100),
    },
    uniqueSummary: {
      works: uniqueCards.filter((c) => c.status === 'works').length,
      partial: uniqueCards.filter((c) => c.status === 'partial').length,
      broken: uniqueCards.filter((c) => c.status === 'broken').length,
    },
    broken,
    partial,
    uniqueCards,
    allResults: results,
  };

  const outDir = path.join(__dirname, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'trainer-simulator-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(outData, null, 2), 'utf8');

  // Generate markdown report
  const mdLines = [
    `# Standard 2026-2027 Trainer, Tool, Supporter & Stadium Simulator Audit`,
    ``,
    `Audited **${results.length}** prints (**${uniqueCards.length}** unique cards) across all Standard sets.`,
    ``,
    `| Metric | Prints | Unique Cards | % of Format |`,
    `|---|---:|---:|---:|`,
    `| **Works (Automated / Guided / Passive)** | ${works.length} | ${uniqueCards.filter((c) => c.status === 'works').length} | ${Math.round((works.length / results.length) * 100)}% |`,
    `| **Partial (Announce-Only Guidance)** | ${partial.length} | ${uniqueCards.filter((c) => c.status === 'partial').length} | ${Math.round((partial.length / results.length) * 100)}% |`,
    `| **Broken / Unrecognizable / Failed** | ${broken.length} | ${uniqueCards.filter((c) => c.status === 'broken').length} | ${Math.round((broken.length / results.length) * 100)}% |`,
    ``,
    `### Breakdown by Card Type`,
    ``,
    `| Type | Total Unique | Works | Partial | Broken |`,
    `|---|---:|---:|---:|---:|`,
  ];

  for (const type of ['Item', 'Supporter', 'Tool', 'Stadium']) {
    const list = uniqueCards.filter((c) => c.trainerType === type);
    const w = list.filter((c) => c.status === 'works').length;
    const p = list.filter((c) => c.status === 'partial').length;
    const b = list.filter((c) => c.status === 'broken').length;
    mdLines.push(`| **${type}** | ${list.length} | ${w} | ${p} | ${b} |`);
  }

  mdLines.push(
    ``,
    `### Breakdown by Execution Engine Mode`,
    ``,
    `| Execution Mode | Prints | Unique | Description |`,
    `|---|---:|---:|---|`,
    `| **Automated (` + '`automated`' + `)** | ${results.filter((r) => r.executionType === 'automated').length} | ${uniqueCards.filter((c) => c.executionType === 'automated').length} | Engine directly alters game state (draws, discards, shuffles) |`,
    `| **Guided Picker (` + '`guided-picker`' + `)** | ${results.filter((r) => r.executionType === 'guided-picker').length} | ${uniqueCards.filter((c) => c.executionType === 'guided-picker').length} | Opens interactive modal (deck search, recursion, choice picker) |`,
    `| **Attached Tool (` + '`attached-tool`' + `)** | ${results.filter((r) => r.executionType === 'attached-tool').length} | ${uniqueCards.filter((c) => c.executionType === 'attached-tool').length} | Applies attached stat/rule modifiers (HP bonus, retreat) |`,
    `| **Active Stadium (` + '`active-action`' + `)** | ${results.filter((r) => r.executionType === 'active-action').length} | ${uniqueCards.filter((c) => c.executionType === 'active-action').length} | Triggerable once-per-turn or setup stadium actions |`,
    `| **Passive Stadium (` + '`passive-continuous`' + `)** | ${results.filter((r) => r.executionType === 'passive-continuous').length} | ${uniqueCards.filter((c) => c.executionType === 'passive-continuous').length} | Continuous board modifier (bench expansion, damage shield) |`,
    `| **Announce-Only (` + '`announce-only`' + `)** | ${results.filter((r) => r.executionType === 'announce-only').length} | ${uniqueCards.filter((c) => c.executionType === 'announce-only').length} | Announces instructions in chat log for manual board move |`,
    `| **Broken / Failed (` + '`broken`' + `)** | ${broken.length} | ${uniqueCards.filter((c) => c.status === 'broken').length} | Unrecognized effect or runtime exception |`,
    ``
  );

  if (broken.length > 0) {
    mdLines.push(`## Broken / Unrecognized Cards`, ``);
    const brokenUnique = uniqueCards.filter((c) => c.status === 'broken');
    for (const c of brokenUnique) {
      mdLines.push(`- **${c.name}** [${c.trainerType}] — \`${c.details}\``);
      mdLines.push(`  > ${c.effect.replace(/\n/g, ' ')}`);
    }
    mdLines.push(``);
  }

  mdLines.push(`## Announce-Only Cards (Partial Guidance)`, ``);
  const partialUnique = uniqueCards.filter((c) => c.status === 'partial');
  for (const c of partialUnique) {
    mdLines.push(`- **${c.name}** [${c.trainerType}] — \`${c.details}\``);
  }
  mdLines.push(``);

  const mdPath = path.join(outDir, 'trainer-simulator-audit.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

  console.log('Audit Complete:');
  console.log(`  Total Prints: ${results.length} (${uniqueCards.length} unique cards)`);
  console.log(`  Works: ${works.length} prints`);
  console.log(`  Partial: ${partial.length} prints`);
  console.log(`  Broken: ${broken.length} prints`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD: ${mdPath}`);
  console.log(JSON.stringify(outData.meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
