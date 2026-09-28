// Text decklist import for the deck builder's "Import List" popup: parses the
// "4 Pikachu ex SVI 57" lines Pokémon TCG Live / Limitless export, then resolves
// each line to a TCGdex card. Network access is injected (`deps`) so the
// parsing and choosing rules stay testable offline.
import { buildModernBasicEnergy, isModernBasicEnergyLabel } from './modern-energy.mjs';

// Set codes as printed on decklists → TCGdex set ids. Codes missing here still
// import: the printing is then chosen by collector number / newest legal print.
export const PTCGL_SET_IDS = {
  SVI: 'sv01',
  PAL: 'sv02',
  OBF: 'sv03',
  MEW: 'sv03.5',
  PAR: 'sv04',
  PAF: 'sv04.5',
  TEF: 'sv05',
  TWM: 'sv06',
  SFA: 'sv06.5',
  SCR: 'sv07',
  SSP: 'sv08',
  PRE: 'sv08.5',
  JTG: 'sv09',
  DRI: 'sv10',
  BLK: 'sv10.5b',
  WHT: 'sv10.5w',
  MEG: 'me01',
  PFL: 'me02',
  ASC: 'me02.5',
  POR: 'me03',
  CRI: 'me04',
  PBL: 'me05',
  MEP: 'mep',
  SVP: 'svp',
};

const ENERGY_SYMBOLS = {
  G: 'Grass',
  R: 'Fire',
  W: 'Water',
  L: 'Lightning',
  P: 'Psychic',
  F: 'Fighting',
  D: 'Darkness',
  M: 'Metal',
};

const SECTION_HEADER_RE = /^(pok[eé]mon|trainers?|energy|deck|total cards?)\b[^a-z]*$/i;
const COMMENT_RE = /^(#|\/\/)/;
// "4 Pikachu ex SVI 57", "4x Pikachu ex (SVI) 57", "4 Pikachu ex"
const LINE_RE = /^(\d{1,3})\s*x?\s+(.+)$/i;
const SET_SUFFIX_RE = /^(.*?)\s+\(?([A-Z][A-Z0-9.-]{1,5})\)?\s+([A-Za-z]{0,4}\d+[a-z]?)$/;

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const stripLeadingZeros = (number = '') => String(number).replace(/^0+(?=\d)/, '');

/** "Basic {G} Energy" / "Basic Grass Energy" → the label modern-energy.mjs knows, else null. */
export function basicEnergyLabel(name = '') {
  const withNames = String(name).replace(/\{([A-Z])\}/g, (match, code) => ENERGY_SYMBOLS[code] || match);
  const label = withNames.replace(/^basic\s+(\w+)\s+energy$/i, (_, type) => {
    const type0 = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return `Basic ${type0} Energy`;
  });
  return isModernBasicEnergyLabel(label) ? label : null;
}

/**
 * Splits pasted text into `{ entries, skipped }`. Section headers, totals and
 * comments are ignored quietly; lines with no leading quantity land in `skipped`.
 * Repeated lines for the same printing merge their quantities.
 */
export function parseDeckText(text = '') {
  const entries = [];
  const skipped = [];
  const byKey = new Map();

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || COMMENT_RE.test(line)) continue;
    const match = line.match(LINE_RE);
    if (!match) {
      if (!SECTION_HEADER_RE.test(line)) skipped.push(line);
      continue;
    }

    const qty = Number(match[1]);
    let name = match[2].trim();
    let setCode = '';
    let number = '';
    const suffix = name.match(SET_SUFFIX_RE);
    if (suffix && !basicEnergyLabel(name)) {
      [, name, setCode, number] = suffix;
    }
    if (qty < 1 || !name) {
      skipped.push(line);
      continue;
    }

    const key = `${normalize(name)}|${setCode}|${stripLeadingZeros(number)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      continue;
    }
    const entry = { qty, name, setCode, number, line };
    byKey.set(key, entry);
    entries.push(entry);
  }

  return { entries, skipped };
}

/**
 * Picks the printing for a name-only or set-less line from TCGdex candidates:
 * exact name (accent/case-insensitive) first, then the printing whose collector
 * number and set match the line, then Standard-legal, then newest.
 */
export function chooseCandidate(candidates = [], entry = {}) {
  const wanted = normalize(entry.name);
  const exact = candidates.filter((card) => normalize(card?.name) === wanted);
  if (!exact.length) return null;

  const wantedSetId = PTCGL_SET_IDS[entry.setCode];
  const wantedNumber = stripLeadingZeros(entry.number);
  const rank = (card) => {
    let score = 0;
    if (wantedSetId && card.set?.id === wantedSetId) score += 4;
    if (wantedNumber && stripLeadingZeros(card.number) === wantedNumber) score += 2;
    if (card.legal?.standard) score += 1;
    return score;
  };
  const byRecency = (a, b) => String(b.set?.releaseDate || '').localeCompare(String(a.set?.releaseDate || ''));
  return [...exact].sort((a, b) => rank(b) - rank(a) || byRecency(a, b))[0];
}

const padNumber = (number) => String(number).padStart(3, '0');

function energyDeckCard(label, qty) {
  const card = buildModernBasicEnergy(label, qty);
  return {
    id: card.id,
    name: card.name,
    supertype: 'Energy',
    number: card.localId,
    set: card.set,
    image: card.image,
    images: card.images,
    energyType: 'Normal',
    _provider: 'tcgdex',
  };
}

/**
 * Resolves one parsed entry. `deps.fetchCardDetail(id)` and `deps.searchByName(name)`
 * (→ normalized cards) are the two lookups. Returns `{ card }` or `{ error }`.
 */
export async function resolveEntry(entry, deps) {
  const label = basicEnergyLabel(entry.name);
  if (label) return { card: energyDeckCard(label, entry.qty) };

  const setId = PTCGL_SET_IDS[entry.setCode];
  if (setId && entry.number) {
    for (const localId of [padNumber(entry.number), entry.number]) {
      try {
        const card = await deps.fetchCardDetail(`${setId}-${localId}`);
        if (card?.image && normalize(card.name) === normalize(entry.name)) return { card };
      } catch {
        // Not at that id — fall through to the name search.
      }
    }
  }

  try {
    const candidates = await deps.searchByName(entry.name);
    const card = chooseCandidate(
      (candidates || []).filter((candidate) => candidate?.image),
      entry
    );
    return card ? { card } : { error: 'No card with that name' };
  } catch (error) {
    return { error: `Lookup failed (${error?.message || 'network error'})` };
  }
}

/**
 * Resolves every entry with a small worker pool and folds the hits into `deck`
 * (grouped deck-builder shape, via `addCard`). `onProgress(done, total)` fires
 * after each entry. Returns `{ deck, imported, failed }`; `failed` carries the
 * source line and reason so the popup can list what needs fixing.
 */
export async function importDeckEntries(entries, { deck, addCard, deps, onProgress, concurrency = 4 }) {
  const results = new Array(entries.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < entries.length) {
      const index = next++;
      results[index] = await resolveEntry(entries[index], deps);
      onProgress?.(++done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));

  let nextDeck = deck;
  let imported = 0;
  const failed = [];
  entries.forEach((entry, index) => {
    const { card, error } = results[index];
    if (!card) {
      failed.push({ line: entry.line, reason: error });
      return;
    }
    for (let copy = 0; copy < entry.qty; copy += 1) nextDeck = addCard(nextDeck, card);
    imported += entry.qty;
  });

  return { deck: nextDeck, imported, failed };
}
