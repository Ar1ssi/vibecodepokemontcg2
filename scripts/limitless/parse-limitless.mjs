/**
 * Pure parsers for limitlesstcg.com tournament pages (design 069). Each takes the page's HTML and
 * returns plain rows; the markup they read was probed on 2026-10-15 and is pinned by the fixtures in
 * __tests__/fixtures/. A page that yields no rows returns [] and the caller decides whether that is
 * an error (build-meta-dataset.mjs throws: Limitless changed its markup).
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text = '') {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const cleanText = (html = '') =>
  decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
};

/** "1st" / "22nd" / "548th" → 548; anything else → null. */
export function ordinalToPlacing(text = '') {
  const match = String(text).trim().match(/^(\d+)(?:st|nd|rd|th)\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * The /tournaments listing: one row per event.
 * @returns {{id: number, name: string, date: string, players: number|null, format: string}[]}
 */
export function parseEventIndex(html = '') {
  const rows = [];
  for (const match of String(html).matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const [, rowAttrs, body] = match;
    const link = body.match(/href="\/tournaments\/(\d+)"/);
    const format = attr(rowAttrs, 'data-format');
    if (!link || !format) continue;
    const players = Number(attr(rowAttrs, 'data-players'));
    rows.push({
      id: Number(link[1]),
      name: attr(rowAttrs, 'data-name') || '',
      date: attr(rowAttrs, 'data-date') || '',
      players: Number.isFinite(players) && players > 0 ? players : null,
      format,
    });
  }
  return rows;
}

/**
 * One event's results page (Masters standings).
 * `formatCode` is the card-pool code Limitless links ("TEF-30C"); its first part is the rotation.
 */
export function parseEventPage(html = '') {
  const source = String(html);
  const heading = source.match(/<div class="infobox-heading">([\s\S]*?)<\/div>/);
  const line = source.match(/<div class="infobox-line">([\s\S]*?)<\/div>/);
  const formatLink = source.match(/href="\/decks\/\?[^"]*format=([A-Z0-9]+-[A-Z0-9]+)"[^>]*>([^<]*)</);
  const players = line ? cleanText(line[1]).match(/(\d+)\s+Players/) : null;

  const standings = [];
  for (const match of source.matchAll(/<tr\b([^>]*\bdata-rank="[^"]*"[^>]*)>([\s\S]*?)<\/tr>/g)) {
    const [, rowAttrs, body] = match;
    const placing = Number(attr(rowAttrs, 'data-rank'));
    if (!Number.isInteger(placing) || placing < 1) continue;
    const archetype = body.match(/href="\/decks\/(\d+)(?:\?[^"]*)?"/);
    const list = body.match(/href="\/decks\/list\/(\d+)"/);
    standings.push({
      placing,
      player: attr(rowAttrs, 'data-name') || '',
      archetypeId: archetype ? Number(archetype[1]) : null,
      archetypeName: attr(rowAttrs, 'data-deck') || '',
      listId: list ? Number(list[1]) : null,
    });
  }

  return {
    name: heading ? cleanText(heading[1]) : '',
    players: players ? Number(players[1]) : null,
    formatCode: formatLink ? formatLink[1] : '',
    formatLabel: formatLink ? cleanText(formatLink[2]) : '',
    standings,
  };
}

const CARD_ROW_RE =
  /<div class="decklist-card"([^>]*)>[\s\S]*?<span class="card-count">([^<]*)<\/span>\s*<span class="card-name">([^<]*)<\/span>([\s\S]*?)<\/div>/g;

function parseCardRows(block) {
  const cards = [];
  for (const match of block.matchAll(CARD_ROW_RE)) {
    const [, rowAttrs, countText, nameText, rest] = match;
    const count = Number(countText.trim());
    if (!Number.isInteger(count) || count < 1) continue;
    const price = rest.match(/class="card-price usd"[^>]*>\s*\$([\d,.]+)/);
    const priceUsd = price ? Number(price[1].replace(/,/g, '')) : null;
    cards.push({
      count,
      name: decodeEntities(nameText.trim()),
      set: attr(rowAttrs, 'data-set') || '',
      number: attr(rowAttrs, 'data-number') || '',
      priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
    });
  }
  return cards;
}

/**
 * The /tournaments/<id>/decklists page: every published Masters list, in placing order.
 * Only the text view (`decklist-card`) is read; the image view repeats the same cards.
 * @returns {{placing: number, player: string, cards: {count, name, set, number, priceUsd}[]}[]}
 */
export function parseDecklists(html = '') {
  const lists = [];
  const blocks = String(html).split('<div class="tournament-decklist">').slice(1);
  for (const block of blocks) {
    const toggle = block.match(/<div class="decklist-toggle"[^>]*>([^<]*)<\/div>/);
    if (!toggle) continue;
    const label = decodeEntities(toggle[1]).trim();
    const placing = ordinalToPlacing(label);
    if (placing === null) continue;
    const cards = parseCardRows(block);
    if (!cards.length) continue;
    lists.push({ placing, player: label.replace(/^\S+\s+/, ''), cards });
  }
  return lists;
}
