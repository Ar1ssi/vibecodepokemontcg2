// A 2D-context stand-in for move tests: records every call, every colour used (fill/stroke
// styles and gradient stops), and tracks save/restore depth and the `filter` and
// composite-operation properties a drawer or material must leave alone.
export const recordingContext = () => {
  const calls = [];
  const colours = [];
  const fills = { count: 0 };
  const state = { depth: 0, maxDepth: 0, composite: [] };
  const target = { globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over' };
  const gradient = () => ({ addColorStop: (_at, colour) => colours.push(colour) });
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          calls.push([key, args]);
          return gradient();
        };
      }
      if (key === 'save') {
        return () => {
          state.depth += 1;
          state.maxDepth = Math.max(state.maxDepth, state.depth);
          calls.push([key, []]);
        };
      }
      if (key === 'restore') {
        return () => {
          state.depth -= 1;
          calls.push([key, []]);
        };
      }
      if (key === 'fill') {
        return (...args) => {
          fills.count += 1;
          calls.push([key, args]);
        };
      }
      return (...args) => calls.push([key, args]);
    },
    set(obj, key, value) {
      if (typeof value === 'string' && /Style$/.test(key)) colours.push(value);
      if (key === 'globalCompositeOperation') state.composite.push(value);
      obj[key] = value;
      return true;
    },
  });
  return { ctx, calls, colours, fills, state, target };
};

/** Parse "rgba(r, g, b, a)" into [r, g, b] (null for anything else). */
export const rgbOf = (css) => {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Every numeric argument of every recorded call is finite. */
export const callsAreFinite = (calls) =>
  calls.every(([, args]) => args.every((arg) => typeof arg !== 'number' || Number.isFinite(arg)));
