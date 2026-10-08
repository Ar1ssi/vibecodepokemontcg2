// Validates the study notes against the brief's schema and assembles Appendix A in the spec's
// order (type → physical → special → tier), then splices it into the design at <!-- APPENDIX-A -->.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DESIGN = '/home/user/vibecodepokemontcg2/.agent/designs/063-attack-move-animations.md';
const manifest = JSON.parse(readFileSync('moves/manifest.json', 'utf8'));

// The user's table, in display order. [vgType, physical tiers[3], special tiers[3]]
const TABLE = [
  ['grass', [['vine-whip'], ['razor-leaf'], ['leaf-blade']], [['absorb'], ['magical-leaf'], ['leaf-storm', 'solar-beam', 'seed-flare', 'petal-dance', 'energy-ball']]],
  ['water', [['aqua-jet'], ['waterfall', 'liquidation'], ['wave-crash', 'aqua-tail']], [['water-gun', 'bubble', 'whirlpool'], ['octazooka', 'scald'], ['water-pledge', 'hydro-cannon', 'hydro-pump', 'surf']]],
  ['fire', [['flame-charge'], ['flame-wheel'], ['fire-punch']], [['ember'], ['incinerate', 'mystical-fire', 'lava-plume', 'flame-burst'], ['blast-burn', 'overheat', 'flamethrower']]],
  ['ghost', [['lick', 'astonish'], ['shadow-punch'], ['shadow-claw', 'phantom-force']], [['night-shade'], ['hex', 'ominous-wind'], ['shadow-ball']]],
  ['dark', [['pursuit'], ['feint-attack', 'bite'], ['night-slash', 'throat-chop']], [[], ['snarl'], ['dark-pulse']]],
  ['electric', [['nuzzle'], ['thunder-fang'], ['wild-charge']], [['thunder-shock'], ['shock-wave'], ['electro-shot', 'thunder', 'zap-cannon']]],
  ['ice', [['ice-shard'], ['avalanche'], ['ice-hammer', 'ice-spinner']], [['powder-snow'], ['aurora-beam', 'icy-wind'], ['ice-beam', 'blizzard']]],
  ['fighting', [['arm-thrust'], ['karate-chop', 'low-sweep', 'triple-kick'], ['close-combat', 'meteor-assault', 'superpower']], [['vacuum-wave'], ['aura-sphere'], ['focus-blast']]],
  ['poison', [['poison-sting'], ['poison-tail'], ['poison-jab', 'cross-poison']], [['acid'], ['sludge', 'venoshock'], ['sludge-bomb', 'sludge-wave']]],
  ['ground', [['sand-tomb', 'mud-slap'], ['bulldoze', 'stomping-tantrum'], ['earthquake', 'high-horsepower']], [['mud-slap'], ['mud-shot', 'mud-bomb'], ['earth-power']]],
  ['flying', [['peck'], ['aerial-ace', 'wing-attack'], ['brave-bird']], [['gust'], ['air-cutter'], ['hurricane', 'aeroblast']]],
  ['psychic', [[], ['zen-headbutt', 'psycho-cut'], []], [['confusion'], ['psybeam'], ['psychic', 'future-sight']]],
  ['bug', [['fell-stinger', 'fury-cutter', 'pin-missile', 'twineedle'], ['x-scissor', 'lunge'], ['megahorn']], [['infestation'], ['struggle-bug', 'silver-wind', 'signal-beam'], ['bug-buzz']]],
  ['rock', [['smack-down', 'rock-throw', 'rock-blast'], ['rock-slide', 'rock-tomb'], ['head-smash', 'stone-edge', 'rock-wrecker']], [[], ['ancient-power'], ['power-gem']]],
  ['dragon', [[], ['dual-chop', 'dragon-claw'], ['outrage']], [['twister'], ['dragon-breath'], ['dragon-pulse', 'draco-meteor']]],
  ['steel', [['bullet-punch', 'metal-claw'], ['smart-strike', 'steel-wing'], ['iron-tail', 'iron-head']], [[], ['flash-cannon'], ['steel-beam']]],
  ['fairy', [[], ['spirit-break'], ['play-rough']], [['disarming-voice', 'fairy-wind'], ['draining-kiss', 'dazzling-gleam'], ['moonblast']]],
];

