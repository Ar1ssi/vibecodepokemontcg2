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
  // Sun & Moon and Sword & Shield, as printed on Limitless / JustInBasil lists.
  SUM: 'sm1',
  GRI: 'sm2',
  BUS: 'sm3',
  SLG: 'sm3.5',
  CIN: 'sm4',
  UPR: 'sm5',
  FLI: 'sm6',
  CES: 'sm7',
  DRM: 'sm7.5',
  LOT: 'sm8',
  TEU: 'sm9',
  DET: 'det1',
  UNB: 'sm10',
  UNM: 'sm11',
  HIF: 'sm115',
  CEC: 'sm12',
  'PR-SM': 'smp',
  SSH: 'swsh1',
  RCL: 'swsh2',
  DAA: 'swsh3',
  CPA: 'swsh3.5',
  VIV: 'swsh4',
  SHF: 'swsh4.5',
  BST: 'swsh5',
  CRE: 'swsh6',
  EVS: 'swsh7',
  CEL: 'cel25',
  FST: 'swsh8',
  BRS: 'swsh9',
  ASR: 'swsh10',
  PGO: 'swsh10.5',
  LOR: 'swsh11',
  SIT: 'swsh12',
  CRZ: 'swsh12.5',
  'PR-SW': 'swshp',
};

// Older lists abbreviate the three-type Unit Energy cards; TCGdex spells them out.
const UNIT_ENERGY_TYPES = {
  fdy: 'FightingDarknessFairy',
  grw: 'GrassFireWater',
  lpm: 'LightningPsychicMetal',
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

const SECTION_HEADER_RE = /^(pok[eé]mon|trainers?( cards?)?|energy( cards?)?|deck|total cards?)\b[^a-z]*$/i;
const COMMENT_RE = /^(#|\/\/)/;
// "4 Pikachu ex SVI 57", "4x Pikachu ex (SVI) 57", "4 Pikachu ex"
const LINE_RE = /^(\d{1,3})\s*x?\s+(.+)$/i;
// The set code is 2-6 capitals, or a "SWSHEnergy"-style energy-series code.
const SET_SUFFIX_RE =
  /^(.*?)\s+\(?([A-Z][A-Z0-9.-]{1,5}|[A-Z]{2,5}Energy)\)?\s+([A-Za-z]{0,4}\d+[a-z]?)$/;

// Lists and TCGdex spell the same card differently: "{*}" vs "◇" (Prism Star), "Zoroark-GX" vs
// "Zoroark GX", straight vs curly apostrophes, "Unit Energy FDY" vs its spelled-out type list.
// Both sides of a name comparison go through this, so any spelling matches any other.
const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\{\*\}/g, '◇')
    .replace(/[‘’]/g, "'")
    .replace(/-(?=(gx|ex)\b)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^unit energy (fdy|grw|lpm)\b/, (_, abbr) => `unit energy ${UNIT_ENERGY_TYPES[abbr].toLowerCase()}`);

/** The TCGdex name-search term for a list name: the card's base name, spelled the way TCGdex does. */
export const searchTermFor = (name = '') =>
  String(name)
    .replace(/\s*(\{\*\}|◇)\s*$/, '')
    .replace(/-(?=(GX|EX)\b)/g, ' ')
    .replace(/'/g, '’')
    .replace(/^(Unit Energy)\s+(FDY|GRW|LPM)\b.*$/i, (_, base, abbr) => `${base} ${UNIT_ENERGY_TYPES[abbr.toLowerCase()]}`)
    .trim();

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
export function chooseCandidate(candidates = [], entry = {}, setIds = {}) {
  const wanted = normalize(entry.name);
  const exact = candidates.filter((card) => normalize(card?.name) === wanted);
  if (!exact.length) return null;

  const wantedSetId = setIdForCode(entry.setCode, setIds);
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
 * The TCGdex set id a decklist's set code names: the printed codes above, then `setIds` — the
 * installed custom sets' codes (shared/tcgdex/custom-sets.mjs customSetCodes, design 075).
 */
export function setIdForCode(setCode, setIds = {}) {
  if (!setCode) return undefined;
  if (Object.hasOwn(PTCGL_SET_IDS, setCode)) return PTCGL_SET_IDS[setCode];
  return setIds && Object.hasOwn(setIds, setCode) ? setIds[setCode] : undefined;
}

/**
 * Resolves one parsed entry. `deps.fetchCardDetail(id)` and `deps.searchByName(name)`
 * (→ normalized cards) are the two lookups; `deps.setIds` adds custom set codes.
 * Returns `{ card }` or `{ error }`.
 */
export async function resolveEntry(entry, deps) {
  const label = basicEnergyLabel(entry.name);
  if (label) return { card: energyDeckCard(label, entry.qty) };

  const setId = setIdForCode(entry.setCode, deps.setIds);
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
    const candidates = await deps.searchByName(searchTermFor(entry.name));
    const card = chooseCandidate(
      (candidates || []).filter((candidate) => candidate?.image),
      entry,
      deps.setIds
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
 * `resolve(entry, deps)` defaults to `resolveEntry`; the Suggest tab's list import
 * passes its own (design 069).
 */
export async function importDeckEntries(
  entries,
  { deck, addCard, deps, onProgress, concurrency = 4, resolve = resolveEntry }
) {
  const results = new Array(entries.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < entries.length) {
      const index = next++;
      try {
        results[index] = await resolve(entries[index], deps);
      } catch (error) {
        results[index] = { error: `Lookup failed (${error?.message || 'network error'})` };
      }
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
