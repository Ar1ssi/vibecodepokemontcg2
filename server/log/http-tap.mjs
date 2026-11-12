// Express middleware: one log entry per finished response (level by status and cost).
const QUERY_MAX = 200;

function levelAndEvent(status, ms, path) {
  if (status >= 500) return ['error', 'req.failed'];
  if (status >= 400) return ['warn', 'req.failed'];
  const notable = ms >= 500 || (path.startsWith('/api/') && !path.startsWith('/api/log/'));
  return [notable ? 'debug' : 'trace', 'req'];
}

export function httpLog({ log, now = () => performance.now() }) {
  return function httpLogMiddleware(req, res, next) {
    const start = now();
    res.on('finish', () => {
      try {
        const url = String(req.originalUrl ?? req.url ?? '');
        const q = url.indexOf('?');
        const path = q === -1 ? url : url.slice(0, q);
        const ms = Math.round((now() - start) * 10) / 10;
        const status = res.statusCode;
        const detail = { method: req.method, path };
        if (q !== -1 && q < url.length - 1) detail.query = url.slice(q + 1, q + 1 + QUERY_MAX);
        detail.status = status;
        detail.ms = ms;
        detail.bytes = Number(res.getHeader('content-length')) || null;
        detail.client = req.get('x-ptcg-client') || null;
        const [lvl, ev] = levelAndEvent(status, ms, path);
        log[lvl]('http', ev, detail);
      } catch {
        // logging must never affect the response
      }
    });
    next();
  };
}
