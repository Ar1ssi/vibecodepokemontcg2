#!/bin/bash
# next.sh N → the next N rendered ids (moves.json order) not yet in ledger.md
cd "${PARITY_DIR:-$(dirname "$0")/../../../../.agent/scratch/075/parity}"
node -e "
const fs=require('fs');const rows=require('./moves.json');const led=fs.readFileSync(process.env.PARITY_LEDGER || '../../../designs/075-parity-ledger.md','utf8');
const seen=new Set();const out=[];
for(const r of rows){if(seen.has(r.id))continue;seen.add(r.id);if(led.includes('\n'+r.id+' ('))continue;if(!fs.existsSync('ours/'+r.id+'-7.png'))continue;out.push(r.id);if(out.length>=$1)break}
console.log(out.join(' '))"
