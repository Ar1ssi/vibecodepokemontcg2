import fs from 'node:fs';
import { parseToolCondition } from './shared/engine/rules/tool-conditions.mjs';
import { parseToolOnDamageEffect } from './shared/engine/rules/tool-combat.mjs';
const files = fs.readdirSync('out').filter(f=>f.endsWith('.json'));
const all = files.flatMap(f=>{try{return Object.values(JSON.parse(fs.readFileSync('out/'+f,'utf8')))}catch{return []}});
for (const n of ['Adversity Policy','Punk Helmet',"Team Rocket's Hypnotizer",'Box of Disaster','Heavy Baton','Farewell Bell']) {
  const c = all.find(c=>c?.name===n); if(!c){console.log('missing',n);continue}
  const card = {...c, text:c.text};
  console.log(n,'|',c.text.replace(/\n/g,' ').slice(0,300)); console.log('  cond',JSON.stringify(parseToolCondition(card)),'eff',JSON.stringify(parseToolOnDamageEffect(card)));
}
