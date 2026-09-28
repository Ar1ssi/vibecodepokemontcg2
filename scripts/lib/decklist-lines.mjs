/**
 * Shared decklist-line parsing and TCGdex resolution for the baked-deck generators
 * (generate-starter-decks.mjs, generate-build-battle-box.mjs).
 */
import {
  buildModernBasicEnergy,
  isModernBasicEnergyLabel,
} from '../../client/src/setup/deck-builder/core/modern-energy.mjs';

const TCGDEX_CARD_URL = 'https://api.tcgdex.net/v2/en/cards';
const TCGDEX_SET_URL = 'https://api.tcgdex.net/v2/en/sets';
// TCGdex ships no art for some promos (MEP); Limitless hosts the same scans.
const LIMITLESS_IMAGE_BASE = 'https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci';

export const SET_MAP = {
  MEG: 'me01',
  PFL: 'me02',
  ASC: 'me02.5',
  POR: 'me03',
  CRI: 'me04',
  PBL: 'me05',
  MEP: 'mep',
  OBF: 'sv03',
  SFA: 'sv06.5',
  TWM: 'sv06',
  SSP: 'sv08',
  JTG: 'sv09',
  BLK: 'sv10.5b',
  DRI: 'sv10',
  MEW: 'sv03.5',
  PRE: 'sv08.5',
  SVP: 'svp',
};

/** Trainers/supporters/items without set codes — preferred Standard printings. */
export const TRAINER_IDS = {
  "Lillie's Determination": 'me01-119',
  "Boss's Orders": 'me01-114',
  "Boss's Orders (Ghetsis)": 'me01-114',
  "Boss's Orders (Corbeau)": 'me01-114',
  "Grimsley's Move": 'me02-090',
  "Team Rocket's Petrel": 'sv10-176',
  "Janine's Secret Art": 'sv08.5-112',
  "Lisia's Appeal": 'sv08-179',
  'Academy at Night': 'sv06.5-054',
  'Poké Pad': 'me03-081',
  'Ultra Ball': 'me01-131',
  'Buddy-Buddy Poffin': 'sv05-144',
  'Dark Bell': 'me05-075',
  'Dangerous Laser': 'sv06.5-058',
  'Energy Recycler': 'sv10-164',
  'Night Stretcher': 'sv06.5-061',
  'Rare Candy': 'me01-125',
  'Special Red Card': 'me04-082',
  'Air Balloon': 'sv10.5b-079',
  'Binding Mochi': 'sv08.5-095',
  Firebreather: 'me02-089',
  Dawn: 'me02-087',
  Judge: 'me03-076',
  "Lana's Aid": 'sv06-155',
  'Battle Cage': 'me02-085',
  'Energy Retrieval': 'sv10.5w-082',
  'Mega Signal': 'me01-121',
  'Precious Trolley': 'sv08-185',
  Hilda: 'sv10.5w-084',
  Salvatore: 'sv05-160',
  Tarragon: 'me03-085',
  'Gravity Mountain': 'sv08-177',
  'Fighting Gong': 'me01-116',
  'Premium Power Pro': 'me01-124',
  Switch: 'me01-130',
  'Maximum Belt': 'sv08.5-117',
  "Professor's Research": 'sv04.5-087',
  "Professor's Research (Professor Sada)": 'sv04.5-087',
  Iono: 'sv04.5-080',
  'Earthen Vessel': 'sv08.5-106',
  "Rosa's Encouragement": 'me03-084',
  'Surfing Beach': 'me01-129',
  'Energy Search': 'me03-072',
  'Dusk Ball': 'sv08-175',
  "Brock's Scouting": 'sv09-146',
  "Iris's Fighting Spirit": 'sv09-149',
  Drayton: 'sv08-174',
  'Wondrous Patch': 'me02-094',
};

const ENERGY_IDS = {
  'Neo Upper Energy': 'sv05-162',
};

