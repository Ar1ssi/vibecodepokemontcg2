// Design 087: first module on the page. Installs every capture, then taps the app socket.
import { log, clientRing, clientId, loadId, logStats, onEntry } from './client-log.js';
import { installConsoleCapture } from './capture-console.js';
import { installErrorCapture } from './capture-errors.js';
import { installInputCapture } from './capture-input.js';
import { installNetCapture } from './capture-net.js';
import { installPerfCapture } from './capture-perf.js';
import { installAppEventCapture } from './capture-app.js';
import { tapClientSocket } from './capture-socket.js';
import { startShipping } from './ship.js';
import { initExport, exportFullLog, markMoment } from './export-ui.js';

const originalConsoleError = console.error.bind(console);

try {
  installConsoleCapture({ log });
  installErrorCapture({ log });
  installInputCapture({ log });
  installNetCapture({ log, clientId });
  installPerfCapture({ log, ring: clientRing });
  installAppEventCapture({ log });

  log.info('boot', 'page', {
    url: location.pathname + location.search,
    build: window.__PTCG_BUILD ?? null,
    ua: navigator.userAgent,
    w: innerWidth,
    h: innerHeight,
    dpr: devicePixelRatio,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibility: document.visibilityState,
    e2e: Boolean(window.__PTCG_E2E_ALLOWED),
  });

  window.__ptcgLog = {
    stats: logStats,
    entries: () => clientRing.toArray().map((e) => e.line),
    level: (lvl) => {
      if (lvl) log.setLevel(lvl);
      return log.level();
    },
    mark: (note) => log.info('user', 'mark', { note: String(note ?? '').slice(0, 500) }),
  };

  if (typeof globalThis.io === 'function') {
    import('../state.js')
      .then(({ socket }) => {
        tapClientSocket(socket, { log });
        const shipping = startShipping({ socket, log, ring: clientRing, onEntry, clientId, loadId });
        window.__ptcgLog.ship = shipping.state;
        window.__ptcgLog.flush = shipping.flushNow;
        initExport({ socket, shipping, log });
        window.__ptcgLog.export = exportFullLog;
        window.__ptcgLog.mark = markMoment;
      })
      .catch((error) => log.warn('log', 'socket.tap.failed', { error }));
  } else {
    initExport({ log });
    window.__ptcgLog.export = exportFullLog;
    window.__ptcgLog.mark = markMoment;
  }
} catch (error) {
  originalConsoleError('[log] boot failed', error);
}
