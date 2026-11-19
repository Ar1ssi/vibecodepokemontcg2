// Mirrors console output into a logger. The original method always runs first, so the
// console itself never changes; a log call made while one is being recorded is not re-recorded.
import { patchMethod } from './patch-method.mjs';

const LEVEL_OF = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };

/**
 * @param {Console} consoleRef the console to wrap (injected so tests pass a stub)
 * @param {{ log: Function }} logger a `createLogger` logger
 * @returns {() => void} restores the original methods
 */
export function wrapConsole(consoleRef, logger) {
  if (!consoleRef || typeof logger?.log !== 'function') return () => {};
  let recording = false;

  const uninstalls = Object.entries(LEVEL_OF).map(([method, level]) =>
    patchMethod(consoleRef, method, (original) =>
      function wrappedConsoleMethod(...args) {
        original.apply(this, args);
        if (recording) return;
        recording = true;
        try {
          logger.log(level, 'console', method, { args });
        } finally {
          recording = false;
        }
      }
    )
  );

  return () => {
    for (const uninstall of uninstalls) uninstall();
  };
}
