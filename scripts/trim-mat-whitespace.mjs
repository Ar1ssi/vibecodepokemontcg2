#!/usr/bin/env node
/**
 * Trim the white surround off the scraped playmat images.
 *
 * Most of the catalogue is e-commerce product photography rather than flat mat
 * scans: the mat sits in the middle of a white studio background, so roughly
 * half of a typical file is padding. Stretched onto the board that padding
 * reads as a thin strip of art floating in white, so it has to come off.
 *
 * Detection decodes each image to 8-bit greyscale and finds the bounding box
 * of rows/columns that carry actual content. A row only counts as content if
 * a minimum *fraction* of it is non-white, which keeps a stray logo, caption
 * or compression speckle out in the margin from defeating the trim.
 *
 * Every derived file is rebuilt from `original/`, never from the previous
 * `png/`, so running this repeatedly is idempotent and cannot crop twice.
 *
 * Usage:
 *   node scripts/trim-mat-whitespace.mjs [--dry-run] [--scale 2] [--only <substr>]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../client/src/assets/playmats/', import.meta.url));
const ORIG_DIR = join(ROOT, 'original');
const PNG_DIR = join(ROOT, 'png');
const UPSCALED_DIR = join(ROOT, 'upscaled');
const THUMBS_DIR = join(ROOT, 'thumbs');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const DRY_RUN = flag('--dry-run');
const SCALE = Number(value('--scale', 2));
const ONLY = value('--only', null);
const THUMB_WIDTH = 320;

/** A pixel at or above this luma counts as background. */
const WHITE_LUMA = 242;
/** A row/column needs this fraction of non-white pixels to count as content. */
const CONTENT_RATIO = 0.01;
/** Refuse a crop that would throw away more than this share of the image. */
const MIN_AREA_RATIO = 0.05;

const ffmpeg = (ffmpegArgs) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ffmpegArgs], { stdio: 'pipe' });

function getDimensions(path) {
  try {
    execFileSync('ffmpeg', ['-i', path], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    const text = err.stderr?.toString?.() ?? '';
    const m = text.match(/,\s*(\d+)x(\d+)/);
    if (m) return { width: Number(m[1]), height: Number(m[2]) };
  }
  return null;
}

/** Decode to raw greyscale so we can inspect the pixels directly. */
function readGrey(path, width, height) {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
    { maxBuffer: width * height * 4 + 1024 }
  );
  return raw.length >= width * height ? raw : null;
}

/**
 * Largest run of content in a mask, bridging gaps small enough to be internal
 * to the subject.
 *
 * Taking the outermost content instead would be wrong: these product shots
 * print a copyright caption under the mat, and a first-to-last bounding box
 * swallows the white gap between the mat and that text. The mat is the
 * biggest contiguous block, so the caption drops out on its own.
 */
function largestRun(mask, maxGap) {
  let best = null;
  let start = -1;
  let gap = 0;

  for (let i = 0; i <= mask.length; i++) {
    const filled = i < mask.length && mask[i];
    if (filled) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      // Only close the run once the gap is too wide to be part of the subject.
      if (gap > maxGap || i === mask.length) {
        const end = i - gap;
        if (!best || end - start > best.end - best.start) best = { start, end };
        start = -1;
        gap = 0;
      }
    }
  }

  return best;
}

/**
 * Bounding box of the mat itself, or null when the image is already tight
 * (or is blank, which would make the crop meaningless).
 */
function findContentBox(grey, width, height) {
  const rowThreshold = Math.max(2, Math.floor(width * CONTENT_RATIO));
  const rowHasContent = new Uint8Array(height);

  for (let y = 0; y < height; y++) {
    let rowCount = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) {
      if (grey[base + x] < WHITE_LUMA) rowCount++;
    }
    if (rowCount >= rowThreshold) rowHasContent[y] = 1;
  }

  const rowRun = largestRun(rowHasContent, Math.max(2, Math.floor(height * 0.02)));
  if (!rowRun) return null;
  const top = rowRun.start;
  const bottom = rowRun.end - 1;

  // Columns are measured only across the rows the mat actually occupies, so a
  // caption elsewhere in the frame cannot widen the crop either.
  const bandHeight = bottom - top + 1;
  const colThreshold = Math.max(2, Math.floor(bandHeight * CONTENT_RATIO));
  const colHasContent = new Uint8Array(width);

  for (let x = 0; x < width; x++) {
    let colCount = 0;
    for (let y = top; y <= bottom; y++) {
      if (grey[y * width + x] < WHITE_LUMA) colCount++;
    }
    if (colCount >= colThreshold) colHasContent[x] = 1;
  }

  const colRun = largestRun(colHasContent, Math.max(2, Math.floor(width * 0.02)));
  if (!colRun) return null;
  const left = colRun.start;
  const right = colRun.end - 1;

  if (top >= bottom || left >= right) return null;

  // ffmpeg's crop wants even dimensions for some pixel formats; keeping the
  // box even also avoids a half-pixel resample on the upscale.
  const box = {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
  if (box.width % 2) box.width -= 1;
  if (box.height % 2) box.height -= 1;

  return box;
}

