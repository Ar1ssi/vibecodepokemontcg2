#!/usr/bin/env node
/**
 * Bulk audit: parse every Pokémon ability in Standard 2026-27 rotation sets.
 * Uses TCGdex `abilities[]` shape (type/name/effect) and the same
 * tcgAbilityFromDetail() mapper that ensureCardData() applies after the fix.
 */
import { getLegalSetRegistry, fetchSetCards } from './client/src/setup/deck-builder/core/set-browser.mjs';
import { parseAbility } from './client/src/setup/rules/abilities.mjs';
import {
  classifyAbility,
  classifyAbilityFamilies,
} from './client/src/setup/rules/ability-effects.mjs';
import { tcgAbilityFromDetail } from './client/src/setup/rules/rules-state.mjs';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const detailCache = new Map();

function tcgAbilityToSim(detail) {
  // What ensureCardData() loads (via tcgAbilityFromDetail)
  const simCurrent = tcgAbilityFromDetail(detail);

  // Legacy path (pre-fix): detail.ability only — kept for before/after comparison
  const simLegacy = detail.ability || null;

  // All Ability entries from TCGdex v2 abilities[]
  const raw = Array.isArray(detail.abilities) ? detail.abilities : [];
  const parsed = raw
    .filter((a) => String(a?.type || '').toLowerCase() === 'ability')
    .map((a) => ({ name: a.name || '', text: a.effect || a.text || '' }));

  return { simCurrent, simLegacy, tcgAbilities: parsed };
}

async function fetchCardDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
  if (!res.ok) throw new Error(`Failed ${id}: ${res.status}`);
  const detail = await res.json();
  detailCache.set(id, detail);
  return detail;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const STEP_TO_FAMILY = {
  searchAbility: 'search',
  drawAbility: 'draw',
  opponentDraw: 'draw',
  switchAbility: 'switch',
  healAbility: 'heal',
  attachAbility: 'attach',
  moveEnergyAbility: 'energy-redirect',
  moveDamageAbility: 'move-damage',
  opponentDisruptAbility: 'opponent-disrupt',
  recursionAbility: 'recursion',
  evolveAbility: 'evolve',
  lookAtTopAbility: 'look-at-top',
  whenPlayedAbility: 'when-played',
  endOfTurnAbility: 'end-of-turn',
  statusAbility: 'status',
  koPreventionAbility: 'ko-prevention',
  retreatCostAbility: 'retreat-cost',
  costDiscountAbility: 'cost-discount',
  hpBonusAbility: 'hp-bonus',
  weaknessAbility: 'weakness',
  damageReductionAbility: 'damage-reduce',
  damageBonusAbility: 'damage-bonus',
  damagePreventAbility: 'damage-prevent',
  setupAbility: 'setup',
  toolCapAbility: 'tool-cap',
  prizeModifyAbility: 'prize-modify',
  effectPreventAbility: 'effect-prevent',
  energyMultiplierAbility: 'energy-multiplier',
  thornsAbility: 'thorns',
  passiveAbility: 'passive',
};

const EXECUTED_FAMILIES = new Set([
  'search',
  'draw',
  'switch',
  'heal',
  'attach',
  'when-played',
  'end-of-turn',
  'damage-prevent',
  'energy-redirect',
  'move-energy',
  'hand-protect',
  'opponent-disrupt',
  'cost-discount',
  'move-damage',
  'status',
  'look-at-top',
  'recursion',
  'evolve',
  'passive',
  'damage-reduce',
  'damage-bonus',
  'effect-prevent',
  'thorns',
  'checkup',
  'attack-inheritance',
  'on-opponent-evolve',
  'ko-prevention',
  'retreat-cost',
  'hp-bonus',
  'weakness',
  'setup',
  'tool-cap',
  'prize-modify',
  'energy-multiplier',
]);

