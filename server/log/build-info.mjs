import { execFileSync } from 'node:child_process';

export function readBuild({ env = process.env, exec = execFileSync, cwd } = {}) {
  return { commit: readCommit(env, exec, cwd), node: process.version, startedAt: new Date().toISOString() };
}

function readCommit(env, exec, cwd) {
  if (env.RENDER_GIT_COMMIT) return env.RENDER_GIT_COMMIT;
  try {
    const out = exec('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}
