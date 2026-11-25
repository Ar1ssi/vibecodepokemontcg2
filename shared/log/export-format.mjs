// Shapes both export writers (server export, client local export) emit. Pure, no Node built-ins.
import { EXPORT_NOTE_MAX } from './log-schema.mjs';

export const LEGEND = Object.freeze({
  record: 'k = header | journal | state | snap | e',
  e: 'ts = server-aligned ms; src = server or c:<client>; t = source clock ms; seq = per-source counter; lvl; cat; ev; room; seat; sv = stateVersion; cs = clientSeq; d = detail',
  journal: 'rec.k = rebase | rng | cmd — replayable with: node tools/log.mjs replay <file>',
  cli: 'node tools/log.mjs summary <file>',
});

/** The `src` label a client's entries carry in an export. */
export const clientSrc = (clientId) => `c:${String(clientId ?? '').slice(0, 8)}`;

/** A client's clock mapped onto the server's, to 0.1 ms. */
export const alignedTs = (t, offset) => Math.round((t + offset) * 10) / 10;

/** The header note: only a string is a note; anything else (an object from a socket) is none. */
export const exportNote = (note) => (typeof note === 'string' ? note.slice(0, EXPORT_NOTE_MAX) : '');

/** One merged-timeline record: the logger's own line with the export's fields written in front. */
export function timelineLine({ ts, src, load, line }) {
  const loadPart = load ? `,"load":${JSON.stringify(load)}` : '';
  return `{"k":"e","ts":${ts},"src":${JSON.stringify(src)}${loadPart},${line.slice(1)}`;
}

const utcStamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/** `ptcg-log_<tag>_<UTC stamp>.ndjson`, the download name on both sides. */
export const logFileName = (tag, ms) => `ptcg-log_${tag}_${utcStamp(ms)}.ndjson`;
