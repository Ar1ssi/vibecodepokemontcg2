#!/usr/bin/env node
/**
 * In-simulator audit: every TCGdex Standard-legal Stadium + Pokémon Tool card.
 *
 * Uses Playwright + the live app's ensureCardData() (same enrichment path as
 * gameplay), then evaluates the same parsers/hooks the rules engine uses.
 *
 * Usage:
 *   node server/server.js   # in another terminal
 *   node stadium-tool-simulator-audit.mjs [--json] [--browser-play N]
 */

import { chromium } from 'playwright';
import fs from 'fs';

const TCGDEX = 'https://api.tcgdex.net/v2/en';
const BASE_URL = process.env.PTCG_BASE_URL || 'http://localhost:4000';
const jsonOut = process.argv.includes('--json');
const browserPlayN = parseInt(
  process.argv.find((a) => a.startsWith('--browser-play='))?.split('=')[1] || '0',
  10
);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchStandardCards(trainerType) {
  const list = await fetchJson(`${TCGDEX}/cards?trainerType=${trainerType}`);
  const standard = list.filter((c) => c?.id);
  const cards = [];
  for (let i = 0; i < standard.length; i += 15) {
    const batch = standard.slice(i, i + 15);
    const details = await Promise.all(
      batch.map((c) =>
        fetchJson(`${TCGDEX}/cards/${c.id}`).then((d) => (d?.legal?.standard ? d : null)).catch(() => null)
      )
    );
    cards.push(...details.filter(Boolean));
  }
  return cards;
}

function simCardFromDeck(detail) {
  return {
    name: detail.name,
    type: 'Trainer',
    trainerType: detail.trainerType || null,
    subtypes: detail.subtypes || [],
    id: detail.id,
    number: detail.localId || detail.number || null,
    set: detail.set?.id || null,
    text: detail.effect || detail.text || null,
    effect: detail.effect || null,
  };
}

function stadiumStatus(row) {
  const issues = [];
  if (!row.isStadiumCard) issues.push('not-recognized-as-stadium');
  if (!row.simReadableText) issues.push('effect-text-not-readable');
  if (row.family === 'unknown' || row.family === 'none') issues.push('unknown-family');
  if (!row.hasPassive && !row.oncePerTurn && !row.setupDraw && row.applyResults === 0) {
    issues.push('no-effect-hooks');
  }

  let status = 'working';
  if (issues.length) status = 'broken';
  else if (row.oncePerTurnKind === 'energy') status = 'partial';
  else if (row.family === 'once-per-turn' || row.family === 'setup-once') status = 'working';
  else if (row.hasPassive || row.applyResults > 0) status = 'working';
  else status = 'partial';

  return { status, issues };
}

function toolStatus(row) {
  const issues = [];
  if (!row.isTool) issues.push('not-recognized-as-tool');
  if (!row.simReadableText) issues.push('effect-text-not-readable');
  if (!row.executorHit) issues.push('no-executor-parser-match');

  return { status: issues.length ? 'broken' : 'working', issues };
}

