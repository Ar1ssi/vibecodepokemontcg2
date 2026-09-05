#!/usr/bin/env node
/**
 * Build picker-sized thumbnails for the scraped playmats and regenerate the
 * pure catalog module the deck builder imports.
 *
 * The 1500px PNGs in `png/` total ~218 MB, which no picker grid can load, so
 * every mat gets a ~320px WebP in `thumbs/`. Sources are the already-scraped
 * local PNGs — this script never touches the network.
 *
 * Outputs:
 *   client/src/assets/playmats/thumbs/*.webp        (gitignored)
 *   client/src/assets/playmats/manifest.json         (adds a `thumb` field)
 *   client/src/setup/deck-builder/core/mats-catalog.mjs
 *
 * Usage: node scripts/generate-mat-thumbs.mjs [--width 320] [--force]
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYMATS_DIR = fileURLToPath(
  new URL('../client/src/assets/playmats/', import.meta.url)
);
const MANIFEST_PATH = join(PLAYMATS_DIR, 'manifest.json');
const THUMBS_DIR = join(PLAYMATS_DIR, 'thumbs');
const CLIENT_DIR = fileURLToPath(new URL('../client/', import.meta.url));
const CATALOG_PATH = fileURLToPath(
  new URL(
    '../client/src/setup/deck-builder/core/mats-catalog.mjs',
    import.meta.url
  )
);

const args = process.argv.slice(2);
const widthIdx = args.indexOf('--width');
const WIDTH = widthIdx >= 0 ? Number(args[widthIdx + 1]) : 320;
const FORCE = args.includes('--force');

/**
 * Zone layout family, mirroring `classifyMatLayout` in
 * `client/src/setup/sizing/mat-layouts.mjs`: only full-size / official mats
 * cover both players.
 */
function classifyLayout(title) {
  const text = String(title || '');
  if (/full[\s-]?size/i.test(text)) return 'two-player';
  if (/official\s+playmat/i.test(text)) return 'two-player';
  return 'one-player';
}

/** Titles come straight out of the product page HTML, entities and all. */
function decodeTitle(title) {
  return String(title || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
    .trim();
}

function toClientPath(absolutePath) {
  return absolutePath.replace(CLIENT_DIR, '').replaceAll('\\', '/');
}

function makeThumb(sourcePath, targetPath) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-vf',
      `scale=${WIDTH}:-1`,
      '-quality',
      '80',
      targetPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

function renderCatalog(mats) {
  const entries = mats
    .map(
      (mat) =>
        `  ${JSON.stringify({
          id: mat.id,
          title: mat.title,
          image: mat.image,
          thumb: mat.thumb,
          layout: mat.layout,
          sourceUrl: mat.sourceUrl,
          imageUrl: mat.imageUrl,
        })},`
    )
    .join('\n');

  return [
    '// GENERATED FILE — run `node scripts/generate-mat-thumbs.mjs` to rebuild.',
    '// Playmat catalog scraped from artofpkm.com. `image` is the local 1500px',
    '// PNG, `thumb` the ~320px WebP the picker grid loads, and `imageUrl` the',
    '// remote original used as an onerror fallback when the (gitignored) local',
    '// files are absent. `layout` is the zone profile family from',
    '// `setup/sizing/mat-layouts.mjs`.',
    '',
    'export const MATS_CATALOG = [',
    entries,
    '];',
    '',
  ].join('\n');
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `missing ${MANIFEST_PATH} — run scripts/scrape-playmats.mjs first`
    );
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  mkdirSync(THUMBS_DIR, { recursive: true });

  const mats = [];
  let built = 0;
  let reused = 0;
  let skipped = 0;
  let bytes = 0;

  for (const entry of manifest) {
    const sourceRelative = entry.png || entry.upscaled;
    const sourcePath = sourceRelative ? join(CLIENT_DIR, sourceRelative) : null;
    const thumbName = `${basename(sourceRelative || entry.slug, '.png')}.webp`;
    const thumbPath = join(THUMBS_DIR, thumbName);

    if (!sourcePath || !existsSync(sourcePath)) {
      console.warn(`! no local source for ${entry.slug} — skipping thumbnail`);
      skipped += 1;
    } else if (existsSync(thumbPath) && !FORCE) {
      reused += 1;
    } else {
      makeThumb(sourcePath, thumbPath);
      built += 1;
    }

    const hasThumb = existsSync(thumbPath);
    if (hasThumb) bytes += statSync(thumbPath).size;
    const thumb = hasThumb ? toClientPath(thumbPath) : entry.png || null;

    entry.thumb = thumb;
    mats.push({
      id: entry.slug,
      title: decodeTitle(entry.title),
      productId: entry.productId,
      image: entry.png || entry.upscaled,
      thumb,
      layout: classifyLayout(entry.title),
      sourceUrl: entry.sourceUrl,
      imageUrl: entry.imageUrl,
    });
  }

  // A handful of distinct products ship under the same product name; the
  // picker shows titles, so collisions get the product id appended to stay
  // tellable apart.
  const titleCounts = new Map();
  for (const mat of mats) {
    titleCounts.set(mat.title, (titleCounts.get(mat.title) || 0) + 1);
  }
  for (const mat of mats) {
    if (titleCounts.get(mat.title) > 1 && mat.productId) {
      mat.title = `${mat.title} (#${mat.productId})`;
    }
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(CATALOG_PATH, renderCatalog(mats));

  const twoPlayer = mats.filter((m) => m.layout === 'two-player').length;
  console.log(
    `${mats.length} mats · ${built} thumbnails built, ${reused} reused, ${skipped} skipped`
  );
  console.log(
    `thumbnails: ${(bytes / 1024 / 1024).toFixed(1)} MB in ${toClientPath(THUMBS_DIR)}`
  );
  console.log(
    `layouts: ${twoPlayer} two-player, ${mats.length - twoPlayer} one-player`
  );
}

main();
