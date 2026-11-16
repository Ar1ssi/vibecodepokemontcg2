import { describeElement } from '../../../shared/log/describe-element.mjs';
import { describeKey, describeChange, eventTarget } from './input-filter.mjs';

const POINTER_EVENTS = ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'dragstart', 'dragend', 'drop'];
const TRACE_EVENTS = ['pointermove', 'dragover'];
const TRACE_GAP_MS = 100;
const RESIZE_DEBOUNCE_MS = 250;
const OPTS = { capture: true, passive: true };

export function installInputCapture({ log, win = window, doc = document }) {
  const removers = [];
  const safe = (fn) => (event) => {
    try {
      fn(event);
    } catch {
      // capture must never throw into the page
    }
  };
  const listen = (target, type, fn, opts = OPTS) => {
    const handler = safe(fn);
    target.addEventListener(type, handler, opts);
    removers.push(() => target.removeEventListener(type, handler, opts));
  };
  const pointerDetail = (e) => ({ el: describeElement(eventTarget(e)), x: Math.round(e.clientX), y: Math.round(e.clientY) });

  for (const type of POINTER_EVENTS) {
    listen(win, type, (e) => log.debug('input', type, { ...pointerDetail(e), button: e.button }));
  }
  for (const type of TRACE_EVENTS) {
    let last = -Infinity;
    listen(win, type, (e) => {
      if (!log.enabled('trace')) return;
      const nowMs = performance.now();
      if (nowMs - last < TRACE_GAP_MS) return;
      last = nowMs;
      log.trace('input', type, pointerDetail(e));
    });
  }
  listen(win, 'keydown', (e) => {
    if (e.repeat) return;
    log.debug('input', 'keydown', { ...describeKey(e), el: describeElement(eventTarget(e)) });
  });
  listen(win, 'change', (e) => {
    const target = eventTarget(e);
    log.debug('input', 'change', { el: describeElement(target), ...describeChange(target) });
  });
  listen(win, 'submit', (e) => log.debug('input', 'submit', { el: describeElement(eventTarget(e)) }));

  let resizeTimer = null;
  listen(win, 'resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try {
        log.debug('input', 'resize', { w: win.innerWidth, h: win.innerHeight, dpr: win.devicePixelRatio });
      } catch {
        // swallow
      }
    }, RESIZE_DEBOUNCE_MS);
  });
  removers.push(() => clearTimeout(resizeTimer));

  listen(doc, 'visibilitychange', () => log.info('input', 'visibility', { state: doc.visibilityState }), false);
  listen(win, 'focus', (e) => {
    if (e.target === win) log.debug('input', 'window.focus');
  });
  listen(win, 'blur', (e) => {
    if (e.target === win) log.debug('input', 'window.blur');
  });
  listen(win, 'online', () => log.info('net', 'online'), false);
  listen(win, 'offline', () => log.info('net', 'offline'), false);
  listen(
    win,
    'popstate',
    () => log.debug('input', 'popstate', { url: win.location.pathname + win.location.search }),
    false,
  );

  return () => {
    for (const remove of removers) remove();
  };
}
