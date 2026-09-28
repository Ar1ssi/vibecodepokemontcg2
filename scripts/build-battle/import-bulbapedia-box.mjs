/**
 * Drafts a box source (scripts/build-battle/boxes/<key>.mjs) from its Bulbapedia page (design 054
 * § Generated data). Development tool: its output is reviewed and edited by hand where a page states
 * a rule in prose (Trainer counts, Energy swaps, alternative prints), then committed.
 *
 *   node scripts/build-battle/import-bulbapedia-box.mjs "Team Up Build & Battle Box (TCG)" \
 *     [--key team-up] [--map "Gardevoir group=kirlia"] [--out scripts/build-battle/boxes]
 *
 * Pages are read through the MediaWiki API (bulbapedia.bulbagarden.net/w/api.php); the promos come
 * from "Build & Battle Box (TCG)", the box list. Every card line is resolved on TCGdex by set code
 * and number; when TCGdex names the card differently the line takes TCGdex's name and keeps
 * Bulbapedia's in a comment. BULBAPEDIA_CACHE_DIR / TCGDEX_CACHE_DIR keep responses between runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchCard, fetchSet } from '../lib/decklist-lines.mjs';
import { resolveCardNumber } from './box-lines.mjs';

const API = 'https://bulbapedia.bulbagarden.net/w/api.php';
const LIST_PAGE = 'Build & Battle Box (TCG)';
const WIKI = 'https://bulbapedia.bulbagarden.net/wiki/';

// Bulbapedia expansion names → the set codes of scripts/lib/decklist-lines.mjs SET_MAP.
export const BULBAPEDIA_SET_CODES = {
  151: 'MEW',
  'Ancient Origins': 'AOR',
  'Ascended Heroes': 'ASC',
  'Astral Radiance': 'ASR',
  BREAKpoint: 'BKP',
  BREAKthrough: 'BKT',
  'Battle Styles': 'BST',
  'Black Bolt': 'BLK',
  'Brilliant Stars': 'BRS',
  'Burning Shadows': 'BUS',
  'Celestial Storm': 'CES',
  'Chaos Rising': 'CRI',
  'Chilling Reign': 'CRE',
  'Cosmic Eclipse': 'CEC',
  'Crimson Invasion': 'CIN',
  'Darkness Ablaze': 'DAA',
  'Destined Rivals': 'DRI',
  Evolutions: 'EVO',
  'Evolving Skies': 'EVS',
  'Fates Collide': 'FCO',
  'Forbidden Light': 'FLI',
  'Fusion Strike': 'FST',
  'Guardians Rising': 'GRI',
  'Journey Together': 'JTG',
  'Lost Origin': 'LOR',
  'Lost Thunder': 'LOT',
  'MEP Promo': 'MEP',
  'Mega Evolution': 'MEG',
  'Obsidian Flames': 'OBF',
  'Paldea Evolved': 'PAL',
  'Paldean Fates': 'PAF',
  'Paradox Rift': 'PAR',
  'Perfect Order': 'POR',
  'Phantasmal Flames': 'PFL',
  'Pitch Black': 'PBL',
  'Primal Clash': 'PRC',
  'Rebel Clash': 'RCL',
  'Roaring Skies': 'ROS',
  'SM Promo': 'SMP',
  'SVP Promo': 'SVP',
  'SWSH Promo': 'SWSHP',
  'Scarlet & Violet': 'SVI',
  'Shrouded Fable': 'SFA',
  'Silver Tempest': 'SIT',
  'Steam Siege': 'STS',
  'Stellar Crown': 'SCR',
  'Sun & Moon': 'SUM',
  'Surging Sparks': 'SSP',
  'Sword & Shield': 'SSH',
  'Team Up': 'TEU',
  'Temporal Forces': 'TEF',
  'Twilight Masquerade': 'TWM',
  'Ultra Prism': 'UPR',
  'Unbroken Bonds': 'UNB',
  'Unified Minds': 'UNM',
  'Vivid Voltage': 'VIV',
  'White Flare': 'WHT',
  'XY Promo': 'XYP',
  XY: 'XY',
};

const slugOf = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

async function fetchPage(title) {
  const dir = process.env.BULBAPEDIA_CACHE_DIR;
  const file = dir ? join(dir, `page-${slugOf(title.replace(/ \(TCG\)$/, ''))}.json`) : null;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = new URL(API);
  url.search = new URLSearchParams({ action: 'parse', page: title, format: 'json', prop: 'wikitext|revid', redirects: '1' });
  const res = await fetch(url, { headers: { 'User-Agent': 'ptcg-sim build-battle importer' } });
  const json = await res.json();
  if (json.error) throw new Error(`${title}: ${json.error.info}`);
  const page = { title: json.parse.title, revid: json.parse.revid, wikitext: json.parse.wikitext['*'] };
  if (file) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(page));
  }
  return page;
}

// Splits a template's inner text on top-level `|`, keeping nested `{{…}}` and `[[…]]` whole.
function splitParams(inner) {
  const params = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < inner.length; index += 1) {
    const pair = inner.slice(index, index + 2);
    if (pair === '{{' || pair === '[[') {
      depth += 1;
      current += pair;
      index += 1;
    } else if (pair === '}}' || pair === ']]') {
      depth -= 1;
      current += pair;
      index += 1;
    } else if (inner[index] === '|' && depth === 0) {
      params.push(current);
      current = '';
    } else {
      current += inner[index];
    }
  }
  params.push(current);
  return params;
}

// Every top-level `{{name|…}}` template in `text` whose name matches, as its params.
function templates(text, namePattern) {
  const found = [];
  for (let index = text.indexOf('{{'); index !== -1; index = text.indexOf('{{', index + 2)) {
    let depth = 0;
    let end = index;
    for (; end < text.length; end += 1) {
      if (text.startsWith('{{', end)) {
        depth += 1;
        end += 1;
      } else if (text.startsWith('}}', end)) {
        depth -= 1;
        end += 1;
        if (depth === 0) break;
      }
    }
    const [name, ...params] = splitParams(text.slice(index + 2, end - 1));
    if (namePattern.test(name.trim())) {
      found.push(params);
      index = end - 1;
    }
  }
  return found;
}

// Positional params with `N=value` named ones folded into place (1-based, as MediaWiki does).
function positional(params) {
  const out = [];
  for (const param of params) {
    const named = param.match(/^\s*(\d+)\s*=(.*)$/s);
    if (named) out[Number(named[1]) - 1] = named[2];
    else out.push(param);
  }
  return out;
}

function cardOf(namePart) {
  const [id] = templates(namePart, /^TCG ID$/);
  if (id) return { set: id[0].trim(), name: id[1].trim(), number: Number(id[2]) };
  const [basic] = templates(namePart, /^TCG$/);
  const energy = basic?.[0]?.trim();
  return energy && /^Basic \w+ Energy$/.test(energy) ? { energy } : null;
}

/** The page's blocks: each header with the entries under it, and the section it sits in. */
export function parseBoxPage(wikitext) {
  const blocks = [];
  let section = '';
  for (const line of wikitext.split('\n')) {
    const heading = line.match(/^(={2,4})\s*(.+?)\s*\1\s*$/);
    if (heading) {
      section = heading[2];
      continue;
    }
    for (const params of templates(line, /^[Hh]alfdecklist\/(?:nm)?header$/)) {
      const fields = Object.fromEntries(
        params.map((param) => param.split('=')).map(([key, ...rest]) => [key.trim(), rest.join('=').trim()])
      );
      blocks.push({ section, title: fields.title, type: fields.type, entries: [] });
    }
    for (const kind of ['nmentry', 'entry']) {
      for (const params of templates(line, new RegExp(`^[Hh]alfdecklist/${kind}$`))) {
        const values = positional(params);
        const namePart = kind === 'nmentry' ? values[1] : values[2];
        const qty = (values.at(-1) ?? '').trim();
        blocks.at(-1)?.entries.push({ card: cardOf(namePart ?? ''), qty, raw: line.trim() });
      }
    }
  }
  return blocks;
}

