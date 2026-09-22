/**
 * Vendors pokesprite item art for the deck list's per-card sprites (design 025).
 *
 * Source: msikma/pokesprite `items/`. Like the Pokémon art (D97) the PNGs are
 * vendored, not hotlinked, so the builder renders offline; this script is the
 * only thing that talks to the network.
 *
 * Usage: node scripts/generate-item-sprites.mjs [--force]
 *   --force  re-download sprites that are already on disk.
 *
 * Only folders that can match a Trainer card name are vendored. Key items,
 * mail, TMs, Z-crystals and curry ingredients have no TCG counterpart worth
 * the bytes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/msikma/pokesprite@master';
const LISTING_URL =
  'https://data.jsdelivr.com/v1/packages/gh/msikma/pokesprite@master?structure=flat';
const ASSET_DIR = path.join(REPO_ROOT, 'client/src/assets/items');
const CATALOG_PATH = path.join(
  REPO_ROOT,
  'client/src/setup/deck-builder/core/item-sprite-catalog.generated.mjs'
);
const CONCURRENCY = 16;

const VENDORED_FOLDERS = [
  'ball',
  'battle-item',
  'berry',
  'ev-item',
  'evo-item',
  'flute',
  'fossil',
  'gem',
  'hold-item',
  'incense',
  'medicine',
  'mega-stone',
  'mint',
  'other-item',
  'plate',
  'scarf',
  'valuable-item',
];

// Key items are mostly story items; these few share a name with a Trainer card.
const EXTRA_ITEMS = [
  'key-item/dowsing-machine',
  'key-item/exp-share',
  'key-item/good-rod',
  'key-item/old-rod',
  'key-item/pal-pad',
  'key-item/poke-flute',
  'key-item/super-rod',
  'key-item/town-map',
  'key-item/vs-seeker',
];

const SMALL_WORDS = new Set(['of', 'the']);

function titleCase(slug) {
  return slug
    .split('-')
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

/** The in-game display name a Trainer card would print, e.g. ball/poke → "Poké Ball". */
function itemDisplayName(folder, slug) {
  if (folder === 'ball') {
    const base = slug === 'poke' ? 'Poké' : titleCase(slug);
    return `${base.replace('Hisuian Poke', 'Hisuian Poké')} Ball`;
  }
  return titleCase(slug).replace(/\bPoke\b/g, 'Poké');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function download(relativePath, force) {
  const target = path.join(ASSET_DIR, relativePath);
  if (!force && existsSync(target)) return;
  const response = await fetch(`${CDN_BASE}/items/${relativePath}`);
  if (!response.ok) throw new Error(`GET ${relativePath} -> ${response.status}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const force = process.argv.includes('--force');
  const listing = await fetchJson(LISTING_URL);
  const entries = listing.files
    .map((file) => file.name)
    .filter((name) => name.startsWith('/items/') && name.endsWith('.png'))
    .map((name) => name.slice('/items/'.length, -'.png'.length))
    .filter((relative) => {
      const [folder, slug] = relative.split('/');
      // `--bag` / `--held` variants duplicate the base icon.
      if (EXTRA_ITEMS.includes(relative)) return true;
      return VENDORED_FOLDERS.includes(folder) && slug && !slug.includes('--');
    })
    .sort()
    .map((relative) => {
      const [folder, slug] = relative.split('/');
      return { path: relative, name: itemDisplayName(folder, slug) };
    })
    // A name in two folders (Exp. Share is a hold item and a key item) keeps the first.
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index);

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(
      entries.slice(i, i + CONCURRENCY).map((entry) => download(`${entry.path}.png`, force))
    );
  }

  const lines = entries.map(
    (entry) => `  { name: ${JSON.stringify(entry.name)}, path: '${entry.path}' },`
  );
  await writeFile(
    CATALOG_PATH,
    [
      '// GENERATED FILE — do not edit by hand.',
      '// Regenerate with: node scripts/generate-item-sprites.mjs',
      '// Source: msikma/pokesprite `items/`. Art is vendored at client/src/assets/items/<path>.png.',
      '',
      'export const ITEM_SPRITE_CATALOG = [',
      ...lines,
      '];',
      '',
    ].join('\n')
  );
  console.log(`Vendored ${entries.length} item sprites.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