const REQUIRED = ['Refs:', 'Sprite beats:', 'Screen:', 'Palette:', 'Modern cue:', 'Board mapping:', 'Flags:'];
const slugOf = (name) => name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Parse every note file into entries keyed by slug (from the heading's English name).
const entries = new Map();
const problems = [];
for (const file of readdirSync('notes').filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(path.join('notes', file), 'utf8');
  const parts = text.split(/^(?=### )/m).filter((p) => p.startsWith('### '));
  for (const part of parts) {
    const heading = part.split('\n')[0];
    const name = heading.replace(/^###\s+/, '').split(/\s+[—–-]\s+/)[0].trim();
    const slug = slugOf(name);
    const known = manifest[slug] ? slug : Object.keys(manifest).find((s) => manifest[s].en && slugOf(manifest[s].en) === slug);
    if (!known) {
      problems.push(`${file}: heading not a spec move: "${heading}"`);
      continue;
    }
    for (const key of REQUIRED) if (!part.includes(`\n${key}`)) problems.push(`${file}: ${known} missing "${key}"`);
    if (entries.has(known)) problems.push(`${file}: duplicate entry for ${known} (also in ${entries.get(known).file})`);
    entries.set(known, { file, body: part.trim() });
  }
}

// ONLY=fire,water,… limits the pass to those types; the others are written as pending.
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const active = (type) => !only || only.has(type);
const expected = new Set(TABLE.filter(([t]) => active(t)).flatMap(([, p, s]) => [...p.flat(), ...s.flat()]));
for (const slug of expected) if (!entries.has(slug)) problems.push(`missing entry: ${slug}`);

if (problems.length) {
  console.error(problems.join('\n'));
  if (!process.argv.includes('--force')) process.exit(1);
}

const title = (s) => s.replace(/(^|-)([a-z])/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase());
const refLine = (slug) => {
  const e = manifest[slug] || {};
  const bits = [];
  if (e.sprite) bits.push(`sprite ${e.sprite.gen} (${e.sprite.durationMs} ms) <${e.sprite.source}>`);
  if (e.modern) bits.push(`3D ${e.modern.gen} (${e.modern.durationMs} ms) <${e.modern.source}>`);
  if (!bits.length) bits.push('no animation file found (Poképédia, Pokémon Central)');
  return `Sources: ${bits.join(' · ')}`;
};

let out = '';
if (only) {
  out += `\n_This pass covers ${[...only].map(title).join(', ')} (the user's test run of the study method). The other types are listed with their reference sources only; their entries follow the same schema in a later pass._\n`;
}
for (const [type, physical, special] of TABLE) {
  out += `\n### ${title(type)}\n`;
  if (!active(type)) {
    const slugs = [...physical.flat(), ...special.flat()];
    out += `Pending (sources in refs/063-move-refs.json): ${slugs.map(title).join(', ')}.\n`;
    continue;
  }
  for (const [cls, tiers] of [['Physical', physical], ['Special', special]]) {
    tiers.forEach((cell, i) => {
      if (!cell.length) {
        out += `\n#### ${cls} · tier ${i + 1} — N/A in the spec (falls back per Options 8)\n`;
        return;
      }
      for (const slug of cell) {
        const entry = entries.get(slug);
        out += `\n#### ${title(slug)} — ${title(type)} · ${cls} · tier ${i + 1}\n${refLine(slug)}\n`;
        if (entry) {
          // Drop the agent's own heading line; keep the body verbatim.
          out += entry.body.split('\n').slice(1).join('\n').trim() + '\n';
        } else {
          out += 'Entry missing from the study notes.\n';
        }
      }
    });
  }
}

const design = readFileSync(DESIGN, 'utf8');
const marker = '<!-- APPENDIX-A -->';
if (!design.includes(marker)) throw new Error('marker not found in design');
const start = design.indexOf(marker);
const end = design.indexOf('\n---\nSelf-approval checklist', start);
const next = design.slice(0, start) + marker + '\n' + out + design.slice(end);
writeFileSync(DESIGN, next);
writeFileSync('appendix-a.md', out);
console.log(`merged ${entries.size} entries (${expected.size} expected); problems: ${problems.length}; design now ${next.split('\n').length} lines`);
