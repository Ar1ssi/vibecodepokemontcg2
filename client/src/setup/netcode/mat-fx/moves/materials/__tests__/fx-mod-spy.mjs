// A 2D-context stand-in that snapshots `ctx.fxMod` at every fill and stroke, so a kit test can
// say which modifiers a fill ran under (design 076) and that the kit left `fxMod` as it found it.
export const fxModSpy = (initial = null) => {
  const paints = [];
  const target = { fxMod: initial, fxStyle: null, globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over' };
  const snapshot = (op) => paints.push({ op, fxMod: target.fxMod ? structuredClone(target.fxMod) : null });
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'fill' || key === 'stroke') return () => snapshot(key);
      return () => {};
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
  return { ctx, paints, fills: () => paints.filter((p) => p.op === 'fill') };
};

/** The modules (dissolve / distort / detail) a snapshot turns on, sorted. */
export const modulesOf = (fxMod) => Object.keys(fxMod ?? {}).sort();