function analyzeAbility(card, abilityName, abilityText) {
  const cardForClassify = { name: card.name, ability: { name: abilityName, text: abilityText } };
  const steps = parseAbility(abilityText);
  const family = classifyAbility(cardForClassify);
  const families = classifyAbilityFamilies(cardForClassify);
  const stepTypes = steps.map((s) => s.type);
  const stepFamilies = [...new Set(stepTypes.map((t) => STEP_TO_FAMILY[t]).filter(Boolean))];

  const issues = [];

  if (family === 'unknown') {
    issues.push({ kind: 'unknown-family', severity: 'high' });
  }

  if (steps.length === 1 && steps[0].type === 'passiveAbility' && abilityText.length > 30) {
    issues.push({ kind: 'unrecognized-passive-fallback', severity: 'high' });
  }

  if (
    family !== 'unknown' &&
    stepFamilies.length > 0 &&
    !stepFamilies.includes(family) &&
    !(family === 'passive' && stepFamilies.includes('passive'))
  ) {
    issues.push({
      kind: 'classifier-parser-mismatch',
      severity: 'medium',
      detail: `classify=${family}, parse=${stepFamilies.join('+')}`,
    });
  }

  if (stepTypes.length > 1) {
    issues.push({ kind: 'compound-effect', severity: 'info', detail: stepTypes.join('+') });
  }

  if (family !== 'unknown' && !EXECUTED_FAMILIES.has(family)) {
    issues.push({ kind: 'announce-only-family', severity: 'low' });
  }

  const searchStep = steps.find((s) => s.type === 'searchAbility');
  if (searchStep) {
    const normalized = abilityText.replace(/\{\s*([A-Za-z])\s*\}/g, '{$1}');
    const symbolsInText = [...normalized.matchAll(/\{([A-Za-z])\}/g)].map((m) =>
      m[1].toUpperCase()
    );
    const symbolInWhat = searchStep.what.match(/\{([A-Za-z])\}/);
    if (symbolsInText.length > 0 && !symbolInWhat) {
      issues.push({
        kind: 'typed-symbol-collapsed',
        severity: 'high',
        detail: `text has {${symbolsInText.join('}/{')}} but what="${searchStep.what}"`,
      });
    }
    if (
      /basic\s+\{[a-z]\}\s+energy/i.test(abilityText) &&
      searchStep.what === 'Energy'
    ) {
      issues.push({
        kind: 'typed-energy-collapsed',
        severity: 'high',
        detail: `what="${searchStep.what}"`,
      });
    }
  }

  return { steps, family, families, stepTypes, stepFamilies, issues };
}

