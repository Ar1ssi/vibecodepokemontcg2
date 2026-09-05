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

// Build a TCGdex card id ("ex7-32") from a decklist's printed set code and
// collector number. Returns null when the set code isn't in the table or the
// number is missing — callers must fall back to searching by name.
//
// The table was hand-assembled for limitlesstcg's URL scheme and has never
// been verified set-by-set against TCGdex, so an id from here is a *candidate*:
// callers should confirm the fetched card's name matches before trusting it.
export function buildLegacyCardId(setCode, number) {
  if (setCode == null || number == null) return null;
  const set = String(setCode).trim();
  const num = String(number).trim();
  if (!set || !num) return null;
  // hasOwn, not a plain lookup: codes come from user-pasted decklists, and
  // "constructor"/"toString" would otherwise resolve to Object.prototype members.
  if (!Object.hasOwn(LEGACY_SET_CODE_TO_TCGDEX_ID, set)) return null;
  const setId = LEGACY_SET_CODE_TO_TCGDEX_ID[set];
  if (!setId) return null;
  return `${setId}-${num}`;
}
