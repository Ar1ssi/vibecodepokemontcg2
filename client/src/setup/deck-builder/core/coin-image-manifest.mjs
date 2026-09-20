// Pure helpers for the Bulbapedia coin-image downloader
// (`scripts/download-coin-images.mjs`). Kept DOM/node-free so the parsing rules
// are unit-testable without a browser.

/**
 * Turn a Bulbapedia `<img src>` into a direct, un-scaled archive URL.
 * Handles protocol-relative (`//host/...`) and page-relative (`/media/...`)
 * sources, and strips `/thumb/.../<N>px-file` scaling.
 * Returns '' when the value is not a usable URL.
 */
export function wikiImageUrl(src) {
  const raw = String(src ?? '').trim();
  if (!raw) return '';

  let url = raw;
  if (url.startsWith('//')) url = `https:${url}`;
  else if (url.startsWith('/')) url = `https://bulbapedia.bulbagarden.net${url}`;
  if (!/^https?:\/\//i.test(url)) return '';

  const withoutThumb = url.replace(/\/thumb\//, '/').replace(/\/\d+px-[^/]+$/, '');
  return withoutThumb;
}

/** Derive a filesystem-safe file name from an image URL (decoded, sanitized). */
export function imageFileName(url) {
  const text = String(url ?? '').split('?')[0].split('#')[0];
  const last = text.split('/').filter(Boolean).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    name = last;
  }
  name = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '');
  if (!name) return '';
  return /\.[A-Za-z0-9]{2,4}$/.test(name) ? name : `${name}.png`;
}

/**
 * Build a deduplicated download manifest from scraped rows.
 * @param {{ name?: string, release?: string, imageUrl?: string }[]} rows
 * @param {{ requireCoinInName?: boolean }} [options]
 * @returns {{ fileName: string, name: string, release: string, sourceUrl: string }[]}
 */
export function buildManifest(rows = [], { requireCoinInName = true } = {}) {
  const byFile = new Map();
  for (const row of rows) {
    const sourceUrl = wikiImageUrl(row?.imageUrl);
    if (!sourceUrl) continue;
    const fileName = imageFileName(sourceUrl);
    if (!fileName) continue;
    if (requireCoinInName && !/coin/i.test(fileName)) continue;
    if (byFile.has(fileName)) continue;
    byFile.set(fileName, {
      fileName,
      name: String(row?.name ?? '').trim(),
      release: String(row?.release ?? '').trim(),
      sourceUrl,
    });
  }

  return [...byFile.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}
