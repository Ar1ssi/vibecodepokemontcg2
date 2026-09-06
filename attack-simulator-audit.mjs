#!/usr/bin/env node
/**
 * In-simulator audit: every Standard-format Pokémon attack is loaded through
 * ensureCardData() and evaluated inside the browser with the same modules the
 * live UI uses (classifyAttackEffect, parseAttackDamage, computeAttackDamage,
 * attack clauses, damage scaling, false-positive detection).
 *
 * Runs inside Playwright Chromium against http://localhost:4000.
 * Auto-starts the server if not running.
 *
 * Usage:
 *   node attack-simulator-audit.mjs [--sets=sv08,me01] [--limit=50] [--out=out/attack-simulator-audit.json]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getLegalSetRegistry, fetchSetCards } from './client/src/setup/deck-builder/core/set-browser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const SERVER = process.env.PTCG_SIM_URL || 'http://localhost:4000';
const CACHE_DIR = path.join(__dirname, '.cache', 'tcgdex-cards');

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
    out: outArg ? outArg.slice('--out='.length) : path.join(__dirname, 'out', 'attack-simulator-audit.json'),
  };
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

function getCachedCardDetail(id) {
  try {
    const filePath = path.join(CACHE_DIR, `${id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // fallback to fetch
  }
  return null;
}

function saveCachedCardDetail(id, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const filePath = path.join(CACHE_DIR, `${id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data));
  } catch {
    // ignore cache write error
  }
}

async function fetchCardDetail(id) {
  const cached = getCachedCardDetail(id);
  if (cached) return cached;

  const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
  if (!res.ok) throw new Error(`fetch ${id}: ${res.status}`);
  const detail = await res.json();
  saveCachedCardDetail(id, detail);
  return detail;
}

function parseDamage(raw) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

function tcgAttackToSim(detail) {
  return (detail.attacks || []).map((a) => ({
    name: a.name || '',
    cost: a.cost || [],
    damage: parseDamage(a.damage),
    text: a.effect || a.text || '',
  }));
}

async function collectStandardPokemon(setFilter) {
  let registry = getLegalSetRegistry().filter((e) => (e.category || 'standard') !== 'other');
  if (setFilter?.length) {
    registry = registry.filter((e) => setFilter.includes(e.setId));
  }

  const entries = [];
  for (const entry of registry) {
    process.stderr.write(`  listing ${entry.setId} (${entry.name || entry.setId})...\n`);
    try {
      const cards = await fetchSetCards(entry.setId);
      for (const stub of cards) {
        entries.push({
          id: stub.id,
          name: stub.name,
          localId: stub.localId || '',
          setId: entry.setId,
          setName: entry.name || entry.setId,
        });
      }
    } catch (err) {
      process.stderr.write(`  WARN ${entry.setId}: ${err.message}\n`);
    }
    await sleep(40);
  }

  process.stderr.write(`\n${entries.length} card stubs. Fetching details for Pokémon...\n`);

  const pokemonList = [];
  const BATCH = 15;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    if (i > 0 && i % 150 === 0) {
      process.stderr.write(`  detail ${i}/${entries.length}...\n`);
    }
    await Promise.all(
      batch.map(async (stub) => {
        try {
          const detail = await fetchCardDetail(stub.id);
          if (detail.category !== 'Pokemon') return;
          const attacks = tcgAttackToSim(detail);
          if (attacks.length === 0) return;
          pokemonList.push({
            ...stub,
            hp: detail.hp || 100,
            types: detail.types || [],
            stage: detail.stage || 'Basic',
            attacks,
          });
        } catch {
          // skip fetch error
        }
      })
    );
    await sleep(20);
  }

  return { registry, pokemonList };
}

/** In-simulator audit function executed inside the browser page */
const BROWSER_AUDIT_FN = async (entry) => {
  const [
    { Card },
    { ensureCardData, rulesState, startGame, beginTurn },
    { classifyAttackEffect, ATTACK_FAMILIES },
    { parseAttackDamage, DAMAGE_COMPONENTS },
    { computeAttackDamage },
    { getZone },
  ] = await Promise.all([
    import('/src/setup/deck-constructor/card.js'),
    import('/src/setup/rules/rules-state.mjs'),
    import('/src/setup/rules/attack-effects.mjs'),
    import('/src/setup/rules/damage-parser.mjs'),
    import('/src/setup/rules/attack-engine.mjs'),
    import('/src/setup/zones/get-zone.js'),
  ]);

  rulesState.enabled = true;
  startGame('self');
  beginTurn('self');
  rulesState.phase = 'attack';

  const placeholder = 'https://images.pokemontcg.io/base1/58_hires.png';
  const attackerCard = new Card('self', entry.name, 'Pokémon', placeholder, entry.localId, null, entry.id);
  const defenderCard = new Card('opp', 'Defender Dummy', 'Pokémon', placeholder, '1', null, 'base1-1');
  defenderCard.hp = 200;
  defenderCard.types = ['Colorless'];
  defenderCard.stage = 'Stage 1';

  // Minimal board for executors and zones
  const selfDeck = getZone('self', 'deck');
  const selfHand = getZone('self', 'hand');
  const selfDiscard = getZone('self', 'discard');
  const selfActive = getZone('self', 'active');
  const oppActive = getZone('opp', 'active');

  selfDeck.array.length = 0;
  selfHand.array.length = 0;
  selfDiscard.array.length = 0;
  for (let i = 0; i < 10; i++) {
    selfDeck.array.push(new Card('self', 'Energy Filler', 'Energy', placeholder));
  }
  selfActive.array.length = 0;
  selfActive.element.innerHTML = '';
  selfActive.array.push(attackerCard);
  selfActive.element.appendChild(attackerCard.image);

  oppActive.array.length = 0;
  oppActive.element.innerHTML = '';
  oppActive.array.push(defenderCard);
  oppActive.element.appendChild(defenderCard.image);

  let loadError = null;
  try {
    await ensureCardData(attackerCard);
    await ensureCardData(defenderCard);
  } catch (err) {
    loadError = String(err?.message || err);
  }

  const attacks = attackerCard.attacks?.length ? attackerCard.attacks : entry.attacks;
  const attackResults = [];

  for (const attack of attacks) {
    const text = String(attack.text || '').trim();
    const hasText = text.length > 0;
    const lowerText = text.toLowerCase();

    let family = 'unknown';
    let classifyError = null;
    try {
      family = classifyAttackEffect(attack, attackerCard);
    } catch (err) {
      family = 'throw';
      classifyError = String(err?.message || err);
    }

    let parsed = null;
    let parseError = null;
    try {
      parsed = parseAttackDamage(attack, attackerCard, defenderCard, {
        energyCount: 2,
        opponentPrizes: 4,
        turnCount: 2,
        attackerHp: attackerCard.hp || 100,
        defenderHp: defenderCard.hp || 200,
        coin: 'heads',
        headsCount: 2,
      });
    } catch (err) {
      parseError = String(err?.message || err);
    }

    let computed = null;
    let computeError = null;
    try {
      computed = computeAttackDamage(attackerCard, defenderCard, {
        ...attack,
        damage: parsed?.total ?? attack.damage ?? 0,
      });
    } catch (err) {
      computeError = String(err?.message || err);
    }

    const issues = [];
    if (classifyError) {
      issues.push({ kind: 'classify-throw', detail: classifyError });
    }
    if (parseError) {
      issues.push({ kind: 'parse-throw', detail: parseError });
    }
    if (computeError) {
      issues.push({ kind: 'compute-throw', detail: computeError });
    }

    // ── False Positive Detection ──
    // 1. Flat with effect text: substantive text present (>8 chars) but classified as 'flat'
    if (family === 'flat' && hasText && text.length > 8) {
      issues.push({ kind: 'flat-with-effect-text', detail: text });
    }

    // 2. Unknown family when text is present
    if (family === 'unknown' && hasText) {
      issues.push({ kind: 'unknown-family', detail: text });
    }

    // 3. Coin flip mentioned but not recognized by family or parsed components
    const mentionsCoin = /flip a coin|flip \d+ coins?|a coin/i.test(lowerText);
    const familyIsCoin = family === 'coin-flip' || family === 'per-heads-coin';
    const parsedHasCoin = parsed?.components?.some((c) => c === 'coin' || c === 'per-heads');
    if (mentionsCoin && !familyIsCoin && !parsedHasCoin && !/if heads|if tails/i.test(lowerText) === false) {
      issues.push({ kind: 'coin-unhandled', detail: text });
    }

    // 4. Status infliction mentioned in text
    const mentionsStatus =
      /is now (asleep|paralyzed|poisoned|burned|confused)|put(s)? (the defending pok[ée]mon|it) to sleep/i.test(lowerText);
    const familyIsStatus =
      family.startsWith('status-') || family === 'dual-status' || family === 'self-status';
    if (mentionsStatus && !familyIsStatus && !/if .*is (asleep|paralyzed|poisoned|burned|confused)/i.test(lowerText)) {
      issues.push({ kind: 'status-unhandled', detail: text });
    }

    // 5. Bench damage mentioned in text (actual damage dealt to a benched Pokémon)
    const dealsDamageToBench =
      /(?:damage|damage counters?)\s+to\s+(?:1 of\s+)?(?:your\s+|your opponent's\s+|a\s+)?benched|to\s+(?:each|all)\s+of\s+your\s+opponent's\s+benched|damage\s+to\s+(?:a|the)\s+bench/i.test(
        lowerText
      );
    const familyIsBench = family === 'bench-damage' || family === 'multi-target';
    if (dealsDamageToBench && !familyIsBench && (parsed?.bench ?? 0) === 0) {
      issues.push({ kind: 'bench-damage-unhandled', detail: text });
    }

    // 6. Healing mentioned in text
    const mentionsHeal = /(heal \d+ damage|remove \d+ damage counter)/i.test(lowerText);
    const familyIsHeal = family === 'heal' || family === 'mirror-heal';
    if (mentionsHeal && !familyIsHeal && (parsed?.heal ?? 0) === 0) {
      issues.push({ kind: 'heal-unhandled', detail: text });
    }

    // 7. Self-damage mentioned in text
    const mentionsSelfDamage = /(this pok[ée]mon|it) (also )?does \d+ damage to itself/i.test(lowerText);
    const hasSelfDamageComponent = parsed?.components?.includes('self-damage');
    const coinGatedTailsSelfDamage = /tails.*does \d+ damage to itself/i.test(lowerText);
    if (mentionsSelfDamage && family !== 'self-damage' && (parsed?.selfDamage ?? 0) === 0 && !coinGatedTailsSelfDamage && !hasSelfDamageComponent) {
      issues.push({ kind: 'self-damage-unhandled', detail: text });
    }

    // 8. Damage is NaN
    if (Number.isNaN(parsed?.total) || Number.isNaN(computed?.total)) {
      issues.push({ kind: 'damage-is-nan' });
    }

    let status = 'works';
    let reason = family;

    if (issues.some((i) => i.kind.includes('throw') || i.kind === 'damage-is-nan')) {
      status = 'broken';
      reason = 'eval-throw';
    } else if (issues.some((i) => i.kind === 'flat-with-effect-text')) {
      status = 'broken';
      reason = 'flat-with-effect-text';
    } else if (issues.some((i) => i.kind === 'unknown-family')) {
      status = 'broken';
      reason = 'unknown-family';
    } else if (issues.some((i) => i.kind.endsWith('-unhandled'))) {
      status = 'broken';
      reason = issues.find((i) => i.kind.endsWith('-unhandled')).kind;
    } else if (family === 'copy-attack' || family === 'devolve-opponent' || family === 'look-opponent-deck') {
      status = 'partial';
      reason = `${family}:announce-only`;
    }

    attackResults.push({
      attackName: attack.name,
      damage: attack.damage,
      text: text.slice(0, 200),
      family,
      parsedTotal: parsed?.total,
      parsedComponents: parsed?.components || [],
      computedTotal: computed?.total,
      status,
      reason,
      issues,
    });
  }

  return {
    id: entry.id,
    name: entry.name,
    setId: entry.setId,
    setName: entry.setName,
    attacks: attackResults,
    loadError,
  };
};

async function main() {
  const { setFilter, limit, out } = parseArgs(process.argv.slice(2));

  await ensureServerRunning();

  process.stderr.write('Collecting Pokémon and attacks from Standard 2026-2027 sets...\n');
  const { registry, pokemonList: allPokemon } = await collectStandardPokemon(setFilter);
  const pokemonList = limit ? allPokemon.slice(0, limit) : allPokemon;

  const totalAttacks = pokemonList.reduce((sum, p) => sum + p.attacks.length, 0);
  process.stderr.write(
    `\nAuditing ${pokemonList.length} Pokémon (${totalAttacks} attacks) across ${registry.length} sets in simulator...\n`
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept('Audit');
    else await d.accept();
  });

  await page.goto(SERVER, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const results = [];
  const BATCH = 10;
  for (let i = 0; i < pokemonList.length; i += BATCH) {
    const batch = pokemonList.slice(i, i + BATCH);
    if (i > 0 && i % 50 === 0) {
      process.stderr.write(`  sim ${i}/${pokemonList.length} Pokémon...\n`);
    }
    for (const entry of batch) {
      try {
        const row = await page.evaluate(BROWSER_AUDIT_FN, entry);
        results.push(row);
      } catch (err) {
        results.push({
          id: entry.id,
          name: entry.name,
          setId: entry.setId,
          setName: entry.setName,
          loadError: String(err?.message || err),
          attacks: entry.attacks.map((a) => ({
            attackName: a.name,
            damage: a.damage,
            text: a.text,
            status: 'broken',
            reason: 'page-eval-error',
            issues: [{ kind: 'page-eval-error', detail: String(err?.message || err) }],
          })),
        });
      }
      await sleep(20);
    }
  }

  await browser.close();

  // Aggregate attack-level stats
  const allAuditedAttacks = [];
  for (const card of results) {
    for (const atk of card.attacks) {
      allAuditedAttacks.push({
        cardId: card.id,
        cardName: card.name,
        setId: card.setId,
        setName: card.setName,
        ...atk,
      });
    }
  }

  const brokenAttacks = allAuditedAttacks.filter((a) => a.status === 'broken');
  const partialAttacks = allAuditedAttacks.filter((a) => a.status === 'partial');
  const workingAttacks = allAuditedAttacks.filter((a) => a.status === 'works');

  const brokenByReason = {};
  for (const a of brokenAttacks) {
    (brokenByReason[a.reason] ||= []).push(a);
  }

  const partialByReason = {};
  for (const a of partialAttacks) {
    (partialByReason[a.reason] ||= []).push(a);
  }

  const report = {
    meta: {
      auditedAt: new Date().toISOString(),
      setsScanned: registry.length,
      setFilter,
      totalPokemon: results.length,
      totalAttacks: allAuditedAttacks.length,
      works: workingAttacks.length,
      partial: partialAttacks.length,
      broken: brokenAttacks.length,
      pctWorks: allAuditedAttacks.length
        ? Math.round((100 * workingAttacks.length) / allAuditedAttacks.length)
        : 0,
    },
    brokenByReason: Object.fromEntries(
      Object.entries(brokenByReason).map(([k, v]) => [k, v.length])
    ),
    partialByReason: Object.fromEntries(
      Object.entries(partialByReason).map(([k, v]) => [k, v.length])
    ),
    broken: brokenAttacks,
    partial: partialAttacks,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  // Write Markdown summary
  const mdPath = out.replace(/\.json$/, '.md');
  const lines = [
    '# Standard 2026-2027 Pokémon Attack In-Simulator Audit',
    '',
    `Audited **${allAuditedAttacks.length}** attacks across **${results.length}** Pokémon in **${registry.length}** Standard sets.`,
    '',
    '| Status | Count | % |',
    '|---|---:|---:|',
    `| Works | ${workingAttacks.length} | ${report.meta.pctWorks}% |`,
    `| Partial | ${partialAttacks.length} | ${Math.round((100 * partialAttacks.length) / allAuditedAttacks.length)}% |`,
    `| Broken / False Positive | ${brokenAttacks.length} | ${Math.round((100 * brokenAttacks.length) / allAuditedAttacks.length)}% |`,
    '',
    '## Broken / False Positives (Need Fixes)',
    '',
  ];

  for (const [reason, subset] of Object.entries(brokenByReason).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${reason} (${subset.length})`, '');
    for (const a of subset.slice(0, 30)) {
      lines.push(`- **${a.cardName}** (${a.setName}) — *${a.attackName}*: \`${a.text}\``);
    }
    if (subset.length > 30) {
      lines.push(`- … and ${subset.length - 30} more`);
    }
    lines.push('');
  }

  lines.push('## Partial (Announce-Only / Heuristic)', '');
  for (const [reason, subset] of Object.entries(partialByReason).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${reason} (${subset.length})`, '');
    for (const a of subset.slice(0, 15)) {
      lines.push(`- **${a.cardName}** (${a.setName}) — *${a.attackName}*`);
    }
    if (subset.length > 15) {
      lines.push(`- … and ${subset.length - 15} more`);
    }
    lines.push('');
  }

  fs.writeFileSync(mdPath, lines.join('\n'));

  process.stderr.write(
    `\nAudit Complete:\n  Works: ${workingAttacks.length}\n  Partial: ${partialAttacks.length}\n  Broken / False Positives: ${brokenAttacks.length}\n` +
      `  JSON: ${out}\n  MD: ${mdPath}\n`
  );
  console.log(JSON.stringify(report.meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
