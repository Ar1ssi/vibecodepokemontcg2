// Attack behaviour classes and ratchet gate over unique effect-text attacks (design 036 slice
// 16). attack-harness.mjs runs each unique attack on a rich board; this module judges the
// observation (ok / partial / ran-no-effect / engine-error), tallies per family, and compares
// every row with the committed baseline so an attack that stops working fails the gate instead
// of drifting back in silently.
import { classifyAttackEffect } from '../../shared/engine/rules/attack-effects.mjs';
import { mon, DEFAULT_SEEDS } from './oracle-harness.mjs';
import { runAttackRich } from './attack-harness.mjs';
import { splitCard } from './split-card-text.mjs';

/**
 * ok           the attack executed and its printed sentences have a matching state change
 * partial      it ran, but a sentence mechanic has no observable state change
 * ran-no-effect it executed and changed nothing at all
 * engine-error the reducer threw on every seed that did not execute
 */
export const ATTACK_CLASSES = ['ok', 'partial', 'ran-no-effect', 'engine-error'];

const RANK = { ok: 3, partial: 2, 'ran-no-effect': 1, 'engine-error': 0 };

/** Higher is better; a verdict may only move up without a baseline refresh. */
export const verdictRank = (verdict) => RANK[verdict] ?? -1;

/** Stable case/whitespace-insensitive form for keys and sentence checks. */
export function normalizeAttackText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unique-attack key: reprints of the same name + text share one key. */
export function attackKey(name, text) {
  const norm = `${normalizeAttackText(name)}|${normalizeAttackText(text)}`;
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  return `${normalizeAttackText(name) || '(unnamed)'}#${hash.toString(36)}`;
}

