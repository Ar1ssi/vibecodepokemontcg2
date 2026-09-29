// Booster-pack anatomy per era and the one boosted rate profile every pack rolls (design 054
// § Pack models). Pure: a pack model names pools; `resolvePackModel` turns them into card ids for
// one baked set, so `openPack` never needs to know an era's rarity strings.

import { isBasicEnergy } from '../../../../../../shared/engine/rules/card-classify.mjs';

/**
 * Per-pack hit chances of the 30th Celebration set (design 054 § Research 4): ex-class 22–28 % →
 * .25, Illustration Rare 1 in 5 → .20, Special Illustration Rare 1 in 20 → .05, the top tier
 * (Futuristic Rare, 1 in ~100–120) → .01. The set has no tier for full-art rule-box cards or ACE
 * SPEC, so those keep their measured rates (Phantasmal Flames Ultra Rare 8.06 %; Temporal Forces
 * and Surging Sparks ACE SPEC 5.0 %).
 */
export const BOOSTED_RATE_PROFILE = Object.freeze({
  hit: 0.25,
  ultra: 0.08,
  illustration: 0.2,
  specialIllustration: 0.05,
  aceSpec: 0.05,
  top: 0.01,
});

/** Hit classes, rarest first: a card belongs to the first class it matches. */
export const CARD_CLASSES = Object.freeze([
  'top',
  'specialIllustration',
  'illustration',
  'ultra',
  'aceSpec',
  'hit',
]);

const m = (rarity, extra = {}) => Object.freeze({ rarity, ...extra });

// TCGdex rarity strings per era (design 054 § Research 5, § Deviations D3). A matcher without
// `subset` matches main-set cards only; `secret` compares the numeric localId with SET.official.
// TCGdex merges tiers: XY/SM regular and full-art EX/GX are both `Ultra Rare`, and rainbow, gold
// and alt-art cards are all `Secret Rare`.
const OLD_ERA_CLASSES = Object.freeze({
  hit: [m('Ultra Rare', { secret: false })],
  top: [m('Secret Rare'), m('Ultra Rare', { secret: true })],
});

export const RARITY_CLASSES = Object.freeze({
  xy: OLD_ERA_CLASSES,
  sm: OLD_ERA_CLASSES,
  swsh: Object.freeze({
    hit: [
      m('Holo Rare V', { secret: false }),
      m('Holo Rare VMAX', { secret: false }),
      m('Holo Rare VSTAR', { secret: false }),
      m('Radiant Rare'),
      m('Amazing Rare'),
    ],
    ultra: [m('Ultra Rare', { secret: false })],
    illustration: [m('Rare', { subset: 'tg' }), m('Holo Rare', { subset: 'tg' })],
    specialIllustration: [
      m('Ultra Rare', { subset: 'tg' }),
      m('Holo Rare V', { subset: 'tg' }),
      m('Holo Rare VMAX', { subset: 'tg' }),
      m('Full Art Trainer', { subset: 'tg' }),
      m('Secret Rare', { subset: 'tg' }),
    ],
    top: [m('Secret Rare'), m('Ultra Rare', { secret: true })],
  }),
  sv: Object.freeze({
    hit: [m('Double rare')],
    ultra: [m('Ultra Rare')],
    aceSpec: [m('ACE SPEC Rare')],
    illustration: [m('Illustration rare')],
    specialIllustration: [m('Special illustration rare')],
    top: [m('Hyper rare')],
  }),
  me: Object.freeze({
    hit: [m('Double rare')],
    ultra: [m('Ultra Rare')],
    illustration: [m('Illustration rare')],
    specialIllustration: [m('Special illustration rare')],
    top: [m('Mega Hyper Rare')],
  }),
});

// Filler pools: `reverse` is every Common, Uncommon and plain rare; `rare` is the era's plain
// (holo) rare. Both take non-secret main-set cards only.
export const REVERSE_POOL = 'reverse';
export const RARE_POOL = 'rare';
const PLAIN_RARE_RARITIES = new Set(['Rare', 'Rare Holo', 'Holo Rare']);
const FILLER_POOLS = new Set([REVERSE_POOL, RARE_POOL]);