/** The four promos of one box, from the box list page: `[{ name, set, number }]`. */
export function promosFromList(wikitext, boxName) {
  const rows = wikitext.split(/\n\|-\s*\n/);
  const row = rows.find((text) => text.includes(`{{TCG|${boxName}}}`));
  if (!row) throw new Error(`${boxName} is not on the box list`);
  return templates(row, /^TCG ID$/).map(([set, name, number]) => ({ set: set.trim(), name: name.trim(), number: Number(number) }));
}

async function lineFor({ card, qty }, tcgdex) {
  if (card?.energy) return { text: `${qty} ${card.energy}` };
  const code = BULBAPEDIA_SET_CODES[card?.set];
  if (!code) throw new Error(`No set code for "${card?.set}"`);
  const resolved = await resolveCardNumber({ setCode: code, number: card.number, name: undefined }, tcgdex);
  const text = `${qty} ${resolved.name} ${code} ${card.number}`;
  return resolved.name === card.name ? { text, id: resolved.id } : { text, id: resolved.id, note: `Bulbapedia: "${card.name}"` };
}

const quote = (text) => (text.includes("'") ? `"${text.replace(/"/g, '\\"')}"` : `'${text}'`);
const keyText = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key));

function renderLines(lines, indent) {
  return lines
    .map(({ text, note, flag }) => `${indent}${quote(text)},${note ? ` // ${note}` : ''}${flag ? ` // CHECK: ${flag}` : ''}`)
    .join('\n');
}

async function main() {
  const [title, ...args] = process.argv.slice(2);
  if (!title) throw new Error('Usage: import-bulbapedia-box.mjs "<Box page title (TCG)>" [--key k] [--map "X group=key"] [--out dir]');
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const boxName = title.replace(/ \(TCG\)$/, '');
  const key = option('--key') || slugOf(boxName.replace(/ (Build & Battle Box|Prerelease Kit)$/, ''));
  const tcgdex = { fetchSet, fetchCard };
  const [list, page] = await Promise.all([fetchPage(LIST_PAGE), fetchPage(title)]);
  const promos = promosFromList(list.wikitext, boxName).map((promo) => ({ ...promo, key: slugOf(promo.name) }));
  const overrides = Object.fromEntries(
    args
      .flatMap((arg, index) => (args[index - 1] === '--map' ? [arg] : []))
      .map((pair) => pair.split('=').map((part) => part.trim()))
  );
  const blocks = parseBoxPage(page.wikitext);
  const groupKeyOf = (block) => {
    if (overrides[block.title]) return overrides[block.title];
    const bare = block.title.replace(/\s+(group|deck)$/i, '').trim().toLowerCase();
    const byTitle = promos.find((promo) => promo.name.toLowerCase() === bare);
    if (byTitle) return byTitle.key;
    const byMember = promos.filter((promo) => block.entries.some((entry) => entry.card?.name === promo.name));
    return byMember.length === 1 ? byMember[0].key : null;
  };
  const isFixed = blocks.some((block) => /deck$/i.test(block.title));
  const groups = {};
  const common = [];
  const pools = [];
  for (const block of blocks) {
    const lines = [];
    for (const entry of block.entries) {
      const valid = /^\d+(-\d+)?$/.test(entry.qty) && entry.card;
      if (!valid) {
        lines.push({ text: `${entry.qty} ${entry.card?.name ?? '?'} ?`, flag: entry.raw });
        continue;
      }
      lines.push(await lineFor(entry, tcgdex));
    }
    if (/^all groups$/i.test(block.title)) common.push(...lines);
    else if (/(group|deck)$/i.test(block.title)) {
      const groupKey = groupKeyOf(block);
      if (!groupKey) throw new Error(`No promo for "${block.title}"; pass --map "${block.title}=<promo key>"`);
      groups[groupKey] = lines;
    } else pools.push({ name: block.title, lines });
  }
  const promoLines = await Promise.all(
    promos.map(async (promo) => [promo.key, await lineFor({ card: promo, qty: '1' }, tcgdex)])
  );
  const url = `${WIKI}${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
  const header = `// ${boxName} — Bulbapedia "${page.title}", revision ${page.revid} (read ${new Date().toISOString().slice(0, 10)}).`;
  const body = [
    header,
    'export default {',
    `  key: '${key}',`,
    `  source: { url: '${url}', revision: ${page.revid} },`,
  ];
  if (isFixed) {
    body.push('  decks: {');
    for (const promo of promos) body.push(`    ${keyText(promo.key)}: [\n${renderLines(groups[promo.key] || [], '      ')}\n    ],`);
    body.push('  },');
  } else {
    body.push('  promos: {');
    for (const [promoKey, line] of promoLines) body.push(`    ${keyText(promoKey)}: ${quote(line.text)},${line.note ? ` // ${line.note}` : ''}`);
    body.push('  },', '  groups: {');
    for (const promo of promos) body.push(`    ${keyText(promo.key)}: [\n${renderLines(groups[promo.key] || [], '      ')}\n    ],`);
    body.push('  },');
    if (common.length) body.push(`  common: [\n${renderLines(common, '    ')}\n  ],`);
    if (pools.length) {
      body.push('  trainers: [');
      for (const pool of pools) {
        body.push(`    {\n      name: ${quote(pool.name)},\n      count: null,\n      cards: [\n${renderLines(pool.lines, '        ')}\n      ],\n    },`);
      }
      body.push('  ],');
    }
  }
  body.push('};', '');
  const text = body.join('\n');
  const catalog = {
    key,
    name: boxName,
    page: page.title,
    decks: promos.map((promo, index) => ({
      key: promo.key,
      name: promo.name,
      promoId: promoLines[index][1].id,
    })),
  };
  const out = option('--out');
  if (out) {
    writeFileSync(join(out, `${key}.mjs`), text);
    console.log(`wrote ${join(out, `${key}.mjs`)}`);
  } else {
    console.log(text);
  }
  console.log(`// catalog: ${JSON.stringify(catalog)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
