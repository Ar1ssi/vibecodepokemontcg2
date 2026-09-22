/**
 * Regenerates the deck-builder's Pokémon sprite catalog and vendors the art.
 *
 * Source: msikma/pokesprite `pokemon-gen8`. The sprites are vendored rather
 * than hotlinked (D97) so the builder has no runtime third-party dependency
 * and renders offline; this script is the only thing that talks to the network.
 *
 * Usage: node scripts/generate-pokemon-sprites.mjs [--force]
 *   --force  re-download sprites that are already on disk.
 *
 * Only base forms (`$` in pokesprite's gen-8 form map) are vendored — mega,
 * gmax and regional forms would multiply the catalog for a decoration and
 * would force a two-level picker.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/msikma/pokesprite@master';
const DATA_URL = `${CDN_BASE}/data/pokemon.json`;
const ASSET_DIR = path.join(REPO_ROOT, 'client/src/assets/pokemon/gen8');
const CATALOG_PATH = path.join(
  REPO_ROOT,
  'client/src/setup/deck-builder/core/pokemon-sprite-catalog.generated.mjs'
);
const VARIANTS = ['regular', 'shiny'];
const CONCURRENCY = 16;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

/**
 * The alternate forms worth vendoring, in the order they should appear under
 * their species. Battle-relevant forms only: Mega, Primal, Gigantamax and the
 * regional variants. pokesprite also carries purely cosmetic forms (Unown
 * letters, Vivillon patterns, Alcremie creams, Pikachu caps) — hundreds of
 * near-identical rows that would bury the species they belong to.
 *
 * Each entry says how the form's display name is built from the species name;
 * the file slug is always `<species>-<form key>`.
 */
const FORMS = [
  { key: 'mega', label: (name) => `Mega ${name}` },
  { key: 'mega-x', label: (name) => `Mega ${name} X` },
  { key: 'mega-y', label: (name) => `Mega ${name} Y` },
  { key: 'primal', label: (name) => `Primal ${name}` },
  { key: 'gmax', label: (name) => `Gigantamax ${name}` },
  { key: 'alola', label: (name) => `Alolan ${name}` },
  { key: 'galar', label: (name) => `Galarian ${name}` },
  { key: 'hisui', label: (name) => `Hisuian ${name}` },
  { key: 'hisui-noble', label: (name) => `Noble Hisuian ${name}` },
];

/**
 * @returns {{idx: string, name: string, slug: string, species: string,
 *   form: string|null}[]} dex order, each species followed by its forms.
 */
function toCatalog(pokemonData) {
  const entries = [];
  for (const [idx, entry] of Object.entries(pokemonData).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const forms = entry?.['gen-8']?.forms;
    // No base form in gen 8 means there is no file to vendor; skip rather
    // than emit a catalog row whose sprite would 404.
    if (!forms?.$) continue;
    const name = entry?.name?.eng;
    const slug = entry?.slug?.eng;
    if (!name || !slug) continue;

    entries.push({ idx, name, slug, species: name, form: null });
    for (const form of FORMS) {
      if (!forms[form.key]) continue;
      entries.push({
        idx,
        name: form.label(name),
        slug: `${slug}-${form.key}`,
        species: name,
        form: form.key,
      });
    }
  }
  return entries;
}

