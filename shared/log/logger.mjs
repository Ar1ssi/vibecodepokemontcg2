// Level gate -> flood gate -> line build -> sink. Never throws; failures are only counted.
import { LEVEL_RANK, CATEGORIES, LIMITS } from './log-schema.mjs';
import { safeStringify } from './safe-json.mjs';

const CATEGORY_SET = new Set(CATEGORIES);
const CTX_KEYS = ['room', 'seat', 'sv', 'cs'];

export function createLogger({ now, sink, level = 'debug', ctx = {} }) {
  const state = {
    now,
    sink,
    level,
    seq: 0,
    failures: 0,
    flooded: 0,
    windows: new Map(),
    sweptWin: null,
  };
  return makeLogger(state, ctx);
}

function emit(state, lvl, cat, ev, detail, ctx, t) {
  const { maxBytes: ctxMaxBytes, ...fields } = ctx;
  const maxBytes = ctxMaxBytes ?? (lvl === 'trace' ? LIMITS.traceDetailBytes : LIMITS.detailBytes);
  const seq = ++state.seq;
  let line = `{"t":${t},"seq":${seq},"lvl":${JSON.stringify(lvl)},"cat":${JSON.stringify(cat)},"ev":${JSON.stringify(ev)}`;
  for (const key of CTX_KEYS) {
    if (fields[key] != null) line += `,${JSON.stringify(key)}:${JSON.stringify(fields[key])}`;
  }
  if (detail !== undefined) line += `,"d":${safeStringify(detail, { maxBytes })}`;
  line += '}';
  state.sink({ seq, t, lvl, cat, ev, room: fields.room ?? null, line });
}

function emitSuppressed(state, nowMs) {
  const current = Math.floor(nowMs / 1000);
  // Windows only end when the second changes, so one sweep per second keeps log() O(1).
  if (current === state.sweptWin) return;
  state.sweptWin = current;
  for (const [key, w] of state.windows) {
    if (w.win >= current) continue;
    state.windows.delete(key);
    if (w.excess === 0 || LEVEL_RANK.warn > LEVEL_RANK[state.level]) continue;
    try {
      emit(state, 'warn', 'log', 'suppressed', { cat: w.cat, ev: w.ev, n: w.excess }, {}, Math.round(nowMs * 10) / 10);
    } catch {
      state.failures++;
    }
  }
}

function passesFloodGate(state, cat, ev, nowMs) {
  const key = `${cat}|${ev}`;
  const win = Math.floor(nowMs / 1000);
  let w = state.windows.get(key);
  if (!w || w.win !== win) {
    w = { win, cat, ev, count: 0, excess: 0 };
    state.windows.set(key, w);
  }
  if (w.count >= LIMITS.floodPerSec) {
    w.excess++;
    state.flooded++;
    return false;
  }
  w.count++;
  return true;
}

function makeLogger(state, baseCtx) {
  function log(lvl, cat, ev, detail, callCtx) {
    try {
      if (!(lvl in LEVEL_RANK) || !CATEGORY_SET.has(cat) || typeof ev !== 'string') {
        state.failures++;
        return;
      }
      if (LEVEL_RANK[lvl] > LEVEL_RANK[state.level]) return;
      const nowMs = state.now();
      emitSuppressed(state, nowMs);
      if (!passesFloodGate(state, cat, ev, nowMs)) return;
      emit(state, lvl, cat, ev, detail, { ...baseCtx, ...callCtx }, Math.round(nowMs * 10) / 10);
    } catch {
      state.failures++;
    }
  }

  const logger = {
    log,
    enabled: (lvl) => LEVEL_RANK[lvl] <= LEVEL_RANK[state.level],
    setLevel(lvl) {
      if (lvl in LEVEL_RANK) state.level = lvl;
      else state.failures++;
    },
    level: () => state.level,
    child: (ctx) => makeLogger(state, { ...baseCtx, ...ctx }),
    seq: () => state.seq,
    suppressed: () => ({ flooded: state.flooded, failures: state.failures }),
  };
  for (const lvl of ['error', 'warn', 'info', 'debug', 'trace']) {
    logger[lvl] = (cat, ev, detail, callCtx) => log(lvl, cat, ev, detail, callCtx);
  }
  return logger;
}