const BROWSER_AUDIT_FN = async ({ stadiumMetas, toolMetas }) => {
  const { ensureCardData } = await import('/src/setup/rules/rules-state.mjs');
  const stadiumFx = await import('/src/setup/rules/stadium-effects.mjs');
  const executors = await import('/src/setup/rules/ability-executors.mjs');
  const { rulesState, markStadiumPlayed, startGame } = await import('/src/setup/rules/rules-state.mjs');

  const simReadable = (card) =>
    Boolean(
      String(card?.text || card?.ability?.text || card?.abilityText || card?.effect || '').trim()
    );

  const executorProbe = (card) => {
    const hits = [];
    if (executors.parseDamagePrevention(card).preventAll || executors.parseDamagePrevention(card).reduce) {
      hits.push('damage-prevent');
    }
    if (executors.parseDamageReduction(card).reduce) hits.push('damage-reduce');
    if (executors.parseDamageBonus(card).bonus) hits.push('damage-bonus');
    if (executors.parseHpBonus(card).bonus) hits.push('hp-bonus');
    if (executors.parseRetreatCostModifier(card)) hits.push('retreat-cost');
    if (executors.passiveCostDiscount(card)) hits.push('cost-discount');
    if (executors.isHandProtected(card)) hits.push('hand-protect');
    if (executors.parseEnergyRedirect(card)) hits.push('energy-redirect');
    if (executors.parseKoPrevention(card)) hits.push('ko-prevention');
    if (executors.parseThorns(card)) hits.push('thorns');
    if (executors.parseCheckupEffect(card)) hits.push('checkup');
    if (executors.parseEnergyMultiplier(card)) hits.push('energy-multiplier');
    if (executors.parsePrizeModify(card)) hits.push('prize-modify');
    if (executors.parseEffectPrevent(card)) hits.push('effect-prevent');
    if (executors.parseWhenPlayedEffect(card)) hits.push('when-played');
    if (executors.parseEndOfTurnEffect(card)) hits.push('end-of-turn');
    if (executors.parseToolCap(card).extra) hits.push('tool-cap');
    if (executors.parseAttackInheritance(card)) hits.push('attack-inheritance');
    if (executors.parseOnOpponentEvolve(card)) hits.push('on-opponent-evolve');
    if (executors.parseStatusInflict(card)) hits.push('status');
    if (executors.parseMoveDamage(card)) hits.push('move-damage');
    if (executors.parseLookAtTop(card)) hits.push('look-at-top');
    if (executors.parseRecursionFromDiscard(card)) hits.push('recursion');
    if (executors.parseSetupFaceDown(card)) hits.push('setup-face-down');
    return hits;
  };

  const auditStadium = async (meta) => {
    const card = {
      name: meta.name,
      type: 'Trainer',
      trainerType: null,
      subtypes: [],
      id: meta.id,
      number: meta.number,
      set: meta.set,
    };
    await ensureCardData(card);
    const family = stadiumFx.classifyStadiumEffect(card);
    const applied = stadiumFx.applyStadiumEffect(card);
    const once = stadiumFx.parseStadiumOncePerTurn(card);
    const setupDraw = stadiumFx.parseStadiumSetupDraw(card);
    return {
      id: meta.id,
      name: meta.name,
      regulationMark: meta.regulationMark || '',
      effect: card.effect || meta.effect || '',
      enriched: {
        trainerType: card.trainerType || null,
        text: card.text || null,
        effect: card.effect || null,
        subtypes: card.subtypes || [],
      },
      isStadiumCard: stadiumFx.isStadiumCard(card),
      simReadableText: simReadable(card),
      family,
      hasPassive: stadiumFx.hasRecognizedPassiveStadiumEffect(card),
      oncePerTurn: Boolean(once),
      oncePerTurnKind: once?.kind || null,
      setupDraw,
      applyResults: applied.results?.length || 0,
      describe: stadiumFx.describeStadiumEffect(card),
    };
  };

  const auditTool = async (meta) => {
    const card = {
      name: meta.name,
      type: 'Trainer',
      trainerType: null,
      subtypes: [],
      id: meta.id,
      number: meta.number,
      set: meta.set,
    };
    await ensureCardData(card);
    const hits = executorProbe(card);
    const mon = { name: 'Testmon', type: 'Pokémon', hp: 100, image: { relative: { name: 'Host' } } };
    card.image = { relative: mon.image };
    const combined = executors.combinedDamagePrevention(mon, [card]);
    return {
      id: meta.id,
      name: meta.name,
      regulationMark: meta.regulationMark || '',
      effect: card.effect || meta.effect || '',
      enriched: {
        trainerType: card.trainerType || null,
        text: card.text || null,
        effect: card.effect || null,
        subtypes: card.subtypes || [],
      },
      isTool: executors.isPokemonToolCard(card),
      simReadableText: simReadable(card),
      executorHits: hits,
      executorHit: hits.length > 0,
      combatHook:
        combined.preventAll ||
        combined.reduce > 0 ||
        executors.combinedPassiveCostDiscount(mon, [card]) > 0 ||
        executors.combinedHandProtected(mon, [card]),
      parseDamagePrevention: executors.parseDamagePrevention(card),
    };
  };

  // Passive runtime hooks sample (Jamming Tower-style)
  rulesState.enabled = true;
  startGame('self');

  const stadiums = [];
  for (const meta of stadiumMetas) {
    stadiums.push(await auditStadium(meta));
  }

  const tools = [];
  for (const meta of toolMetas) {
    tools.push(await auditTool(meta));
  }

  return { stadiums, tools };
};

async function tryBrowserPlay(page, card, kind) {
  const messages = [];
  page.on('console', (msg) => {
    if (msg.type() === 'log') messages.push(msg.text());
  });

  await page.evaluate(async ({ card, kind }) => {
    const { Card } = await import('/src/setup/deck-constructor/card.js');
    const { getZone } = await import('/src/setup/zones/get-zone.js');
    const { moveCardBundle } = await import('/src/actions/move-card-bundle/move-card-bundle.js');
    const { ensureCardData } = await import('/src/setup/rules/rules-state.mjs');
    const { rulesState, startGame, beginTurn } = await import('/src/setup/rules/rules-state.mjs');

    rulesState.enabled = true;
    startGame('self');
    beginTurn('self');

    const c = new Card('self', card.name, 'Trainer', `https://assets.tcgdex.net/en/${card.id.split('-')[0]}/${card.id.split('-').slice(1).join('-')}/high.webp`, card.number, card.set, card.id);
    await ensureCardData(c);
    getZone('self', 'hand').array.push(c);
    getZone('self', 'hand').element.appendChild(c.image);

    if (kind === 'stadium') {
      moveCardBundle('self', 'self', 'hand', 'board', 0, false, 'move');
    } else {
      const mon = new Card('self', 'Pikachu', 'Pokémon', 'https://images.pokemontcg.io/base1/58.png', '58', 'base1');
      getZone('self', 'active').array.push(mon);
      getZone('self', 'active').element.appendChild(mon.image);
      getZone('self', 'hand').array.push(c);
      moveCardBundle('self', 'self', 'hand', 'active', 0, false, 'move', 0);
    }
  }, { card, kind });

  await page.waitForTimeout(1500);
  const chat = await page.evaluate(() => {
    const box = document.getElementById('chatbox');
    return box ? box.innerText.slice(-2000) : '';
  });
  return { chat, messages };
}

