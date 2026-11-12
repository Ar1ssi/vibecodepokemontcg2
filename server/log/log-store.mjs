// In-memory log streams (`server`, `room:<id>`, `client:<id>`), each a capped ring, plus the
// client-to-room participant links. `sweep()` enforces retention and the total memory cap.
import { createRing } from '../../shared/log/ring.mjs';
import { LIMITS } from '../../shared/log/log-schema.mjs';

const MAX_ENTRIES = 1_000_000;
const MAX_TRIM_ROUNDS = 64;
const ROOM_PREFIX = 'room:';

function capFor(streamId, limits) {
  if (streamId.startsWith(ROOM_PREFIX)) return limits.roomStreamBytes;
  if (streamId.startsWith('client:')) return limits.clientStreamBytes;
  return limits.serverStreamBytes;
}

export function createLogStore({
  now = Date.now,
  limits = LIMITS,
  totalBytes = LIMITS.totalBytesDefault,
  sink = null,
} = {}) {
  const streams = new Map();
  const links = new Map(); // roomId -> Map(clientId -> participant row)

  function open(streamId) {
    let s = streams.get(streamId);
    if (!s) {
      s = {
        id: streamId,
        ring: createRing({ maxBytes: capFor(streamId, limits), maxEntries: MAX_ENTRIES }),
        meta: {},
        closedAt: null,
        lastAt: now(),
      };
      streams.set(streamId, s);
    }
    return s;
  }

  function deleteStream(streamId) {
    streams.delete(streamId);
    if (streamId.startsWith(ROOM_PREFIX)) links.delete(streamId.slice(ROOM_PREFIX.length));
  }

  const totalSize = () => {
    let sum = 0;
    for (const s of streams.values()) sum += s.ring.bytes();
    return sum;
  };

  function oldestClosed() {
    let oldest = null;
    for (const s of streams.values()) {
      if (s.closedAt !== null && (oldest === null || s.closedAt < oldest.closedAt)) oldest = s;
    }
    return oldest;
  }

  function largestTrimmable() {
    let largest = null;
    for (const s of streams.values()) {
      if (s.closedAt !== null || s.ring.size() <= 1) continue;
      if (largest === null || s.ring.bytes() > largest.ring.bytes()) largest = s;
    }
    return largest;
  }

  return {
    append(streamId, { seq, t, ts = t, lvl, line, load, diskLine }) {
      const s = open(streamId);
      s.ring.push(load === undefined ? { seq, t, ts, lvl, line } : { seq, t, ts, lvl, line, load });
      s.lastAt = now();
      s.closedAt = null;
      if (!sink) return;
      try {
        sink.write(streamId, diskLine ?? line);
      } catch {
        // disk mirroring is best effort; memory logging continues
      }
    },
    stream(streamId) {
      const s = streams.get(streamId);
      if (!s) return null;
      return {
        id: s.id,
        entries: () => s.ring.toArray(),
        bytes: s.ring.bytes(),
        size: s.ring.size(),
        dropped: s.ring.dropped(),
        firstSeq: s.ring.firstSeq(),
        meta: s.meta,
        closedAt: s.closedAt,
        lastAt: s.lastAt,
      };
    },
    setMeta(streamId, meta) {
      const s = open(streamId);
      s.meta = { ...s.meta, ...meta };
    },
    link(clientId, roomId, who = {}) {
      let room = links.get(roomId);
      if (!room) {
        room = new Map();
        links.set(roomId, room);
      }
      const row = room.get(clientId);
      if (row) {
        Object.assign(row, who, { leftAt: null });
        return;
      }
      room.set(clientId, { clientId, ...who, joinedAt: now(), leftAt: null });
    },
    unlink(clientId, roomId) {
      const row = links.get(roomId)?.get(clientId);
      if (row) row.leftAt = now();
    },
    participants(roomId) {
      return [...(links.get(roomId)?.values() ?? [])].map((row) => ({ ...row }));
    },
    close(streamId) {
      const s = streams.get(streamId);
      if (s) s.closedAt = now();
    },
    sweep() {
      const result = { expired: [], evicted: [], trimmed: [] };
      const at = now();
      for (const s of [...streams.values()]) {
        if (s.closedAt !== null && at - s.closedAt > limits.retainClosedMs) {
          deleteStream(s.id);
          result.expired.push(s.id);
        }
      }
      while (totalSize() > totalBytes) {
        const victim = oldestClosed();
        if (!victim) break;
        deleteStream(victim.id);
        result.evicted.push(victim.id);
      }
      for (let round = 0; round < MAX_TRIM_ROUNDS && totalSize() > totalBytes; round++) {
        const victim = largestTrimmable();
        if (!victim) break;
        victim.ring.dropOldest(Math.ceil(victim.ring.size() / 4));
        if (!result.trimmed.includes(victim.id)) result.trimmed.push(victim.id);
      }
      return result;
    },
    stats() {
      const byStream = [...streams.values()].map((s) => ({
        id: s.id,
        bytes: s.ring.bytes(),
        size: s.ring.size(),
        dropped: s.ring.dropped(),
        closedAt: s.closedAt,
      }));
      return { streams: byStream.length, bytes: totalSize(), byStream };
    },
  };
}
