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
 * Base species plus the battle-relevant alternate forms: Mega / Primal /
 * Gigantamax / regional (generic), the transform formes in `SPECIES_FORMS`
 * (Kyurem Black/White, Necrozma dawn/dusk/ultra, Rotom appliances, …), and the
 * Arceus / Silvally type forms. Purely cosmetic variants (Unown letters,
 * Vivillon patterns, Alcremie creams, Totem sizes) stay out: hundreds of
 * near-identical rows would bury the species they belong to.
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
 * Transform formes, keyed by species slug, in the order they should appear
 * under the species. Labels are printed explicitly because the display name
 * is not always `<form> <species>` ("Dawn Wings Necrozma", "Hoopa Unbound").
 * pokesprite form keys are unique per species, but a per-species table keeps
 * the label and the card-name wording reviewable side by side.
 */
const SPECIES_FORMS = {
  castform: [
    { key: 'sunny', label: 'Sunny Castform' },
    { key: 'rainy', label: 'Rainy Castform' },
    { key: 'snowy', label: 'Snowy Castform' },
  ],
  cherrim: [{ key: 'sunshine', label: 'Sunshine Cherrim' }],
  deoxys: [
    { key: 'attack', label: 'Attack Forme Deoxys' },
    { key: 'defense', label: 'Defense Forme Deoxys' },
    { key: 'speed', label: 'Speed Forme Deoxys' },
  ],
  dialga: [{ key: 'origin', label: 'Origin Forme Dialga' }],
  palkia: [{ key: 'origin', label: 'Origin Forme Palkia' }],
  giratina: [{ key: 'origin', label: 'Origin Forme Giratina' }],
  shaymin: [{ key: 'sky', label: 'Sky Forme Shaymin' }],
  rotom: [
    { key: 'heat', label: 'Heat Rotom' },
    { key: 'wash', label: 'Wash Rotom' },
    { key: 'frost', label: 'Frost Rotom' },
    { key: 'fan', label: 'Fan Rotom' },
    { key: 'mow', label: 'Mow Rotom' },
  ],
  darmanitan: [
    { key: 'zen', label: 'Zen Mode Darmanitan' },
    { key: 'galar-zen', label: 'Galarian Zen Mode Darmanitan' },
  ],
  kyurem: [
    { key: 'black', label: 'Black Kyurem' },
    { key: 'white', label: 'White Kyurem' },
  ],
  keldeo: [{ key: 'resolute', label: 'Resolute Form Keldeo' }],
  meloetta: [{ key: 'pirouette', label: 'Pirouette Form Meloetta' }],
  aegislash: [{ key: 'blade', label: 'Blade Form Aegislash' }],
  zygarde: [
    { key: '10', label: 'Zygarde 10% Forme' },
    { key: 'complete', label: 'Zygarde Complete Forme' },
  ],
  hoopa: [{ key: 'unbound', label: 'Hoopa Unbound' }],
  oricorio: [
    { key: 'pom-pom', label: 'Pom-Pom Style Oricorio' },
    { key: 'pau', label: "Pa'u Style Oricorio" },
    { key: 'sensu', label: 'Sensu Style Oricorio' },
  ],
  lycanroc: [
    { key: 'dusk', label: 'Dusk Form Lycanroc' },
    { key: 'midnight', label: 'Midnight Form Lycanroc' },
  ],
  wishiwashi: [{ key: 'school', label: 'School Form Wishiwashi' }],
  necrozma: [
    { key: 'dawn', label: 'Dawn Wings Necrozma' },
    { key: 'dusk', label: 'Dusk Mane Necrozma' },
    { key: 'ultra', label: 'Ultra Necrozma' },
  ],
  cramorant: [
    { key: 'gulping', label: 'Gulping Cramorant' },
    { key: 'gorging', label: 'Gorging Cramorant' },
  ],
  toxtricity: [{ key: 'low-key', label: 'Low Key Form Toxtricity' }],
  eiscue: [{ key: 'noice', label: 'Noice Face Eiscue' }],
  morpeko: [{ key: 'hangry', label: 'Hangry Mode Morpeko' }],
  zacian: [{ key: 'crowned', label: 'Crowned Sword Zacian' }],
  zamazenta: [{ key: 'crowned', label: 'Crowned Shield Zamazenta' }],
  eternatus: [{ key: 'eternamax', label: 'Eternamax Eternatus' }],
  urshifu: [
    { key: 'rapid-strike-gmax', label: 'Gigantamax Rapid Strike Urshifu' },
  ],
  calyrex: [
    { key: 'ice-rider', label: 'Ice Rider Calyrex' },
    { key: 'shadow-rider', label: 'Shadow Rider Calyrex' },
  ],
  xerneas: [{ key: 'active', label: 'Active Mode Xerneas' }],
  tornadus: [{ key: 'therian', label: 'Therian Forme Tornadus' }],
  thundurus: [{ key: 'therian', label: 'Therian Forme Thundurus' }],
  landorus: [{ key: 'therian', label: 'Therian Forme Landorus' }],
  enamorus: [{ key: 'therian', label: 'Therian Forme Enamorus' }],
  greninja: [{ key: 'ash', label: 'Ash Greninja' }],
};

// Multitype / RKS System type forms: one row per real type, labelled
// `<Type> <Species>`. `normal` aliases the base sprite and Arceus's
// "unknown" is an unofficial icon, so both stay out.
const TYPE_FORM_SPECIES = new Set(['arceus', 'silvally']);
const TYPE_FORM_KEYS = [
  'bug',
  'dark',
  'dragon',
  'electric',
  'fairy',
  'fighting',
  'fire',
  'flying',
  'ghost',
  'grass',
  'ground',
  'ice',
  'poison',
  'psychic',
  'rock',
  'steel',
  'water',
];

function titleCase(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

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

    // Alias forms point at another form's file; a row for one would only
    // 404 in the download loop, so drop it here.
    const pushForm = (key, label) => {
      if (!forms[key] || forms[key].is_alias_of) return;
      entries.push({
        idx,
        name: label,
        slug: `${slug}-${key}`,
        species: name,
        form: key,
      });
    };

    entries.push({ idx, name, slug, species: name, form: null });
    for (const form of FORMS) pushForm(form.key, form.label(name));
    for (const form of SPECIES_FORMS[slug] || [])
      pushForm(form.key, form.label);
    if (TYPE_FORM_SPECIES.has(slug)) {
      for (const key of TYPE_FORM_KEYS)
        pushForm(key, `${titleCase(key)} ${name}`);
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
// Each species is followed by its battle-relevant forms (Mega / Primal /
// Gigantamax / regional / transform / type); \`species\` is what groups them
// under one name when searching.
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
