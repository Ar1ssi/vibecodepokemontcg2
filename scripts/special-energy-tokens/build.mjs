// Special Energy token sheet + per-token SVG/PNG (design proposal; not wired into the board yet).
// 1. python3 extract-type-glyphs.py client/src/assets/energy/tokens <maskDir>   (black masks), then
//    make white copies `<type>-w.png` (same alpha, RGB 255) next to them.
// 2. card-refs.json maps each corpus name to the TCGdex printing used as art reference
//    (regenerate with fetch-card-refs.py <dir> out/pkmn-special-energy-cards.json).
// 3. node build.mjs <maskDir> scripts/special-energy-tokens/card-refs.json out/pkmn-special-energy-cards.json <outDir> [--png]
import fs from 'node:fs';
import path from 'node:path';
import { loadMasks } from './lib.mjs';
import { renderToken } from './render.mjs';
import { CARDS } from './cards.mjs';

const [maskDir, indexPath, corpusPath, outDir] = process.argv.slice(2);
const wantPng = process.argv.includes('--png');
loadMasks(maskDir);
fs.mkdirSync(outDir, { recursive: true });

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const corpusNames = [
  ...new Set(
    JSON.parse(fs.readFileSync(corpusPath, 'utf8')).map((r) => r.name)
  ),
];
const byName = new Map(CARDS.map((c) => [c.n, c]));
const missing = corpusNames.filter((n) => !byName.has(n));
const extra = CARDS.filter((c) => !corpusNames.includes(c.n)).map((c) => c.n);
if (missing.length || extra.length) {
  console.error('coverage mismatch', { missing, extra });
  process.exit(1);
}

