/**
 * Regenerates the base-stat table the attack-move picker reads (design 063).
 *
 * Source: Pokémon Showdown `data/pokedex.json` (MIT, smogon/pokemon-showdown).
 * The stats are vendored rather than fetched at play time so a move can be
 * chosen offline and deterministically on both clients; this script is the
 * only thing that talks to the network.
 *
 * Usage: node scripts/vendor-species-stats.mjs
 *
 * Writes `SPECIES_STATS` ({showdownId: [atk, spa, type1, type2?]}), `SPECIES_ID`
 * (every slug of both sprite catalogs -> showdownId) and `SPECIES_FALLBACKS`
 * (Legends Z-A fan Megas Showdown has no form for, resolved to the base species).
 * A slug that resolves to nothing fails the run, so a new catalog form shows up
 * here and not in play.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const DATA_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const CORE_DIR = path.join(
  REPO_ROOT,
  'client/src/setup/deck-builder/core'
);
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  'client/src/setup/netcode/mat-fx/moves/species-stats.generated.mjs'
);

// Slugs whose hyphen-stripped form is not the Showdown id.
const SLUG_OVERRIDES = {
  'arcanine-hisui-noble': 'arcaninehisui',
  'electrode-hisui-noble': 'electrodehisui',
  'lilligant-hisui-noble': 'lilliganthisui',
  'avalugg-hisui-noble': 'avalugghisui',
  'xerneas-active': 'xerneas',
  'necrozma-dawn': 'necrozmadawnwings',
  'necrozma-dusk': 'necrozmaduskmane',
  'calyrex-ice-rider': 'calyrexice',
  'calyrex-shadow-rider': 'calyrexshadow',
  'tauros-paldea': 'taurospaldeacombat',
  'oinkologne-female': 'oinkolognef',
  'maushold-family-of-four': 'mausholdfour',
  'squawkabilly-white-plumage': 'squawkabillywhite',
  'squawkabilly-blue-plumage': 'squawkabillyblue',
  'squawkabilly-yellow-plumage': 'squawkabillyyellow',
  'koraidon-limited-build': 'koraidon',
  'miraidon-low-power-mode': 'miraidon',
  'ogerpon-hearthflame-mask': 'ogerponhearthflame',
  'ogerpon-wellspring-mask': 'ogerponwellspring',
  'ogerpon-cornerstone-mask': 'ogerponcornerstone',
};

const FAN_MEGA = /^(.+)-mega(?:-[xyz])?$/;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function catalogSlugs() {
  const gen8 = await import(
    new URL(
      'pokemon-sprite-catalog.generated.mjs',
      `file:///${CORE_DIR.replaceAll('\\', '/')}/`
    )
  );
  const gen9 = await import(
    new URL(
      'pokemon-sprite-catalog-gen9.mjs',
      `file:///${CORE_DIR.replaceAll('\\', '/')}/`
    )
  );
  const slugs = [
    ...gen8.POKEMON_SPRITE_CATALOG.map((entry) => entry.slug),
    ...gen9.GEN9_SPRITE_CATALOG.map((entry) => entry.slug),
  ];
  return [...new Set(slugs)];
}

const stripHyphens = (slug) => slug.replace(/-/g, '');

function statsTable(pokedex) {
  const stats = {};
  for (const [id, entry] of Object.entries(pokedex)) {
    if (!(entry.num > 0)) continue;
    stats[id] = [
      entry.baseStats.atk,
      entry.baseStats.spa,
      ...entry.types.map((type) => type.toLowerCase()),
    ];
  }
  return stats;
}

/** @returns {{ids: Record<string,string>, fallbacks: string[], unresolved: string[]}} */
function resolveSlugs(slugs, stats) {
  const ids = {};
  const fallbacks = [];
  const unresolved = [];
  for (const slug of slugs) {
    const direct = SLUG_OVERRIDES[slug] ?? stripHyphens(slug);
    if (stats[direct]) {
      ids[slug] = direct;
      continue;
    }
    const baseSlug = FAN_MEGA.exec(slug)?.[1];
    const base = baseSlug && stripHyphens(baseSlug);
    if (base && stats[base]) {
      ids[slug] = base;
      fallbacks.push(slug);
      continue;
    }
    unresolved.push(slug);
  }
  return { ids, fallbacks, unresolved };
}

const needsQuotes = (key) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
const keyText = (key) => (needsQuotes(key) ? `'${key}'` : key);

function renderModule(stats, ids, fallbacks) {
  const statRows = Object.entries(stats)
    .map(
      ([id, row]) =>
        `  ${keyText(id)}: [${row.map((v) => (typeof v === 'number' ? v : `'${v}'`)).join(', ')}],`
    )
    .join('\n');
  const idRows = Object.entries(ids)
    .map(([slug, id]) => `  ${keyText(slug)}: '${id}',`)
    .join('\n');
  const fallbackRows = fallbacks.map((slug) => `  '${slug}',`).join('\n');
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/vendor-species-stats.mjs
// Source: Pokémon Showdown data/pokedex.json (MIT licence, smogon/pokemon-showdown).
// SPECIES_STATS: showdownId -> [base Attack, base Special Attack, type1, type2?].
// SPECIES_ID: sprite-catalog slug -> showdownId. SPECIES_FALLBACKS: slugs whose
// form Showdown lacks, resolved to the base species.

export const SPECIES_STATS = {
${statRows}
};

export const SPECIES_ID = {
${idRows}
};

export const SPECIES_FALLBACKS = [
${fallbackRows}
];
`;
}

async function main() {
  const stats = statsTable(await fetchJson(DATA_URL));
  const slugs = await catalogSlugs();
  const { ids, fallbacks, unresolved } = resolveSlugs(slugs, stats);
  if (unresolved.length) {
    throw new Error(
      `no Showdown species for slug(s): ${unresolved.join(', ')}; add a SLUG_OVERRIDES entry`
    );
  }
  const next = renderModule(stats, ids, fallbacks);
  const current = existsSync(OUTPUT_PATH)
    ? await readFile(OUTPUT_PATH, 'utf8')
    : '';
  if (current === next) {
    console.log('species stats unchanged');
    return;
  }
  await writeFile(OUTPUT_PATH, next);
  console.log(
    `wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}: ${Object.keys(stats).length} species, ${slugs.length} slugs, ${fallbacks.length} fallbacks`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
