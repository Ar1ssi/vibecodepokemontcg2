// Pure mapping for the TCG Live card foil importer (design 069): TCG Live set codes → TCGdex sets, the
// MaterialManifest shader/material names → the exported TPCi/Cards3D shaders and MAT_Cards3D materials,
// and TCG Live cards → TCGdex card ids (by ordinal inside a set segment, verified by name).
import {
  DEFAULT_FOIL_UV,
  FOIL_MANIFEST_VERSION,
  normalizeCardKey,
} from '../../client/src/setup/foil/tcgl-foil-manifest.mjs';

export { normalizeCardKey };

const sameId = (code) => [{ set: code, prefix: '' }];
const padded = (code) => [{ set: code.replace(/(\d+)$/, (n) => n.padStart(2, '0')), prefix: '' }];
const segment = (set, prefix = '') => ({ set, prefix });

// TCG Live set code (lowercase, as in the bundle names) → TCGdex set segments, in TCG Live number order.
// Set ids from api.tcgdex.net/v2/en/sets (2026-10-13). The importer's name check arbitrates: a wrong row
// shows up as unmapped cards in its report, never as a wrong foil.
export const TCGL_TO_TCGDEX_SETS = Object.freeze({
  ...Object.fromEntries(
    ['bw1', 'bw2', 'bw3', 'bw4', 'bw5', 'bw6', 'bw7', 'bw8', 'bw9', 'bw10', 'bw11'].map((c) => [c, sameId(c)])
  ),
  bw11r: [segment('bw11', 'RC')],
  'bw6-5': [segment('dv1')],
  bwbsp: [segment('bwp', 'BW')],
  ...Object.fromEntries(
    ['xy0', 'xy1', 'xy2', 'xy3', 'xy4', 'xy5', 'xy6', 'xy7', 'xy8', 'xy9', 'xy10', 'xy11', 'xy12'].map((c) => [
      c,
      sameId(c),
    ])
  ),
  'xy5-5': [segment('dc1')],
  'xy9-5': [segment('g1')],
  'xy9-5r': [segment('g1', 'RC')],
  xybsp: [segment('xyp', 'XY')],
  ...Object.fromEntries(
    ['sm1', 'sm2', 'sm3', 'sm4', 'sm5', 'sm6', 'sm7', 'sm8', 'sm9', 'sm10', 'sm11', 'sm12'].map((c) => [c, sameId(c)])
  ),
  'sm3-5': [segment('sm3.5')],
  'sm7-5': [segment('sm7.5')],
  'sm11-5': [segment('sm115'), segment('sma', 'SV')],
  smbsp: [segment('smp', 'SM')],
  ...Object.fromEntries(
    ['swsh1', 'swsh2', 'swsh3', 'swsh4', 'swsh5', 'swsh6', 'swsh7', 'swsh8', 'swsh9', 'swsh10', 'swsh11', 'swsh12'].map(
      (c) => [c, sameId(c)]
    )
  ),
  'swsh3-5': [segment('swsh3.5')],
  'swsh4-5': [segment('swsh4.5'), segment('swsh4.5sv', 'SV')],
  'swsh7-5': [segment('cel25')],
  'swsh7-5r': [segment('cel25cc')],
  swsh9a: [segment('swsh9tg', 'TG')],
  swsh10a: [segment('swsh10tg', 'TG')],
  swsh11a: [segment('swsh11tg', 'TG')],
  swsh12a: [segment('swsh12tg', 'TG')],
  'swsh10-5': [segment('swsh10.5')],
  'swsh12-5': [segment('swsh12.5')],
  'swsh12-5a': [segment('swsh12.5gg', 'GG')],
  swshbsp: [segment('swshp', 'SWSH')],
  ...Object.fromEntries(
    ['sv1', 'sv2', 'sv3', 'sv4', 'sv5', 'sv6', 'sv7', 'sv8', 'sv9', 'sv10'].map((c) => [c, padded(c)])
  ),
  'sv3-5': [segment('sv03.5')],
  'sv4-5': [segment('sv04.5')],
  'sv6-5': [segment('sv06.5')],
  'sv8-5': [segment('sv08.5')],
  'rsv10-5': [segment('sv10.5b')],
  'zsv10-5': [segment('sv10.5w')],
  svbsp: [segment('svp')],
  sve: [segment('sve')],
  ...Object.fromEntries(['me1', 'me2', 'me3', 'me4', 'me5'].map((c) => [c, padded(c)])),
  'me2-5': [segment('me02.5')],
  mebsp: [segment('mep')],
  mee: [segment('mee')],
});

/** Port of WebApp export_foil.py `legacy_shader`: MaterialManifest `_s` → exported shader name. */
export function legacyShaderName(name) {
  const value = String(name ?? '');
  if (value.startsWith('TPCi/Cards3D')) return value;
  const replace = {
    'Cards/': 'TPCi/Cards3D/',
    _Amplify: '',
    _J: '',
    SW: 'Sw',
    SV: 'Sv',
    Standard_: '',
    'Foil/': '',
    HoloFoil_: 'HoloFoil/',
    Cracked_Ice: 'CrackedIce',
  };
  return value.replace(
    /(^Cards\/)|(_J)|(_Amplify)|(Standard_)|(Foil\/)|(HoloFoil_)|(SW)|(SV)|(Cracked_Ice)/g,
    (match) => replace[match] ?? match
  );
}

