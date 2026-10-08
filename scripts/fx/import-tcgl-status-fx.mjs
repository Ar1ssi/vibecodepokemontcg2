/**
 * Copy the TCG Live status-condition VFX textures, damage-counter art and Poison/Burn badges into the
 * committed client assets. Source is the WebP conversion of the Unity extract
 * (<extract>/WebApp/assets/ui, made by WebApp/tools/assets/ui_convert.py); this script never re-encodes.
 * Run: node scripts/fx/import-tcgl-status-fx.mjs --src <extract dir>          (copies)
 *      node scripts/fx/import-tcgl-status-fx.mjs --src <extract dir> --check  (exit 1 on drift, writes nothing)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS_DIR = join(ROOT, 'client/src/assets');
export const UI_DIR = 'WebApp/assets/ui';

/** Unity bundle → output folder under client/src/assets/status-fx/. */
export const STATUS_BUNDLES = {
  status_apply: 'apply',
  status_burned: 'burned',
  status_confusion: 'confusion',
  status_damage: 'damage',
  status_paralyze: 'paralyze',
  status_poison: 'poison',
  status_remove: 'remove',
  status_sleep: 'sleep',
};

/** Unity's default particle dot and the normal maps have no use in a 2D DOM overlay. */
const SKIPPED = /^(Default-ParticleSystem|.*normals?)\.webp$/i;

/** Single files outside the status bundles: [source under UI_DIR, destination under ASSETS_DIR]. */
export const SINGLE_FILES = [
  ['_data_sharedassets6/attach_damage_flat.webp', 'damage-counter/counter-flat.webp'],
  ['_data_resources/counterBack.webp', 'damage-counter/counter-back.webp'],
  ['_data_sharedassets1/T_VFX_Damage_Counter_Slash.webp', 'damage-counter/counter-slash.webp'],
  ['_data_sharedassets1/T_VFX_Damage_Counter_Wave.webp', 'damage-counter/counter-wave.webp'],
  ['_data_sharedassets1/T_VFX_Damage_Highlight_Mask.webp', 'damage-counter/highlight-mask.webp'],
  ['_data_sharedassets1/poisonBadge.webp', 'status-markers/poison-badge.webp'],
  ['_data_sharedassets1/burnBadge.webp', 'status-markers/burn-badge.webp'],
];

/** URL-safe output name: Unity names carry spaces ("Spin 1"). */
export const safeName = (name) => name.replace(/\s+/g, '_');

/** @returns {{ src: string|null, check: boolean, error?: string }} */
export function parseArgs(argv) {
  const args = { src: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--src') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) return { ...args, error: '--src needs a directory' };
      args.src = value;
    } else return { ...args, error: `unknown argument ${flag}` };
  }
  if (!args.src) return { ...args, error: '--src <extract dir> is required' };
  return args;
}

/**
 * @param {(bundle: string) => string[]} listBundle file names in one status bundle
 * @returns {{ from: string, to: string }[]} paths relative to UI_DIR and ASSETS_DIR
 */
export function planCopies(listBundle) {
  const copies = [];
  for (const [bundle, folder] of Object.entries(STATUS_BUNDLES)) {
    for (const name of listBundle(bundle).sort()) {
      if (!name.endsWith('.webp') || SKIPPED.test(name)) continue;
      copies.push({ from: `${bundle}/${name}`, to: `status-fx/${folder}/${safeName(name)}` });
    }
  }
  for (const [from, to] of SINGLE_FILES) copies.push({ from, to });
  return copies;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    process.exit(2);
  }
  const uiRoot = join(args.src, UI_DIR);
  if (!existsSync(uiRoot)) {
    console.error(`no converted UI images at ${uiRoot}`);
    process.exit(2);
  }
  const copies = planCopies((bundle) => {
    const dir = join(uiRoot, bundle);
    return existsSync(dir) ? readdirSync(dir) : [];
  });
  const missing = copies.filter(({ from }) => !existsSync(join(uiRoot, from)));
  if (missing.length) {
    console.error(`missing in extract:\n  ${missing.map((c) => c.from).join('\n  ')}`);
    process.exit(1);
  }
  const drift = copies.filter(({ from, to }) => {
    const dest = join(ASSETS_DIR, to);
    return !existsSync(dest) || !readFileSync(dest).equals(readFileSync(join(uiRoot, from)));
  });
  if (args.check) {
    if (drift.length) console.error(`out of date:\n  ${drift.map((c) => c.to).join('\n  ')}`);
    process.exit(drift.length ? 1 : 0);
  }
  for (const { from, to } of drift) {
    const dest = join(ASSETS_DIR, to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(uiRoot, from), dest);
  }
  console.log(`${copies.length} files, ${drift.length} written`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
