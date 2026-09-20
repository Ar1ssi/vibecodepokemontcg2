// Pure helpers for the Bulbapedia coin-image scraper/downloader
// (`scripts/download-coin-images.mjs`). Kept DOM/node-free so the parsing and
// matching rules are unit-testable without a browser or network.

/**
 * Absolutise a Bulbapedia `<img src>` (protocol-relative or page-relative).
 * Returns '' when the value is not a usable URL.
 */
export function absoluteImageUrl(src) {
  const raw = String(src ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `https://bulbapedia.bulbagarden.net${raw}`;
  return /^https?:\/\//i.test(raw) ? raw : '';
}

/**
 * Turn a Bulbapedia thumbnail URL into the full-size original
 * (strips `/thumb/` and the trailing `/NNNpx-file` segment).
 */
export function wikiImageUrl(src) {
  const url = absoluteImageUrl(src);
  if (!url) return '';
  return url.replace(/\/thumb\//, '/').replace(/\/\d+px-[^/]+$/, '');
}

/** Derive a filesystem-safe file name from an image URL (drops a leading `NNNpx-`). */
export function imageFileName(url) {
  const text = String(url ?? '').split('?')[0].split('#')[0];
  const last = text.split('/').filter(Boolean).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    name = last;
  }
  name = name
    .replace(/^\d+px-/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+/, '');
  if (!name) return '';
  return /\.[A-Za-z0-9]{2,4}$/.test(name) ? name : `${name}.png`;
}

const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parse Bulbapedia coin pages into `{ imageUrl, description, text }` entries.
 * Each coin is one `<table class="roundy">` block whose stripped text ends with
 * `Description: <text>` — the same text the catalog's `description` field holds.
 */
export function parseCoinTables(html) {
  const blocks = [
    ...String(html ?? '').matchAll(/<table class="roundy"[^>]*>[\s\S]*?<\/table>/g),
  ].map((m) => m[0]);

  const entries = [];
  for (const block of blocks) {
    const text = stripHtml(block);
    const description = (text.match(/[Dd]escription:\s*([\s\S]*)$/) || [])[1]?.trim() ?? '';
    // A coin table always carries a Description; its scan usually says "Coin", but a
    // few (e.g. 2022_Q1_Stacking_Tins_Grookey.png) do not — fall back to the upload image.
    if (!description) continue;
    const images = [...block.matchAll(/(?:src|data-src)="([^"]+)"/g)].map((m) => m[1]);
    const imageUrl = images.find((u) => /coin/i.test(u)) ?? images.find((u) => /\/upload\//.test(u));
    if (!imageUrl) continue;
    entries.push({ imageUrl, description, text });
  }
  return entries;
}

/** Canonical form for matching descriptions (case/punctuation/whitespace-insensitive). */
export function normalizeMatchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Build a deduplicated download manifest from scraped rows.
 * @param {{ name?: string, release?: string, description?: string, imageUrl?: string }[]} rows
 * @param {{ requireCoinInName?: boolean, fullSize?: boolean }} [options]
 * @returns {{ fileName: string, name: string, release: string, description: string, sourceUrl: string }[]}
 */
export function buildManifest(rows = [], { requireCoinInName = true, fullSize = false } = {}) {
  const byFile = new Map();
  for (const row of rows) {
    const sourceUrl = fullSize ? wikiImageUrl(row?.imageUrl) : absoluteImageUrl(row?.imageUrl);
    if (!sourceUrl) continue;
    const fileName = imageFileName(sourceUrl);
    if (!fileName) continue;
    if (requireCoinInName && !/coin/i.test(fileName)) continue;

    const description = String(row?.description ?? '').trim();
    const existing = byFile.get(fileName);
    if (existing) {
      // Several coin variants can share one scan; keep every description so each links.
      if (description && !existing.descriptions.includes(description)) {
        existing.descriptions.push(description);
      }
      continue;
    }
    byFile.set(fileName, {
      fileName,
      name: String(row?.name ?? '').trim(),
      release: String(row?.release ?? '').trim(),
      descriptions: description ? [description] : [],
      sourceUrl,
    });
  }

  return [...byFile.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/**
 * Match manifest entries to catalog coins by `description` (exact, then prefix).
 * @returns {{ matches: { coinId: string, fileName: string }[], unmatched: object[] }}
 */
export function matchManifestToCoins(manifest = [], coins = []) {
  const byDescription = new Map();
  for (const entry of manifest) {
    const descriptions = Array.isArray(entry?.descriptions)
      ? entry.descriptions
      : entry?.description
        ? [entry.description]
        : [];
    for (const description of descriptions) {
      const key = normalizeMatchText(description);
      if (key && !byDescription.has(key)) byDescription.set(key, entry);
    }
  }
  const keys = [...byDescription.keys()];

  const matches = [];
  const unmatched = [];
  for (const coin of coins) {
    const key = normalizeMatchText(coin?.description);
    if (!key) {
      unmatched.push(coin);
      continue;
    }
    let entry = byDescription.get(key);
    if (!entry) {
      const hit = keys.find((candidate) => candidate.startsWith(key) || key.startsWith(candidate));
      entry = hit ? byDescription.get(hit) : null;
    }
    if (entry) matches.push({ coinId: coin.id, fileName: entry.fileName });
    else unmatched.push(coin);
  }

  return { matches, unmatched };
}