export const slugOf = (name) =>
  name
    .toLowerCase()
    .replace('δ', 'delta')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ERAS = [
  ['Mega Evolution · Scarlet & Violet', /^(me|sv)/],
  ['Sword & Shield', /^swsh/],
  ['Sun & Moon', /^sm/],
  ['XY · Black & White', /^(xy|dc|bw)/],
  ['HeartGold SoulSilver · Platinum · Diamond & Pearl', /^(col|hgss|pl|dp)/],
  ['EX · e-Card · Neo · Legendary Collection', /^(ex|pop|ecard|lc|neo)/],
];
const eraOf = (card) => {
  const id = card.n === 'Double Colorless Energy' ? 'sm2' : index[card.n].id;
  return ERAS.findIndex(([, re]) => re.test(id));
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pretty = (s) =>
  esc(s).replace(/\{([A-Z])\}/g, (_, c) => `<b class="sym s-${c}">${c}</b>`);

const cell = (card, i) => {
  const id = `t${i}`;
  const svg = renderToken(id, card, 112);
  const mini = renderToken(`${id}x`, card, 30);
  const info = index[card.n];
  return `<figure class="cell" data-slug="${slugOf(card.n)}">
  <div class="art">${svg}<div class="mini" title="table size">${mini}</div></div>
  <figcaption><div class="name">${pretty(card.n)}</div><div class="note">${pretty(card.note)}</div><div class="src">${esc(info.id)}</div></figcaption>
</figure>`;
};

const legendCard = (label, sub, card, i) =>
  `<div class="leg"><div>${renderToken(`L${i}`, card, 72)}</div><div><div class="name">${label}</div><div class="note">${sub}</div></div></div>`;
const pick = (n) => byName.get(n);

let html =
  `<!doctype html><html><head><meta charset="utf-8"><title>Special Energy Tokens</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#14161b;--panel:#1c1f26;--ink:#ecebe7;--mute:#9aa0aa;--line:#2a2e37;--accent:#e2b33c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.35 Inter,system-ui,sans-serif}
main{max-width:1640px;margin:0 auto;padding:28px 24px 40px}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.01em}
.lede{color:var(--mute);margin:0 0 18px;max-width:900px}
.legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:26px}
.leg{display:flex;gap:12px;align-items:center}
h2{font-size:15px;font-weight:700;margin:26px 0 12px;color:var(--accent);text-transform:uppercase;letter-spacing:.08em;display:flex;gap:10px;align-items:baseline}
h2 span{color:var(--mute);font-weight:500;letter-spacing:0;text-transform:none;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
.cell{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 10px 10px;display:flex;flex-direction:column;align-items:center;text-align:center}
.art{position:relative;width:112px;height:112px}
.art svg{display:block;filter:drop-shadow(0 3px 5px rgba(0,0,0,.55))}
.mini{position:absolute;right:-12px;bottom:-4px;width:30px;height:30px;border-radius:50%;background:#bfa58a;box-shadow:0 0 0 3px var(--panel)}
figcaption{margin-top:8px;width:100%}
.name{font-weight:700;font-size:12.5px}
.note{color:var(--mute);font-size:11px;margin-top:3px}
.src{color:#6b717c;font-size:10px;margin-top:4px;font-variant-numeric:tabular-nums}
.sym{display:inline-grid;place-items:center;width:1.25em;height:1.25em;border-radius:50%;font-size:.78em;color:#111;vertical-align:.05em}
.s-G{background:#3cb767}.s-R{background:#e0453f}.s-W{background:#3a9be0}.s-L{background:#f6dc2f}.s-P{background:#a15fbd}.s-F{background:#c2603f}.s-D{background:#2c5b67;color:#fff}.s-M{background:#b3a99d}.s-C{background:#e8e4e2}.s-Y{background:#e46f9b}.s-N{background:#c29a3f}
footer{color:var(--mute);margin-top:28px;font-size:12px}
@media (max-width:520px){main{padding:18px 16px}.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main>
<h1>Special Energy tokens</h1>
<p class="lede">${CARDS.length} tokens, one per Special Energy name in the card corpus. Each token reads in four layers: the <b>body</b> shows what it provides, the black <b>glyph</b> shows what it does, the <b>bezel</b> marks it as special, and the <b>top-right pips</b> copy the card's corner symbols (one pip per Energy provided). The small coin beside each token is the size it appears on the table.</p>
<div class="legend">
${legendCard('Typed body', 'Same colour as the basic token; the basic type symbol is reused inside the glyph', pick('Rocky {F} Energy'), 1)}
${legendCard('Pearl body', 'Provides {C}', pick('Gift Energy'), 2)}
${legendCard('Iridescent body', 'Can provide every type', pick('Luminous Energy'), 3)}
${legendCard('Split body', 'Provides one of several types, e.g. Unit / Blend / team Energy', pick('Unit Energy {G}{R}{W}'), 4)}
${legendCard('Gold bezel', 'Special Energy', pick('Jet Energy'), 5)}
${legendCard('Magenta bezel', 'ACE SPEC', pick('Neo Upper Energy'), 6)}
${legendCard('Silver bezel + ◇', 'Prism Star', pick('Super Boost Energy Prism Star'), 7)}
${legendCard('Pips', 'Count = Energy provided; split pip = “one of these types”', pick('Ignition Energy'), 8)}
</div>`.replace(/\{([A-Z])\}/g, (_, c) => `<b class="sym s-${c}">${c}</b>`);

let i = 0;
ERAS.forEach(([title], e) => {
  const cards = CARDS.filter((c) => eraOf(c) === e);
  html += `<h2>${title}<span>${cards.length}</span></h2><div class="grid">${cards.map((c) => cell(c, i++)).join('')}</div>`;
});
const unplaced = CARDS.filter((c) => eraOf(c) < 0);
if (unplaced.length) {
  console.error(
    'no era for',
    unplaced.map((c) => c.n)
  );
  process.exit(1);
}
html += `<footer>Glyphs reuse the exact type symbols from the basic tokens (client/src/assets/energy/tokens). Card text: out/pkmn-special-energy-cards.json; art reference: TCGdex (ids under each name).</footer></main></body></html>`;
fs.writeFileSync(path.join(outDir, 'sheet.html'), html);

// Standalone SVG per token (168px, the basic token size).
fs.mkdirSync(path.join(outDir, 'svg'), { recursive: true });
for (const card of CARDS)
  fs.writeFileSync(
    path.join(outDir, 'svg', slugOf(card.n) + '.svg'),
    renderToken('t', card, 168)
  );
console.log('wrote', CARDS.length, 'tokens');

if (wantPng) {
  const { chromium } = await import(
    '/opt/node-tools/node_modules/playwright/index.mjs'
  );
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1640, height: 1000 },
    deviceScaleFactor: 1.5,
  });
  await page.goto('file://' + path.resolve(outDir, 'sheet.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(outDir, 'sheet.png'),
    fullPage: true,
  });
  // Per-token PNGs at 168×168 with transparent corners.
  fs.mkdirSync(path.join(outDir, 'png'), { recursive: true });
  const solo = await browser.newPage({
    viewport: { width: 168, height: 168 },
    deviceScaleFactor: 1,
  });
  for (const card of CARDS) {
    const svg = renderToken('t', card, 168);
    await solo.setContent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`
    );
    await solo.evaluate(() => document.fonts.ready);
    await solo.locator('svg').screenshot({
      path: path.join(outDir, 'png', slugOf(card.n) + '.png'),
      omitBackground: true,
    });
  }
  await browser.close();
  console.log('rendered pngs');
}
