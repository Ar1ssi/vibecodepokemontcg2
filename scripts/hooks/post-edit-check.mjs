// Claude Code PostToolUse hook (Edit|Write): lints the edited JS file and runs its own test
// file, so the agent gets fast feedback without spending turns on it. Exit 2 = report the
// failure back to the agent; exit 0 = pass or nothing to check. The full suite
// (`pnpm test`) still runs once before commit — this hook only covers the touched file.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planPostEditChecks } from './post-edit-plan.mjs';

const REPORT_TAIL_LINES = 40;
const CHECK_TIMEOUT_MS = 90_000;

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function tail(text, lines) {
  return text.trim().split('\n').slice(-lines).join('\n');
}

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
  });
  if (result.error) return `${label}: could not run (${result.error.message})`;
  if (result.status === 0) return null;
  return `${label} failed:\n${tail(`${result.stdout}\n${result.stderr}`, REPORT_TAIL_LINES)}`;
}

function main() {
  const input = readHookInput();
  const filePath = input?.tool_input?.file_path;
  const repoRoot =
    process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  const plan = planPostEditChecks(filePath, repoRoot, existsSync);
  const failures = [];

  // Run eslint's own entry with node: no shell, no platform-specific .bin shims.
  const eslintEntry = path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (plan.lint && existsSync(eslintEntry)) {
    failures.push(run('eslint', process.execPath, [eslintEntry, '--quiet', plan.lint], repoRoot));
  }
  for (const testFile of plan.tests) {
    const label = `node --test ${path.relative(repoRoot, testFile)}`;
    failures.push(run(label, process.execPath, ['--test', testFile], repoRoot));
  }

  const report = failures.filter(Boolean).join('\n\n');
  if (!report) return 0;
  process.stderr.write(`${report}\n`);
  return 2;
}

process.exitCode = main();
