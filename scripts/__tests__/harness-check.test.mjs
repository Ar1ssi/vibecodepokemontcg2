import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPS,
  checkHarness,
  commitsSinceMaintain,
  countLines,
  evaluateCommits,
  formatTable,
  measureHarness,
} from '../harness-check.mjs';

function lines(count, make = (n) => `line ${n}`) {
  return Array.from({ length: count }, (_, i) => make(i + 1)).join('\n') + '\n';
}

function decisionLine(n, length = 100) {
  const head = `- D${n} 2026-10-15 [harness] `;
  return head + 'x'.repeat(length - head.length);
}

function issueLine(n, length = 100) {
  const head = `- I${n} 2026-10-15 P3 [repo] `;
  return head + 'x'.repeat(length - head.length);
}

// A harness fixture exactly at its caps; each test breaks one of them.
function buildFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'harness-check-'));
  const agent = join(root, '.agent');
  mkdirSync(join(agent, 'areas'), { recursive: true });
  const files = {
    'STATE.md': lines(CAPS.stateLines),
    'MAP.md': lines(CAPS.mapLines),
    'PROJECT.md': lines(CAPS.projectLines),
    'DECISIONS.md': `# header\n${lines(CAPS.decisionsLines, (n) => decisionLine(n))}`,
    'ISSUES.md': [
      '# header',
      '## Open (newest first)',
      ...Array.from({ length: CAPS.issuesOpen }, (_, i) => issueLine(i + 1)),
      '',
      '## Closed (newest first)',
      ...Array.from({ length: CAPS.issuesClosed }, (_, i) =>
        issueLine(i + 100)
      ),
      '',
    ].join('\n'),
    'areas/netcode.md': lines(CAPS.areaLines),
    ...overrides,
  };
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(agent, file), text);
  }
  writeFileSync(join(root, 'NEXTSTEPS.md'), lines(CAPS.nextstepsLines));
  return root;
}

function withFixture(overrides, run) {
  const root = buildFixture(overrides);
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rowNamed = (rows, name) => rows.find((entry) => entry.name === name);

test('countLines matches wc -l for newline-terminated files', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a\n'), 1);
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb'), 2);
});

test('a fixture exactly at every cap passes', () => {
  withFixture({}, (root) => {
    const { rows, ok } = checkHarness({ root, subjects: ['patch: x'] });
    assert.deepEqual(
      rows.filter((entry) => entry.status !== 'OK'),
      []
    );
    assert.equal(ok, true);
  });
});

test('one file over its cap fails and names the file', () => {
  withFixture({ 'STATE.md': lines(CAPS.stateLines + 1) }, (root) => {
    const { rows, ok } = checkHarness({ root });
    assert.equal(ok, false);
    assert.equal(rowNamed(rows, 'STATE.md lines').status, 'OVER');
    assert.equal(rowNamed(rows, 'MAP.md lines').status, 'OK');
  });
});

test('an area doc over 60 lines fails', () => {
  withFixture(
    { 'areas/rules-engine.md': lines(CAPS.areaLines + 1) },
    (root) => {
      const rows = measureHarness(root);
      assert.equal(
        rowNamed(rows, 'areas/rules-engine.md lines').status,
        'OVER'
      );
      assert.equal(rowNamed(rows, 'areas/netcode.md lines').status, 'OK');
    }
  );
});

test('too many "- D" lines or too many bytes fails DECISIONS.md', () => {
  const extra = `# header\n${lines(CAPS.decisionsLines + 1, (n) => decisionLine(n))}`;
  withFixture({ 'DECISIONS.md': extra }, (root) => {
    const rows = measureHarness(root);
    assert.equal(rowNamed(rows, 'DECISIONS.md "- D" lines').status, 'OVER');
  });
  const heavy = `# header\n${'#'.repeat(CAPS.decisionsBytes)}\n${decisionLine(1)}\n`;
  withFixture({ 'DECISIONS.md': heavy }, (root) => {
    const rows = measureHarness(root);
    assert.equal(rowNamed(rows, 'DECISIONS.md bytes').status, 'OVER');
    assert.equal(rowNamed(rows, 'DECISIONS.md "- D" lines').status, 'OK');
  });
});

