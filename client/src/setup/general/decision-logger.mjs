const MAX_ENTRIES = 800;
const STORAGE_KEY = 'ptcg-sim.decision-log.v1';

let sessionEnabled = false;
let seq = 0;
const entries = [];

export function isDecisionLogEnabled() {
  if (sessionEnabled) return true;
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDecisionLogEnabled(on) {
  sessionEnabled = !!on;
  try {
    if (on) {
      globalThis.localStorage?.setItem(STORAGE_KEY, '1');
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    /* node:test */
  }
}

/**
 * Summarize a decision into a short human-readable line.
 * @param {string} action
 * @param {any[]} parameters
 * @returns {string}
 */
export function summarizeDecision(action, parameters = []) {
  switch (action) {
    case 'moveCardBundle': {
      const [, from, to, , , subAction, hints] = parameters;
      const moving = hints?.moving?.name || (hints?.moving?.syncInstance ?? '?');
      const target = hints?.target?.name ? ` \u2192${hints.target.name}` : '';
      return `${moving} ${from}[${parameters[3]}] ${subAction} \u2192${to}${target}`;
    }
    case 'attack':
      return `attack[${parameters[0] ?? 0}]`;
    case 'retreat':
      return 'retreat';
    case 'pass':
      return 'pass';
    case 'useAbility': {
      const hint = parameters[3];
      const name = hint?.name || (hint?.syncInstance ?? '?');
      return `useAbility ${name} (${parameters[1] ?? '?'})`;
    }
    case 'draw':
      return `draw[${parameters[1] ?? 1}]`;
    case 'takePrizes':
      return `takePrizes[${parameters[1] ?? '?'}]`;
    case 'takePrizesByIndex':
      return `takePrizesByIndex`;
    case 'shuffleIntoDeck':
      return `shuffleIntoDeck ${parameters[1] ?? '?'}`;
    case 'moveToDeckTop':
      return `moveToDeckTop ${parameters[1] ?? '?'}`;
    case 'switchWithDeckTop':
      return `switchWithDeckTop ${parameters[1] ?? '?'}`;
    case 'shuffleZone':
      return `shuffleZone ${parameters[1] ?? '?'}`;
    case 'shuffleBottom':
      return `shuffleBottom ${parameters[1] ?? '?'}`;
    case 'discardAll':
      return `discardAll ${parameters[1] ?? '?'}`;
    case 'handAll':
      return `handAll ${parameters[1] ?? '?'}`;
    case 'lostZoneAll':
      return `lostZoneAll ${parameters[1] ?? '?'}`;
    case 'shuffleAll':
      return `shuffleAll ${parameters[1] ?? '?'}`;
    case 'discardAndDraw':
      return `discardAndDraw ${parameters[1] ?? '?'}`;
    case 'shuffleAndDraw':
      return `shuffleAndDraw ${parameters[1] ?? '?'}`;
    case 'shuffleBottomAndDraw':
      return `shuffleBottomAndDraw ${parameters[1] ?? '?'}`;
    case 'shufflePrizesToDeckBottom':
      return 'shufflePrizesToDeckBottom';
    case 'addDamageCounter':
      return `damage ${parameters[2] ?? '?'}`;
    case 'addSpecialCondition':
      return `condition ${parameters[2] ?? '?'}`;
    case 'rotateCard':
      return 'rotate';
    case 'stadium-effect':
      return 'stadium-effect';
    default:
      return action;
  }
}

/**
 * @param {{ player: 'self'|'opp', action: string, parameters?: any[], counters?: { self?: number, opp?: number }, turn?: number, extra?: object }} payload
 */
export function logDecisionEntry(payload) {
  if (!isDecisionLogEnabled()) return;

  const entry = {
    seq: ++seq,
    t: Date.now(),
    player: payload.player,
    action: payload.action,
    summary: summarizeDecision(payload.action, payload.parameters),
    selfCounter: payload.counters?.self ?? null,
    oppCounter: payload.counters?.opp ?? null,
    turn: payload.turn ?? null,
    detail: payload.extra ?? {},
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  const tag = `[decision ${entry.seq} ${entry.player}]`;
  console.info(`${tag} ${entry.action}: ${entry.summary}`);
}

export function clearDecisionLog() {
  seq = 0;
  entries.length = 0;
}

export function getDecisionLogEntries() {
  return [...entries];
}

function formatDecisionCompareLine(who, entry) {
  const ctr = `s${entry.selfCounter ?? '?'}/o${entry.oppCounter ?? '?'}`;
  const turn = entry.turn != null ? `t${entry.turn}` : 't?';
  return `${who}\t${entry.seq}\t${entry.player}\t${ctr}\t${turn}\t${entry.action}\t${entry.summary}`;
}

/**
 * @param {{ username?: string, roomId?: string, socketId?: string }} meta
 */
export function buildDecisionLogExport(meta = {}, entryList = getDecisionLogEntries()) {
  const snapshot = {
    meta: { exportedAt: new Date().toISOString(), ...meta },
    entries: [...entryList],
  };
  return {
    ...snapshot,
    compareHeader: 'client\tseq\tplayer\tcounters\tturn\taction\tsummary',
    compareLines: snapshot.entries.map((e) =>
      formatDecisionCompareLine(meta.username || '?', e)
    ),
  };
}

/**
 * Merge local + remote decision log exports into one timeline.
 * @param {ReturnType<typeof buildDecisionLogExport>} localExport
 * @param {ReturnType<typeof buildDecisionLogExport>[]} remoteExports
 */
export function buildCombinedDecisionLogExport(localExport, remoteExports = []) {
  const clients = [localExport, ...remoteExports.filter(Boolean)];
  const timeline = [];

  for (const client of clients) {
    const who = client.meta?.username || client.meta?.socketId || '?';
    for (const entry of client.entries || []) {
      timeline.push({
        t: entry.t,
        who,
        entry,
        compareLine: formatDecisionCompareLine(who, entry),
      });
    }
  }

  timeline.sort((a, b) => a.t - b.t || String(a.who).localeCompare(String(b.who)));

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      combined: true,
      roomId: localExport.meta?.roomId || remoteExports[0]?.meta?.roomId || '',
      requester: localExport.meta?.username,
      clients: clients.map((c) => c.meta),
    },
    clients,
    compareHeader: 'client\tseq\tplayer\tcounters\tturn\taction\tsummary',
    compareLines: timeline.map((row) => row.compareLine),
    timeline: timeline.map(({ t, who, entry }) => ({
      t,
      who,
      seq: entry.seq,
      player: entry.player,
      selfCounter: entry.selfCounter,
      oppCounter: entry.oppCounter,
      turn: entry.turn,
      action: entry.action,
      summary: entry.summary,
    })),
  };
}
