#!/usr/bin/env node
/**
 * In-simulator audit: every Standard-format Pokémon ability is loaded through
 * ensureCardData() and evaluated with the same modules the live UI uses
 * (classifyAbility, parseAbility, planAbilitySteps, isUsableAbilityCard,
 * passive parsers, when-played / end-of-turn hooks).
 *
 * Requires: running server at http://localhost:4000 + playwright chromium.
 *
 * Usage:
 *   node ability-simulator-audit.mjs [--sets=sv08,me01] [--limit=50] [--out=path.json]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import { getLegalSetRegistry, fetchSetCards } from './client/src/setup/deck-builder/core/set-browser.mjs';
import { tcgAbilityFromDetail } from './client/src/setup/rules/rules-state.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const SERVER = process.env.PTCG_SIM_URL || 'http://localhost:4000';
const detailCache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const setsArg = argv.find((a) => a.startsWith('--sets='));
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const outArg = argv.find((a) => a.startsWith('--out='));
  return {
    setFilter: setsArg ? setsArg.slice('--sets='.length).split(',').map((s) => s.trim()).filter(Boolean) : null,
    limit: limitArg ? Number(limitArg.slice('--limit='.length)) : null,
    out: outArg ? outArg.slice('--out='.length) : '/opt/cursor/artifacts/ability-simulator-audit.json',
  };
}

async function fetchCardDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
  if (!res.ok) throw new Error(`fetch ${id}: ${res.status}`);
  const detail = await res.json();
  detailCache.set(id, detail);
  return detail;
}

async function collectStandardAbilities(setFilter) {
  let registry = getLegalSetRegistry().filter((e) => (e.category || 'standard') !== 'other');
  if (setFilter?.length) {
    registry = registry.filter((e) => setFilter.includes(e.setId));
  }

  const entries = [];
  for (const entry of registry) {
    process.stderr.write(`  listing ${entry.setId} (${entry.name})...\n`);
    try {
      const cards = await fetchSetCards(entry.setId);
      for (const stub of cards) {
        entries.push({
          id: stub.id,
          name: stub.name,
          localId: stub.localId || '',
          setId: entry.setId,
          setName: entry.name,
        });
      }
    } catch (err) {
      process.stderr.write(`  WARN ${entry.setId}: ${err.message}\n`);
    }
    await sleep(60);
  }

  process.stderr.write(`\n${entries.length} card stubs. Resolving abilities...\n`);

  const abilities = [];
  for (let i = 0; i < entries.length; i++) {
    const stub = entries[i];
    if (i > 0 && i % 80 === 0) {
      process.stderr.write(`  detail ${i}/${entries.length}...\n`);
      await sleep(120);
    }
    try {
      const detail = await fetchCardDetail(stub.id);
      if (detail.category !== 'Pokemon') continue;
      const raw = Array.isArray(detail.abilities) ? detail.abilities : [];
      const parsed = raw
        .filter((a) => String(a?.type || '').toLowerCase() === 'ability')
        .map((a) => ({ name: a.name || '', text: a.effect || a.text || '' }));
      if (parsed.length === 0 && detail.ability?.text) {
        parsed.push({ name: detail.ability.name || '', text: detail.ability.text || '' });
      }
      for (const ab of parsed) {
        if (!ab.text && !ab.name) continue;
        abilities.push({ ...stub, abilityName: ab.name, abilityText: ab.text });
      }
    } catch {
      /* skip fetch errors */
    }
  }
  return { registry, abilities };
}

