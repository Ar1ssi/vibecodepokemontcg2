import { formatImageUrl } from './csv-adapter.mjs';

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const cardTileHtml = (card = {}) => {
  const name = card.name || 'Unknown Card';
  const count = Math.max(1, Number(card.count) || 1);
  const imageUrl = formatImageUrl(card);
  const setName = card.set?.name || '';
  const meta = [card.supertype, setName].filter(Boolean).join(' · ');
  const imageHtml = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" />`
    : `<span class="export-card-missing">${escapeHtml(name)}</span>`;

  return `
      <figure class="export-card">
        <div class="export-card-frame">
          ${imageHtml}
          ${count > 1 ? `<span class="export-card-qty" aria-label="Quantity ${count}">×${count}</span>` : ''}
        </div>
        <figcaption class="export-card-caption">
          <strong>${escapeHtml(name)}</strong>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </figcaption>
      </figure>`;
};

/**
 * Builds the standalone HTML document the "Export Deck" popout renders: every
 * card in the deck as a framed tile (count badge for duplicates) plus a
 * Download button the opener binds to the deck CSV.
 *
 * Pure string building — the caller opens the window and wires the button,
 * so this stays testable without a DOM.
 *
 * @param {object} [options]
 * @param {object[]} [options.cards] Deck cards (getSortedDeckCardArray output; `count` rides each)
 * @param {string} [options.deckName] Deck title shown in the header
 * @param {'dark'|'light'} [options.theme] Matches the deck builder's active theme
 * @returns {string} A complete HTML document
 */
export function buildDeckExportDocument({
  cards = [],
  deckName = 'Untitled Deck',
  theme = 'dark',
} = {}) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const totalCount = safeCards.reduce(
    (sum, card) => sum + Math.max(1, Number(card?.count) || 1),
    0
  );
  const hasCards = safeCards.length > 0;
  const safeDeckName = escapeHtml(deckName || 'Untitled Deck');
  const metaLine = hasCards
    ? `${totalCount} card${totalCount === 1 ? '' : 's'} · ${safeCards.length} unique`
    : 'No cards';
  const grid = hasCards
    ? safeCards.map(cardTileHtml).join('\n')
    : '<p class="export-empty">This deck has no cards yet — add cards before exporting.</p>';

  return `<!DOCTYPE html>
<html lang="en"${theme === 'light' ? ' class="theme-light"' : ''}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeDeckName} — Deck Export</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1216;
    --panel: #171c21;
    --line: #2a323b;
    --text: #e8edf2;
    --muted: #98a5b3;
    --accent: #f5c518;
    --felt: #0b0e11;
  }

  html.theme-light {
    color-scheme: light;
    --bg: #f3f5f8;
    --panel: #ffffff;
    --line: #d7dde4;
    --text: #1b2229;
    --muted: #5b6875;
    --accent: #c99700;
    --felt: #e7ebf0;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif;
  }

  .export-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 16px 24px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .export-header h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
  }

  .export-header p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .export-download {
    padding: 10px 18px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--accent);
    color: #14181c;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .export-download:hover:not(:disabled) { filter: brightness(1.08); }

  .export-download:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .export-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 20px;
    padding: 24px;
  }

  .export-card {
    margin: 0;
    min-width: 0;
  }

  .export-card-frame {
    position: relative;
    aspect-ratio: 63 / 88;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--felt);
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.35);
  }

  html.theme-light .export-card-frame {
    box-shadow: 0 6px 16px rgb(15 23 42 / 0.12);
  }

  .export-card-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .export-card-missing {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 12px;
    color: var(--muted);
    text-align: center;
  }

  .export-card-qty {
    position: absolute;
    top: 8px;
    right: 8px;
    min-width: 26px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--accent);
    color: #14181c;
    font-weight: 700;
    text-align: center;
  }

  .export-card-caption {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 8px;
    min-width: 0;
  }

  .export-card-caption strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .export-card-caption span {
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .export-empty {
    grid-column: 1 / -1;
    margin: 0;
    padding: 48px 0;
    color: var(--muted);
    text-align: center;
  }

  @media print {
    :root, html.theme-light {
      color-scheme: light;
      --bg: #ffffff;
      --panel: #ffffff;
      --line: #cccccc;
      --text: #111111;
      --muted: #555555;
      --felt: #f2f2f2;
    }

    .export-header {
      position: static;
      border-bottom-color: #cccccc;
    }

    .export-download { display: none; }

    .export-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      padding: 12px 0;
    }

    .export-card { break-inside: avoid; }

    .export-card-frame { box-shadow: none; }
  }
</style>
</head>
<body>
  <header class="export-header">
    <div>
      <h1>${safeDeckName}</h1>
      <p>${metaLine}</p>
    </div>
    <button type="button" class="export-download" data-action="download-deck"${hasCards ? '' : ' disabled'}>Download deck (.csv)</button>
  </header>
  <main class="export-grid">
${grid}
  </main>
</body>
</html>
`;
}