/** Port of WebApp export_foil.py `material_name`: MaterialManifest `_f` → MAT_Cards3D_* material. */
export function materialName(field) {
  let value = String(field ?? '');
  if (value === 'HoloFoil_SWSecret_J') value = 'HoloFoil_SwSecret_Amplify_J';
  if (value === 'HoloFoil_SWHolo_J') value = 'HoloFoil_SwHolo_Amplify_J';
  const replace = { HoloFoil: '', Standard: '', Amplify: '', J: '', SW: 'Sw', SV: 'Sv', _: '' };
  return `MAT_Cards3D_${value.replace(/(HoloFoil)|(Standard)|(Amplify)|(J)|(_)|(SW)|(SV)/g, (m) => replace[m])}`;
}

// Name spellings differ in punctuation, accents and symbols between TCG Live and TCGdex
// ("Pikachu-EX" / "Pikachu EX", "Flabébé", "Ultra Necrozma ◇" / "Prism Star").
const SYMBOL_WORDS = [
  [/◇/g, 'prismstar'],
  [/[★☆]/g, 'star'],
  [/δ/g, 'deltaspecies'],
];

export function canonicalName(name) {
  let value = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const [pattern, word] of SYMBOL_WORDS) value = value.replace(pattern, word);
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function namesMatch(a, b) {
  const left = canonicalName(a);
  return left.length > 0 && left === canonicalName(b);
}

const localNumber = (localId, prefix) => {
  const match = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(String(localId ?? ''));
  return match ? Number(match[1]) : null;
};

const numericRun = (localId) => {
  const match = /(\d+)/.exec(String(localId ?? ''));
  return match ? Number(match[1]) : null;
};

/**
 * Matches one TCG Live set's cards to TCGdex ids.
 * @param {{tcglId: string, number: number, name: string}[]} tcglCards
 * @param {{set: string, prefix: string, cards: {id: string, localId: string, name: string}[]}[]} segments
 * @returns {{matched: Map<string, string>, unmapped: string[]}} tcglId → TCGdex id
 */
export function matchSetCards(tcglCards, segments) {
  const ranges = [];
  let start = 1;
  for (const seg of segments) {
    const byNumber = new Map();
    for (const card of seg.cards ?? []) {
      const n = localNumber(card.localId, seg.prefix);
      if (n != null && !byNumber.has(n)) byNumber.set(n, card);
    }
    const max = byNumber.size ? Math.max(...byNumber.keys()) : 0;
    ranges.push({ start, end: start + max - 1, byNumber });
    start += max;
  }
  const everyCard = segments.flatMap((seg) => seg.cards ?? []);
  const matched = new Map();
  const unmapped = [];
  for (const card of tcglCards) {
    const range = ranges.find((r) => card.number >= r.start && card.number <= r.end);
    const ordinal = range?.byNumber.get(card.number - range.start + 1);
    if (ordinal && namesMatch(card.name, ordinal.name)) {
      matched.set(card.tcglId, ordinal.id);
      continue;
    }
    const retry = everyCard.find(
      (candidate) => numericRun(candidate.localId) === card.number && namesMatch(card.name, candidate.name)
    );
    if (retry) matched.set(card.tcglId, retry.id);
    else unmapped.push(card.tcglId);
  }
  return { matched, unmapped };
}

/**
 * @param {{tcgdexId: string, tcglId: string, foil: boolean, shader?: string, material?: string,
 *          front?: string, etch?: string, wp?: string, cf?: string, cc?: string}[]} entries
 * @returns the manifest.json object (keys sorted, so reruns on unchanged input are byte-identical)
 */
export function buildManifest(entries, uv = DEFAULT_FOIL_UV) {
  const foils = entries.filter((e) => e.foil).sort((a, b) => compareKeys(a, b));
  const shaders = [...new Set(foils.map((e) => e.shader))].sort();
  const materials = [...new Set(foils.map((e) => e.material))].sort();
  const cards = {};
  for (const e of foils) {
    const key = normalizeCardKey(e.tcgdexId);
    if (!key || Object.hasOwn(cards, key)) continue;
    cards[key] = [
      e.tcglId,
      shaders.indexOf(e.shader),
      materials.indexOf(e.material),
      e.front,
      e.etch || '',
      e.wp || '',
      e.cf || '',
      e.cc || '',
    ];
  }
  const flat = entries
    .filter((e) => !e.foil)
    .map((e) => normalizeCardKey(e.tcgdexId))
    .filter((key) => key && !Object.hasOwn(cards, key))
    .sort();
  return { v: FOIL_MANIFEST_VERSION, uv: { ...uv }, shaders, materials, cards, flat: [...new Set(flat)] };
}

const compareKeys = (a, b) => {
  const ka = normalizeCardKey(a.tcgdexId);
  const kb = normalizeCardKey(b.tcgdexId);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};
