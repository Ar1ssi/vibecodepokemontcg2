#!/usr/bin/env node
// Agent CLI for unified logs (design 087 §7): node tools/log.mjs <command> [options] <file-or-dir>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyCommand, attackExtrasFor, costDiscountsFor } from '../shared/engine/reduce.mjs';
import { createRng } from '../shared/engine/rng.mjs';
import { hashState } from '../shared/engine/state.mjs';
import { viewFor } from '../shared/engine/view.mjs';
import {
  diffView,
  formatEntry,
  grepEntries,
  loadExport,
  parseCs,
  replayExport,
  selectAround,
  selectErrors,
  summarize,
  traceCommand,
} from './log-lib.mjs';

const LINE_CAP = 200;
const ENGINE = {
  applyCommand,
  createRng,
  hashState,
  viewFor,
  viewReaders: { attackExtrasFor, costDiscountsFor },
};

const USAGE = `usage: node tools/log.mjs <command> [options] <file-or-dir>

commands:
  summary                                  header, sources, counts, journal, first errors
  errors [--warn]                          every error entry (and warnings with --warn)
  around (--sv N | --cs [seat#]N | --ts T | --mark) [--window 5s|500ms]
                                           entries near an anchor (default window 5s)
  trace --cs [seat#]N                      one command: input, emit, server, engine, views, fx
  replay [--to SV] [--dump-state [path]]   re-run the journal and compare state hashes
  diff-view [--seat p1|p2]                 server view at the client's version vs the client's view
  grep [--cat X] [--ev Y] [--src S] [--lvl L] [--text T]
                                           filter timeline entries

global options:
  --all          no ${LINE_CAP}-line cap
  --room <id>    directory input: only that room's stream and journal
  --help         this text
`;

class UsageError extends Error {}

const VALUE_OPTIONS = new Set(['cs', 'sv', 'ts', 'window', 'to', 'seat', 'cat', 'ev', 'src', 'lvl', 'text', 'room']);
const FLAG_OPTIONS = new Set(['all', 'warn', 'mark', 'help']);

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (FLAG_OPTIONS.has(name)) options[name] = true;
    else if (VALUE_OPTIONS.has(name)) {
      if (i + 1 >= argv.length) throw new UsageError(`--${name} needs a value`);
      options[name] = argv[(i += 1)];
    } else if (name === 'dump-state') {
      // The path is optional, so a lone trailing argument is the input, not the path.
      const next = argv[i + 1];
      const targetFollows = positional.length >= 2 || argv.slice(i + 2).some((a) => !a.startsWith('--'));
      const takesPath = next !== undefined && !next.startsWith('--') && targetFollows;
      options[name] = takesPath ? argv[(i += 1)] : true;
    } else throw new UsageError(`unknown option ${arg}`);
  }
  return { options, command: positional[0], target: positional[1] };
}

