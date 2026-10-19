// Parity fallback: moves with no direct <Nom>_EV.mp4 → scrape the Poképédia page and take the
// newest game's video it carries (EV, LPA, EB, USUL, ROSA, XY …). Updates moves.json.
import { readFileSync, writeFileSync } from 'node:fs';
// Outputs (videos, stills, sheets) go to the gitignored parity work dir.
const here = process.env.PARITY_DIR || new URL('../../../../.agent/scratch/075/parity/', import.meta.url).pathname;
const rows = JSON.parse(readFileSync(`${here}moves.json`, 'utf8'));
const ORDER = ['EV', 'LPA', 'DEPS', 'EB', 'LGPE', 'USUL', 'SL', 'ROSA', 'XY'];
const FR = { 'nihil-light': 'Lumière du Néant' };
for (const row of rows.filter((r) => !r.video)) {
  try {
    const fr = (row.fr || FR[row.id] || '').replace(/’/g, "'");
    if (!fr) throw new Error('no French name');
    row.fr = fr;
    const page = await fetch(`https://www.pokepedia.fr/${encodeURIComponent(fr.replace(/ /g, '_'))}`);
    if (!page.ok) throw new Error(`page ${page.status}`);
    const html = await page.text();
    const srcs = [...html.matchAll(/src="(\/\/www\.pokepedia\.fr\/images\/[^"]+_([A-Za-z]+)\.mp4)"/g)].map((m) => ({ url: `https:${m[1]}`, game: m[2] }));
    const pick = ORDER.map((g) => srcs.find((s) => s.game === g)).find(Boolean) ?? srcs[0];
    if (!pick) throw new Error('no video on page');
    const res = await fetch(pick.url);
    if (!res.ok) throw new Error(`video ${res.status}`);
    writeFileSync(`${here}sv/${row.id}.mp4`, Buffer.from(await res.arrayBuffer()));
    row.video = `${here}sv/${row.id}.mp4`;
    row.game = pick.game;
    delete row.error;
  } catch (e) {
    row.error = String(e.message ?? e);
  }
}
for (const r of rows) if (r.video && !r.game) r.game = 'EV';
writeFileSync(`${here}moves.json`, JSON.stringify(rows, null, 1));
console.log('videos', rows.filter((r) => r.video).length, '/', rows.length);
const games = {};
for (const r of rows) games[r.game ?? 'none'] = (games[r.game ?? 'none'] ?? 0) + 1;
console.log(games);
for (const r of rows.filter((r) => r.error)) console.log(r.id, r.fr, r.error);