// Sentence mechanics with the state tag that proves each one ran (S279 probe's cross-check).
const MECH = [
  ['switch-self', /switch this pokémon with 1 of your benched/, /^own:active-changed$/],
  [
    'gust',
    /(switch (in|out)[^.]*your opponent's|your opponent switches|switch[^.]*your opponent's benched pokémon with)/,
    /^opp:active-changed$/,
  ],
  [
    'attach-from-deck',
    /(search your deck for[^.]*energy[^.]*attach|attach[^.]*from your deck|attach (it|them) to)/,
    /^own:(deck|discard)->attached$/,
  ],
  ['attach-from-hand', /attach[^.]*from your hand/, /^own:hand->attached$/],
  ['attach-from-discard', /attach[^.]*from your discard pile/, /^own:discard->attached$/],
  [
    'search-to-bench',
    /(put (it|them|that card|those cards) (on|onto) your bench|(on|onto|to) your bench(?!ed))/,
    /^own:(deck|discard)->bench$/,
  ],
  ['search-to-hand', /(search your deck for|look through your deck)/, /^own:deck->hand$/],
  ['draw', /draw (a|an|\d+|\w+) cards?|draw cards until/, /^own:deck->hand$/],
  ['draw-opp', /your opponent draws/, /^opp:deck->hand$/],
  [
    'discard-opp-hand',
    /(your opponent discards|discard[^.]*from your opponent's hand)/,
    /^opp:hand->(discard|deck)$/,
  ],
  [
    'discard-own-hand',
    /(discard your hand|discard \d+ cards? from your hand|discard a card from your hand)/,
    /^own:hand->(discard|deck)$/,
  ],
  ['heal', /heal \d+ damage/, /^own:heal$/],
  [
    'status-opp',
    /(opponent's active pokémon|defending pokémon)[^.]*is now (asleep|burned|confused|paralyzed|poisoned)/,
    /^opp:status$/,
  ],
  ['status-self', /this pokémon is now (asleep|burned|confused|paralyzed|poisoned)/, /^own:status$/],
  [
    'counters-opp',
    /(put|place) (\d+|a|an|\w+) damage counters? on[^.]*opponent/,
    /^opp:(active|bench|attached)\+dmg$/,
  ],
  [
    'move-damage',
    /\bmove (\d+|up to \d+|all|a) damage counters?/,
    /(opp|own):(active|bench)\+dmg|own:heal/,
  ],
  [
    'move-energy',
    /\bmove (an|a|\d+|all|up to \d+) [^.]*energy[^.]*(from|to)/,
    /attached-move|own:(bench|active)->attached|own:attached->attached/,
  ],
  [
    'discard-self-energy',
    /discard (an|a|\d+|all|up to \d+|all basic)[^.]*energy[^.]*(from|attached to) (this pokémon|it\b)/,
    /^own:attached->(discard|lostZone|gone)$/,
  ],
  [
    'discard-opp-energy',
    /discard (an|a|\d+|all|up to \d+|a special)[^.]*energy[^.]*(from|attached to) (your opponent's|the defending|each of your opponent's|1 of your opponent's)/,
    /^opp:attached->(discard|gone|lostZone)$/,
  ],
  ['recover-to-hand', /put[^.]*from your discard pile into your hand/, /^own:discard->hand$/],
  ['recover-to-deck', /shuffle[^.]*from your discard pile into your deck/, /^own:discard->deck$/],
  ['shuffle-self-deck', /shuffle this pokémon and all attached cards into your deck/, /^own:active->deck$/],
  [
    'bounce-opp',
    /(put|return|shuffle) your opponent's active pokémon and all attached cards into (his or her|their) (hand|deck)/,
    /^opp:active->(hand|deck)$/,
  ],
  ['take-prize', /take (\d+|an?|1) (more )?prize cards?/, /^own:prizes->hand$/],
  ['opp-shuffle-hand', /your opponent shuffles (his or her|their) hand/, /^opp:hand->deck$/],
  ['discard-opp-tool', /discard (a|all|\d+)? ?pokémon tools?[^.]*your opponent/, /^opp:attached->(discard|gone)$/],
  ['devolve', /devolve/, /^opp:(attached|active|bench)->(hand|deck)$/],
  ['mill-self', /discard the top (\d+ cards?|card) of your deck/, /^own:deck->discard$/],
  ['mill-opp', /discard the top (\d+ cards?|card) of your opponent's deck/, /^opp:deck->discard$/],
  ['lost-zone', /(put|send)[^.]*(in|into) the lost zone/, /->lostZone$/],
];

const CONDITIONAL =
  /\bif\b|\bwhen(ever)?\b|during your next turn|during your opponent's next turn|until the end|as long as|for each|\bunless\b/;

// Events only these producers emit: their presence is evidence the attack's text ran even when
// the board diff alone shows nothing (a pure look, a marker, an entitlement).
const MEANINGFUL = new Set([
  'attackMarkerAdded',
  'cardsLookedAt',
  'cardsRevealed',
  'deckReordered',
  'cardsLostZoned',
  'prizeEntitlementGranted',
  'prizeSwapped',
  'prizeHandSwapped',
  'prizesTaken',
  'knockOutMarked',
  'pokemonDevolved',
  'pokemonEvolved',
  'cardsMovedToDeckBottom',
  'cardsMovedToDeckTop',
  'energyReturned',
]);

/** Printed sentences whose mechanic has no matching state tag. */
export function attackMismatches(text, tags) {
  const mismatches = [];
  for (const sentence of normalizeAttackText(text).split(/(?<=\.)\s+/)) {
    for (const [mech, re, expect] of MECH) {
      if (!re.test(sentence)) continue;
      if (!(tags || []).some((t) => expect.test(t)))
        mismatches.push({ mech, sentence, conditional: CONDITIONAL.test(sentence) });
      break;
    }
  }
  return mismatches;
}

/**
 * The verdict for one attack's multi-seed observation (`runAttackRich` output plus the
 * `attackMismatches` list). A failed condition gate (`skipped:condition_unmet`) is an
 * observation, not a no-effect bug; the turn-start draw is not the attack's effect.
 */
export function attackVerdict({
  tags = [],
  dealt = [],
  errors = [],
  preTurnEvents = [],
  skipped = [],
  mismatches = [],
  oppDrew = false,
} = {}) {
  const executed = dealt.some((d) => d != null);
  const noise = oppDrew ? [] : ['opp:deck->hand'];
  const stateTags = tags.filter(
    (t) => !noise.includes(t) && !t.startsWith('skipped:') && t !== 'coin' && t !== 'ability-used'
  );
  const hasEventEvidence = preTurnEvents.some((e) => MEANINGFUL.has(e));
  const gated = skipped.includes('condition_unmet');
  if (errors.length && !executed) return 'engine-error';
  if (executed && stateTags.length === 0 && !hasEventEvidence && !tags.includes('shuffle') && !gated)
    return 'ran-no-effect';
  if (mismatches.length) return 'partial';
  return 'ok';
}

/** The max copies of each cost symbol across the card's attacks (makes the printed cost payable). */
export function costPoolFor(attacks) {
  const pool = {};
  for (const a of attacks) {
    const counts = {};
    for (const sym of a.cost || []) counts[sym] = (counts[sym] || 0) + 1;
    for (const [sym, n] of Object.entries(counts)) pool[sym] = Math.max(pool[sym] || 0, n);
  }
  return pool;
}

const familyOf = (attack) => {
  try {
    return classifyAttackEffect(attack) || 'unknown';
  } catch {
    return 'ERR';
  }
};

/**
 * Runs one unique attack on the rich board and classes it. `allAttacks` is the holder card's
 * attack list (alias-mapped costs); `attackIndex` is this attack's index in it.
 */
export function classifyAttackRow(card, item, attackIndex, allAttacks, { seeds = DEFAULT_SEEDS } = {}) {
  const attack = {
    name: item.name,
    cost: item.cost,
    damage: item.damageText || '',
    text: item.text,
  };
  const holder = () => {
    const m = mon(card.name, { hp: 200, attacks: allAttacks });
    m.type = 'Pokémon';
    return m;
  };
  const run = runAttackRich(holder, attackIndex, {
    seeds,
    costPool: costPoolFor(allAttacks),
  });
  const mismatches = attackMismatches(item.text, run.tags);
  return {
    key: attackKey(item.name, item.text),
    card: card.name,
    set: card.set,
    number: card.number,
    attack: item.name,
    family: familyOf(attack),
    cost: item.cost,
    damage: attack.damage,
    text: item.text,
    verdict: attackVerdict({ ...run, mismatches }),
    tags: run.tags,
    dealt: run.dealt,
    skipped: run.skipped,
    scaled: run.scaled,
    errors: run.errors,
    mismatches,
    printings: [],
  };
}

// The shared splitter spells the Darkness symbol 'Dark'; the engine's Energy descriptors spell
// it 'Darkness', so an un-mapped cost would never be payable.
const COST_ALIAS = { Dark: 'Darkness' };
const engineCost = (cost) => (cost || []).map((s) => COST_ALIAS[s] || s);

/**
 * Classes every unique effect-text attack in a pkmncards corpus (printings sharing a name and
 * text are one row; damage-only attacks are skipped). `onProgress(scanned, total, rows)` is
 * called every 500 printings.
 */
export function scanCorpus(corpus, { seeds = DEFAULT_SEEDS, onProgress } = {}) {
  const rows = [];
  const seen = new Map();
  let scanned = 0;
  for (const card of corpus || []) {
    scanned += 1;
    if (onProgress && scanned % 500 === 0) onProgress(scanned, corpus.length, rows.length);
    const { items } = splitCard(card);
    const attacks = items.filter((i) => i.kind === 'attack');
    const allAttacks = attacks.map((a) => ({
      name: a.name,
      cost: engineCost(a.cost),
      damage: a.damageText || '',
      text: a.text,
    }));
    const printing = `${card.name} [${card.set} ${card.number}]`;
    let idx = -1;
    for (const item of items) {
      if (item.kind !== 'attack') continue;
      idx += 1;
      if (!String(item.text || '').trim()) continue;
      const key = attackKey(item.name, item.text);
      const existing = seen.get(key);
      if (existing) {
        existing.printings.push(printing);
        continue;
      }
      const row = classifyAttackRow(card, item, idx, allAttacks, { seeds });
      row.printings.push(printing);
      seen.set(key, row);
      rows.push(row);
    }
  }
  return rows;
}

/** `{ <family>: { n, ok, partial, ran-no-effect, engine-error } }` over classed rows. */
export function classCounts(rows) {
  const counts = {};
  for (const row of rows) {
    const c = (counts[row.family] ??= {
      n: 0,
      ...Object.fromEntries(ATTACK_CLASSES.map((k) => [k, 0])),
    });
    c.n++;
    c[row.verdict]++;
  }
  return counts;
}

/** Sums every family's counts into one totals row. */
export function totalCounts(counts) {
  const total = {
    n: 0,
    ...Object.fromEntries(ATTACK_CLASSES.map((k) => [k, 0])),
  };
  for (const c of Object.values(counts)) {
    total.n += c.n;
    for (const k of ATTACK_CLASSES) total[k] += c[k] || 0;
  }
  return total;
}

/** The committed snapshot: every unique attack's family and verdict, keyed by attackKey. */
export function baselineOf(rows, { seeds = DEFAULT_SEEDS, corpus = 'out/pkmn-pokemon-cards.json' } = {}) {
  const entries = {};
  for (const row of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
    entries[row.key] = {
      name: row.card,
      attack: row.attack,
      family: row.family,
      verdict: row.verdict,
    };
  }
  return { corpus, seeds, unique: rows.length, entries };
}

const label = (row) => `${row.name || row.card} ${row.attack}`;

/**
 * Compares the run with the baseline. A row's verdict may only move up (a failure needs
 * `--update-baseline`); a vanished key is a corpus/text edit, a new key is report-only, and a
 * new engine error always fails.
 */
export function checkAttackGate(rows, baseline) {
  const failures = [];
  const improvements = [];
  const warnings = [];
  const entries = baseline?.entries || {};
  const now = new Map(rows.map((r) => [r.key, r]));
  for (const [key, before] of Object.entries(entries)) {
    const row = now.get(key);
    if (!row) {
      warnings.push(`${label(before)}: in baseline but not in the corpus (text edited?)`);
      continue;
    }
    if (row.verdict !== before.verdict) {
      const line = `${label(row)}: ${before.verdict} → ${row.verdict}`;
      if (verdictRank(row.verdict) > verdictRank(before.verdict)) improvements.push(line);
      else failures.push(line);
    }
    if (row.family !== before.family)
      warnings.push(`${label(row)}: family ${before.family} → ${row.family}`);
  }
  for (const row of rows) {
    if (entries[row.key]) continue;
    if (row.verdict === 'engine-error') failures.push(`${label(row)}: engine-error (new attack)`);
    else warnings.push(`${label(row)}: new to the corpus (${row.verdict})`);
  }
  return { failures, improvements, warnings };
}
