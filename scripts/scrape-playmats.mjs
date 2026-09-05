#!/usr/bin/env node
/**
 * Scrape playmat images from artofpkm.com/product_types/3,
 * save originals, convert to PNG, and upscale 2× with ffmpeg lanczos.
 *
 * Usage: node scripts/scrape-playmats.mjs [--limit N] [--scale 2]
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.artofpkm.com';
const TYPE_URL = `${BASE}/product_types/3`;
const OUT_DIR = fileURLToPath(new URL('../client/src/assets/playmats/', import.meta.url));
const ORIG_DIR = join(OUT_DIR, 'original');
const PNG_DIR = join(OUT_DIR, 'png');
const UPSCALED_DIR = join(OUT_DIR, 'upscaled');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const scaleIdx = args.indexOf('--scale');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const SCALE = scaleIdx >= 0 ? Number(args[scaleIdx + 1]) : 2;
const PRIMARY_ONLY = args.includes('--primary-only');
const SKIP_PATTERN = /playmat case|leisure seat|pattern leisure/i;

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseProductIds(html) {
  return [...new Set(html.match(/href="\/products\/(\d+)"/g)?.map((m) => m.match(/\d+/)[0]) ?? [])];
}

function parseProductTitle(html) {
  const m = html.match(/<h1 class="font-bold[^"]*">([^<]+)<\/h1>/);
  return m ? m[1].trim() : 'playmat';
}

function parseImageUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/data-image-url="(https:\/\/cdn\.artofpkm\.com\/[^"]+)"/g)) {
    urls.add(m[1]);
  }
  // Fallback: active image on product page
  for (const m of html.matchAll(
    /data-target="image-switcher\.activeImage"[^>]*src="(https:\/\/cdn\.artofpkm\.com\/[^"]+)"/g
  )) {
    urls.add(m[1]);
  }
  return [...urls];
}

function cdnBasename(url) {
  return url.split('/').pop();
}

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-y', ...args], { stdio: 'pipe' });
}

function getDimensions(path) {
  try {
    execFileSync('ffmpeg', ['-i', path], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    const text = err.stderr?.toString?.() ?? '';
    const m = text.match(/,\s*(\d+)x(\d+)/);
    return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
  }
  return null;
}

async function main() {
  mkdirSync(ORIG_DIR, { recursive: true });
  mkdirSync(PNG_DIR, { recursive: true });
  mkdirSync(UPSCALED_DIR, { recursive: true });

  const productIds = [];
  for (let page = 1; page <= 10; page++) {
    const url = page === 1 ? TYPE_URL : `${TYPE_URL}?page=${page}`;
    const html = await fetchText(url);
    if (!html) break;
    const ids = parseProductIds(html);
    if (!ids.length) break;
    productIds.push(...ids);
  }

  const uniqueIds = [...new Set(productIds)];
  console.log(`Found ${uniqueIds.length} playmat products`);

  const manifest = [];
  let processed = 0;

  for (const id of uniqueIds) {
    if (processed >= LIMIT) break;

    const productUrl = `${BASE}/products/${id}`;
    const html = await fetchText(productUrl);
    const title = parseProductTitle(html);
    if (SKIP_PATTERN.test(title)) {
      console.log(`  skip ${id}: accessory (${title})`);
      continue;
    }
    const slug = `${id}-${slugify(title)}`;
    const imageUrls = parseImageUrls(html);

    if (!imageUrls.length) {
      console.warn(`  skip ${id}: no images`);
      continue;
    }

    const toFetch = PRIMARY_ONLY ? imageUrls.slice(0, 1) : imageUrls;

    for (let i = 0; i < toFetch.length; i++) {
      const url = toFetch[i];
      const cdnId = cdnBasename(url);
      const suffix = imageUrls.length > 1 ? `-${i + 1}` : '';
      const stem = `${slug}${suffix}`;

      const origPath = join(ORIG_DIR, `${stem}-${cdnId}.webp`);
      const pngPath = join(PNG_DIR, `${stem}.png`);
      const upPath = join(UPSCALED_DIR, `${stem}.png`);

      if (!existsSync(origPath)) {
        process.stdout.write(`  download ${stem}… `);
        const buf = await fetchBuffer(url);
        writeFileSync(origPath, buf);
        console.log(`${(buf.length / 1024).toFixed(0)} KB`);
      }

      if (!existsSync(pngPath)) {
        runFfmpeg(['-i', origPath, pngPath]);
      }

      if (!existsSync(upPath)) {
        const dim = getDimensions(pngPath);
        const w = dim ? dim.w * SCALE : 3000;
        const h = dim ? dim.h * SCALE : 3000;
        runFfmpeg([
          '-i',
          pngPath,
          '-vf',
          `scale=${w}:${h}:flags=lanczos`,
          upPath,
        ]);
      }

      manifest.push({
        productId: id,
        title,
        sourceUrl: productUrl,
        imageUrl: url,
        slug: stem,
        png: `src/assets/playmats/png/${stem}.png`,
        upscaled: `src/assets/playmats/upscaled/${stem}.png`,
      });
    }

    processed++;
    if (processed % 10 === 0) {
      console.log(`… ${processed}/${Math.min(uniqueIds.length, LIMIT)} products`);
    }
  }

  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`Done. ${manifest.length} images → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
