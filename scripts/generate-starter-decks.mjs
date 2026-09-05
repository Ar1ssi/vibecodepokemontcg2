/**
 * Resolve TCG Live starter deck lists to baked TCGdex card objects.
 * Run: node scripts/generate-starter-decks.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../client/src/setup/deck-builder/core/starter-decks.generated.mjs');

const SET_MAP = {
  MEG: 'me01',
  PFL: 'me02',
  ASC: 'me02.5',
  POR: 'me03',
  CRI: 'me04',
  PBL: 'me05',
  OBF: 'sv03',
  SFA: 'sv06.5',
  TWM: 'sv06',
  JTG: 'sv09',
  BLK: 'sv10.5b',
  DRI: 'sv10',
  MEW: 'sv03.5',
  PRE: 'sv08.5',
  SVP: 'svp',
};

/** Trainers/supporters/items without set codes — preferred Standard printings. */
const TRAINER_IDS = {
  "Lillie's Determination": 'me01-119',
  "Boss's Orders": 'me01-114',
  "Boss's Orders (Ghetsis)": 'me01-114',
  "Boss's Orders (Corbeau)": 'me01-114',
  "Grimsley's Move": 'me02-090',
  "Team Rocket's Petrel": 'sv10-176',
  "Janine's Secret Art": 'sv08.5-112',
  "Lisia's Appeal": 'sv08-179',
  'Academy at Night': 'me02-093',
  'Poké Pad': 'me03-081',
  'Ultra Ball': 'me01-131',
  'Buddy-Buddy Poffin': 'sv05-144',
  'Dark Bell': 'me05-075',
  'Dangerous Laser': 'me05-070',
  'Energy Recycler': 'sv10-164',
  'Night Stretcher': 'sv06.5-061',
  'Rare Candy': 'me01-125',
  'Special Red Card': 'me04-082',
  'Air Balloon': 'sv10.5b-079',
  'Binding Mochi': 'sv08.5-095',
  Firebreather: 'me02-088',
  Dawn: 'me02-087',
  Judge: 'me03-076',
  "Lana's Aid": 'sv06-161',
  'Battle Cage': 'me02-085',
  'Energy Retrieval': 'sv10.5b-082',
  'Mega Signal': 'me01-121',
  'Precious Trolley': 'me03-083',
  Hilda: 'sv10.5b-084',
  Salvatore: 'sv05-160',
  Tarragon: 'me03-085',
  'Gravity Mountain': 'me01-120',
  'Fighting Gong': 'me01-117',
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
};

const ENERGY_IDS = {
  'Basic {D} Energy': 'g1-81',
  'Basic Darkness Energy': 'g1-81',
  'Basic Fire Energy': 'g1-76',
  'Basic Fighting Energy': 'g1-80',
  'Basic Lightning Energy': 'g1-78',
  'Basic Water Energy': 'g1-77',
  'Neo Upper Energy': 'sv05-162',
};

function normalizeName(name) {
  return String(name)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCardId(setCode, number) {
  const setId = SET_MAP[setCode];
  if (!setId) throw new Error(`Unknown set code: ${setCode}`);
  const localId = String(number).padStart(3, '0');
  return `${setId}-${localId}`;
}

/** @typedef {{ qty: number, line: string }} DeckLine */

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // "3 Mega Darkrai ex PBL 48"
  const withSet = trimmed.match(/^(\d+)\s+(.+?)\s+([A-Z0-9.]+)\s+(\d+)$/);
  if (withSet) {
    return {
      qty: Number(withSet[1]),
      name: withSet[2].trim(),
      setCode: withSet[3],
      number: withSet[4],
    };
  }

  // "4 Lillie's Determination"
  const qtyName = trimmed.match(/^(\d+)\s+(.+)$/);
  if (qtyName) {
    const name = qtyName[2].trim();
    const energyId = ENERGY_IDS[name];
    if (energyId) {
      return { qty: Number(qtyName[1]), cardId: energyId, name };
    }
    const trainerId =
      TRAINER_IDS[name] || TRAINER_IDS[normalizeName(name)];
    if (trainerId) {
      return { qty: Number(qtyName[1]), cardId: trainerId, name: normalizeName(name) };
    }
    throw new Error(`No ID mapping for: ${name}`);
  }

  throw new Error(`Could not parse line: ${line}`);
}