test('DECISIONS.md lines are limited to 220 characters, counted as characters', () => {
  const name = 'DECISIONS.md longest line (chars)';
  const atCap = decisionLine(1, CAPS.decisionLineChars);
  withFixture({ 'DECISIONS.md': `# header\n${atCap}\n` }, (root) => {
    const row = rowNamed(measureHarness(root), name);
    assert.equal(row.value, 220);
    assert.equal(row.status, 'OK');
  });
  withFixture({ 'DECISIONS.md': `# header\n${atCap}x\n` }, (root) => {
    const row = rowNamed(measureHarness(root), name);
    assert.equal(row.value, 221);
    assert.equal(row.status, 'OVER');
  });
  const head = '- D1 2026-10-15 [rules] ';
  const accented =
    head + 'é—'.repeat((CAPS.decisionLineChars - head.length) / 2);
  assert.equal([...accented].length, CAPS.decisionLineChars);
  assert.ok(Buffer.byteLength(accented) > CAPS.decisionLineChars);
  withFixture({ 'DECISIONS.md': `# header\n${accented}\n` }, (root) => {
    assert.equal(rowNamed(measureHarness(root), name).status, 'OK');
  });
});

test('ISSUES.md counts Open and Closed apart and limits each line to 300 characters', () => {
  const issues = [
    '## Open',
    ...Array.from({ length: CAPS.issuesOpen + 1 }, (_, i) => issueLine(i + 1)),
    '## Closed',
    issueLine(500, CAPS.issueLineChars + 1),
    '',
  ].join('\n');
  withFixture({ 'ISSUES.md': issues }, (root) => {
    const rows = measureHarness(root);
    assert.equal(rowNamed(rows, 'ISSUES.md Open lines').status, 'OVER');
    assert.equal(rowNamed(rows, 'ISSUES.md Closed lines').value, 1);
    assert.equal(rowNamed(rows, 'ISSUES.md Closed lines').status, 'OK');
    const longest = rowNamed(rows, 'ISSUES.md longest line (chars)');
    assert.equal(longest.value, 301);
    assert.equal(longest.status, 'OVER');
  });
});

test('a missing harness file is OVER, not silently skipped', () => {
  withFixture({}, (root) => {
    rmSync(join(root, '.agent', 'PROJECT.md'));
    const { rows, ok } = checkHarness({ root });
    assert.equal(rowNamed(rows, 'PROJECT.md lines').status, 'OVER');
    assert.equal(ok, false);
  });
});

test('maintenance is due at 30 commits since the last maintain: commit', () => {
  const since = (count) => [
    ...Array.from({ length: count }, () => 'patch: change'),
    'maintain: sweep',
    'patch: older',
  ];
  assert.equal(commitsSinceMaintain(since(0)), 0);
  assert.equal(commitsSinceMaintain(since(29)), 29);
  assert.equal(evaluateCommits(since(29)).status, 'OK');
  assert.equal(evaluateCommits(since(30)).status, 'OVER');
  assert.equal(commitsSinceMaintain(['patch: a', 'merge: b']), 2);
});

test('the maintenance row fails the check and the table prints every row', () => {
  withFixture({}, (root) => {
    const subjects = Array.from({ length: 30 }, () => 'patch: change');
    const { rows, ok } = checkHarness({ root, subjects });
    assert.equal(ok, false);
    const table = formatTable(rows);
    assert.match(table, /STATE\.md lines\s+25\s+<= 25\s+OK/);
    assert.match(table, /commits since last "maintain:"\s+30\s+< 30\s+OVER/);
  });
});