/** Browser-side audit for one ability (runs inside loaded simulator page). */
const BROWSER_AUDIT_FN = async (entry) => {
  const [
    { Card },
    { ensureCardData, rulesState, startGame, beginTurn },
    { classifyAbility, isAbilityCard },
    { parseAbility },
    { planAbilitySteps, actionableAbilityPlan, PASSIVE_ABILITY_STEP_TYPES },
    { isUsableAbilityCard },
    {
      parseWhenPlayedEffect,
      parseEndOfTurnEffect,
      parseDamagePrevention,
      parseDamageReduction,
      parseDamageBonus,
      parseHpBonus,
      parseRetreatCostModifier,
      passiveCostDiscount,
      parseEnergyRedirect,
      isHandProtected,
      parseOpponentDiscard,
      parseEffectPrevent,
      parseThorns,
      parseCheckupEffect,
      parseEnergyMultiplier,
      parseToolCap,
      parsePrizeModify,
      parseKoPrevention,
      parseAttackInheritance,
      parseOnOpponentEvolve,
      parseSetupFaceDown,
      parseStatusInflict,
      parseMoveDamage,
      parseLookAtTop,
      parseRecursionFromDiscard,
    },
    { getZone },
  ] = await Promise.all([
    import('/src/setup/deck-constructor/card.js'),
    import('/src/setup/rules/rules-state.mjs'),
    import('/src/setup/rules/ability-effects.mjs'),
    import('/src/setup/rules/abilities.mjs'),
    import('/src/setup/rules/ability-step-plan.mjs'),
    import('/src/setup/rules/collect-usable-abilities.mjs'),
    import('/src/setup/rules/ability-executors.mjs'),
    import('/src/setup/zones/get-zone.js'),
  ]);

  rulesState.enabled = true;
  startGame('self');
  beginTurn('self');
  rulesState.phase = 'main';

  const placeholder = 'https://images.pokemontcg.io/base1/58_hires.png';
  const card = new Card('self', entry.name, 'Pokémon', placeholder, entry.localId, null, entry.id);

  // Minimal board for executors that peek at zones
  const deck = getZone('self', 'deck');
  const hand = getZone('self', 'hand');
  const discard = getZone('self', 'discard');
  deck.array.length = 0;
  hand.array.length = 0;
  discard.array.length = 0;
  for (let i = 0; i < 10; i++) {
    const c = new Card('self', 'Filler', 'Energy', placeholder);
    deck.array.push(c);
  }
  const activeZone = getZone('self', 'active');
  activeZone.array.length = 0;
  activeZone.element.innerHTML = '';
  activeZone.array.push(card);
  activeZone.element.appendChild(card.image);

  let loadError = null;
  try {
    await ensureCardData(card);
  } catch (err) {
    loadError = String(err?.message || err);
  }

  const abilityText = card.ability?.text ?? card.abilityText ?? '';
  const abilityName = card.ability?.name ?? entry.abilityName ?? '';
  const loaded = !!(abilityText || abilityName);

  const family = classifyAbility(card);
  const steps = parseAbility(abilityText || entry.abilityText);
  const plan = planAbilitySteps(steps, { mode: 'interactive' });
  const actionable = actionableAbilityPlan(plan, { mode: 'interactive' });
  const planActions = plan.map((p) => p.action);
  const actionableActions = actionable.map((p) => p.action);
  const oncePerTurn = /once during your turn/i.test(abilityText || entry.abilityText);
  const usableInPicker = isUsableAbilityCard(card, { rulesEnabled: true, used: false });

  const dp = parseDamagePrevention(card);
  const passiveChecks = {
    damagePrevention: !!(dp?.preventAll || dp?.reduce > 0),
    damageReduction: (parseDamageReduction(card)?.reduce || 0) > 0,
    damageBonus: (parseDamageBonus(card)?.bonus || 0) > 0,
    hpBonus: (parseHpBonus(card)?.bonus || 0) > 0,
    retreatCost: (parseRetreatCostModifier(card)?.delta || 0) !== 0,
    costDiscount: passiveCostDiscount(card) > 0,
    energyRedirect: !!parseEnergyRedirect(card),
    handProtect: isHandProtected(card),
    effectPrevent: !!parseEffectPrevent(card),
    thorns: !!parseThorns(card),
    checkup: !!parseCheckupEffect(card),
    energyMultiplier: !!parseEnergyMultiplier(card),
    toolCap: !!parseToolCap(card),
    prizeModify: (parsePrizeModify(card)?.delta || 0) !== 0,
    koPrevention: !!parseKoPrevention(card),
    attackInheritance: !!parseAttackInheritance(card),
    onOpponentEvolve: !!parseOnOpponentEvolve(card),
    setupFaceDown: !!parseSetupFaceDown(card),
    opponentDiscard: parseOpponentDiscard(card) > 0,
    statusInflict: !!parseStatusInflict(card)?.status,
    moveDamage: !!(parseMoveDamage(card)?.count),
    lookAtTop: !!(parseLookAtTop(card)?.count),
    recursionDiscard: !!(parseRecursionFromDiscard(card)?.count),
  };
  const passiveParser = Object.entries(passiveChecks).find(([, v]) => v)?.[0] || null;

  const whenPlayed = parseWhenPlayedEffect(card);
  const endOfTurn = parseEndOfTurnEffect(card);

  const issues = [];
  let status = 'works';
  let reason = '';

  if (loadError) {
    issues.push({ kind: 'load-error', detail: loadError });
  }
  if (!loaded) {
    status = 'broken';
    reason = 'ability-not-loaded';
    issues.push({ kind: 'ability-not-loaded' });
  } else if (family === 'unknown') {
    status = 'broken';
    reason = 'unknown-family';
    issues.push({ kind: 'unknown-family' });
  } else if (
    steps.length === 1 &&
    steps[0].type === 'passiveAbility' &&
    (abilityText || entry.abilityText).length > 30
  ) {
    status = 'broken';
    reason = 'unrecognized-passive-fallback';
    issues.push({ kind: 'unrecognized-passive-fallback' });
  } else if (oncePerTurn || actionableActions.some((a) => a !== 'announce' && a !== 'skip')) {
    const executable = actionableActions.filter(
      (a) => !['announce', 'opponent-draw', 'skip'].includes(a)
    );
    if (!usableInPicker) {
      status = 'broken';
      reason = 'once-per-turn-not-usable';
      issues.push({ kind: 'once-per-turn-not-usable', planActions, actionableActions });
    } else if (executable.length === 0) {
      status = 'partial';
      reason = 'interactive-announce-only';
      issues.push({ kind: 'interactive-announce-only', actionableActions });
    } else if (family === 'switch') {
      status = 'partial';
      reason = 'switch-manual-drag';
      issues.push({ kind: 'switch-manual-drag' });
    } else if (family === 'opponent-disrupt' && actionableActions.includes('opponent-disrupt')) {
      status = 'partial';
      reason = 'opponent-disrupt-announce';
      issues.push({ kind: 'opponent-disrupt-announce' });
    } else {
      status = 'works';
      reason = `interactive:${executable.join('+')}`;
    }
  } else if (whenPlayed) {
    status = 'works';
    reason = 'when-played-hooked';
  } else if (endOfTurn) {
    status = 'works';
    reason = 'end-of-turn-hooked';
  } else if (passiveParser) {
    status = 'works';
    reason = `passive:${passiveParser}`;
  } else if (
    family === 'passive' ||
    steps.some((s) => PASSIVE_ABILITY_STEP_TYPES.has(s.type))
  ) {
    status = 'partial';
    reason = 'passive-announce-only';
    issues.push({ kind: 'passive-announce-only', family });
  } else if (steps.some((s) => s.type === 'whenPlayedAbility')) {
    status = 'partial';
    reason = 'when-played-not-hooked';
    issues.push({ kind: 'when-played-not-hooked' });
  } else if (steps.some((s) => s.type === 'endOfTurnAbility')) {
    status = 'partial';
    reason = 'end-of-turn-not-hooked';
    issues.push({ kind: 'end-of-turn-not-hooked' });
  } else {
    status = 'partial';
    reason = 'on-play-announce-only';
    issues.push({ kind: 'on-play-announce-only', family });
  }

  // Typed search regression (Firebreather-style)
  const searchStep = steps.find((s) => s.type === 'searchAbility');
  if (searchStep) {
    const raw = (abilityText || entry.abilityText).replace(/\{\s*([A-Za-z])\s*\}/g, '{$1}');
    const symbols = [...raw.matchAll(/\{([A-Za-z])\}/g)].map((m) => m[1].toUpperCase());
    if (symbols.length && !/\{[A-Za-z]\}/.test(searchStep.what)) {
      status = 'broken';
      reason = 'typed-search-collapsed';
      issues.push({ kind: 'typed-search-collapsed', what: searchStep.what, symbols });
    }
  }

  return {
    id: entry.id,
    name: entry.name,
    setId: entry.setId,
    setName: entry.setName,
    abilityName,
    abilityText: (abilityText || entry.abilityText).slice(0, 220),
    loaded,
    family,
    stepTypes: steps.map((s) => s.type),
    planActions,
    actionableActions,
    oncePerTurn,
    usableInPicker,
    passiveParser,
    status,
    reason,
    issues,
  };
};

