#!/usr/bin/env node
/**
 * Scrape pkmncards.com search results (display=text) into a JSON array of
 * { name, set, number, text, url } printings. Paginates at 100/page.
 *
 * Usage:
 *   node scripts/scrape-pkmncards.mjs --query="type:pokemon has:ability" --out=out/pkmn-pokemon-cards.json
 *   node scripts/scrape-pkmncards.mjs --url="https://pkmncards.com/?s=..." --out=...
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSpanInnerHtml } from './lib/pkmn-article-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  eacute: '\u00e9',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, ent) ? NAMED_ENTITIES[ent] : m;
  });
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim();
}

function firstMatch(block, re) {
  const m = block.match(re);
  return m ? htmlToText(m[1]) : '';
}

function parseCards(html) {
  const out = [];
  const articleRe = /<article class="type-pkmn_card entry"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1];
    // Balance-scan the name span: nested symbol markup stays, a following
    // sibling span (e.g. "60 HP") stays out.
    const name = htmlToText(extractSpanInnerHtml(block, 'name'));
    const set = firstMatch(block, /<span title="Set">([\s\S]*?)<\/span>/);
    const number = firstMatch(block, /<span class="number">([\s\S]*?)<\/span>/);
    const urlMatch = block.match(/<a href="([^"]+)" class="card-link"/);
    const text = firstMatch(block, /<div class="text">([\s\S]*?)<\/div>/);
    if (!name) continue;
    out.push({ name, set, number, text, url: urlMatch ? urlMatch[1] : '' });
  }
  return out;
}

function parseArgs(argv) {
  const urlArg = argv.find((a) => a.startsWith('--url='));
  const queryArg = argv.find((a) => a.startsWith('--query='));
  const outArg = argv.find((a) => a.startsWith('--out='));
  const maxArg = argv.find((a) => a.startsWith('--max-pages='));
  return {
    url: urlArg ? urlArg.slice('--url='.length) : null,
    query: queryArg ? queryArg.slice('--query='.length) : 'type:pokemon has:rule-box,ability,poke-body,poke-power,pokemon-power,ancient-trait,held-item',
    out: outArg ? outArg.slice('--out='.length) : path.join(ROOT, 'out', 'pkmn-pokemon-cards.json'),
    maxPages: maxArg ? Number(maxArg.slice('--max-pages='.length)) : 200,
  };
}

function pageUrl(baseUrl, page) {
  if (!baseUrl) return null;
  const u = new URL(baseUrl);
  if (page === 1) return u.toString();
  return `${u.origin}/page/${page}/${u.search}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ptcg-audit/1.0)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function main() {
  const { url, query, out, maxPages } = parseArgs(process.argv.slice(2));
  const base = url || `https://pkmncards.com/?s=${encodeURIComponent(query)}&sort=date&ord=auto&display=text`;
  const all = [];
  let page = 1;
  for (; page <= maxPages; page++) {
    const target = pageUrl(base, page);
    let html;
    try {
      html = await fetchText(target);
    } catch (err) {
      process.stderr.write(`  page ${page}: ${err.message}\n`);
      break;
    }
    const cards = parseCards(html);
    if (cards.length === 0) break;
    all.push(...cards);
    process.stderr.write(`  page ${page}: ${cards.length} cards (total ${all.length})\n`);
    await sleep(120);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  process.stderr.write(`Wrote ${all.length} printings from ${page - 1} page(s) to ${out}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