const P = BOOSTED_RATE_PROFILE;
const commons = (count) => ({ pools: ['Common'], count });
const uncommons = (count) => ({ pools: ['Uncommon'], count });
const reverseSlot = { count: 1, table: [[REVERSE_POOL, 1]] };
const table = (rows) => ({ count: 1, table: rows });

const swshRareSlot = table([
  ['hit', P.hit],
  ['ultra', P.ultra],
  ['top', P.top],
  [RARE_POOL, 1 - P.hit - P.ultra - P.top],
]);
// XY and SM: TCGdex cannot tell a regular EX/GX from a full-art one, so the hit class carries
// both weights (ex-class + full-art rule box).
const oldEraSlots = [
  commons(5),
  uncommons(3),
  reverseSlot,
  table([
    ['hit', P.hit + P.ultra],
    ['top', P.top],
    [RARE_POOL, 1 - P.hit - P.ultra - P.top],
  ]),
];
const svArtSlot = table([
  ['illustration', P.illustration],
  ['specialIllustration', P.specialIllustration],
  ['top', P.top],
  [REVERSE_POOL, 1 - P.illustration - P.specialIllustration - P.top],
]);
const svRareSlot = table([
  ['hit', P.hit],
  ['ultra', P.ultra],
  [RARE_POOL, 1 - P.hit - P.ultra],
]);

const model = (key, era, slots) =>
  Object.freeze({ key, era, size: 10, slots: Object.freeze(slots) });

/**
 * Pack models by key. Slot placements follow each era's pack (design 054 § Research 5): Trainer
 * Gallery in the reverse slot (Brilliant Stars →), ACE SPEC in the first reverse slot (Temporal
 * Forces →), SV Hyper rares in the second reverse slot, ME Mega Hyper Rares in the rare slot.
 */
export const PACK_MODELS = Object.freeze({
  xy: model('xy', 'xy', oldEraSlots),
  sm: model('sm', 'sm', oldEraSlots),
  swsh: model('swsh', 'swsh', [commons(5), uncommons(3), reverseSlot, swshRareSlot]),
  'swsh-tg': model('swsh-tg', 'swsh', [
    commons(5),
    uncommons(3),
    table([
      ['illustration', P.illustration],
      ['specialIllustration', P.specialIllustration],
      [REVERSE_POOL, 1 - P.illustration - P.specialIllustration],
    ]),
    swshRareSlot,
  ]),
  sv: model('sv', 'sv', [commons(4), uncommons(3), reverseSlot, svArtSlot, svRareSlot]),
  'sv-acespec': model('sv-acespec', 'sv', [
    commons(4),
    uncommons(3),
    table([
      ['aceSpec', P.aceSpec],
      [REVERSE_POOL, 1 - P.aceSpec],
    ]),
    svArtSlot,
    svRareSlot,
  ]),
  me: model('me', 'me', [
    commons(4),
    uncommons(3),
    reverseSlot,
    table([
      ['illustration', P.illustration],
      ['specialIllustration', P.specialIllustration],
      [REVERSE_POOL, 1 - P.illustration - P.specialIllustration],
    ]),
    table([
      ['hit', P.hit],
      ['ultra', P.ultra],
      ['top', P.top],
      [RARE_POOL, 1 - P.hit - P.ultra - P.top],
    ]),
  ]),
});

const isMainSetCard = (card) => !card?.subset;

/** @returns {boolean} whether the card's numeric localId is above its set's official count. */
export function isSecretCard(card, setInfo) {
  if (!isMainSetCard(card) || !/^\d+$/.test(String(card?.localId ?? ''))) return false;
  const official = Number(setInfo?.official);
  return Number.isFinite(official) && official > 0 && Number(card.localId) > official;
}

