// Mirrors log lines to `<dir>/<bootId>/<stream>.ndjson`, buffered and flushed on a timer.
// Failure of any kind disables that stream only; it never throws into the logger.
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from '../../shared/log/log-schema.mjs';

export function resolveLogDir(env, repoRoot) {
  if (env.LOG_DIR === 'off') return null;
  if (typeof env.LOG_DIR === 'string' && env.LOG_DIR !== '') return path.resolve(repoRoot, env.LOG_DIR);
  return env.NODE_ENV !== 'production' ? path.join(repoRoot, 'out', 'logs') : null;
}

const fileNameOf = (streamId) => `${streamId.replace(/[^A-Za-z0-9._-]/g, '_')}.ndjson`;

function pruneOldBoots(dir, bootId, keep, fsRef) {
  try {
    const boots = fsRef
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== bootId)
      .map((d) => ({ name: d.name, mtimeMs: fsRef.statSync(path.join(dir, d.name)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const old of boots.slice(Math.max(0, keep - 1))) {
      fsRef.rmSync(path.join(dir, old.name), { recursive: true, force: true });
    }
  } catch {
    // pruning is housekeeping; ignore failures
  }
}

export function createDiskSink({
  dir,
  bootId,
  limits = LIMITS,
  fsRef = fs,
  onWarn = () => {},
  setIntervalRef = setInterval,
}) {
  const bootDir = path.join(dir, bootId);
  const streams = new Map(); // streamId -> { file, buffer: string[], written, disabled }
  let allDisabled = false;

  function warn(info) {
    try {
      onWarn(info);
    } catch {
      // a throwing warn hook must not break logging
    }
  }

  try {
    fsRef.mkdirSync(bootDir, { recursive: true });
    pruneOldBoots(dir, bootId, limits.diskKeepBoots, fsRef);
  } catch (err) {
    allDisabled = true;
    warn({ streamId: '*', reason: err?.message ?? String(err) });
  }

  // `disabled` stops new writes; `failed` also stops flushing (a size-capped file still gets its last buffer).
  function disable(s, streamId, reason, { failed }) {
    s.disabled = true;
    if (failed) {
      s.failed = true;
      s.buffer = [];
    }
    warn({ streamId, reason });
  }

  function flushStream(streamId, s, append) {
    if (s.failed || s.buffer.length === 0) return;
    const text = `${s.buffer.join('\n')}\n`;
    s.buffer = [];
    try {
      append(s.file, text);
    } catch (err) {
      disable(s, streamId, err?.message ?? String(err), { failed: true });
    }
  }

  function flushAll(append) {
    for (const [streamId, s] of streams) flushStream(streamId, s, append);
  }

  const timer = allDisabled
    ? null
    : setIntervalRef(() => {
        flushAll((file, text) => {
          // The async append reports failure through its callback; a failure disables the stream.
          fsRef.appendFile(file, text, (err) => {
            if (!err) return;
            const entry = [...streams.entries()].find(([, s]) => s.file === file);
            if (entry && !entry[1].failed) disable(entry[1], entry[0], err.message, { failed: true });
          });
        });
      }, limits.diskFlushMs);
  if (typeof timer?.unref === 'function') timer.unref();

  function flushSync() {
    if (allDisabled) return;
    flushAll((file, text) => fsRef.appendFileSync(file, text));
  }

  return {
    dir: bootDir,
    write(streamId, line) {
      if (allDisabled) return;
      let s = streams.get(streamId);
      if (!s) {
        s = { file: path.join(bootDir, fileNameOf(streamId)), buffer: [], written: 0, disabled: false, failed: false };
        streams.set(streamId, s);
      }
      if (s.disabled) return;
      const bytes = Buffer.byteLength(line) + 1;
      if (s.written + bytes > limits.diskFileBytes) {
        disable(s, streamId, 'size', { failed: false });
        return;
      }
      s.written += bytes;
      s.buffer.push(line);
    },
    flushSync,
    close() {
      if (timer) clearInterval(timer);
      flushSync();
    },
  };
}
