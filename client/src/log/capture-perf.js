const LONGTASK_WARN_MS = 500;
const LONGTASK_DEBUG_MS = 100;
const JANK_GAP_MS = 250;
// A slow timer is enough to notice a stalled main thread; a requestAnimationFrame loop would
// keep every page producing frames forever, and the board renders on demand.
const JANK_TICK_MS = 250;
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

  const clock = () => (win.performance ?? performance).now();
  let lastTick = clock();
  const jankTimer = setInterval(() => {
    try {
      const at = clock();
      const late = at - lastTick - JANK_TICK_MS;
      // Hidden tabs throttle timers; only a gap spent fully visible is a stall.
      if (late > JANK_GAP_MS && visibleThroughout) log.debug('perf', 'jank', { gapMs: Math.round(at - lastTick) });
      lastTick = at;
      visibleThroughout = doc.visibilityState === 'visible';
    } catch {
      // swallow
    }
  }, JANK_TICK_MS);

  const sampleTimer = setInterval(() => {
    try {
      const memory = win.performance?.memory;
      log.debug('perf', 'sample', {
        heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
        domNodes: doc.getElementsByTagName('*').length,
        ringBytes: ring.bytes(),
        ringEntries: ring.size(),
        unacked: win.__ptcgLog?.ship?.().pending ?? null,
      });
    } catch {
      // swallow
    }
  }, SAMPLE_MS);

  return () => {
    stopLongTasks();
    doc.removeEventListener('visibilitychange', onVisibility);
    clearInterval(jankTimer);
    clearInterval(sampleTimer);
  };
}
