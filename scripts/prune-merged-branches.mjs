#!/usr/bin/env node
// Prune remote branches whose every commit is already on the base branch (ancestors of
// <remote>/<base>). Squash-merged branches are not ancestors and are left alone on purpose.
//
// Usage: node scripts/prune-merged-branches.mjs [--remote origin] [--base main]
//          [--keep a,b] [--keep-file path] [--yes]
// Without --yes it only prints the candidates (dry run). Open pull-request heads and bases are
// kept automatically when `gh pr list` works; otherwise pass them with --keep/--keep-file.
// Deleting needs push rights on the remote: cloud sessions are limited to their own branch, so
// run this from a normal checkout (design 073, prior audit E1).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHUNK = 40;

export function selectPrunable({ remoteBranches, mergedBranches, keep = [], base, current }) {
  const keepSet = new Set([...keep, base, current].filter(Boolean));
  const merged = new Set(mergedBranches);
  return remoteBranches.filter((branch) => merged.has(branch) && !keepSet.has(branch));
}

export function parseArgs(argv) {
  const options = { remote: 'origin', base: 'main', keep: [], yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes') options.yes = true;
    else if (arg === '--remote') options.remote = argv[++i];
    else if (arg === '--base') options.base = argv[++i];
    else if (arg === '--keep') options.keep.push(...splitList(argv[++i]));
    else if (arg === '--keep-file') options.keep.push(...splitList(readFileSync(argv[++i], 'utf8')));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function splitList(text) {
  return String(text || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function listRemoteBranches(remote) {
  return git(['ls-remote', '--heads', remote])
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/heads\//, ''));
}

function listMergedBranches(remote, base) {
  const prefix = `${remote}/`;
  return git(['branch', '-r', '--merged', `${remote}/${base}`])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix) && !line.includes(' -> '))
    .map((line) => line.slice(prefix.length));
}

function openPullRequestRefs() {
  try {
    const json = execFileSync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '500', '--json', 'headRefName,baseRefName'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const refs = new Set();
    for (const pr of JSON.parse(json)) {
      if (pr.headRefName) refs.add(pr.headRefName);
      if (pr.baseRefName) refs.add(pr.baseRefName);
    }
    return { refs: [...refs], ok: true };
  } catch {
    return { refs: [], ok: false };
  }
}

function summarize(branches) {
  const byPrefix = new Map();
  for (const branch of branches) {
    const prefix = branch.includes('/') ? branch.split('/')[0] : '(none)';
    byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + 1);
  }
  return [...byPrefix.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([prefix, count]) => `${String(count).padStart(5)}  ${prefix}`)
    .join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  git(['fetch', '--prune', options.remote], { stdio: 'ignore' });
  const current = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const openPrs = openPullRequestRefs();
  if (!openPrs.ok) {
    console.warn('warning: `gh pr list` unavailable; open pull-request branches are NOT excluded. Pass --keep/--keep-file.');
  }
  const candidates = selectPrunable({
    remoteBranches: listRemoteBranches(options.remote),
    mergedBranches: listMergedBranches(options.remote, options.base),
    keep: [...options.keep, ...openPrs.refs],
    base: options.base,
    current,
  });
  console.log(`${candidates.length} remote branch(es) fully contained in ${options.remote}/${options.base}:`);
  console.log(summarize(candidates));
  for (const branch of candidates) console.log(`  ${branch}`);
  if (!options.yes) {
    console.log('\nDry run. Re-run with --yes to delete them on the remote.');
    return;
  }
  let deleted = 0;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    git(['push', options.remote, '--delete', ...chunk], { stdio: ['ignore', 'ignore', 'inherit'] });
    deleted += chunk.length;
    console.log(`deleted ${deleted}/${candidates.length}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
