// Mirrors console output into a logger. The original method always runs first, so the
// console itself never changes; a log call made while one is being recorded is not re-recorded.
const LEVEL_OF = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };

/**
 * @param {Console} consoleRef the console to wrap (injected so tests pass a stub)
 * @param {{ log: Function }} logger a `createLogger` logger
 * @returns {() => void} restores the original methods
 */
export function wrapConsole(consoleRef, logger) {
  if (!consoleRef || typeof logger?.log !== 'function') return () => {};
  const originals = {};
  let recording = false;

  for (const [method, level] of Object.entries(LEVEL_OF)) {
    const original = consoleRef[method];
    if (typeof original !== 'function') continue;
    originals[method] = original;
    consoleRef[method] = function wrappedConsoleMethod(...args) {
      original.apply(this, args);
      if (recording) return;
      recording = true;
      try {
        logger.log(level, 'console', method, { args });
      } finally {
        recording = false;
      }
    };
  }

  return () => {
    for (const [method, original] of Object.entries(originals)) consoleRef[method] = original;
  };
}
