// Pure classification + ratchet gate over the Trainer corpus (design 035 slice 12). Each unique
// card (name + text) gets gap tags describing what the authoritative server cannot do with it;
// the gate fails when a card that is in the committed baseline gains a tag it did not have, or
// loses its parsed play condition or a parsed step type, or when a baseline card vanishes from the
// corpus (a text edit re-hashes its key). Cards new to the corpus are reported, never failed.
import { parseTrainerEffect } from '../../shared/engine/rules/trainer-effects.mjs';
import { isExecutableStepType } from '../../shared/engine/effects/executor.mjs';

// Parsed steps with no server handler of their own: `passive` is announced (Tool modifiers are
// read by tool-combat / tool-conditions), `discardCost` is paid by the playTrainer case.
const NON_EXECUTED_OK = new Set(['passive', 'discardCost']);

// A step type may be replaced by a richer one without counting as a lost step.
const STEP_UPGRADES = { searchDeck: new Set(['searchDeckSequence']) };

const PICK_STEPS = new Set(['searchDeck', 'recursion', 'shuffleFromDiscard']);
const DRAW_STEPS = new Set(['draw', 'variableDraw', 'drawUntil', 'shuffleHandThenDraw']);
const KIND = '(?:supporter|item|stadium|tool|trainer|energy|pok[ée]mon|basic|evolution)';
const KINDED_SEARCH_RE = new RegExp(`search your deck for (?:an?|\\d+|up to \\d+) [^,.]*?\\b${KIND}\\b`);
const KINDED_DISCARD_RE = new RegExp(
  `put (?:up to )?(?:\\d+|an?) [^,.•]*?\\b${KIND}\\b[^,.•]*? from your discard pile`
);
const TWO_KIND_RE = /search your deck for (?:an?|\d+|up to \d+) [^,.]+? and (?:an?|\d+|up to \d+) [^,.]+?(?=,|\.)/;
// Printed counts on a card pick only: "put 2 damage counters" is not a count of cards.
const COUNTED_RES = [
  /search your deck for (?:up to )?(\d+) /,
  /put (?:up to )?(\d+) [^,.•]*? from your discard pile/,
];
const LEADING_DRAW_RE = /^draw (?:\d+|an?) cards?\./;

function stepCount(step) {
  if (!step || typeof step !== 'object') return 0;
  if (Array.isArray(step.stages)) return step.stages.reduce((n, s) => n + (s.count || 1), 0);
  if (Array.isArray(step.choices)) return step.choices.reduce((n, c) => n + (c.count || 1), 0);
  if (Array.isArray(step.alternatives)) return Math.max(...step.alternatives.map((a) => a.count || 1));
  // A coin flip carries its picks in its branches (Larry, Energy Amplifier, Poké Ball).
  if (step.type === 'coinFlip') {
    const branches = [step.heads, step.tails].flat().filter(Boolean);
    return branches.length ? Math.max(...branches.map(stepCount)) : 0;
  }
  return step.count || 1;
}

/**
 * Gap tags the step types alone cannot show: a pick whose `what` is any card while the
 * text names a kind, a two-kind search parsed as one pick, a printed count the steps drop,
 * and a leading "Draw N cards." with no draw step. (Each one was found by hand in S325–S331.)
 * @param {string} text Printed card text
 * @param {Array<object>} steps Parsed steps
 * @returns {string[]}
 */
export function semanticGaps(text, steps = []) {
  const lower = String(text || '').toLowerCase().replace(/\s+/g, ' ');
  const tags = [];
  const picks = steps.filter((s) => PICK_STEPS.has(s.type));
  const loose = picks.some((s) => !s.what || s.what === 'card');
  if (loose && (KINDED_SEARCH_RE.test(lower) || KINDED_DISCARD_RE.test(lower))) tags.push('loose-what');
  if (TWO_KIND_RE.test(lower) && !steps.some((s) => s.type === 'searchDeckSequence' || s.oneEach)) {
    tags.push('merged-kinds');
  }
  const counted = COUNTED_RES.map((re) => lower.match(re)).find(Boolean);
  if (counted && Number(counted[1]) >= 2 && steps.length) {
    const max = Math.max(...steps.map(stepCount));
    if (max < Number(counted[1])) tags.push('dropped-count');
  }
  if (LEADING_DRAW_RE.test(lower) && steps.length && !steps.some((s) => DRAW_STEPS.has(s.type) || /draw/i.test(s.type))) {
    tags.push('lost-draw');
  }
  return tags;
}

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
  if (parsed.recognizable) gaps.push(...semanticGaps(row?.text || '', parsed.steps || []));
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
    const steps = [...new Set(c.steps || [])].sort();
    cards[c.key] = {
      ...(c.gaps.length ? { gaps: c.gaps } : {}),
      ...(c.playCondition ? { playCondition: c.playCondition } : {}),
      ...(steps.length ? { steps } : {}),
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
 * A baseline entry without `steps` (pre-design-038 format) records no steps, so none can be lost.
 * @returns {{failures: string[], improvements: string[], added: string[], removed: string[]}}
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
    const nowSteps = new Set(c.steps || []);
    for (const t of before.steps || []) {
      if (nowSteps.has(t)) continue;
      const upgraded = [...(STEP_UPGRADES[t] || [])].some((u) => nowSteps.has(u));
      if (upgraded) improvements.push(`${c.key}: step ${t} upgraded`);
      else failures.push(`${c.key}: lost step ${t}`);
    }
  }
  const corpusKeys = new Set(classified.map((c) => c.key));
  const removed = Object.keys(entries).filter((key) => !corpusKeys.has(key));
  for (const key of removed) failures.push(`${key}: in the baseline but not in the corpus`);
  return { failures, improvements, added, removed };
}
