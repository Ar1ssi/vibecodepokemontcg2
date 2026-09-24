// Pure classification + ratchet gate over the Trainer corpus (design 035 slice 12). Each unique
// card (name + text) gets gap tags describing what the authoritative server cannot do with it;
// the gate fails when a card that is in the committed baseline gains a tag it did not have, or
// loses its parsed play condition. Cards new to the corpus are reported, never failed.
import { parseTrainerEffect } from '../../shared/engine/rules/trainer-effects.mjs';
import { isExecutableStepType } from '../../shared/engine/effects/executor.mjs';

// Parsed steps with no server handler of their own: `passive` is announced (Tool modifiers are
// read by tool-combat / tool-conditions), `discardCost` is paid by the playTrainer case.
const NON_EXECUTED_OK = new Set(['passive', 'discardCost']);

/** Stable key for a card printing group: reprints with identical text share one key. */
export function trainerKey(row) {
  const text = String(row?.text || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return `${row?.name || '(unnamed)'}#${hash.toString(36)}`;
}

/**
 * @param {{name: string, text: string, subtype?: string}} row A corpus row
 * @returns {{key: string, name: string, subtype: string, gaps: string[], serverMissing: string[],
 *   playCondition: string|null, steps: string[]}}
 */
export function classifyTrainer(row) {
  const parsed = parseTrainerEffect(row?.text || '');
  const steps = (parsed.steps || []).map((s) => s.type);
  const gaps = [];
  if (!parsed.recognizable) gaps.push('unrecognizable');
  else if (steps.length === 0) gaps.push('empty');
  else if (steps.every((t) => t === 'passive')) gaps.push('passive-only');
  const serverMissing = [
    ...new Set(steps.filter((t) => !NON_EXECUTED_OK.has(t) && !isExecutableStepType(t))),
  ].sort();
  for (const t of serverMissing) gaps.push(`server-missing:${t}`);
  return {
    key: trainerKey(row),
    name: row?.name || '',
    subtype: row?.subtype || '',
    gaps,
    serverMissing,
    playCondition: parsed.playCondition || null,
    steps,
  };
}

/** Dedupes reprints and classifies every unique card, sorted by key. */
export function classifyCorpus(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = trainerKey(row);
    if (!byKey.has(key)) byKey.set(key, classifyTrainer(row));
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The committed snapshot: only what the gate compares, keyed by card. */
export function baselineOf(classified) {
  const cards = {};
  for (const c of classified) {
    if (c.gaps.length === 0 && !c.playCondition) {
      cards[c.key] = {};
      continue;
    }
    cards[c.key] = {
      ...(c.gaps.length ? { gaps: c.gaps } : {}),
      ...(c.playCondition ? { playCondition: c.playCondition } : {}),
    };
  }
  return { cards: Object.keys(cards).length, entries: cards };
}

/** Per-tag card counts, for the summary table. */
export function gapTally(classified) {
  const tally = {};
  for (const c of classified) {
    for (const g of c.gaps) tally[g] = (tally[g] || 0) + 1;
  }
  return tally;
}

/**
 * @returns {{failures: string[], improvements: string[], added: string[]}}
 */
export function checkTrainerGate(classified, baseline) {
  const failures = [];
  const improvements = [];
  const added = [];
  const entries = baseline?.entries || {};
  for (const c of classified) {
    const before = entries[c.key];
    if (!before) {
      added.push(c.key);
      continue;
    }
    const beforeGaps = new Set(before.gaps || []);
    const nowGaps = new Set(c.gaps);
    for (const g of nowGaps) {
      if (!beforeGaps.has(g)) failures.push(`${c.key}: new gap ${g}`);
    }
    for (const g of beforeGaps) {
      if (!nowGaps.has(g)) improvements.push(`${c.key}: closed ${g}`);
    }
    if (before.playCondition && before.playCondition !== c.playCondition) {
      failures.push(`${c.key}: play condition ${before.playCondition} → ${c.playCondition || 'none'}`);
    } else if (!before.playCondition && c.playCondition) {
      improvements.push(`${c.key}: play condition ${c.playCondition}`);
    }
  }
  return { failures, improvements, added };
}