function matchesClass(card, matcher, setInfo) {
  if (card?.rarity !== matcher.rarity) return false;
  if ((matcher.subset || null) !== (card.subset || null)) return false;
  return matcher.secret === undefined || matcher.secret === isSecretCard(card, setInfo);
}

/** @returns {string|null} the hit class (`CARD_CLASSES`) the card belongs to in its era, or null. */
export function cardClass(card, era, setInfo) {
  const classes = RARITY_CLASSES[era];
  if (!card || !classes) return null;
  for (const name of CARD_CLASSES) {
    if ((classes[name] || []).some((matcher) => matchesClass(card, matcher, setInfo))) return name;
  }
  return null;
}

// Basic Energy is never pack stock: the pack's Energy card is not simulated (design 054 § Pack
// models) and Build & Battle supplies Basic Energy without limit (D188).
const isPackCard = (card) => Boolean(card?.id) && !isBasicEnergy(card);

const isFillerCard = (card, setInfo) => isMainSetCard(card) && !isSecretCard(card, setInfo);

/** @returns {Map<string, string[]>} every pool name of the era → the set's card ids in it. */
function poolIdsFor(era, cards, setInfo) {
  const pools = new Map([
    ['Common', []],
    ['Uncommon', []],
    [RARE_POOL, []],
    [REVERSE_POOL, []],
    ['all', []],
  ]);
  for (const name of CARD_CLASSES) pools.set(name, []);
  for (const card of cards) {
    if (!isPackCard(card)) continue;
    pools.get('all').push(card.id);
    const className = cardClass(card, era, setInfo);
    if (className) pools.get(className).push(card.id);
    if (!isFillerCard(card, setInfo)) continue;
    if (card.rarity === 'Common' || card.rarity === 'Uncommon') {
      pools.get(card.rarity).push(card.id);
      pools.get(REVERSE_POOL).push(card.id);
    } else if (PLAIN_RARE_RARITIES.has(card.rarity)) {
      pools.get(RARE_POOL).push(card.id);
      pools.get(REVERSE_POOL).push(card.id);
    }
  }
  return pools;
}

// A class the set does not print gives its weight to the slot's filler row, so the other rows'
// rates stay as the profile says (design 054 row 9).
function resolveSlot(slot, pools) {
  if (!Array.isArray(slot.table)) {
    const rows = (slot.pools || []).map((pool) => ({ pool, weight: 1, ids: pools.get(pool) || [] }));
    return { count: slot.count || 0, kind: 'pools', rows };
  }
  const rows = slot.table.map(([pool, weight]) => ({
    pool,
    weight: Number(weight) || 0,
    ids: pools.get(pool) || [],
  }));
  const filler = rows.find((row) => FILLER_POOLS.has(row.pool));
  if (filler) {
    for (const row of rows) {
      if (row === filler || row.ids.length || row.weight <= 0) continue;
      filler.weight += row.weight;
      row.weight = 0;
    }
  }
  return { count: slot.count || 0, kind: 'table', rows };
}

/**
 * @param {string|object} modelOrKey a `PACK_MODELS` key or a model `{ era, size, slots }`
 * @param {object[]} cards the box set's SetCards (main set plus its Trainer Gallery rows)
 * @param {{official?: number}} setInfo the set module's `SET`
 * @returns {{key: string, era: string, size: number, slots: object[], fallbackIds: string[],
 *   allIds: string[]}|null} slots as `{ count, kind: 'pools'|'table', rows: [{ pool, weight, ids }] }`;
 *   null for an unknown key.
 */
export function resolvePackModel(modelOrKey, cards = [], setInfo = {}) {
  const packModel = typeof modelOrKey === 'string' ? PACK_MODELS[modelOrKey] : modelOrKey;
  if (!packModel?.slots) return null;
  const pools = poolIdsFor(packModel.era, cards || [], setInfo);
  return {
    key: packModel.key || null,
    era: packModel.era,
    size: packModel.size || 10,
    slots: packModel.slots.map((slot) => resolveSlot(slot, pools)),
    fallbackIds: pools.get(RARE_POOL),
    allIds: pools.get('all'),
  };
}
