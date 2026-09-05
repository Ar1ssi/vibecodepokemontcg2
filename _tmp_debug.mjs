import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('/tmp/cards.json','utf8'));
const t = data[0].text;
console.log('RAW BYTES of first 120 chars:');
console.log(JSON.stringify(t.slice(0,120)));
const lines = t.split(/\n/);
console.log('num lines by \n:', lines.length);
for (const l of lines) console.log('LINE: '+JSON.stringify(l));
