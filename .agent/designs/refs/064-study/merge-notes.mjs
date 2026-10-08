// Validates the study notes against STUDY-BRIEF.md's schema and splices two blocks into design 064:
// the signature list table at <!-- SIGNATURE-LIST --> and Appendix S at <!-- APPENDIX-S -->.
// usage (from sig/): node merge-notes.mjs <design.md> <coverage.txt>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [designPath, coveragePath] = process.argv.slice(2);
const SKIP = new Set(['burning-bulwark', 'jungle-healing', 'geomancy', 'lunar-dance', 'lunar-blessing', 'take-heart']);
const TYPE_ORDER = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
// A field may carry a qualifier before its colon ("Board mapping (proposed, unverified):").
const REQUIRED = ['Refs', 'Signature read', 'Video beats', 'Pokémon', 'Camera & screen', 'Palette', 'Closest generic', 'Board mapping', 'New pieces', 'Flags'];
const hasField = (part, key) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(.*\\))?:`, 'm').test(part);

const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const rows = readFileSync('signature-list.tsv', 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'))
  .map(([slug, english, french, type, cls, power, owners]) => ({ slug, english, french, type, cls, power, owners }))
  .filter((r) => !SKIP.has(r.slug));
const bySlugName = new Map(rows.map((r) => [norm(r.english), r]));
const manifest = JSON.parse(readFileSync('moves/manifest.json', 'utf8'));
const coverage = new Map(
  readFileSync(coveragePath, 'utf8').split('\n').filter((l) => /^\d+\t/.test(l)).map((l) => {
    const [count, slug] = l.split('\t');
    return [slug, Number(count)];
  })
);

const entries = new Map();
const problems = [];
for (const file of readdirSync('notes').filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(path.join('notes', file), 'utf8');
  for (const part of text.split(/^(?=### )/m).filter((p) => p.startsWith('### '))) {
    const heading = part.split('\n')[0];
    const name = heading.replace(/^### /, '').split(' — ')[0].trim();
    const row = bySlugName.get(norm(name));
    if (!row) {
      if (!SKIP.has(name.toLowerCase().replace(/\s+/g, '-'))) problems.push(`${file}: unknown move heading "${name}"`);
      continue;
    }
    const missing = REQUIRED.filter((k) => !hasField(part, k));
    if (missing.length) problems.push(`${row.slug}: missing ${missing.join(', ')}`);
    if (entries.has(row.slug)) problems.push(`${row.slug}: duplicate entry (kept the first)`);
    else entries.set(row.slug, part.trimEnd());
  }
}
const absent = rows.filter((r) => !entries.has(r.slug)).map((r) => r.slug);
if (absent.length) problems.push(`no entry: ${absent.join(', ')}`);

const order = (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.english.localeCompare(b.english);
const sorted = [...rows].sort(order);

const refOf = (slug) => {
  const e = manifest[slug];
  const main = e?.modern ? e.modern.gen : e?.sprite ? `sprite ${e.sprite.gen}` : 'none';
  return `${main}${e?.gen7 ? ' + USUL' : ''}`;
};
const table = [
  '| Move | Owners | Type · class · power | Reference | Corpus cards by name |',
  '|---|---|---|---|---|',
  ...sorted.map((r) => `| ${r.english} (\`${r.slug}\`) | ${r.owners.replaceAll(',', ', ')} | ${r.type} · ${r.cls} · ${r.power} | ${refOf(r.slug)} | ${coverage.get(r.slug) ?? 0} |`),
].join('\n');

let currentType = '';
const appendix = [];
for (const r of sorted) {
  if (r.type !== currentType) {
    currentType = r.type;
    appendix.push(`### ${currentType[0].toUpperCase()}${currentType.slice(1)}`);
  }
  const body = entries.get(r.slug);
  appendix.push(body ? body.replace(/^### /, '#### ') : `#### ${r.english} — NO ENTRY (study missing)`);
}

let design = readFileSync(designPath, 'utf8');
const splice = (marker, content) => {
  const re = new RegExp(`<!-- ${marker} -->[\\s\\S]*?<!-- /${marker} -->|<!-- ${marker} -->`);
  if (!re.test(design)) throw new Error(`marker ${marker} not found`);
  design = design.replace(re, `<!-- ${marker} -->\n${content}\n<!-- /${marker} -->`);
};
splice('SIGNATURE-LIST', table);
splice('APPENDIX-S', appendix.join('\n\n'));
writeFileSync(designPath, design);
console.log(`entries ${entries.size}/${rows.length}`);
console.log(problems.length ? `problems:\n- ${problems.join('\n- ')}` : 'problems: none');
