import { wrapConsole } from '../../../shared/log/console-wrap.mjs';

export function installConsoleCapture({ log, consoleRef = console }) {
  return wrapConsole(consoleRef, log);
}