function parseWindow(text) {
  if (text === undefined) return 5000;
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(text);
  if (!match) throw new UsageError(`bad --window "${text}" (use 5s or 500ms)`);
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

function parseInteger(text, name) {
  if (!/^-?\d+$/.test(String(text))) throw new UsageError(`--${name} needs an integer`);
  return Number(text);
}

function print(lines, all) {
  const shown = all ? lines : lines.slice(0, LINE_CAP);
  for (const line of shown) process.stdout.write(`${line}\n`);
  if (shown.length < lines.length) process.stdout.write(`… ${lines.length - shown.length} more lines (use --all)\n`);
}

const formatAll = (entries) => entries.map((e) => formatEntry(e, entries[0].ts));

function currentCommit() {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function buildNote(data) {
  const recorded = data.header?.build?.server;
  if (!recorded || recorded === 'unknown') return null;
  const current = currentCommit();
  if (!current || current === recorded) return null;
  return `note: log recorded on ${recorded.slice(0, 12)}, this checkout is ${current.slice(0, 12)} — a divergence may be a code change`;
}

function runReplay(data, options) {
  if (data.journal.length === 0) return { lines: ['no journal in this export'], code: 1 };
  const to = options.to === undefined ? Infinity : parseInteger(options.to, 'to');
  const result = replayExport(data, ENGINE, { to });
  const lines = [];
  const note = buildNote(data);
  if (note) lines.push(note);
  if (result.ok) lines.push(`OK ${result.commands} commands, 0 divergences`);
  else {
    const d = result.divergence;
    lines.push(`DIVERGED at game=${d.game} n=${d.n} (${d.kind}): expected ${JSON.stringify(d.expected)} actual ${JSON.stringify(d.actual)}`);
  }
  const dump = options['dump-state'];
  if (typeof dump === 'string') fs.writeFileSync(dump, JSON.stringify(result.state));
  else if (dump) lines.push(JSON.stringify(result.state));
  return { lines, code: result.ok ? 0 : 1 };
}

function runAround(data, options) {
  const anchors = ['sv', 'cs', 'ts'].filter((k) => options[k] !== undefined).length + (options.mark ? 1 : 0);
  if (anchors !== 1) throw new UsageError('around needs exactly one of --sv, --cs, --ts, --mark');
  const query = { windowMs: parseWindow(options.window), mark: Boolean(options.mark) };
  if (options.sv !== undefined) query.sv = parseInteger(options.sv, 'sv');
  if (options.ts !== undefined) query.ts = Number(options.ts);
  if (options.cs !== undefined) {
    query.cs = parseCs(options.cs);
    if (!query.cs) throw new UsageError(`bad --cs "${options.cs}" (use 41 or p1#41)`);
  }
  const result = selectAround(data, query);
  if (result.error) return { lines: [result.error], code: 1 };
  return { lines: result.entries.map((e) => formatEntry(e, result.anchorTs)), code: 0 };
}

function runTrace(data, options) {
  const cs = parseCs(options.cs);
  if (!cs) throw new UsageError('trace needs --cs [seat#]N');
  const result = traceCommand(data, cs);
  if (result.error) return { lines: [result.error], code: 1 };
  const lines = result.steps.map((e) => formatEntry(e, result.steps[0].ts));
  lines.push(`sv=${result.sv}`);
  return { lines, code: 0 };
}

function runDiffView(data, options) {
  if (options.seat && !['p1', 'p2'].includes(options.seat)) throw new UsageError('--seat must be p1 or p2');
  const checked = options.seat ? data.snaps.filter((s) => data.header?.sources?.some((x) => x.src === s.src && x.seat === options.seat)) : data.snaps;
  if (checked.length === 0) return { lines: ['no snapshots to check'], code: 1 };
  const findings = diffView(data, ENGINE, { seat: options.seat ?? null });
  if (findings.length === 0) return { lines: [`no differences (${checked.length} snapshots checked)`], code: 0 };
  const lines = findings.map((f) => {
    const detail = typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail);
    return `${f.src} seat=${f.seat} sv=${f.sv} ${f.kind} ${detail.length > 200 ? `${detail.slice(0, 200)}…` : detail}`;
  });
  return { lines, code: findings.every((f) => f.kind === 'skipped') ? 1 : 0 };
}

function runGrep(data, options) {
  const filters = { cat: options.cat, ev: options.ev, src: options.src, lvl: options.lvl, text: options.text };
  const entries = grepEntries(data, filters);
  return { lines: entries.length ? formatAll(entries) : ['no matching entries'], code: 0 };
}

function runErrors(data, options) {
  const entries = selectErrors(data, { warn: Boolean(options.warn) });
  return { lines: entries.length ? formatAll(entries) : ['no errors'], code: 0 };
}

const COMMANDS = {
  summary: (data) => ({ lines: summarize(data), code: 0 }),
  errors: runErrors,
  around: runAround,
  trace: runTrace,
  replay: runReplay,
  'diff-view': runDiffView,
  grep: runGrep,
};

function main(argv) {
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }
  const { options, command, target } = parseArgs(argv);
  if (!COMMANDS[command]) throw new UsageError(`unknown command "${command}" (try --help)`);
  if (!target) throw new UsageError(`${command} needs a file or directory`);
  let data;
  try {
    data = loadExport(target, { room: options.room });
  } catch (error) {
    throw new UsageError(`cannot read ${target}: ${error.message}`);
  }
  if (!data.header && data.timeline.length === 0 && data.journal.length === 0) {
    throw new UsageError(`${target} holds no log records`);
  }
  const { lines, code } = COMMANDS[command](data, options);
  print(lines, Boolean(options.all));
  return code;
}

// `| head` closes the pipe early; that is the reader's choice, not a failure.
process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') throw error;
});

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