function parseSetFilter(argv) {
  const setsArg = argv.find((a) => a.startsWith('--sets='));
  if (!setsArg) return null;
  return setsArg.slice('--sets='.length).split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const setFilter = parseSetFilter(process.argv.slice(2));
  let registry = getLegalSetRegistry();
  if (setFilter?.length) {
    registry = registry.filter((e) => setFilter.includes(e.setId));
    if (registry.length === 0) {
      throw new Error(`No matching sets for filter: ${setFilter.join(', ')}`);
    }
  }

  process.stderr.write(
    `Auditing ${registry.length} Standard 2026-27 set${registry.length === 1 ? '' : 's'}${setFilter ? ` (${setFilter.join(', ')})` : ''}...\n`
  );

  const allCards = [];
  for (const entry of registry) {
    process.stderr.write(`  Fetching ${entry.setId} (${entry.name})...\n`);
    try {
      const cards = await fetchSetCards(entry.setId);
      allCards.push(...cards.map((c) => ({ ...c, setId: entry.setId, setName: entry.name })));
    } catch (err) {
      process.stderr.write(`  WARN: ${entry.setId}: ${err.message}\n`);
    }
    await sleep(80);
  }

  process.stderr.write(`\n${allCards.length} cards listed. Fetching ability details...\n`);

  const abilityRows = [];
  let fetchErrors = 0;
  let simWouldMissLegacy = 0;
  let simWouldMiss = 0;

  for (let i = 0; i < allCards.length; i++) {
    const stub = allCards[i];
    if (i > 0 && i % 100 === 0) {
      process.stderr.write(`  ${i}/${allCards.length}...\n`);
      await sleep(150);
    }
    try {
      const detail = await fetchCardDetail(stub.id);
      if (detail.category !== 'Pokemon') continue;

      const { simCurrent, simLegacy, tcgAbilities } = tcgAbilityToSim(detail);
      if (tcgAbilities.length === 0) continue;

      if (!simLegacy?.text && !simLegacy?.name) simWouldMissLegacy++;
      if (!simCurrent?.text && !simCurrent?.name) simWouldMiss++;

      for (const ab of tcgAbilities) {
        const row = {
          id: detail.id,
          name: detail.name,
          setId: stub.setId,
          setName: stub.setName,
          abilityName: ab.name,
          abilityText: ab.text,
          simLoadsAbility: !!(simCurrent?.text || simCurrent?.name),
          ...analyzeAbility({ name: detail.name }, ab.name, ab.text),
        };
        abilityRows.push(row);
      }
    } catch {
      fetchErrors++;
    }
  }

  const unknownCount = abilityRows.filter((r) => r.family === 'unknown').length;
  const simMissCount = abilityRows.filter((r) => !r.simLoadsAbility).length;

  process.stderr.write(
    `\n${abilityRows.length} abilities on ${new Set(abilityRows.map((r) => r.id)).size} Pokémon ` +
      `(legacy miss ${simWouldMissLegacy}, fixed miss ${simWouldMiss}, unknown-family ${unknownCount}, ` +
      `simLoadsAbility miss ${simMissCount}, ${fetchErrors} fetch errors)\n`
  );

  const byFamily = {};
  const byIssueKind = {};
  const high = [];
  const medium = [];

  for (const r of abilityRows) {
    byFamily[r.family] = (byFamily[r.family] ?? 0) + 1;
    for (const issue of r.issues) {
      byIssueKind[issue.kind] = (byIssueKind[issue.kind] ?? 0) + 1;
      if (issue.severity === 'high') {
        high.push(r);
      } else if (issue.severity === 'medium') {
        medium.push(r);
      }
    }
  }

  // Group high-severity by ability text pattern
  const groupByText = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const key = r.abilityText.slice(0, 120);
      if (!m.has(key)) {
        m.set(key, {
          abilityName: r.abilityName,
          textSample: r.abilityText,
          family: r.family,
          stepTypes: r.stepTypes,
          cards: [],
        });
      }
      m.get(key).cards.push(`${r.name} (${r.setName})`);
    }
    return [...m.values()].sort((a, b) => b.cards.length - a.cards.length);
  };

  const report = {
    meta: {
      setsAudited: registry.length,
      setFilter: setFilter || null,
      totalCardsScanned: allCards.length,
      pokemonWithAbilities: new Set(abilityRows.map((r) => r.id)).size,
      totalAbilityEntries: abilityRows.length,
      simDataLoading: {
        cardsWithTcgAbilitiesButNoLegacyDetailAbility: simWouldMissLegacy,
        cardsWithTcgAbilitiesButNoFixedAbilityLoad: simWouldMiss,
        simLoadsAbilityMissCount: simMissCount,
        unknownFamilyCount: unknownCount,
        description:
          'ensureCardData() uses tcgAbilityFromDetail() to read abilities[] when detail.ability is empty',
      },
      fetchErrors,
    },
    familyCounts: Object.fromEntries(Object.entries(byFamily).sort((a, b) => b[1] - a[1])),
    issueCounts: byIssueKind,
    executedFamilyCoverage: {
      executed: abilityRows.filter((r) => EXECUTED_FAMILIES.has(r.family)).length,
      announceOnly: abilityRows.filter((r) => r.issues.some((i) => i.kind === 'announce-only-family')).length,
      pctExecuted: Math.round(
        (100 * abilityRows.filter((r) => EXECUTED_FAMILIES.has(r.family)).length) / abilityRows.length
      ),
    },
    highSeverityGroups: groupByText(high).slice(0, 40),
    mediumSeverityGroups: groupByText(medium).slice(0, 30),
    compoundEffects: abilityRows
      .filter((r) => r.stepTypes.length > 1)
      .map((r) => ({
        name: r.name,
        set: r.setName,
        abilityName: r.abilityName,
        steps: r.stepTypes,
        family: r.family,
        text: r.abilityText.slice(0, 180),
      })),
    announceOnlyByFamily: Object.fromEntries(
      [...new Set(abilityRows.map((r) => r.family))]
        .filter((f) => !EXECUTED_FAMILIES.has(f))
        .sort()
        .map((f) => [
          f,
          {
            count: abilityRows.filter((r) => r.family === f).length,
            examples: abilityRows
              .filter((r) => r.family === f)
              .slice(0, 5)
              .map((r) => ({ name: r.name, abilityName: r.abilityName })),
          },
        ])
    ),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
