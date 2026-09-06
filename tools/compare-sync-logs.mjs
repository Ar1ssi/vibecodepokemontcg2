#!/usr/bin/env node
/**
 * Compare exported ptcg sync log JSON files side-by-side.
 *
 * Usage:
 *   node tools/compare-sync-logs.mjs player-a.json player-b.json
 *   node tools/compare-sync-logs.mjs combined-export.json
 *
 * Combined exports (meta.combined === true) contain both clients in one file;
 * pass a single path to print the unified timeline.
 */
import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error(
    'Usage: node tools/compare-sync-logs.mjs <log-a.json> [log-b.json]\n' +
      '  One combined export, or two single-client exports.'
  );
  process.exit(1);
}

function load(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));

  if (raw.meta?.combined) {
    const clients = (raw.clients || []).map((c) => c.meta?.username || '?');
    return {
      combined: true,
      who: clients.join(' + '),
      lines: raw.compareLines || [],
      meta: raw.meta,
      timeline: raw.timeline || [],
    };
  }

  const who = raw.meta?.username || path;
  const lines = raw.compareLines?.length
    ? raw.compareLines
    : (raw.entries || []).map(
        (e) =>
          `${who}\t${e.seq}\t${e.dir}\ts${e.selfCounter ?? '?'}/o${e.oppCounter ?? '?'}\t${e.event}\t${JSON.stringify(e.detail)}`
      );
  return { combined: false, who, lines, meta: raw.meta };
}

function printCombined(a) {
  console.log('=== Combined sync log ===');
  console.log(`Clients: ${a.who}`);
  console.log(`Room: ${a.meta?.roomId}  Requester: ${a.meta?.requester}`);
  console.log(`Timeline rows: ${a.lines.length}`);
  if (a.meta?.remoteMissing) {
    console.log('Note: opponent log was not received (timeout or solo export).');
  }
  console.log('');
  console.log(a.meta?.compareHeader || 'client\tseq\tdir\tcounters\tevent\tdetail');
  for (const line of a.lines) {
    console.log(line);
  }
}

function compareTwo(a, b) {
  console.log('=== Sync log compare ===');
  console.log(`A: ${a.who} (${paths[0]}) room=${a.meta?.roomId} socket=${a.meta?.socketId}`);
  console.log(`B: ${b.who} (${paths[1]}) room=${b.meta?.roomId} socket=${b.meta?.socketId}`);
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
  return mismatches;
}

const loaded = paths.map(load);

if (loaded.length === 1) {
  if (!loaded[0].combined) {
    console.log('=== Single-client sync log ===');
    console.log(`Client: ${loaded[0].who}  room=${loaded[0].meta?.roomId}`);
    console.log(`Entries: ${loaded[0].lines.length}`);
    console.log('');
    for (const line of loaded[0].lines) {
      console.log(line);
    }
    process.exit(0);
  }
  printCombined(loaded[0]);
  process.exit(0);
}

if (loaded.some((l) => l.combined)) {
  console.error('Pass one combined file alone, or two single-client files — not mixed.');
  process.exit(1);
}

const mismatches = compareTwo(loaded[0], loaded[1]);
process.exit(mismatches > 0 ? 1 : 0);
