import { describeElement } from '../../../shared/log/describe-element.mjs';

const SKIPPED = new Set(['board-view-applied']);

export function installAppEventCapture({ log, win = window }) {
  const proto = win.EventTarget?.prototype;
  if (!proto || typeof proto.dispatchEvent !== 'function') return () => {};
  const original = proto.dispatchEvent;
  const wrapper = function dispatchEventWithLog(event) {
    try {
      if (event instanceof win.CustomEvent && !SKIPPED.has(event.type)) {
        const target = this === win ? 'window' : this === win.document ? 'document' : describeElement(this);
        log.debug('app', event.type, { target, detail: event.detail });
      }
    } catch {
      // capture must never throw into the page
    }
    return original.call(this, event);
  };
  proto.dispatchEvent = wrapper;
  return () => {
    if (proto.dispatchEvent === wrapper) proto.dispatchEvent = original;
  };
}
