// Byte- and count-capped ring of log lines. Array + head index: O(1) amortized, no splice.
const COMPACT_MIN_HEAD = 1024;

export function createRing({ maxBytes, maxEntries }) {
  let entries = [];
  let head = 0;
  let bytes = 0;
  let dropped = 0;

  const size = () => entries.length - head;

  function evictHead() {
    bytes -= entries[head].line.length;
    entries[head] = undefined;
    head++;
    dropped++;
    if (head > COMPACT_MIN_HEAD && head > entries.length / 2) {
      entries = entries.slice(head);
      head = 0;
    }
  }

  return {
    push(entry) {
      entries.push(entry);
      bytes += entry.line.length;
      while (size() > 1 && (bytes > maxBytes || size() > maxEntries)) evictHead();
    },
    /** Evicts up to `count` of the oldest entries (the store's memory sweep); counted as dropped. */
    dropOldest(count) {
      let left = Math.min(Math.max(0, Math.floor(count) || 0), size());
      while (left > 0) {
        evictHead();
        left -= 1;
      }
    },
    since(seq) {
      return entries.slice(head).filter((e) => e.seq > seq);
    },
    toArray: () => entries.slice(head),
    bytes: () => bytes,
    size,
    dropped: () => dropped,
    firstSeq: () => (size() === 0 ? null : entries[head].seq),
    clear() {
      entries = [];
      head = 0;
      bytes = 0;
      dropped = 0;
    },
  };
}
