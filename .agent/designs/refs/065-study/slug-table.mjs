// Builds the pinned slug → signature table for design 065 from the study list and the sprite catalogs.
import { readFileSync } from 'node:fs';
const [tsv] = process.argv.slice(2);
const SKIP = new Set(['burning-bulwark', 'jungle-healing', 'geomancy', 'lunar-dance', 'lunar-blessing', 'take-heart']);
const OWNERS = { 'sacred-fire': ['ho-oh'], 'psycho-boost': ['deoxys'], 'heart-swap': ['manaphy'], 'fusion-flare': ['reshiram'], 'fusion-bolt': ['zekrom'], 'sacred-sword': ['cobalion', 'terrakion', 'virizion'] };
const FORMS = {
  'kyurem-black': 'freeze-shock', 'kyurem-white': 'ice-burn',
  'calyrex-ice-rider': 'glacial-lance', 'calyrex-shadow-rider': 'astral-barrage', calyrex: null,
  'urshifu-rapid-strike': 'surging-strikes', 'urshifu-rapid-strike-gmax': 'surging-strikes',
  'hoopa-unbound': 'hyperspace-fury',
  'necrozma-ultra': 'photon-geyser', 'necrozma-dusk': 'sunsteel-strike', 'necrozma-dawn': 'moongeist-beam',
  'zygarde-mega': 'nihil-light', 'zygarde-10': 'thousand-arrows', 'zygarde-complete': 'core-enforcer', zygarde: 'lands-wrath',
  'moltres-galar': 'fiery-wrath', 'zapdos-galar': 'thunderous-kick', 'articuno-galar': 'freezing-glare',
  moltres: null, zapdos: null, articuno: null, hoopa: 'hyperspace-hole',
};
const rows = readFileSync(tsv, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'))
  .filter((r) => !SKIP.has(r[0]))
  .map((r) => ({ slug: r[0], power: Number(r[5]) || 0, owners: OWNERS[r[0]] ?? r[6].split(',') }));
const catalogText = ['pokemon-sprite-catalog.generated.mjs', 'pokemon-sprite-catalog-gen9.mjs']
  .map((f) => readFileSync(`client/src/setup/deck-builder/core/${f}`, 'utf8')).join('\n');
const catalog = [...new Set([...catalogText.matchAll(/'([a-z0-9-]+)'\s*:/g)].map((m) => m[1]))];
const species = [...new Set(rows.flatMap((r) => r.owners))];
const primary = (sp) => {
  const own = rows.filter((r) => r.owners.includes(sp));
  const single = own.filter((r) => r.owners.length === 1);
  const pool = single.length ? single : own;
  return pool.sort((a, b) => b.power - a.power)[0]?.slug ?? null;
};
const table = {};
for (const sp of species) {
  const slugs = catalog.filter((s) => s === sp || s.startsWith(`${sp}-`));
  if (!slugs.includes(sp)) slugs.push(sp);
  for (const s of slugs) {
    if (sp === 'mew' && s.startsWith('mewtwo')) continue;
    table[s] = s in FORMS ? FORMS[s] : primary(sp);
  }
}
for (const [s, m] of Object.entries(FORMS)) if (!(s in table)) table[s] = m;
const sorted = Object.entries(table).sort(([a], [b]) => a.localeCompare(b));
console.log(sorted.length, 'slugs');
console.log(sorted.map(([s, m]) => `${s}→${m ?? '∅'}`).join(' · '));
const unused = rows.filter((r) => !Object.values(table).includes(r.slug)).map((r) => r.slug);
console.log('moves reachable only by name match:', unused.join(', ') || 'none');
