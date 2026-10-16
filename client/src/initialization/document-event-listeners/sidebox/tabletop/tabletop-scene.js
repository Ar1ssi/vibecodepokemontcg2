import { fxDisabled, fxVolume, motionReduced, soundDisabled } from '../../../../setup/image-logic/mat-fx.mjs';

/**
 * Mounts the tabletop opening (design 073) into `root`, or the design-052 DOM scene when it cannot
 * run: effects off, no WebGL 2, the 3D modules fail to load, or the context is lost mid-scene
 * (rows 1–3). three.js loads only here, through `import()`.
 *
 * @param {object} options the `mountUnboxingScene` options plus `box` (catalog entry),
 *   `deckRows`, `storage`, `quality`, `surface`, `finishLabel`, `muted`, `volume`,
 *   `toggleSound`, and `fallback()` (mounts the DOM scene in `root`, returns its `{unmount}`)
 * @returns {{unmount: () => void}}
 */
export function mountTabletopUnboxing(options) {
  const { root, fallback } = options;
  let handle = null;
  let unmounted = false;
  let fellBack = false;

  const useFallback = () => {
    if (unmounted || fellBack) return;
    fellBack = true;
    const failed = handle;
    handle = null;
    failed?.unmount?.();
    root.replaceChildren();
    handle = fallback ? fallback() : null;
  };

  if (fxDisabled() || !supportsWebgl2()) {
    useFallback();
  } else {
    import('./tabletop-app.js')
      .then((module) =>
        module.createTabletopApp({
          instant: motionReduced,
          muted: soundDisabled,
          volume: fxVolume,
          ...options,
          onLost: () => useFallback(),
        })
      )
      .then((app) => {
        if (unmounted) {
          app?.unmount();
          return;
        }
        if (!app) useFallback();
        else handle = app;
      })
      .catch(() => useFallback());
  }

  return {
    unmount: () => {
      unmounted = true;
      handle?.unmount?.();
      handle = null;
    },
  };
}

function supportsWebgl2() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}
