const LONGTASK_WARN_MS = 500;
const LONGTASK_DEBUG_MS = 100;
const JANK_GAP_MS = 250;
const SAMPLE_MS = 30000;

function observeLongTasks(win, log) {
  const Observer = win.PerformanceObserver;
  if (typeof Observer !== 'function' || !Observer.supportedEntryTypes?.includes('longtask')) return () => {};
  try {
    const observer = new Observer((list) => {
      for (const entry of list.getEntries()) {
        try {
          const ms = Math.round(entry.duration);
          if (entry.duration >= LONGTASK_WARN_MS) log.warn('perf', 'longtask', { ms });
          else if (entry.duration >= LONGTASK_DEBUG_MS) log.debug('perf', 'longtask', { ms });
        } catch {
          // swallow
        }
      }
    });
    observer.observe({ type: 'longtask' });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function installPerfCapture({ log, win = window, doc = document, ring }) {
  const stopLongTasks = observeLongTasks(win, log);

  let visibleThroughout = doc.visibilityState === 'visible';
  const onVisibility = () => {
    visibleThroughout = false;
  };
  doc.addEventListener('visibilitychange', onVisibility);

  let rafId = null;
  let lastFrame = null;
  const onFrame = (frameTime) => {
    try {
      if (lastFrame !== null && frameTime - lastFrame > JANK_GAP_MS && visibleThroughout) {
        log.debug('perf', 'jank', { gapMs: Math.round(frameTime - lastFrame) });
      }
      lastFrame = frameTime;
      visibleThroughout = doc.visibilityState === 'visible';
    } catch {
      // swallow
    }
    rafId = win.requestAnimationFrame(onFrame);
  };
  if (typeof win.requestAnimationFrame === 'function') rafId = win.requestAnimationFrame(onFrame);

  const sampleTimer = setInterval(() => {
    try {
      const memory = win.performance?.memory;
      log.debug('perf', 'sample', {
        heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
        domNodes: doc.getElementsByTagName('*').length,
        ringBytes: ring.bytes(),
        ringEntries: ring.size(),
      });
    } catch {
      // swallow
    }
  }, SAMPLE_MS);

  return () => {
    stopLongTasks();
    doc.removeEventListener('visibilitychange', onVisibility);
    if (rafId !== null) win.cancelAnimationFrame?.(rafId);
    clearInterval(sampleTimer);
  };
}
