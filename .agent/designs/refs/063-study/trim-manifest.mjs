// Trims moves/manifest.json to what a later session needs to refetch the references
// (names, page, file URLs, game tags, durations) and writes it where the design points.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , outPath = '../../../../../../home/user/vibecodepokemontcg2/.agent/designs/refs/063-move-refs.json'] = process.argv;
const manifest = JSON.parse(readFileSync('moves/manifest.json', 'utf8'));
const order = readFileSync('move-list.txt', 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('#'));

const ref = (media) =>
  media ? { game: media.gen, url: media.source, frames: media.frames, fps: Math.round(media.fps * 100) / 100, durationMs: media.durationMs } : null;

const out = {
  about:
    'Design 063 move references. Sprite-era animations (N2B2 = Black 2/White 2, NB = Black/White; older tags when neither exists) and the newest 3D video (EV = Scarlet/Violet, LPA = Legends Z-A, EB = Sword/Shield, USUL/SL = Sun/Moon, ROSA/XY = Gen VI) as hosted by Poképédia; French names from PokéAPI. Regenerate with scratch fetch-moves.mjs (see the design).',
  fetchedOn: new Date().toISOString().slice(0, 10),
  moves: order.map((slug) => {
    const e = manifest[slug] || { slug, status: 'missing' };
    return {
      slug,
      name: e.en || slug,
      fr: e.fr || null,
      vgType: e.type || null,
      gameClass: e.damageClass || null,
      introduced: e.generation || null,
      page: e.page || null,
      sprite: ref(e.sprite),
      modern: ref(e.modern),
      available: e.available || [],
      status: e.status,
      ...(e.error ? { error: e.error } : {}),
    };
  }),
};
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
const noSprite = out.moves.filter((m) => !m.sprite).map((m) => m.slug);
const noModern = out.moves.filter((m) => !m.modern).map((m) => m.slug);
console.log(`wrote ${outPath}: ${out.moves.length} moves; no sprite: ${noSprite.length} (${noSprite.join(', ')}); no modern: ${noModern.join(', ') || 'none'}`);
