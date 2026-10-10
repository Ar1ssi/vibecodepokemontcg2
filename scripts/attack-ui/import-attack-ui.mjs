/**
 * Copy the TCG Live attack-overlay sprites (AttackOverlay's AttackEntryAssetRegistry) into
 * client/src/assets/attack-ui/. The output is committed; rerun after the extract changes.
 * Run: node scripts/attack-ui/import-attack-ui.mjs --src <extract dir>          (writes assets)
 *      node scripts/attack-ui/import-attack-ui.mjs --src <extract dir> --check  (exit 1 on drift)
 * <extract dir> is E:/TCGLive_Extract. Sprites come from `Pokemon TCG Live_Data/sharedassets1.assets/Sprite`;
 * the localized Ability tags come from `pokemon_Pokemon TCG Live/propertybadge_en/Sprite`.
 * Colours, ink and 9-slice borders in attack-ui.json come from dump-registry.py (same folder).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_OUT_DIR = join(ROOT, 'client/src/assets/attack-ui');

const UI_SPRITES = 'Pokemon TCG Live_Data/sharedassets1.assets/Sprite';
const BADGE_SPRITES = 'pokemon_Pokemon TCG Live/propertybadge_en/Sprite';

// [asset key, titlebar stem, short-titlebar stem, retreat stem]. The extract spells Fairy "Fariy"
// in one titlebar sprite and calls Darkness "Dark" on the retreat button.
const TYPES = [
  ['colorless', 'Colorless', 'Colorless', 'Colorless'],
  ['fire', 'Fire', 'Fire', 'Fire'],
  ['grass', 'Grass', 'Grass', 'Grass'],
  ['water', 'Water', 'Water', 'Water'],
  ['fighting', 'Fighting', 'Fighting', 'Fighting'],
  ['fairy', 'Fariy', 'Fairy', 'Fairy'],
  ['darkness', 'Darkness', 'Darkness', 'Dark'],
  ['lightning', 'Lightning', 'Lightning', 'Lightning'],
  ['dragon', 'Dragon', 'Dragon', 'Dragon'],
  ['metal', 'Metal', 'Metal', 'Metal'],
  ['psychic', 'Psychic', 'Psychic', 'Psychic'],
];

/** @returns {{ out: string, from: 'ui'|'badge', source: string }[]} */
export function spriteMap() {
  const rows = [];
  const ui = (out, source) => rows.push({ out, from: 'ui', source });
  for (const [key, bar, barShort, retreat] of TYPES) {
    ui(`bar-${key}.png`, `atkOv_Titlebar_${bar}.png`);
    ui(`bar-${key}-short.png`, `atkOv_Titlebar_${barShort}_Short.png`);
    ui(`retreat-${key}.png`, `atkOv_RetreatBtn_${retreat}.png`);
  }
  ui('retreat-disable.png', 'atkOv_RetreatBtn_Disable.png');
  ui('bar-gx.png', 'atkOv_TitlebarGX.png');
  ui('bar-gx-off.png', 'atkOv_TitlebarGX_Off.png');
  ui('dmg.png', 'atkOv_DmgBG.png');
  ui('dmg-short.png', 'atkOv_DmgBG_Short.png');
  ui('dmg-empty.png', 'atkOv_DmgBG_Empty.png');
  ui('dmg-empty-short.png', 'atkOv_DmgBG_Empty_Short.png');
  ui('ability-bg.png', 'atkOv_Ability_BG.png');
  rows.push({ out: 'ability-tag-on.png', from: 'badge', source: 'atkOV_AbilityTag_On_EN.png' });
  rows.push({ out: 'ability-tag-off.png', from: 'badge', source: 'atkOV_AbilityTag_Off_EN.png' });
  return rows;
}

export function parseArgs(argv, outDefault = DEFAULT_OUT_DIR) {
  const args = { src: null, out: outDefault, check: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--src' || flag === '--out') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) return { ...args, error: `${flag} needs a directory` };
      args[flag.slice(2)] = value;
    } else return { ...args, error: `unknown argument ${flag}` };
  }
  if (!args.src) return { ...args, error: '--src <extract dir> is required' };
  return args;
}

function sourcePath(src, row) {
  return join(src, row.from === 'ui' ? UI_SPRITES : BADGE_SPRITES, row.source);
}

/** Copy (or, with `check`, compare) every sprite; returns the paths that are missing or drifted. */
export function importSprites({ src, out, check }) {
  const problems = [];
  if (!check) mkdirSync(out, { recursive: true });
  for (const row of spriteMap()) {
    const from = sourcePath(src, row);
    const to = join(out, row.out);
    if (!existsSync(from)) {
      problems.push(`missing source ${from}`);
      continue;
    }
    if (check) {
      if (!existsSync(to) || !readFileSync(from).equals(readFileSync(to))) problems.push(`drift ${row.out}`);
    } else copyFileSync(from, to);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    process.exit(2);
  }
  const problems = importSprites(args);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`${spriteMap().length} sprites ${args.check ? 'match' : 'written to'} ${args.out}`);
}
