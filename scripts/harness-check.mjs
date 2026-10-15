// `pnpm harness:check`: measures the agent harness against the budgets in
// .agent/workflows/maintain.md and exits 1 when any is OVER. The last row is
// the maintenance trigger: 30 commits since the last `maintain:` commit.
// Measuring is pure (measureHarness, evaluateCommits); main() only adds git
// and printing, so the checks run against fixture directories in tests.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CAPS = {
  stateLines: 25,
  mapLines: 120,
  projectLines: 80,
  nextstepsLines: 60,
  areaLines: 60,
  decisionsLines: 90,
  decisionsBytes: 20 * 1024,
  decisionLineChars: 220,
  issuesOpen: 40,
  issuesClosed: 30,
  issueLineChars: 300,
  commitsSinceMaintain: 30,
};

const MAINTAIN_SUBJECT_PREFIX = 'maintain:';

export function countLines(text) {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function row(name, value, cap) {
  return { name, value, cap, status: value > cap ? 'OVER' : 'OK' };
}

function missingRow(name, cap) {
  return { name, value: 'missing', cap, status: 'OVER' };
}

function longestChars(lines) {
  return lines.reduce((max, line) => Math.max(max, [...line].length), 0);
}

function lineCountRow(name, text, cap) {
  return text === null
    ? missingRow(name, cap)
    : row(name, countLines(text), cap);
}

function decisionRows(text) {
  const name = 'DECISIONS.md';
  if (text === null) {
    return [
      missingRow(`${name} "- D" lines`, CAPS.decisionsLines),
      missingRow(`${name} bytes`, CAPS.decisionsBytes),
      missingRow(`${name} longest line`, CAPS.decisionLineChars),
    ];
  }
  const decisions = text.split('\n').filter((line) => /^- D\d/.test(line));
  return [
    row(`${name} "- D" lines`, decisions.length, CAPS.decisionsLines),
    row(`${name} bytes`, Buffer.byteLength(text), CAPS.decisionsBytes),
    row(
      `${name} longest line (chars)`,
      longestChars(decisions),
      CAPS.decisionLineChars
    ),
  ];
}

// ISSUES.md keeps `## Open` and `## Closed` sections of `- I<n> ...` lines.
function issueSections(text) {
  const sections = { open: [], closed: [] };
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## Open')) current = 'open';
    else if (line.startsWith('## Closed')) current = 'closed';
    else if (line.startsWith('## ')) current = null;
    else if (current && /^- I\d/.test(line)) sections[current].push(line);
  }
  return sections;
}

function issueRows(text) {
  const name = 'ISSUES.md';
  if (text === null) {
    return [
      missingRow(`${name} Open lines`, CAPS.issuesOpen),
      missingRow(`${name} Closed lines`, CAPS.issuesClosed),
      missingRow(`${name} longest line`, CAPS.issueLineChars),
    ];
  }
  const { open, closed } = issueSections(text);
  return [
    row(`${name} Open lines`, open.length, CAPS.issuesOpen),
    row(`${name} Closed lines`, closed.length, CAPS.issuesClosed),
    row(
      `${name} longest line (chars)`,
      longestChars([...open, ...closed]),
      CAPS.issueLineChars
    ),
  ];
}

function areaRows(areasDir) {
  if (!fs.existsSync(areasDir)) return [];
  return fs
    .readdirSync(areasDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) =>
      lineCountRow(
        `areas/${file} lines`,
        readText(path.join(areasDir, file)),
        CAPS.areaLines
      )
    );
}

// root = repository root (holds .agent/ and NEXTSTEPS.md).
export function measureHarness(root) {
  const agent = path.join(root, '.agent');
  const agentText = (file) => readText(path.join(agent, file));
  return [
    lineCountRow('STATE.md lines', agentText('STATE.md'), CAPS.stateLines),
    lineCountRow('MAP.md lines', agentText('MAP.md'), CAPS.mapLines),
    lineCountRow(
      'PROJECT.md lines',
      agentText('PROJECT.md'),
      CAPS.projectLines
    ),
    ...decisionRows(agentText('DECISIONS.md')),
    ...issueRows(agentText('ISSUES.md')),
    lineCountRow(
      'NEXTSTEPS.md lines',
      readText(path.join(root, 'NEXTSTEPS.md')),
      CAPS.nextstepsLines
    ),
    ...areaRows(path.join(agent, 'areas')),
  ];
}

// subjects: commit subjects, newest first. No maintain commit at all counts
// every commit as "since".
export function commitsSinceMaintain(subjects) {
  const index = subjects.findIndex((subject) =>
    subject.startsWith(MAINTAIN_SUBJECT_PREFIX)
  );
  return index === -1 ? subjects.length : index;
}

export function evaluateCommits(subjects) {
  const count = commitsSinceMaintain(subjects);
  return {
    name: `commits since last "${MAINTAIN_SUBJECT_PREFIX}"`,
    value: count,
    cap: CAPS.commitsSinceMaintain,
    status: count >= CAPS.commitsSinceMaintain ? 'OVER' : 'OK',
    strict: true,
  };
}

// null when git is unavailable or the directory is not a repository.
export function readSubjects(cwd) {
  const result = spawnSync('git', ['log', '--format=%s'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').filter(Boolean);
}

export function checkHarness({ root, subjects = null }) {
  const rows = measureHarness(root);
  if (subjects) rows.push(evaluateCommits(subjects));
  return { rows, ok: rows.every((entry) => entry.status !== 'OVER') };
}

export function formatTable(rows) {
  const nameWidth = Math.max(...rows.map((entry) => entry.name.length));
  const lines = rows.map((entry) => {
    const comparator = entry.strict ? '<' : '<=';
    return [
      entry.name.padEnd(nameWidth),
      String(entry.value).padStart(8),
      `${comparator} ${entry.cap}`.padStart(10),
      entry.status,
    ].join('  ');
  });
  const header = [
    'check'.padEnd(nameWidth),
    'value'.padStart(8),
    'cap'.padStart(10),
    'status',
  ].join('  ');
  return [header, ...lines].join('\n');
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const subjects = readSubjects(root);
  const { rows, ok } = checkHarness({ root, subjects });
  console.log(formatTable(rows));
  if (!subjects) console.log('(git unavailable: maintenance trigger skipped)');
  console.log(
    ok
      ? 'harness:check OK'
      : 'harness:check OVER: run .agent/workflows/maintain.md'
  );
  return ok ? 0 : 1;
}

const entryFile = process.argv[1] && path.resolve(process.argv[1]);
if (entryFile && import.meta.url === pathToFileURL(entryFile).href) {
  process.exitCode = main();
}