async function main() {
  console.error('Fetching Standard-legal Stadium + Tool cards from TCGdex…');
  const [stadiumDetails, toolDetails] = await Promise.all([
    fetchStandardCards('Stadium'),
    fetchStandardCards('Tool'),
  ]);
  console.error(`  Stadiums: ${stadiumDetails.length}, Tools: ${toolDetails.length}`);

  const stadiumMetas = stadiumDetails.map((d) => ({
    id: d.id,
    name: d.name,
    effect: d.effect || '',
    regulationMark: d.regulationMark || '',
    number: d.localId || null,
    set: d.set?.id || null,
  }));
  const toolMetas = toolDetails.map((d) => ({
    id: d.id,
    name: d.name,
    effect: d.effect || '',
    regulationMark: d.regulationMark || '',
    number: d.localId || null,
    set: d.set?.id || null,
  }));

  // Node-side sanity (pre-browser): realistic deck card before enrichment
  const { classifyStadiumEffect, isStadiumCard, hasRecognizedPassiveStadiumEffect } = await import(
    './client/src/setup/rules/stadium-effects.mjs'
  );
  const { isPokemonToolCard, parseDamagePrevention } = await import(
    './client/src/setup/rules/ability-executors.mjs'
  );

  let nodeBrokenStadium = 0;
  for (const d of stadiumDetails) {
    const card = simCardFromDeck(d);
    card.effect = d.effect;
    if (!isStadiumCard(card) || !hasRecognizedPassiveStadiumEffect(card)) {
      const once = classifyStadiumEffect(card);
      if (once === 'unknown' || once === 'none') nodeBrokenStadium++;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept('Audit') : d.accept()));

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    console.error(`Could not reach ${BASE_URL} — start the server first (node server/server.js).`);
    console.error(e.message);
    process.exit(1);
  }

  const raw = await page.evaluate(BROWSER_AUDIT_FN, { stadiumMetas, toolMetas });

  const stadiumRows = raw.stadiums.map((r) => ({ ...r, ...stadiumStatus(r) }));
  const toolRows = raw.tools.map((r) => ({ ...r, ...toolStatus(r) }));

  const browserSamples = [];
  if (browserPlayN > 0) {
    const sample = [
      ...stadiumRows.filter((r) => r.status === 'broken').slice(0, Math.ceil(browserPlayN / 2)),
      ...stadiumRows.filter((r) => r.status === 'working').slice(0, 2),
      ...toolRows.filter((r) => r.status === 'broken').slice(0, Math.floor(browserPlayN / 2)),
      ...toolRows.filter((r) => r.status === 'working').slice(0, 2),
    ].slice(0, browserPlayN);
    for (const row of sample) {
      const kind = stadiumRows.includes(row) ? 'stadium' : 'tool';
      browserSamples.push({
        id: row.id,
        name: row.name,
        kind,
        ...(await tryBrowserPlay(page, row, kind)),
      });
    }
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'TCGdex legal.standard=true',
    counts: {
      stadiums: stadiumRows.length,
      tools: toolRows.length,
      stadiumBroken: stadiumRows.filter((r) => r.status === 'broken').length,
      stadiumPartial: stadiumRows.filter((r) => r.status === 'partial').length,
      stadiumWorking: stadiumRows.filter((r) => r.status === 'working').length,
      toolBroken: toolRows.filter((r) => r.status === 'broken').length,
      toolPartial: toolRows.filter((r) => r.status === 'partial').length,
      toolWorking: toolRows.filter((r) => r.status === 'working').length,
    },
    rootCauses: {
      effectNotInTextOf:
        'stadium-effects.mjs and ability-executors.mjs read card.text / ability.text but TCGdex stores trainer effect text in card.effect; ensureCardData does not copy effect → text.',
      trainerTypeNotEnriched:
        'ensureCardData does not persist detail.trainerType; isStadiumCard / isPokemonToolCard fail for generic type=Trainer deck rows.',
    },
    brokenStadiums: stadiumRows
      .filter((r) => r.status === 'broken')
      .map(({ id, name, regulationMark, issues, family, effect, enriched }) => ({
        id,
        name,
        regulationMark,
        issues,
        family,
        effect: effect.slice(0, 160),
        enriched,
      })),
    partialStadiums: stadiumRows
      .filter((r) => r.status === 'partial')
      .map(({ id, name, regulationMark, oncePerTurnKind, family, effect }) => ({
        id,
        name,
        regulationMark,
        family,
        oncePerTurnKind,
        effect: effect.slice(0, 160),
      })),
    workingStadiums: stadiumRows.filter((r) => r.status === 'working').map((r) => r.name),
    brokenTools: toolRows
      .filter((r) => r.status === 'broken')
      .map(({ id, name, regulationMark, issues, executorHits, effect, enriched }) => ({
        id,
        name,
        regulationMark,
        issues,
        executorHits,
        effect: effect.slice(0, 160),
        enriched,
      })),
    partialTools: toolRows
      .filter((r) => r.status === 'partial')
      .map(({ id, name, regulationMark, executorHits, effect }) => ({
        id,
        name,
        regulationMark,
        executorHits,
        effect: effect.slice(0, 160),
      })),
    workingTools: toolRows.filter((r) => r.status === 'working').map((r) => r.name),
    browserSamples,
  };

  const outPath = '/opt/cursor/artifacts/stadium-tool-simulator-audit.json';
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== Stadium + Tool IN-SIMULATOR AUDIT ===\n');
  console.log(`Source: TCGdex legal.standard=true (${report.counts.stadiums} stadiums, ${report.counts.tools} tools)`);
  console.log('Method: Playwright + live ensureCardData() in browser (same path as gameplay)\n');

  console.log('--- Summary ---');
  console.log(`Stadiums: ${report.counts.stadiumWorking} working, ${report.counts.stadiumPartial} partial, ${report.counts.stadiumBroken} broken`);
  console.log(`Tools:    ${report.counts.toolWorking} working, ${report.counts.toolPartial} partial, ${report.counts.toolBroken} broken`);
  console.log('');
  console.log('Root causes (systemic):');
  for (const [k, v] of Object.entries(report.rootCauses)) console.log(`  • ${v}`);
  console.log('');

  if (report.brokenStadiums.length) {
    console.log(`--- BROKEN STADIUMS (${report.brokenStadiums.length}) ---`);
    for (const c of report.brokenStadiums) {
      console.log(`\n[${c.regulationMark}] ${c.name} (${c.id})`);
      console.log(`  issues: ${c.issues.join(', ')}`);
      console.log(`  family: ${c.family}`);
      console.log(`  enriched: trainerType=${c.enriched.trainerType} text=${c.enriched.text ? 'set' : 'empty'} effect=${c.enriched.effect ? 'set' : 'empty'}`);
      console.log(`  ${c.effect}${c.effect.length >= 160 ? '…' : ''}`);
    }
  }

  if (report.partialStadiums.length) {
    console.log(`\n--- PARTIAL STADIUMS (${report.partialStadiums.length}) ---`);
    for (const c of report.partialStadiums) {
      console.log(`  [${c.regulationMark}] ${c.name} — ${c.family}${c.oncePerTurnKind ? ` (${c.oncePerTurnKind})` : ''}`);
    }
  }

  if (report.brokenTools.length) {
    console.log(`\n--- BROKEN TOOLS (${report.brokenTools.length}) ---`);
    for (const c of report.brokenTools) {
      console.log(`\n[${c.regulationMark}] ${c.name} (${c.id})`);
      console.log(`  issues: ${c.issues.join(', ')}`);
      console.log(`  enriched: trainerType=${c.enriched.trainerType} text=${c.enriched.text ? 'set' : 'empty'} effect=${c.enriched.effect ? 'set' : 'empty'}`);
      console.log(`  ${c.effect}${c.effect.length >= 160 ? '…' : ''}`);
    }
  }

  if (report.partialTools.length) {
    console.log(`\n--- PARTIAL TOOLS (${report.partialTools.length}) ---`);
    for (const c of report.partialTools) {
      console.log(`  [${c.regulationMark}] ${c.name} — parsers: ${c.executorHits.join(', ') || 'none'}`);
    }
  }

  if (report.workingStadiums.length) {
    console.log(`\n--- WORKING STADIUMS (${report.workingStadiums.length}) ---`);
    console.log(report.workingStadiums.join(', '));
  }
  if (report.workingTools.length) {
    console.log(`\n--- WORKING TOOLS (${report.workingTools.length}) ---`);
    console.log(report.workingTools.join(', '));
  }

  console.log(`\nFull JSON: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
