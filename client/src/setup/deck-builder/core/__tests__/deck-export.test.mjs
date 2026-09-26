import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckExportDocument } from '../deck-export.mjs';

const card = (overrides = {}) => ({
  id: 'sv1-4',
  name: 'Charmander',
  supertype: 'Pokémon',
  count: 1,
  images: { small: 'https://img.example/small.png', large: 'https://img.example/large.png' },
  set: { id: 'sv1', name: 'Scarlet & Violet' },
  ...overrides,
});

const tileCount = (html) => (html.match(/class="export-card"/g) || []).length;

describe('deck-export', () => {
  it('renders one framed tile per card and a count badge for duplicates', () => {
    const html = buildDeckExportDocument({
      cards: [card(), card({ id: 'sv1-5', name: 'Charmeleon', count: 4 })],
      deckName: 'Test Deck',
    });

    assert.equal(tileCount(html), 2);
    assert.match(html, /alt="Charmander"/);
    assert.match(html, /alt="Charmeleon"/);
    assert.match(html, /class="export-card-qty"[^>]*>×4</);
    assert.doesNotMatch(html, /×1</);
  });

  it('prefers the large scan and falls back to the plain image field', () => {
    const html = buildDeckExportDocument({
      cards: [
        card(),
        card({ id: 'csv-1', name: 'Squirtle', images: undefined, image: 'https://img.example/sq.png' }),
      ],
    });

    assert.match(html, /src="https:\/\/img\.example\/large\.png"/);
    assert.match(html, /src="https:\/\/img\.example\/sq\.png"/);
  });

  it('escapes names and urls so deck data cannot inject markup', () => {
    const html = buildDeckExportDocument({
      cards: [
        card({
          name: '<img src=x onerror=alert(1)>',
          images: { large: 'https://img.example/a".png' },
        }),
      ],
    });

    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x onerror/);
    assert.match(html, /src="https:\/\/img\.example\/a&quot;\.png"/);
  });

  it('renders a placeholder for a card without any image', () => {
    const html = buildDeckExportDocument({
      cards: [card({ images: undefined, image: '' })],
    });

    assert.match(html, /class="export-card-missing"/);
    assert.equal(tileCount(html), 1);
  });

  it('shows deck totals in the header', () => {
    const html = buildDeckExportDocument({
      cards: [card({ count: 4 }), card({ id: 'sv1-5', count: 56 })],
      deckName: 'Charizard ex',
    });

    assert.match(html, /<h1>Charizard ex<\/h1>/);
    assert.match(html, /60 cards · 2 unique/);
  });

  it('empty deck shows the empty state and disables download', () => {
    const html = buildDeckExportDocument({ cards: [], deckName: 'Empty' });

    assert.match(html, /class="export-empty"/);
    assert.equal(tileCount(html), 0);
    assert.match(html, /data-action="download-deck" disabled/);
    assert.match(html, /0 cards|No cards/);
  });

  it('non-empty deck exposes the download hook enabled', () => {
    const html = buildDeckExportDocument({ cards: [card()] });

    assert.match(html, /data-action="download-deck">Download deck/);
    assert.doesNotMatch(html, /data-action="download-deck" disabled/);
  });

  it('defaults to dark and opts into light via the theme class', () => {
    assert.match(buildDeckExportDocument({ cards: [card()] }), /<html lang="en">/);
    assert.match(
      buildDeckExportDocument({ cards: [card()], theme: 'light' }),
      /<html lang="en" class="theme-light">/
    );
  });

  it('tolerates null input', () => {
    const html = buildDeckExportDocument();

    assert.match(html, /<h1>Untitled Deck<\/h1>/);
    assert.match(html, /class="export-empty"/);
  });
});