async function main() {
  const { setFilter, limit, out } = parseArgs(process.argv.slice(2));

  const { registry, abilities: allAbilities } = await collectStandardAbilities(setFilter);
  const abilities = limit ? allAbilities.slice(0, limit) : allAbilities;

  process.stderr.write(
    `\nAuditing ${abilities.length} abilities in simulator at ${SERVER}...\n`
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept('Audit');
    else await d.accept();
  });

  await page.goto(SERVER, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const results = [];
  const BATCH = 8;
  for (let i = 0; i < abilities.length; i += BATCH) {
    const batch = abilities.slice(i, i + BATCH);
    if (i > 0 && i % 40 === 0) {
      process.stderr.write(`  sim ${i}/${abilities.length}...\n`);
    }
    for (const entry of batch) {
      try {
        const row = await page.evaluate(BROWSER_AUDIT_FN, entry);
        results.push(row);
      } catch (err) {
        results.push({
          id: entry.id,
          name: entry.name,
          setName: entry.setName,
          abilityName: entry.abilityName,
          status: 'broken',
          reason: 'sim-eval-error',
          issues: [{ kind: 'sim-eval-error', detail: String(err?.message || err) }],
          abilityText: entry.abilityText.slice(0, 220),
        });
      }
      await sleep(40);
    }
  }

  await browser.close();

  const broken = results.filter((r) => r.status === 'broken');
  const partial = results.filter((r) => r.status === 'partial');
  const works = results.filter((r) => r.status === 'works');

  const byReason = {};
  for (const r of [...broken, ...partial]) {
    byReason[r.reason] = byReason[r.reason] || [];
    byReason[r.reason].push(r);
  }

  const report = {
    meta: {
      auditedAt: new Date().toISOString(),
      sets: registry.length,
      setFilter,
      totalAbilities: results.length,
      works: works.length,
      partial: partial.length,
      broken: broken.length,
      pctWorks: Math.round((100 * works.length) / results.length),
    },
    byReasonCounts: Object.fromEntries(
      Object.entries(byReason)
        .map(([k, v]) => [k, v.length])
        .sort((a, b) => b[1] - a[1])
    ),
    broken,
    partial,
    worksByReason: Object.fromEntries(
      [...new Set(works.map((r) => r.reason))].map((reason) => [
        reason,
        works.filter((r) => r.reason === reason).length,
      ])
    ),
  };

  fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  const mdPath = out.replace(/\.json$/, '.md');
  const brokenByReason = {};
  for (const r of broken) {
    (brokenByReason[r.reason] ||= []).push(r);
  }
  const partialByReason = {};
  for (const r of partial) {
    (partialByReason[r.reason] ||= []).push(r);
  }

  const lines = [
    '# Standard Format Ability Simulator Audit',
    '',
    `Audited **${results.length}** abilities across **${registry.length}** Standard sets.`,
    '',
    '| Status | Count | % |',
    '|--------|------:|--:|',
    `| Works | ${works.length} | ${report.meta.pctWorks}% |`,
    `| Partial | ${partial.length} | ${Math.round((100 * partial.length) / results.length)}% |`,
    `| Broken | ${broken.length} | ${Math.round((100 * broken.length) / results.length)}% |`,
    '',
    '## Broken (do not work)',
    '',
  ];

  for (const [reason, subset] of Object.entries(brokenByReason).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${reason} (${subset.length})`, '');
    for (const r of subset) {
      lines.push(
        `- **${r.name}** (${r.setName}) — *${r.abilityName}*: ${r.abilityText.slice(0, 100)}${r.abilityText.length > 100 ? '…' : ''}`
      );
    }
    lines.push('');
  }

  lines.push('## Partial (parsed but incomplete / announce-only)', '');
  for (const [reason, subset] of Object.entries(partialByReason).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${reason} (${subset.length})`, '');
    for (const r of subset.slice(0, 25)) {
      lines.push(`- **${r.name}** (${r.setName}) — *${r.abilityName}*`);
    }
    if (subset.length > 25) {
      lines.push(`- … and ${subset.length - 25} more (see JSON)`);
    }
    lines.push('');
  }

  fs.writeFileSync(mdPath, lines.join('\n'));

  process.stderr.write(
    `\nDone: ${works.length} works, ${partial.length} partial, ${broken.length} broken\n` +
      `JSON: ${out}\nMD: ${mdPath}\n`
  );

  console.log(JSON.stringify(report.meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
