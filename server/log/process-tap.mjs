// Mirrors console output, uncaught exceptions and process warnings into the log. Observes only:
// the monitor event never changes crash behavior.
import { wrapConsole } from '../../shared/log/console-wrap.mjs';

export function installProcessTap({ log, diskSink = null, consoleRef = console, processRef = process }) {
  const restoreConsole = wrapConsole(consoleRef, log);

  const onFatal = (err, origin) => {
    try {
      log.error('process', 'uncaught', { error: err, origin });
    } catch {
      // keep going: the stderr line below is the record that survives
    }
    try {
      diskSink?.flushSync();
    } catch {
      // disk is best effort
    }
    try {
      processRef.stderr.write(
        `${JSON.stringify({ fatal: true, t: Date.now(), name: err?.name, message: err?.message, stack: err?.stack })}\n`
      );
    } catch {
      // nothing left to report to
    }
  };
  const onWarning = (warning) => log.warn('process', 'warning', { warning });

  processRef.on('uncaughtExceptionMonitor', onFatal);
  processRef.on('warning', onWarning);

  return function uninstall() {
    processRef.removeListener('uncaughtExceptionMonitor', onFatal);
    processRef.removeListener('warning', onWarning);
    restoreConsole();
  };
}
