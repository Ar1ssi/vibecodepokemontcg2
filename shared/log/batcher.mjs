// Decides when and what to ship (design 087 §5). Pure: the caller supplies the clock and the ring.
import { LIMITS } from './log-schema.mjs';

export function createBatcher({ limits = LIMITS } = {}) {
  let lastSeq = 0;
  let ackedSeq = 0;
  let firstPendingAt = 0;
  let errorAt = null;
  let connected = false;
  let inFlight = false;
  let backoffUntil = 0;
  let forced = false;

  const pending = () => Math.max(0, lastSeq - ackedSeq);

  return {
    note({ seq, lvl }, nowMs) {
      const hadPending = pending() > 0;
      lastSeq = seq;
      if (!hadPending) firstPendingAt = nowMs;
      if (lvl === 'error' && errorAt === null) errorAt = nowMs;
    },
    pending,
    due(nowMs) {
      if (!connected || inFlight || nowMs < backoffUntil || pending() === 0) return false;
      return (
        forced ||
        nowMs - firstPendingAt >= limits.batchFlushMs ||
        pending() >= limits.batchMaxLines ||
        (errorAt !== null && nowMs - errorAt >= limits.errorFlushMs)
      );
    },
    take(ring) {
      if (!connected || inFlight) return null;
      const entries = ring.since(ackedSeq).slice(0, limits.batchMaxLines);
      if (entries.length === 0) {
        ackedSeq = lastSeq;
        return null;
      }
      let count = 0;
      let bytes = 0;
      for (const entry of entries) {
        bytes += entry.line.length;
        if (count > 0 && bytes > limits.batchMaxBytes) break;
        count += 1;
      }
      const batch = entries.slice(0, count);
      inFlight = true;
      forced = false;
      errorAt = null;
      return { lines: batch.map((e) => e.line), from: batch[0].seq, to: batch[count - 1].seq };
    },
    acked(seq, nowMs) {
      ackedSeq = Math.max(ackedSeq, seq);
      inFlight = false;
      if (pending() > 0) firstPendingAt = nowMs;
    },
    failed(reason, nowMs) {
      inFlight = false;
      backoffUntil = nowMs + (reason === 'rate' ? limits.rateBackoffMs : limits.batchFlushMs);
    },
    onConnect(serverAckedSeq = 0) {
      connected = true;
      ackedSeq = Math.max(ackedSeq, serverAckedSeq);
      inFlight = false;
    },
    onDisconnect() {
      connected = false;
      inFlight = false;
    },
    force() {
      forced = true;
    },
    unacked(ring, maxBytes) {
      const lines = [];
      let bytes = 0;
      for (const entry of ring.since(ackedSeq)) {
        bytes += entry.line.length;
        if (bytes > maxBytes) break;
        lines.push(entry.line);
      }
      return lines;
    },
    state: () => ({ acked: ackedSeq, lastSeq, pending: pending(), connected, inFlight, backoffUntil }),
  };
}
