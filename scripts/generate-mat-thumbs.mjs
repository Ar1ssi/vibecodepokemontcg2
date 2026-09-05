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
 *   client/src/assets/playmats/thumbs/*.webp        (picker grid)
 *   client/src/assets/playmats/board/*.webp         (trimmed board art)
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
const BOARD_DIR = join(PLAYMATS_DIR, 'board');
const CLIENT_DIR = fileURLToPath(new URL('../client/', import.meta.url));
const CATALOG_PATH = fileURLToPath(
  new URL(
    '../client/src/setup/deck-builder/core/mats-catalog.mjs',
    import.meta.url
  )
);

const args = process.argv.slice(2);
const widthIdx = args.indexOf('--width');
const boardWidthIdx = args.indexOf('--board-width');
const WIDTH = widthIdx >= 0 ? Number(args[widthIdx + 1]) : 320;
const BOARD_WIDTH = boardWidthIdx >= 0 ? Number(args[boardWidthIdx + 1]) : 1500;
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

function makeBoard(sourcePath, targetPath) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-vf',
      `scale='min(${BOARD_WIDTH},iw)':-1`,
      '-quality',
      '85',
      targetPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

/** Prettier's string style: single quotes unless the value has one in it. */
function quote(value) {
  const text = String(value ?? '');
  return text.includes("'")
    ? JSON.stringify(text)
    : `'${text.replaceAll('\\', '\\\\')}'`;
}

function renderCatalog(mats) {
  const entries = mats
    .map((mat) =>
      [
        '  {',
        `    id: ${quote(mat.id)},`,
        `    title: ${quote(mat.title)},`,
        `    image: ${quote(mat.image)},`,
        `    thumb: ${quote(mat.thumb)},`,
        `    board: ${quote(mat.board)},`,
        `    layout: ${quote(mat.layout)},`,
        `    sourceUrl: ${quote(mat.sourceUrl)},`,
        `    imageUrl: ${quote(mat.imageUrl)},`,
        '  },',
      ].join('\n')
    )
    .join('\n');

  return [
    '// GENERATED FILE — run `node scripts/generate-mat-thumbs.mjs` to rebuild.',
    '// Playmat catalog scraped from artofpkm.com. `image` is the local 1500px',
    '// PNG, `thumb` the ~320px WebP the picker grid loads, `board` the trimmed',
    '// ~1500px WebP painted on the battle mat, and `imageUrl` the remote',
    '// original used only as a last-resort proxy fallback. `layout` is the',
    '// `setup/sizing/mat-layouts.mjs`.',
    '',
    'export const MATS_CATALOG = [',
    entries,
    '];',
    '',
  ].join('\n');
}

/**
 * Long asset paths need prettier's own line wrapping to keep the generated
 * file lint-clean; hand-rolling that is not worth it, so defer to the local
 * prettier when the workspace has one installed.
 */
function formatCatalog() {
  const prettier = fileURLToPath(
    new URL('../node_modules/.bin/prettier', import.meta.url)
  );
  if (!existsSync(prettier)) {
    console.warn(
      '! prettier not installed — generated catalog left unformatted'
    );
    return;
  }
  execFileSync(prettier, ['--write', CATALOG_PATH], { stdio: 'ignore' });
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `missing ${MANIFEST_PATH} — run scripts/scrape-playmats.mjs first`
    );
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  mkdirSync(THUMBS_DIR, { recursive: true });
  mkdirSync(BOARD_DIR, { recursive: true });

  const mats = [];
  let built = 0;
  let reused = 0;
  let boardBuilt = 0;
  let boardReused = 0;
  let skipped = 0;
  let bytes = 0;
  let boardBytes = 0;

  for (const entry of manifest) {
    const sourceRelative = entry.png || entry.upscaled;
    const sourcePath = sourceRelative ? join(CLIENT_DIR, sourceRelative) : null;
    const thumbName = `${basename(sourceRelative || entry.slug, '.png')}.webp`;
    const thumbPath = join(THUMBS_DIR, thumbName);
    const boardPath = join(BOARD_DIR, thumbName);

    if (!sourcePath || !existsSync(sourcePath)) {
      console.warn(`! no local source for ${entry.slug} — skipping thumbnail`);
      skipped += 1;
    } else {
      if (existsSync(thumbPath) && !FORCE) {
        reused += 1;
      } else {
        makeThumb(sourcePath, thumbPath);
        built += 1;
      }
      if (existsSync(boardPath) && !FORCE) {
        boardReused += 1;
      } else {
        makeBoard(sourcePath, boardPath);
        boardBuilt += 1;
      }
    }

    const hasThumb = existsSync(thumbPath);
    const hasBoard = existsSync(boardPath);
    if (hasThumb) bytes += statSync(thumbPath).size;
    if (hasBoard) boardBytes += statSync(boardPath).size;
    const thumb = hasThumb ? toClientPath(thumbPath) : entry.png || null;
    const board = hasBoard ? toClientPath(boardPath) : thumb;

    entry.thumb = thumb;
    entry.board = board;
    mats.push({
      id: entry.slug,
      title: decodeTitle(entry.title),
      productId: entry.productId,
      image: entry.png || entry.upscaled,
      thumb,
      board,
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
  formatCatalog();

  const twoPlayer = mats.filter((m) => m.layout === 'two-player').length;
  console.log(
    `${mats.length} mats · ${built} thumbnails built, ${reused} reused, ${boardBuilt} board built, ${boardReused} board reused, ${skipped} skipped`
  );
  console.log(
    `thumbnails: ${(bytes / 1024 / 1024).toFixed(1)} MB in ${toClientPath(THUMBS_DIR)}`
  );
  console.log(
    `board art: ${(boardBytes / 1024 / 1024).toFixed(1)} MB in ${toClientPath(BOARD_DIR)}`
  );
  console.log(
    `layouts: ${twoPlayer} two-player, ${mats.length - twoPlayer} one-player`
  );
}

main();
