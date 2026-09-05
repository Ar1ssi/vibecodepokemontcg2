// Legacy/short set-code → TCGdex set-id table.
//
// This table was originally private to `deck-constructor/import.js`, where it
// was only used to build limitlesstcg image URLs. The rules engine needs the
// same mapping to pin a board card to one specific printing (a name-only
// TCGdex search can't tell "Piloswine" from EX Team Rocket Returns apart from
// "Piloswine" from Phantasmal Flames), so it lives here as a DOM-free module
// both sides import. Keep this as the single source of truth — don't copy it.
export const LEGACY_SET_CODE_TO_TCGDEX_ID = {
  // the following are taken from pokemontcg.io (v2)'s ptcgoCode
  BS: 'base1',
  JU: 'base2',
  PR: 'basep',
  FO: 'base3',
  B2: 'base4',
  TR: 'base5',
  G1: 'gym1',
  G2: 'gym2',
  N1: 'neo1',
  N2: 'neo2',
  N3: 'neo3',
  N4: 'neo4',
  LC: 'base6',
  EX: 'ecard1',
  BP: 'bp',
  AQ: 'ecard2',
  SK: 'ecard3',
  RS: 'ex1',
  SS: 'ex2',
  DR: 'ex3',
  'PR-NP': 'np',
  MA: 'ex4',
  HL: 'ex5',
  RG: 'ex6',
  TRR: 'ex7',
  DX: 'ex8',
  EM: 'ex9',
  UF: 'ex10',
  DS: 'ex11',
  LM: 'ex12',
  HP: 'ex13',
  CG: 'ex14',
  DF: 'ex15',
  PK: 'ex16',
  DP: 'dp1',
  MT: 'dp2',
  SW: 'dp3',
  GE: 'dp4',
  MD: 'dp5',
  LA: 'dp6',
  SF: 'dp7',
  PL: 'pl1',
  RR: 'pl2',
  SV: 'pl3',
  AR: 'pl4',
  // the following were written by hand
  POP1: 'pop1',
  POP2: 'pop2',
  POP3: 'pop3',
  POP4: 'pop4',
  POP5: 'pop5',
  POP6: 'pop6',
  POP7: 'pop7',
  POP8: 'pop8',
  POP9: 'pop9',
  P1: 'pop1',
  P2: 'pop2',
  P3: 'pop3',
  P4: 'pop4',
  P5: 'pop5',
  P6: 'pop6',
  P7: 'pop7',
  P8: 'pop8',
  P9: 'pop9',
  pop1: 'pop1',
  pop2: 'pop2',
  pop3: 'pop3',
  pop4: 'pop4',
  pop5: 'pop5',
  pop6: 'pop6',
  pop7: 'pop7',
  pop8: 'pop8',
  pop9: 'pop9',
  SI: 'si1',
  RM: 'ru1',
  FUT20: 'fut20',
  // https://limitlesstcg.com/cards
  BS2: 'base4',
  EXP: 'ecard1',
  AQP: 'ecard2',
  SKR: 'ecard3',
  E1: 'ecard1',
  E2: 'ecard2',
  E3: 'ecard3',
  WBP: 'basep',
  WBSP: 'basep',
  NP: 'np',
  NBSP: 'np',
  FRLG: 'ex6',
  BG: 'bp',
};

// Limitless / PTCGL short codes for Scarlet & Violet onward (and Mega
// Evolution). Collector numbers repeat across sets — "24" alone cannot
// distinguish Phantasmal Flames Piloswine (me02-024) from Skyridge Piloswine
// (ecard3-24). Pair the short code with the number via buildSetCardId().
export const MODERN_SET_CODE_TO_TCGDEX_ID = {
  // Mega Evolution era (find-type.js MEGEra)
  MEG: 'me01',
  PFL: 'me02',
  MEP: 'mep',
  MEE: 'mee',
  // Scarlet & Violet (find-type.js SVEra)
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
  SVP: 'svp',
  SVE: 'sve',
  // Sword & Shield (find-type.js SSEra — partial; legacy table covers many older codes)
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
  // Sun & Moon (common short codes)
  SUM: 'sm1',
  GRI: 'sm2',
  BUS: 'sm3',
  CIN: 'sm4',
  UPR: 'sm5',
  FLI: 'sm6',
  CES: 'sm7',
  LOT: 'sm8',
  TEU: 'sm9',
  UNB: 'sm10',
  UNM: 'sm11',
  CEC: 'sm12',
  HIF: 'sm115', // Hidden Fates — verify at runtime; wrong map fails name check
  SMP: 'smp',
};

// Resolve a decklist's printed short code ("PFL", "TRR") or a raw TCGdex set
// id ("me02") to the TCGdex set id used in card ids ("me02-024").
export function resolveTcgdexSetId(setCode) {
  if (setCode == null) return null;
  const set = String(setCode).trim();
  if (!set) return null;
  if (Object.hasOwn(LEGACY_SET_CODE_TO_TCGDEX_ID, set)) {
    return LEGACY_SET_CODE_TO_TCGDEX_ID[set];
  }
  if (Object.hasOwn(MODERN_SET_CODE_TO_TCGDEX_ID, set)) {
    return MODERN_SET_CODE_TO_TCGDEX_ID[set];
  }
  // Already a TCGdex set id (deck-builder cards carry set.id this way).
  if (/^[a-z]+\d[\d.a-z]*$/i.test(set)) return set;
  return null;
}

// Candidate TCGdex card ids for a (set code, collector number) pair. Modern
// sets zero-pad to three digits in TCGdex ids (me02-024); legacy sets often
// do not (ex7-13). Emit both forms when the number is numeric so callers can
// try each until one validates.
export function buildSetCardIdCandidates(setCode, number) {
  if (setCode == null || number == null) return [];
  const setId = resolveTcgdexSetId(setCode);
  const num = String(number).trim();
  if (!setId || !num) return [];
  const out = [];
  const add = (id) => {
    if (id && !out.includes(id)) out.push(id);
  };
  add(`${setId}-${num}`);
  const m = num.match(/^(\d+)([a-zA-Z]?)$/);
  if (m) {
    const padded = m[1].padStart(3, '0') + (m[2] || '');
    add(`${setId}-${padded}`);
    const stripped = String(Number(m[1])) + (m[2] || '');
    if (stripped !== m[1]) add(`${setId}-${stripped}`);
  }
  return out;
}

// First candidate id — kept for callers that only need one guess.
export function buildLegacyCardId(setCode, number) {
  const candidates = buildSetCardIdCandidates(setCode, number);
  return candidates.length > 0 ? candidates[0] : null;
}

export function buildSetCardId(setCode, number) {
  return buildLegacyCardId(setCode, number);
}

// Pull a TCGdex card id out of image URLs we already host on board cards.
export function extractTcgdexIdFromImageUrl(src) {
  if (!src) return null;
  const s = String(src);
  // TCGdex CDN: …/en/me/me02/024/high.webp → me02-024
  let m = s.match(/assets\.tcgdex\.net\/en\/[^/]+\/([^/]+)\/([^/.]+)/);
  if (m) return `${m[1]}-${m[2]}`;
  // pokemontcg.io: …/me02/024_hires.png → me02-024
  m = s.match(/images\.pokemontcg\.io\/([^/]+)\/([^_./]+)/);
  if (m) return `${m[1]}-${m[2]}`;
  // limitlesstcg: …/tpci/PFL/PFL_024_R_EN.png → build from short code
  m = s.match(/\/tpci\/([^/]+)\/\1_(\d+[a-zA-Z]?)_/);
  if (m) return buildLegacyCardId(m[1], m[2]);
  return null;
}
