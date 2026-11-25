// What every server-side proxy to a third-party host needs: a cap on requests in flight, a cap on how
// much of a body is read, and a log that stays quiet through a long outage.

export class BodyTooLargeError extends Error {}

/**
 * The response body as a Buffer, refused as soon as it passes `maxBytes`, whether or not the upstream
 * declared a length.
 * @param {Response} response
 * @param {number} maxBytes
 * @throws {BodyTooLargeError}
 */
export async function readCapped(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(`${declared} bytes, over ${maxBytes}`);
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new BodyTooLargeError(`over ${maxBytes} bytes`);
    return buffer;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(`over ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * A FIFO limiter. A finished task hands its slot straight to the next waiter without freeing it, so a
 * newcomer can never slip in between and push `active` past `limit`.
 * @param {number} limit tasks running at once
 * @param {{ maxWaiting?: number }} [options] queue length at which `saturated()` turns true
 * @returns {{ run: <T>(task: () => Promise<T>) => Promise<T>, saturated: () => boolean }}
 */
export function createLimiter(limit, { maxWaiting = Infinity } = {}) {
  let active = 0;
  const waiting = [];
  async function run(task) {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  }
  return { run, saturated: () => active >= limit && waiting.length >= maxWaiting };
}

/**
 * Logs a failure once per `kind` until `recovered` is called, so an outage writes one line, not one per request.
 * @param {(line: string) => void} log
 */
export function createFailureLog(log) {
  let current = null;
  return {
    failed(kind, line) {
      if (current === kind) return;
      current = kind;
      log(line);
    },
    recovered(line) {
      if (current === null) return;
      current = null;
      log(line);
    },
  };
}