function buildDerived(sourcePath, slug, box) {
  const cropFilter = box
    ? `crop=${box.width}:${box.height}:${box.x}:${box.y}`
    : null;
  const pngPath = join(PNG_DIR, `${slug}.png`);
  const upPath = join(UPSCALED_DIR, `${slug}.png`);
  const thumbPath = join(THUMBS_DIR, `${slug}.webp`);

  ffmpeg([
    '-i',
    sourcePath,
    ...(cropFilter ? ['-vf', cropFilter] : []),
    pngPath,
  ]);

  const width = (box ? box.width : 0) * SCALE;
  const height = (box ? box.height : 0) * SCALE;
  ffmpeg([
    '-i',
    pngPath,
    '-vf',
    box
      ? `scale=${width}:${height}:flags=lanczos`
      : `scale=iw*${SCALE}:ih*${SCALE}:flags=lanczos`,
    upPath,
  ]);

  ffmpeg(['-i', pngPath, '-vf', `scale=${THUMB_WIDTH}:-1`, thumbPath]);
}

function main() {
  for (const dir of [PNG_DIR, UPSCALED_DIR, THUMBS_DIR]) {
    mkdirSync(dir, { recursive: true });
  }

  const manifestPath = join(ROOT, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('No manifest.json — run scripts/scrape-playmats.mjs first.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // `original/` filenames carry the CDN id, so index them by slug prefix.
  const originals = readdirSync(ORIG_DIR);
  const originalFor = (slug) => {
    const match = originals.find((name) => name.startsWith(`${slug}-`));
    return match ? join(ORIG_DIR, match) : null;
  };

  let trimmed = 0;
  let alreadyTight = 0;
  let skipped = 0;
  let totalReduction = 0;
  const suspicious = [];

  const entries = ONLY
    ? manifest.filter((e) => e.slug.includes(ONLY))
    : manifest;

  for (const entry of entries) {
    const source = originalFor(entry.slug);
    if (!source) {
      console.warn(`  ! ${entry.slug}: no original on disk`);
      skipped++;
      continue;
    }

    const dim = getDimensions(source);
    if (!dim) {
      console.warn(`  ! ${entry.slug}: could not read dimensions`);
      skipped++;
      continue;
    }

    const grey = readGrey(source, dim.width, dim.height);
    if (!grey) {
      console.warn(`  ! ${entry.slug}: could not decode pixels`);
      skipped++;
      continue;
    }

    const box = findContentBox(grey, dim.width, dim.height);
    const fullArea = dim.width * dim.height;

    let crop = box;
    if (!crop) {
      suspicious.push(`${entry.slug} (no content detected)`);
      crop = null;
    } else if ((crop.width * crop.height) / fullArea < MIN_AREA_RATIO) {
      // Almost certainly a detection failure rather than a mat that really is
      // 5% of its own photo; keep the untrimmed frame and flag it.
      suspicious.push(
        `${entry.slug} (crop would keep only ${Math.round(
          ((crop.width * crop.height) / fullArea) * 100
        )}%)`
      );
      crop = null;
    }

    const isTight =
      crop &&
      crop.width >= dim.width - 2 &&
      crop.height >= dim.height - 2;

    if (crop && !isTight) {
      const reduction = 1 - (crop.width * crop.height) / fullArea;
      totalReduction += reduction;
      trimmed++;
      const aspect = (crop.width / crop.height).toFixed(2);
      console.log(
        `  ${entry.slug}: ${dim.width}x${dim.height} -> ${crop.width}x${crop.height}` +
          ` (${Math.round(reduction * 100)}% removed, aspect ${aspect})`
      );
    } else {
      alreadyTight++;
      crop = isTight ? crop : null;
    }

    if (!DRY_RUN) buildDerived(source, entry.slug, crop);
  }

  console.log(
    `\n${trimmed} trimmed, ${alreadyTight} already tight, ${skipped} skipped` +
      (trimmed ? `, mean ${Math.round((totalReduction / trimmed) * 100)}% removed` : '')
  );
  if (suspicious.length) {
    console.log(`\nLeft untrimmed for review (${suspicious.length}):`);
    for (const item of suspicious) console.log(`  - ${item}`);
  }
  if (DRY_RUN) console.log('\n(dry run — no files written)');
}

main();
