// Name-match coverage: which corpus cards carry an attack named after a signature move.
// usage: node coverage.mjs <corpus.json> <signature-list.tsv>
import { readFileSync } from 'node:fs';
const [corpusPath, listPath] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(corpusPath, 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const attacksOf = (card) =>
  card.text
    .split('\n')
    .map((line) => line.match(/→\s*(.+?)(?:\s*:\s*([\d]+[+×x\-]?))?\s*$/))
    .filter(Boolean)
    .map((m) => ({ name: m[1].trim(), damage: m[2] || '' }));
const rows = readFileSync(listPath, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
const out = [];
for (const [slug, english, , type, cls, , owners] of rows) {
  const want = norm(english);
  const hits = [];
  for (const card of cards) {
    for (const a of attacksOf(card)) if (norm(a.name) === want) hits.push(`${card.name} (${card.set} ${card.number}) ${a.damage}`);
  }
  out.push({ slug, english, type, cls, owners, count: hits.length, hits });
}
for (const r of out) console.log(`${r.count}\t${r.slug}\t${r.owners}\t${r.hits.slice(0, 6).join('; ')}${r.hits.length > 6 ? ' …' : ''}`);
console.log('moves with ≥1 card:', out.filter((r) => r.count).length, '/', out.length, '· cards:', out.reduce((n, r) => n + r.count, 0));