export function normalizeName(name) {
  return String(name)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toCardId(setCode, number) {
  const setId = SET_MAP[setCode];
  if (!setId) throw new Error(`Unknown set code: ${setCode}`);
  const localId = String(number).padStart(3, '0');
  return `${setId}-${localId}`;
}

/**
 * "4 Charcadet PFL 19" → { qty, name, setCode, number }; "3 Hilda" → { qty, cardId, name };
 * "16 Basic Fire Energy" → { qty, modernEnergy }.
 */
export function parseLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;

  const withSet = trimmed.match(/^(\d+)\s+(.+?)\s+([A-Z0-9.]+)\s+(\d+)$/);
  if (withSet) {
    return {
      qty: Number(withSet[1]),
      name: withSet[2].trim(),
      setCode: withSet[3],
      number: withSet[4],
    };
  }

  const qtyName = trimmed.match(/^(\d+)\s+(.+)$/);
  if (qtyName) {
    const name = qtyName[2].trim();
    if (isModernBasicEnergyLabel(name)) {
      return { qty: Number(qtyName[1]), modernEnergy: name };
    }
    const energyId = ENERGY_IDS[name];
    if (energyId) {
      return { qty: Number(qtyName[1]), cardId: energyId, name };
    }
    const trainerId = TRAINER_IDS[name] || TRAINER_IDS[normalizeName(name)];
    if (trainerId) {
      return { qty: Number(qtyName[1]), cardId: trainerId, name: normalizeName(name) };
    }
    throw new Error(`No ID mapping for: ${name}`);
  }

  throw new Error(`Could not parse line: ${line}`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TCGdex fetch failed (${res.status}) for ${url}`);
  return res.json();
}

/** Fetches a card by id; throws when `expectedName` is given and TCGdex disagrees (data drift). */
export async function fetchCard(cardId, expectedName) {
  const card = await fetchJson(`${TCGDEX_CARD_URL}/${cardId}`);
  if (expectedName && card.name !== expectedName) {
    throw new Error(`${cardId} is "${card.name}", decklist says "${expectedName}"`);
  }
  return card;
}

export async function fetchSet(setId) {
  return fetchJson(`${TCGDEX_SET_URL}/${setId}`);
}

function limitlessImage(card) {
  const setCode = Object.keys(SET_MAP).find((code) => SET_MAP[code] === card.set?.id);
  if (!setCode || !card.localId) return null;
  const file = `${LIMITLESS_IMAGE_BASE}/${setCode}/${setCode}_${card.localId}_R_EN`;
  return { small: `${file}.png`, large: `${file}_LG.png` };
}

function cardImages(card) {
  const imageBase = card.image || '';
  if (imageBase) return { small: `${imageBase}/low.webp`, large: `${imageBase}/high.webp` };
  return limitlessImage(card) || { small: '', large: '' };
}

export function normalizeCard(card, qty) {
  const images = cardImages(card);
  const supertype =
    card.category === 'Pokemon'
      ? 'Pokémon'
      : card.category === 'Energy'
        ? 'Energy'
        : 'Trainer';

  return {
    id: card.id,
    name: card.name,
    supertype,
    localId: card.localId || '',
    image: images.large,
    images,
    set: {
      id: card.set?.id || '',
      name: card.set?.name || '',
      releaseDate: card.set?.releaseDate || '',
    },
    qty,
  };
}

/** Resolves decklist lines; `mapRow(row, tcgdexCard|null)` may enrich each row. */
export async function resolveDeck(lines, mapRow = (row) => row) {
  const tasks = lines.map(async (line) => {
    const parsed = parseLine(line);
    if (parsed.modernEnergy) {
      return mapRow(buildModernBasicEnergy(parsed.modernEnergy, parsed.qty), null);
    }
    const cardId = parsed.cardId || toCardId(parsed.setCode, parsed.number);
    const card = await fetchCard(cardId, parsed.name);
    return mapRow(normalizeCard(card, parsed.qty), card);
  });
  return Promise.all(tasks);
}
