import { describeElement } from '../../../shared/log/describe-element.mjs';

// The renderer string of the first WebGL context the page itself created. Read there, so a
// snapshot never has to create a context of its own (slow under software GL).
let gpuRenderer = null;

export function getGpuRenderer() {
  return gpuRenderer;
}

function readRenderer(gl) {
  const info = gl.getExtension?.('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
}

function wrapGetContext(win, log) {
  const proto = win.HTMLCanvasElement?.prototype;
  if (!proto || typeof proto.getContext !== 'function') return () => {};
  const original = proto.getContext;
  const seen = new WeakSet();
  proto.getContext = function getContext(type, ...rest) {
    const result = original.call(this, type, ...rest);
    try {
      if (String(type).startsWith('webgl')) {
        const el = describeElement(this);
        if (result === null) {
          log.warn('fx', 'gl.context.failed', { type, el });
        } else if (!seen.has(this)) {
          seen.add(this);
          if (gpuRenderer === null) gpuRenderer = readRenderer(result);
          log.debug('fx', 'gl.context', { type, el, w: this.width, h: this.height, gpu: gpuRenderer });
          this.addEventListener?.('webglcontextlost', () => log.warn('fx', 'gl.context.lost', { el }));
          this.addEventListener?.('webglcontextrestored', () => log.info('fx', 'gl.context.restored', { el }));
        }
      }
    } catch {
      // capture must never throw into the page
    }
    return result;
  };
  return () => {
    if (proto.getContext !== original) proto.getContext = original;
  };
}

export function installErrorCapture({ log, win = window }) {
  const onError = (event) => {
    try {
      if ('error' in event || typeof event.message === 'string') {
        log.error('error', 'uncaught', {
          message: event.message,
          source: event.filename,
          line: event.lineno,
          col: event.colno,
          error: event.error,
        });
        return;
      }
      const target = event.target;
      if (!target || typeof target.tagName !== 'string') return;
      log.warn('net', 'resource.failed', {
        tag: target.tagName.toLowerCase(),
        src: String(target.src || target.href || '').slice(0, 300),
        el: describeElement(target),
      });
    } catch {
      // swallow
    }
  };
  const onRejection = (event) => {
    try {
      log.error('error', 'unhandledrejection', { reason: event.reason });
    } catch {
      // swallow
    }
  };
  const onCsp = (event) => {
    try {
      log.warn('error', 'csp', { directive: event.violatedDirective, blocked: event.blockedURI });
    } catch {
      // swallow
    }
  };
  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onRejection);
  win.addEventListener('securitypolicyviolation', onCsp);
  const restoreGetContext = wrapGetContext(win, log);
  return () => {
    win.removeEventListener('error', onError, true);
    win.removeEventListener('unhandledrejection', onRejection);
    win.removeEventListener('securitypolicyviolation', onCsp);
    restoreGetContext();
  };
}
