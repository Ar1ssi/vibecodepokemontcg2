#!/usr/bin/env node
/**
 * Scrape every Trainer card printing from a pkmncards.com search into
 * out/pkmn-trainer-cards.json.
 *
 * The search covers every Trainer subtype: Supporter, Item, Pokémon Tool,
 * Stadium, Technical Machine, Rocket's Secret Machine, Pokémon Tool F.
 * Stadiums are stored for the stadium audit; audit-all-trainers.mjs skips them.
 * Output rows: { name, set, number, subtype, text, url }.
 *
 * Run: node scripts/scrape-pkmncards-trainers.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSpanInnerHtml } from './lib/pkmn-article-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'out', 'pkmn-trainer-cards.json');

// One query per subtype, merged by URL. A single comma-OR query
// (`type:supporter,item,…`) drops rows on pkmncards — it lost Professor's
// Research BLK 085 (present in `type:supporter`) while the per-type queries
// each have it; 38 rows overlap across subtypes and are de-duped here.
const SUBTYPES = [
  'supporter',
  'item',
  'pokemon-tool',
  'stadium',
  'technical-machine',
  'rockets-secret-machine',
  'pokemon-tool-f',
];
const PAGE_CONCURRENCY = 4;
const PAGE_DELAY_MS = 150;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Card text is HTML: <br> is whitespace, <em> keeps its words, and energy
// symbols are <abbr title="Water"><span class="vh">{</span>W<span
// class="vh">}</span></abbr> which must collapse back to {W}.
function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(?:p|div|li)>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(re, html) {
  const m = html.match(re);
  return m ? htmlToText(m[1]) : '';
}

function parseArticles(html) {
  const cards = [];
  const articleRe = /<article class="type-pkmn_card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  for (const m of html.matchAll(articleRe)) {
    const body = m[1];
    // Balance-scan the name span: nested symbol markup stays, a following
    // sibling span (e.g. "60 HP") stays out.
    const name = htmlToText(extractSpanInnerHtml(body, 'name'));
    const subtype = firstMatch(/<span class="sub-type"[^>]*>([\s\S]*?)<\/span>/, body);
    const textBlock = body.match(/<div class="text">([\s\S]*?)<\/div>\s*<div class="release-meta/);
    const text = textBlock ? htmlToText(textBlock[1]) : '';
    const set = firstMatch(/<span title="Set">([\s\S]*?)<\/span>/, body);
    const number = firstMatch(/<span class="number">([\s\S]*?)<\/span>/, body);
    const url = firstMatch(/href="(https:\/\/pkmncards\.com\/card\/[^"]+)"/, body);
    if (!name) continue;
    cards.push({ name, set, number, subtype, text, url });
  }
  return cards;
}

async function fetchText(url, attempt = 1) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ptcg-sim-card-audit/1.0 (+local developer tooling)' },
  });
  if (!res.ok) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return fetchText(url, attempt + 1);
    }
    throw new Error(`${res.status} ${url}`);
  }
  return res.text();
}

function pageUrl(base, page) {
  return page === 1 ? base : base.replace('https://pkmncards.com/', `https://pkmncards.com/page/${page}/`);
}

async function mapPool(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function scrapeSearch(search) {
  const base = `https://pkmncards.com/?s=${encodeURIComponent(`type:${search}`)}&sort=date&ord=auto&display=text`;
  const first = await fetchText(base);
  const totalMatch = first.match(/class="out-of"[^>]*><a[^>]*>\s*\/\s*([\d,]+)/);
  const totalResults = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null;
  const lastPageMatch = first.match(/class="out-of last-page-link"[^>]*>[\s\S]*?<a[^>]*>\s*\/\s*(\d+)/);
  const lastPage = lastPageMatch ? Number(lastPageMatch[1]) : null;

  const pages = [1];
  if (lastPage) {
    for (let p = 2; p <= lastPage; p++) pages.push(p);
  }

  const pageCards = await mapPool(pages, PAGE_CONCURRENCY, async (page) => {
    const html = page === 1 ? first : await fetchText(pageUrl(base, page));
    const cards = parseArticles(html);
    await sleep(PAGE_DELAY_MS);
    return cards;
  });

  return { cards: pageCards.flat(), totalResults, lastPage };
}

async function main() {
  const all = [];
  const seen = new Set();
  let dropped = 0;
  for (const subtype of SUBTYPES) {
    const { cards, totalResults, lastPage } = await scrapeSearch(subtype);
    process.stderr.write(
      `type:${subtype} — reported ${totalResults ?? '?'} (${lastPage ?? '?'} pages), parsed ${cards.length}\n`
    );
    for (const c of cards) {
      const key = c.url || `${c.name}\u0000${c.set}\u0000${c.number}`;
      if (seen.has(key)) {
        dropped++;
        continue;
      }
      seen.add(key);
      all.push(c);
    }
  }
  if (!all.length) throw new Error('No cards parsed — page markup may have changed.');
  if (dropped > 0) process.stderr.write(`duplicates dropped across queries: ${dropped}\n`);

  const outDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(all, null, 1), 'utf8');

  const bySubtype = new Map();
  for (const c of all) bySubtype.set(c.subtype, (bySubtype.get(c.subtype) || 0) + 1);

  process.stderr.write(`\nPrintings scraped: ${all.length} -> ${OUT_PATH}\n`);
  for (const [k, v] of [...bySubtype.entries()].sort((a, b) => b[1] - a[1])) {
    process.stderr.write(`  ${String(v).padStart(4)}  ${k || '(none)'}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