async function downloadSprite(slug, variant, force) {
  const target = path.join(ASSET_DIR, variant, `${slug}.png`);
  if (!force && existsSync(target)) return 'skipped';
  const response = await fetch(
    `${CDN_BASE}/pokemon-gen8/${variant}/${slug}.png`
  );
  // pokesprite's form map does not perfectly predict which files exist, so a
  // 404 is data rather than a crash: the caller drops that row. Anything else
  // (a network or CDN fault) still fails the run.
  if (response.status === 404) return 'absent';
  if (!response.ok)
    throw new Error(`${variant}/${slug}.png -> ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return 'downloaded';
}

/** Runs `worker` over `items` with a bounded number of in-flight requests. */
async function inBatches(items, worker) {
  const results = [];
  for (let start = 0; start < items.length; start += CONCURRENCY) {
    results.push(
      ...(await Promise.all(
        items.slice(start, start + CONCURRENCY).map(worker)
      ))
    );
  }
  return results;
}

/**
 * Quotes a name the way prettier would, so the generated file is already
 * formatted and never shows up as lint noise: single quotes, except for the
 * handful of names that contain an apostrophe (Farfetch'd, Sirfetch'd).
 */
function quote(value) {
  const text = String(value).replaceAll('\\', '\\\\');
  if (text.includes("'") && !text.includes('"')) return `"${text}"`;
  return `'${text.replaceAll("'", "\\'")}'`;
}

function renderCatalogModule(entries) {
  const rows = entries
    .map(
      (entry) =>
        `  { idx: '${entry.idx}', name: ${quote(entry.name)}, slug: '${entry.slug}', species: ${quote(entry.species)}, form: ${entry.form ? `'${entry.form}'` : 'null'} },`
    )
    .join('\n');
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-pokemon-sprites.mjs
// Source: msikma/pokesprite \`data/pokemon.json\` + \`pokemon-gen8\`.
// Each species is followed by its Mega / Primal / Gigantamax / regional forms;
// \`species\` is what groups them under one name when searching.
// Art for every slug below is vendored at client/src/assets/pokemon/gen8/{regular,shiny}/.

export const POKEMON_SPRITE_CATALOG = [
${rows}
];
`;
}

async function main() {
  const force = process.argv.includes('--force');
  for (const variant of VARIANTS) {
    await mkdir(path.join(ASSET_DIR, variant), { recursive: true });
  }

  const entries = toCatalog(await fetchJson(DATA_URL));
  console.log(`catalog: ${entries.length} Pokémon`);

  const jobs = entries.flatMap((entry) =>
    VARIANTS.map((variant) => ({ slug: entry.slug, variant }))
  );
  const failures = [];
  const absent = new Set();
  const outcomes = await inBatches(jobs, async ({ slug, variant }) => {
    try {
      const outcome = await downloadSprite(slug, variant, force);
      if (outcome === 'absent') absent.add(slug);
      return outcome;
    } catch (error) {
      failures.push(error.message);
      return 'failed';
    }
  });

  const tally = outcomes.reduce(
    (counts, outcome) => ({ ...counts, [outcome]: (counts[outcome] || 0) + 1 }),
    {}
  );
  console.log(`sprites: ${JSON.stringify(tally)}`);
  if (failures.length) {
    // A partial download would leave the catalog pointing at missing files,
    // so fail loudly instead of writing a catalog that lies.
    console.error(failures.slice(0, 20).join('\n'));
    throw new Error(
      `${failures.length} sprite(s) failed to download; catalog not written`
    );
  }

  // A form whose art does not exist upstream (pokesprite's form map is not a
  // perfect index of its own files) is dropped rather than left pointing at a
  // 404. A missing BASE form would mean the source changed shape, so it stops
  // the run instead.
  const missingBase = [...absent].filter((slug) =>
    entries.some((entry) => entry.slug === slug && !entry.form)
  );
  if (missingBase.length) {
    throw new Error(
      `no art for base form(s): ${missingBase.join(', ')}; catalog not written`
    );
  }
  if (absent.size) {
    console.log(`dropped (no art upstream): ${[...absent].sort().join(', ')}`);
  }
  const kept = entries.filter((entry) => !absent.has(entry.slug));

  const next = renderCatalogModule(kept);
  const current = existsSync(CATALOG_PATH)
    ? await readFile(CATALOG_PATH, 'utf8')
    : '';
  if (current === next) {
    console.log('catalog unchanged');
    return;
  }
  await writeFile(CATALOG_PATH, next);
  console.log(`wrote ${path.relative(REPO_ROOT, CATALOG_PATH)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
