#!/usr/bin/env node
/**
 * Compare two exported ptcg sync log JSON files side-by-side.
 *
 * Usage:
 *   node tools/compare-sync-logs.mjs player-a.json player-b.json
 */
import { readFileSync } from 'node:fs';

const [pathA, pathB] = process.argv.slice(2);
if (!pathA || !pathB) {
  console.error('Usage: node tools/compare-sync-logs.mjs <log-a.json> <log-b.json>');
  process.exit(1);
}

function load(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const who = raw.meta?.username || path;
  const lines = raw.compareLines?.length
    ? raw.compareLines
    : (raw.entries || []).map(
        (e) =>
          `${who}\t${e.seq}\t${e.dir}\ts${e.selfCounter ?? '?'}/o${e.oppCounter ?? '?'}\t${e.event}\t${JSON.stringify(e.detail)}`
      );
  return { who, lines, meta: raw.meta };
}

const a = load(pathA);
const b = load(pathB);

console.log('=== Sync log compare ===');
console.log(`A: ${a.who} (${pathA}) room=${a.meta?.roomId} socket=${a.meta?.socketId}`);
console.log(`B: ${b.who} (${pathB}) room=${b.meta?.roomId} socket=${b.meta?.socketId}`);
console.log(`A entries: ${a.lines.length}  B entries: ${b.lines.length}`);
console.log('');

const max = Math.max(a.lines.length, b.lines.length);
let mismatches = 0;
for (let i = 0; i < max; i++) {
  const la = a.lines[i] || '';
  const lb = b.lines[i] || '';
  const match = la === lb;
  if (!match) mismatches++;
  const mark = match ? ' ' : '!';
  console.log(`${mark} ${String(i + 1).padStart(3)} A | ${la}`);
  if (!match) {
    console.log(`  ${String(i + 1).padStart(3)} B | ${lb}`);
  }
}

console.log('');
console.log(`Mismatched rows: ${mismatches} / ${max}`);
process.exit(mismatches > 0 ? 1 : 0);
