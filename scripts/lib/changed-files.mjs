// Files this branch changed relative to a base branch: commits since the merge-base, plus staged,
// unstaged and untracked files. Shared by `pnpm test:changed` and `pnpm gates`, so both agree on
// what "changed" means.
import { spawnSync } from 'node:child_process';

export function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`
    );
  }
  return result.stdout.trim();
}

function lines(text) {
  return text ? text.split('\n').filter(Boolean) : [];
}

// File text at a revision, or null when the file does not exist there.
export function fileAt(revision, file) {
  const result = spawnSync('git', ['show', `${revision}:${file}`], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout : null;
}

export function changedFiles(baseBranch) {
  const base = git(['merge-base', 'HEAD', baseBranch]);
  return [
    ...lines(git(['diff', '--name-only', base, 'HEAD'])),
    ...lines(git(['diff', '--name-only', 'HEAD'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard'])),
  ];
}
