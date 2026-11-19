import { isDatabaseCard, isFormattedDeckCard } from './card-compare.mjs';

export function formatImageUrl(cardObj = {}) {
  if (isDatabaseCard(cardObj)) {
    return (
      cardObj.images?.large ||
      cardObj.images?.small ||
      cardObj.image ||
      ''
    );
  }

  if (isFormattedDeckCard(cardObj)) {
    const image = cardObj.image || '';
    if (image.startsWith('assets')) {
      if (!image.includes('tishinator')) {
        return `https://tishinator.github.io/PTCGDeckBuilder${image}`;
      }
    }
    return image;
  }

  return '';
}

export function formatCardType(cardObj = {}) {
  return cardObj.supertype || '';
}

const SIM_CSV_HEADER = 'QTY,Name,Type,URL,Number,Set,TcgId';

// A field holding a comma or a quote is wrapped in quotes with inner quotes doubled; every other
// field stays bare, so exports of ordinary decks read as they always did.
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// Splits one CSV line into fields, honouring quoted fields; an unquoted line splits on commas alone.
function splitCsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

const positiveWhole = (value) => {
  const number = Number(String(value ?? '').trim());
  return Number.isInteger(number) && number > 0 ? number : null;
};

// One sim row, in the shape both readers merge: [qty, name, type, url, number?, set?, tcgId?].
// Returns null for a row without qty, name, type and url or whose qty is not a positive whole number.
function simRowToCard(cells) {
  if (cells.length < 4) return null;
  const [quantity, name, type, url, number, set, tcgId] = cells;
  const count = positiveWhole(quantity);
  if (count === null) return null;
  const text = (value) => String(value ?? '').trim();
  return {
    count,
    card: {
      name,
      supertype: type,
      image: text(url),
      ...deckCardIdentityFields({
        number: text(number) || null,
        localId: text(number) || null,
        id: text(tcgId) || null,
        set: text(set) ? { id: text(set) } : undefined,
      }),
    },
  };
}

// Adds one parsed row to a grouped deck, merging copies of the same print (same image and id).
function addCardToDecklist(decklist, { card, count }) {
  const group = (decklist[card.name] ??= { cards: [], totalCount: 0 });
  const entry = group.cards.find(({ data }) => data.image === card.image && data.id === card.id);
  if (entry) entry.count += count;
  else group.cards.push({ data: card, count });
  group.totalCount += count;
}

function deckCardNumber(data = {}) {
  return data.number || data.localId || '';
}

function deckCardSetCode(data = {}) {
  if (data.set && typeof data.set === 'object') return data.set.id || '';
  if (typeof data.set === 'string') return data.set;
  return '';
}

function deckCardIdentityFields(data = {}) {
  return {
    number: deckCardNumber(data) || null,
    localId: deckCardNumber(data) || null,
    id: data.id || null,
    set: deckCardSetCode(data) ? { id: deckCardSetCode(data) } : undefined,
  };
}

// Sleeve/coin/deck box choices ride as `#`-prefixed comment lines above the header so
// simulator CSVs (no comment lines) and older exports parse unchanged.
const META_LINE_PREFIXES = { sleeveId: '#SLEEVE,', coinId: '#COIN,', deckBoxId: '#DECKBOX,' };

export function serializeDeckToSimCsv(decklist = {}, meta = {}) {
  const rows = [];

  for (const cardName in decklist) {
    const group = decklist[cardName];
    if (!group?.cards) continue;

    for (const variant of group.cards) {
      const data = variant?.data || {};
      const quantity = variant?.count;
      const type = formatCardType(data);
      const url = formatImageUrl(data);
      const number = deckCardNumber(data);
      const set = deckCardSetCode(data);
      const tcgId = data.id || '';

      if (cardName !== '' && type !== '' && url !== '') {
        rows.push(csvRow([quantity, cardName, type, url, number, set, tcgId]));
      }
    }
  }

  const metaLines = [];
  if (meta.sleeveId) metaLines.push(`${META_LINE_PREFIXES.sleeveId}${meta.sleeveId}`);
  if (meta.coinId) metaLines.push(`${META_LINE_PREFIXES.coinId}${meta.coinId}`);
  if (meta.deckBoxId) metaLines.push(`${META_LINE_PREFIXES.deckBoxId}${meta.deckBoxId}`);
  const metaBlock = metaLines.length ? `${metaLines.join('\n')}\n` : '';

  return `${metaBlock}${SIM_CSV_HEADER}\n${rows.join('\n')}`;
}

// Reads the `#SLEEVE`/`#COIN`/`#DECKBOX` comment lines a CSV export may carry; absent on
// simulator CSVs and pre-existing exports, where each comes back null.
export function parseCsvMeta(csvData = '') {
  const meta = { sleeveId: null, coinId: null, deckBoxId: null };
  const rows = String(csvData).split('\n');

  for (const row of rows) {
    if (row.startsWith(META_LINE_PREFIXES.sleeveId)) {
      meta.sleeveId = row.slice(META_LINE_PREFIXES.sleeveId.length).trim() || null;
    } else if (row.startsWith(META_LINE_PREFIXES.coinId)) {
      meta.coinId = row.slice(META_LINE_PREFIXES.coinId.length).trim() || null;
    } else if (row.startsWith(META_LINE_PREFIXES.deckBoxId)) {
      meta.deckBoxId = row.slice(META_LINE_PREFIXES.deckBoxId.length).trim() || null;
    } else if (!row.startsWith('#')) {
      break;
    }
  }

  return meta;
}

/**
 * @throws {Error} naming the line of a row that lacks qty, name, type and url, or whose qty is not
 *   a positive whole number; the import reports it instead of building a shorter deck.
 */
export function parseSimCsv(csvData = '') {
  const newDecklist = {};
  let headerSeen = false;

  String(csvData)
    .split('\n')
    .forEach((line, index) => {
      const row = line.replace(/\r$/, '');
      if (row.startsWith('#')) return;
      if (!headerSeen) {
        headerSeen = true;
        return;
      }
      if (!row.trim()) return;

      const parsed = simRowToCard(splitCsvRow(row));
      if (!parsed) throw new Error(`line ${index + 1} is not "QTY,Name,Type,URL" with a whole-number QTY`);
      addCardToDecklist(newDecklist, parsed);
    });

  return newDecklist;
}

// Convert simulator deckData tuples ([qty, name, type, url, number?, set?, tcgId?])
// into the grouped deck-builder shape without dropping identity fields.
export function parseDeckDataRows(deckRows = []) {
  const newDecklist = {};

  for (const row of deckRows) {
    const parsed = Array.isArray(row) ? simRowToCard(row) : null;
    if (parsed) addCardToDecklist(newDecklist, parsed);
  }

  return newDecklist;
}

export function deckDataRowsToSimCsv(deckRows = []) {
  const body = (Array.isArray(deckRows) ? deckRows : [])
    .filter((row) => Array.isArray(row) && row.length >= 4)
    .map((row) => {
      const [quantity, name, type, url, number = '', set = '', tcgId = ''] = row;
      return csvRow([quantity, name, type, url, number || '', set || '', tcgId || '']);
    });

  return `${SIM_CSV_HEADER}\n${body.join('\n')}`;
}