const DECK_SOURCES = {
  lucario: [
    '3 Mega Lucario ex MEG 77',
    '4 Riolu MEG 76',
    '2 Hariyama MEG 73',
    '2 Makuhita MEG 72',
    '2 Lunatone MEG 74',
    '2 Solrock MEG 75',
    '1 Okidogi ASC 122',
    '1 Fezandipiti ex SFA 38',
    '1 Meowth ex POR 62',
    "4 Lillie's Determination",
    "2 Boss's Orders (Ghetsis)",
    '2 Judge',
    '1 Hilda',
    '1 Salvatore',
    '1 Tarragon',
    "1 Team Rocket's Petrel",
    '2 Gravity Mountain',
    '4 Fighting Gong',
    '4 Premium Power Pro',
    '3 Ultra Ball',
    '2 Switch',
    '1 Night Stretcher',
    '1 Poké Pad',
    '2 Air Balloon',
    '1 Maximum Belt',
    '10 Basic Fighting Energy',
  ],
  charizard: [
    '3 Mega Charizard X ex PFL 13',
    '1 Mega Charizard Y ex ASC 22',
    '2 Charmeleon PFL 12',
    '4 Charmander PFL 11',
    '2 Oricorio ex PFL 18',
    '1 Reshiram PFL 17',
    '1 Fezandipiti ex SFA 38',
    '1 Meowth ex POR 62',
    "4 Lillie's Determination",
    "2 Boss's Orders (Ghetsis)",
    '2 Firebreather',
    "2 Team Rocket's Petrel",
    '1 Dawn',
    '1 Judge',
    "1 Lana's Aid",
    '2 Battle Cage',
    '4 Rare Candy',
    '4 Ultra Ball',
    '2 Energy Retrieval',
    '2 Night Stretcher',
    '2 Poké Pad',
    '1 Energy Recycler',
    '1 Mega Signal',
    '1 Precious Trolley',
    '2 Air Balloon',
    '11 Basic Fire Energy',
  ],
  darkrai: [
    '3 Mega Darkrai ex PBL 48',
    '3 Toxtricity PFL 68',
    '3 Toxel PFL 67',
    '1 Fezandipiti ex SFA 38',
    '1 Meowth ex POR 62',
    '1 Seviper PFL 62',
    '1 Mega Gengar ex PFL 56',
    '1 Haunter PFL 55',
    '1 Gastly POR 48',
    '1 Munkidori TWM 95',
    '1 Pecharunt ex SFA 39',
    "4 Lillie's Determination",
    "2 Boss's Orders (Ghetsis)",
    "2 Grimsley's Move",
    "2 Team Rocket's Petrel",
    "1 Janine's Secret Art",
    "1 Lisia's Appeal",
    '2 Academy at Night',
    '4 Poké Pad',
    '4 Ultra Ball',
    '2 Buddy-Buddy Poffin',
    '2 Dark Bell',
    '1 Dangerous Laser',
    '1 Energy Recycler',
    '1 Night Stretcher',
    '1 Rare Candy',
    '1 Special Red Card',
    '1 Air Balloon',
    '1 Binding Mochi',
    '10 Basic {D} Energy',
  ],
  dragonite: [
    '2 Mega Dragonite ex ASC 152',
    '2 Dragonair ASC 151',
    '3 Dratini OBF 157',
    '1 Mega Eelektross ex ASC 61',
    '3 Eelektrik ASC 60',
    '3 Tynamo ASC 59',
    '1 Zekrom ex BLK 34',
    '1 Zeraora DRI 78',
    '1 Fezandipiti ex ASC 142',
    '1 Mew ex MEW 151',
    "4 Lillie's Determination",
    "3 Professor's Research (Professor Sada)",
    "2 Boss's Orders (Corbeau)",
    '2 Iono',
    '2 Battle Cage',
    '4 Buddy-Buddy Poffin',
    '4 Earthen Vessel',
    '4 Ultra Ball',
    '2 Night Stretcher',
    '2 Poké Pad',
    '2 Rare Candy',
    '2 Air Balloon',
    '1 Maximum Belt',
    '5 Basic Lightning Energy',
    '3 Basic Water Energy',
  ],
  greninja: [
    '3 Mega Greninja ex CRI 22',
    '2 Frogadier CRI 21',
    '3 Froakie CRI 20',
    '3 Mega Starmie ex POR 21',
    '3 Staryu POR 20',
    '1 Fezandipiti ex SFA 38',
    '1 Meowth ex POR 62',
    '1 Budew PRE 4',
    "4 Lillie's Determination",
    "3 Boss's Orders (Ghetsis)",
    '1 Dawn',
    '1 Hilda',
    '1 Judge',
    "1 Rosa's Encouragement",
    '1 Salvatore',
    "1 Team Rocket's Petrel",
    '2 Surfing Beach',
    '4 Buddy-Buddy Poffin',
    '3 Ultra Ball',
    '2 Poké Pad',
    '2 Rare Candy',
    '2 Special Red Card',
    '1 Energy Retrieval',
    '1 Energy Search',
    '1 Night Stretcher',
    '2 Air Balloon',
    '9 Basic Water Energy',
    '1 Neo Upper Energy',
  ],
};

async function fetchCard(cardId) {
  const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`);
  if (!res.ok) {
    throw new Error(`TCGdex fetch failed (${res.status}) for ${cardId}`);
  }
  return res.json();
}

function normalizeCard(card, qty) {
  const imageBase = card.image || '';
  const detailImage = imageBase ? `${imageBase}/high.webp` : '';
  const lowImage = imageBase ? `${imageBase}/low.webp` : '';
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
    image: detailImage,
    images: {
      small: lowImage,
      large: detailImage,
    },
    set: {
      id: card.set?.id || '',
      name: card.set?.name || '',
      releaseDate: card.set?.releaseDate || '',
    },
    qty,
  };
}

async function resolveDeck(lines) {
  const resolved = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    const cardId =
      parsed.cardId ||
      toCardId(parsed.setCode, parsed.number);
    const card = await fetchCard(cardId);
    resolved.push(normalizeCard(card, parsed.qty));
  }
  return resolved;
}

async function main() {
  const decks = {};
  for (const [key, lines] of Object.entries(DECK_SOURCES)) {
    decks[key] = await resolveDeck(lines);
    const total = decks[key].reduce((n, c) => n + c.qty, 0);
    console.log(`${key}: ${total} cards`);
    if (total !== 60) {
      throw new Error(`${key} deck has ${total} cards, expected 60`);
    }
  }

  const body = `// AUTO-GENERATED by scripts/generate-starter-decks.mjs — do not edit by hand.
export const GENERATED_STARTER_DECKS = ${JSON.stringify(decks, null, 2)};
`;

  writeFileSync(OUT, body, 'utf8');
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
