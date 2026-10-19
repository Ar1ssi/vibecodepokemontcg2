// Design 075 parity: every shipped move spec → its French name (PokéAPI) → the Poképédia
// Scarlet/Violet animation (<Nom>_EV.mp4, MediaWiki hashed path). Writes moves.json + sv/<id>.mp4.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
// Outputs (videos, stills, sheets) go to the gitignored parity work dir.
const here = process.env.PARITY_DIR || new URL('../../../../.agent/scratch/075/parity/', import.meta.url).pathname;
const moves = new URL('../../../../client/src/setup/netcode/mat-fx/moves', import.meta.url).pathname;
mkdirSync(`${here}sv`, { recursive: true });
const { SPECS } = await import(`${moves}/specs/index.mjs`);
const { SIGNATURE_SPECS } = await import(`${moves}/signature/specs/index.mjs`);
const all = [...Object.values(SPECS).map((s) => ({ s, sig: false })), ...Object.values(SIGNATURE_SPECS).map((s) => ({ s, sig: true }))];
const rows = [];
const pool = 6;
let next = 0;
async function work() {
  while (next < all.length) {
    const { s, sig } = all[next++];
    const row = { id: s.id, name: s.name, sig, contactMs: s.contactMs, durationMs: s.durationMs, material: s.material };
    try {
      const api = await fetch(`https://pokeapi.co/api/v2/move/${s.id}`);
      if (!api.ok) throw new Error(`pokeapi ${api.status}`);
      row.fr = (await api.json()).names.find((n) => n.language.name === 'fr')?.name;
      const file = `${row.fr.replace(/ /g, '_')}_EV.mp4`;
      const h = createHash('md5').update(file).digest('hex');
      const url = `https://www.pokepedia.fr/images/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(file)}`;
      const out = `${here}sv/${s.id}.mp4`;
      if (!existsSync(out)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`video ${res.status} ${file}`);
        writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      }
      row.video = out;
    } catch (e) {
      row.error = String(e.message ?? e);
    }
    rows.push(row);
  }
}
await Promise.all(Array.from({ length: pool }, work));
rows.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(`${here}moves.json`, JSON.stringify(rows, null, 1));
console.log('moves', rows.length, 'videos', rows.filter((r) => r.video).length);
for (const r of rows.filter((r) => r.error)) console.log(r.id, r.fr ?? '', r.error);
