const URL_MAX = 300;
const SLOW_MS = 1500;
const OWN_TRAFFIC = /\/socket\.io\/|\/api\/log\//;

function requestParts(input, win) {
  const raw = typeof input === 'string' ? input : (input?.url ?? String(input));
  const origin = win.location?.origin;
  let parsed;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return { url: String(raw).slice(0, URL_MAX), sameOrigin: false };
  }
  const sameOrigin = parsed.origin === origin;
  const url = sameOrigin ? (parsed.pathname + parsed.search).slice(0, URL_MAX) : parsed.origin + parsed.pathname;
  return { url, sameOrigin };
}

function wrapFetch(win, log, clientId) {
  const original = win.fetch;
  if (typeof original !== 'function') return () => {};
  const wrapper = function fetchWithLog(input, init) {
    let url = '';
    let method = 'GET';
    let args = [input, init];
    const startedAt = performance.now();
    try {
      const parts = requestParts(input, win);
      url = parts.url;
      method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
      const isRequest = typeof input !== 'string' && !(input instanceof URL);
      if (parts.sameOrigin && !isRequest) {
        const headers = new Headers(init?.headers);
        headers.set('x-ptcg-client', clientId);
        args = [input, { ...init, headers }];
      }
    } catch {
      // fall through with the untouched call
    }
    const promise = original.apply(this, args);
    return Promise.resolve(promise).then(
      (response) => {
        try {
          const ms = Math.round(performance.now() - startedAt);
          if (response?.ok) log.debug('net', 'fetch', { method, url, status: response.status, ms });
          else log.warn('net', 'fetch.failed', { method, url, status: response?.status, ms });
        } catch {
          // swallow
        }
        return response;
      },
      (error) => {
        try {
          log.warn('net', 'fetch.failed', { method, url, error, ms: Math.round(performance.now() - startedAt) });
        } catch {
          // swallow
        }
        throw error;
      },
    );
  };
  win.fetch = wrapper;
  return () => {
    if (win.fetch === wrapper) win.fetch = original;
  };
}

function observeResources(win, log) {
  const Observer = win.PerformanceObserver;
  if (typeof Observer !== 'function') return () => {};
  try {
    const observer = new Observer((list) => {
      for (const entry of list.getEntries()) {
        try {
          // The socket transport's long polls and the log's own beacon are not page resources.
          if (OWN_TRAFFIC.test(entry.name)) continue;
          const detail = { url: String(entry.name).slice(0, URL_MAX), ms: Math.round(entry.duration), type: entry.initiatorType };
          if (entry.duration > SLOW_MS) log.debug('net', 'resource.slow', detail);
          else log.trace('net', 'resource', detail);
        } catch {
          // swallow
        }
      }
    });
    observer.observe({ type: 'resource', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function installNetCapture({ log, win = window, clientId }) {
  const restoreFetch = wrapFetch(win, log, clientId);
  const stopObserving = observeResources(win, log);
  return () => {
    restoreFetch();
    stopObserving();
  };
}
