import { readFileSync, writeFileSync } from 'node:fs';
import { classifyAttackEffect } from './client/src/setup/rules/attack-effects.mjs';
import { parseAttackDamage } from './client/src/setup/rules/damage-parser.mjs';

const data = JSON.parse(readFileSync('/tmp/cards.json','utf8'));

// Attack header line: <EnergyCost> → <AttackName> : <Damage>[+|×]
const headerRe = /^(Grass|Fire|Water|Lightning|Psychic|Fighting|Dark|Metal|Fairy|Dragon|Colorless)+\s*→\s*(.+?)\s*:\s*(\d+)([+×x]?)\s*$/i;

const attacks = [];
for (const card of data) {
  const lines = card.text.split(/\n/);
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (cur) { attacks.push(cur); cur = null; } continue; }
    const m = line.match(headerRe);
    if (m) {
      if (cur) attacks.push(cur);
      cur = { card: card.name, name: m[2].trim(), cost: m[1], damage: parseInt(m[3],10), suffix: m[4]||'', effect: '' };
    } else if (cur) {
      cur.effect += (cur.effect ? '\n' : '') + line;
    }
  }
  if (cur) attacks.push(cur);
}

console.log('TOTAL ATTACKS:', attacks.length);
const results = attacks.map(a => {
  const attack = { name: a.name, damage: a.damage, text: a.effect };
  let family = 'ERR';
  try { family = classifyAttackEffect(attack); } catch(e){ family = 'THROW: '+e.message; }
  let dmg = null;
  try { dmg = parseAttackDamage(attack); } catch(e){ dmg = { error: e.message }; }
  return { ...a, family, dmg };
});

writeFileSync('/tmp/attack_results.json', JSON.stringify(results, null, 2));

const byFamily = {};
for (const r of results) byFamily[r.family] = (byFamily[r.family]||0)+1;
console.log('FAMILY COUNTS:');
for (const [k,v] of Object.entries(byFamily).sort((a,b)=>b[1]-a[1])) console.log('  '+k+': '+v);

console.log('\n=== ALL ATTACKS ===');
for (const r of results) {
  console.log('\n['+r.card+'] '+r.name+' (dmg '+r.damage+r.suffix+')  =>  '+r.family);
  if (r.dmg && !r.dmg.error) console.log('   total='+r.dmg.total+' comps=['+r.dmg.components.join(',')+'] resolved='+r.dmg.resolved+' notes='+JSON.stringify(r.dmg.notes));
  else if (r.dmg && r.dmg.error) console.log('   PARSE ERROR: '+r.dmg.error);
  if (r.effect) console.log('   text: '+r.effect.replace(/\n/g,' | '));
}
