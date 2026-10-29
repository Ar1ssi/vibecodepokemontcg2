// A 2D-context stand-in that snapshots, at every fill and stroke, the GPU hints a kit draws under
// (design 076): `fxMod`, `fxStyle`, the lift height `fxLift.z` and the composite operation, so a
// kit test can say what a fill ran under and that the kit left them as it found them. It starts
// on the move player's additive pass (`lighter`); save/restore keep the composite.
export const fxModSpy = (initial = null) => {
  const paints = [];
  const saved = [];
  const target = { fxMod: initial, fxStyle: null, fxLift: null, globalAlpha: 1, filter: 'none', globalCompositeOperation: 'lighter' };
  const snapshot = (op) =>
    paints.push({
      op,
      fxMod: target.fxMod ? structuredClone(target.fxMod) : null,
      fxStyle: target.fxStyle,
      z: Number(target.fxLift?.z) || 0,
      composite: target.globalCompositeOperation,
    });
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'fill' || key === 'stroke') return () => snapshot(key);
      if (key === 'save') return () => saved.push(obj.globalCompositeOperation);
      if (key === 'restore') return () => (obj.globalCompositeOperation = saved.pop() ?? obj.globalCompositeOperation);
      return () => {};
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
  return { ctx, paints, fills: () => paints.filter((p) => p.op === 'fill'), strokes: () => paints.filter((p) => p.op === 'stroke') };
};

/** The modules (dissolve / distort / detail / volume) a snapshot turns on, sorted. */
export const modulesOf = (fxMod) => Object.keys(fxMod ?? {}).sort();
