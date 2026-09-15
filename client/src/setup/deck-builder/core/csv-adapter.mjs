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

// Sleeve/coin choices ride as `#`-prefixed comment lines above the header so
// simulator CSVs (no comment lines) and older exports parse unchanged.
const META_LINE_PREFIXES = { sleeveId: '#SLEEVE,', coinId: '#COIN,' };

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
        rows.push([quantity, cardName, type, url, number, set, tcgId].join(','));
      }
    }
  }

  const metaLines = [];
  if (meta.sleeveId) metaLines.push(`${META_LINE_PREFIXES.sleeveId}${meta.sleeveId}`);
  if (meta.coinId) metaLines.push(`${META_LINE_PREFIXES.coinId}${meta.coinId}`);
  const metaBlock = metaLines.length ? `${metaLines.join('\n')}\n` : '';

  return `${metaBlock}${SIM_CSV_HEADER}\n${rows.join('\n')}`;
}

// Reads the `#SLEEVE`/`#COIN` comment lines a CSV export may carry; absent on
// simulator CSVs and pre-existing exports, where both come back null.
export function parseCsvMeta(csvData = '') {
  const meta = { sleeveId: null, coinId: null };
  const rows = String(csvData).split('\n');

  for (const row of rows) {
    if (row.startsWith(META_LINE_PREFIXES.sleeveId)) {
      meta.sleeveId = row.slice(META_LINE_PREFIXES.sleeveId.length).trim() || null;
    } else if (row.startsWith(META_LINE_PREFIXES.coinId)) {
      meta.coinId = row.slice(META_LINE_PREFIXES.coinId.length).trim() || null;
    } else if (!row.startsWith('#')) {
      break;
    }
  }

  return meta;
}

export function parseSimCsv(csvData = '') {
  const rows = String(csvData).split('\n');
  const newDecklist = {};
  let headerSeen = false;

  for (const row of rows) {
    if (row.startsWith('#')) continue;
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    if (!row.trim()) continue;

    const cells = row.split(',');
    const card = {
      count: cells[0],
      name: cells[1],
      supertype: cells[2],
      image: cells[3]?.trim(),
      ...deckCardIdentityFields({
        number: cells[4]?.trim() || null,
        localId: cells[4]?.trim() || null,
        id: cells[6]?.trim() || null,
        set: cells[5]?.trim() ? { id: cells[5].trim() } : undefined,
      }),
    };

    if (!newDecklist[card.name]) {
      newDecklist[card.name] = { cards: [], totalCount: 0 };
    }

    let cardFound = false;
    for (const cardEntry of newDecklist[card.name].cards) {
      if (cardEntry.data.image === card.image) {
        cardEntry.count += Number(card.count);
        cardFound = true;
        break;
      }
    }

    if (!cardFound) {
      newDecklist[card.name].cards.push({ data: card, count: Number(card.count) });
    }

    newDecklist[card.name].totalCount += Number(card.count);
  }

  return newDecklist;
}

// Convert simulator deckData tuples ([qty, name, type, url, number?, set?, tcgId?])
// into the grouped deck-builder shape without dropping identity fields.
export function parseDeckDataRows(deckRows = []) {
  const newDecklist = {};

  for (const row of deckRows) {
    if (!Array.isArray(row) || row.length < 4) continue;

    const [quantity, name, type, url, number, set, tcgId] = row;
    const card = {
      name,
      supertype: type,
      image: String(url || '').trim(),
      ...deckCardIdentityFields({
        number: number || null,
        localId: number || null,
        id: tcgId || null,
        set: set ? { id: set } : undefined,
      }),
    };

    if (!newDecklist[card.name]) {
      newDecklist[card.name] = { cards: [], totalCount: 0 };
    }

    let cardFound = false;
    for (const cardEntry of newDecklist[card.name].cards) {
      if (cardEntry.data.image === card.image && cardEntry.data.id === card.id) {
        cardEntry.count += Number(quantity);
        cardFound = true;
        break;
      }
    }

    if (!cardFound) {
      newDecklist[card.name].cards.push({
        data: card,
        count: Number(quantity),
      });
    }

    newDecklist[card.name].totalCount += Number(quantity);
  }

  return newDecklist;
}

export function deckDataRowsToSimCsv(deckRows = []) {
  const body = (Array.isArray(deckRows) ? deckRows : [])
    .filter((row) => Array.isArray(row) && row.length >= 4)
    .map((row) => {
      const [quantity, name, type, url, number = '', set = '', tcgId = ''] = row;
      return [quantity, name, type, url, number || '', set || '', tcgId || ''].join(',');
    });

  return `${SIM_CSV_HEADER}\n${body.join('\n')}`;
}
