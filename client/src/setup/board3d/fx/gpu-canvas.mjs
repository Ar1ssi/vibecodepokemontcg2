// Design 075 § GPU canvas: a Canvas2D-compatible recorder. The move drawers and material kits
// draw on it unchanged; every fill and stroke becomes triangles in stage px with a paint row
// the GPU evaluates (solid, linear, two-circle radial, the noise pattern). Pure and DOM-free:
// the triangulator is injected (three's ShapeUtils in the browser and in tests).
//
// Vertex (VERTEX_FLOATS): x y z · edge · across · halfWidth · feather · along · paint.
// A fill's interior has edge 1 and halfWidth −1; its feather band fades edge to 0 outward.
// A stroke has halfWidth ≥ 0 and `across` = ±(halfWidth + feather) at its two sides, so the
// fragment's coverage is (halfWidth + feather − |across|) / feather.

export const VERTEX_FLOATS = 9;
export const PAINT_TEXELS = 17;
const PAINT_FLOATS = PAINT_TEXELS * 4;
export const MAX_STOPS = 8;
export const MAX_CLIP_DEPTH = 4;
const MAX_VERTICES = 1 << 20;
const MIN_FEATHER = 0.75;
const BLUR_FEATHER = 1.5;
const MITER_LIMIT_FILL = 4;
const CURVE_SEGMENTS = 12;
const TAU = Math.PI * 2;

export const PAINT_KIND = Object.freeze({ solid: 0, linear: 1, radial: 2, pattern: 3 });
export const STYLE_IDS = Object.freeze({ flat: 0, flame: 1, orb: 2, liquid: 3, energy: 4, crystal: 5, smoke: 6, shadow: 7 });
/** Each style's three params in row order, with the design's starting values (§ Styles). */
export const STYLE_PARAMS = Object.freeze({
  flat: [],
  flame: [['erode', 0.45], ['speed', 1.6], ['gain', 1.8]],
  orb: [['boil', 0.35], ['limb', 0.35], ['gain', 2.2]],
  liquid: [['gloss', 0.6]],
  energy: [['streak', 0.5], ['speed', 3], ['gain', 1.6]],
  crystal: [['facets', 6], ['sheen', 0.5]],
  smoke: [['churn', 0.5]],
  shadow: [['depth', 0.3]],
});
const STYLE_NAMES = Object.keys(STYLE_IDS);

// ---- colours ------------------------------------------------------------------------

const TRANSPARENT = Object.freeze([0, 0, 0, 0]);
const colourCache = new Map();

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A CSS colour string as straight `[r, g, b, a]` in 0–1, or transparent when it cannot be read. */
export function parseColour(text) {
  if (typeof text !== 'string') return TRANSPARENT;
  const cached = colourCache.get(text);
  if (cached) return cached;
  let out = TRANSPARENT;
  const s = text.trim().toLowerCase();
  const fn = /^rgba?\(([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      const a = parts.length > 3 && Number.isFinite(parts[3]) ? clamp01(parts[3]) : 1;
      out = [clamp01(parts[0] / 255), clamp01(parts[1] / 255), clamp01(parts[2] / 255), a];
    }
  } else if (/^#[0-9a-f]{3}$/.test(s)) {
    out = [1, 2, 3].map((i) => parseInt(s[i] + s[i], 16) / 255).concat(1);
  } else if (/^#[0-9a-f]{6}$/.test(s)) {
    out = [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255).concat(1);
  }
  out = Object.freeze(out);
  if (colourCache.size < 4096) colourCache.set(text, out);
  return out;
}

// ---- 2×3 transforms (canvas order: x' = a x + c y + e, y' = b x + d y + f) -------------

const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const invert = (m) => {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const applyTo = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 0;
const finite = (...values) => values.every(Number.isFinite);

// ---- paints (CanvasGradient / CanvasPattern stand-ins) ---------------------------------

class GpuGradient {
  constructor(kind, geometry) {
    this.kind = kind;
    this.geometry = geometry;
    this.stops = [];
  }

  addColorStop(offset, colour) {
    const o = Number(offset);
    if (!(o >= 0 && o <= 1)) return;
    this.stops.push({ offset: o, rgba: parseColour(colour) });
    // Canvas keeps insertion order among equal offsets: a stable sort.
    this.stops.sort((p, q) => p.offset - q.offset);
  }
}

class GpuPattern {
  constructor(image) {
    this.kind = PAINT_KIND.pattern;
    this.image = image;
  }
}

// ---- geometry helpers ------------------------------------------------------------------

const signedArea = (points) => {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += (points[j].x - points[i].x) * (points[j].y + points[i].y);
  }
  return area / 2;
};

const insidePolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Drops repeated consecutive points and a closing point equal to the first. */
const cleanRing = (points) => {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) break;
    out.pop();
  }
  return out;
};

const unit = (x, y) => {
  const len = Math.hypot(x, y);
  return len > 1e-9 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
};

/** Arc sweep the way Canvas2D resolves it (a full turn or more draws the whole circle). */
const arcSweep = (start, end, ccw) => {
  if (!ccw && end - start >= TAU) return TAU;
  if (ccw && start - end >= TAU) return -TAU;
  let sweep = end - start;
  if (!ccw) {
    sweep %= TAU;
    if (sweep < 0) sweep += TAU;
  } else {
    sweep = -((start - end) % TAU);
    if (sweep > 0) sweep -= TAU;
  }
  return sweep;
};

const arcSegments = (sweep, radiusPx) => Math.min(96, Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(radiusPx, 0)) / 2)));

// ---- the recorder ----------------------------------------------------------------------

const defaultState = () => ({
  transform: IDENTITY,
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 10,
  globalAlpha: 1,
  composite: 'source-over',
  filter: 'none',
  dash: [],
  dashOffset: 0,
  fxStyle: null,
  clipDepth: 0,
  clips: [],
});

/**
 * @param {{ triangulate: (contour: {x:number,y:number}[], holes: {x:number,y:number}[][]) => number[][],
 *   size?: number, maxVertices?: number, debug?: (message: string, detail?: unknown) => void }} options
 *   `triangulate` returns index triples into contour ++ holes (three's ShapeUtils.triangulateShape);
 *   `size` caps the paint rows per frame.
 */
export function createGpuCanvas({ triangulate, size = 4096, maxVertices = MAX_VERTICES, debug = (...args) => console.debug(...args) }) {
  if (typeof triangulate !== 'function') throw new TypeError('gpu-canvas needs a triangulate function');
  let vertices = new Float32Array(VERTEX_FLOATS * 4096);
  let vertexCount = 0;
  let paints = new Float32Array(PAINT_FLOATS * 64);
  let paintCount = 0;
  let runs = [];
  let pattern = null;
  let pass = { layer: 'front', z: 0, depthTest: false, unit: 100, seed: 0 };
  let state = defaultState();
  const stack = [];
  let subpaths = [];
  let current = null;
  const warned = new Set();
  let capWarned = false;

  const warnOnce = (name) => {
    if (warned.has(name)) return;
    warned.add(name);
    debug('gpu-canvas: unsupported', name);
  };

  // ---- buffers ----
  const ensureVertices = (n) => {
    if (vertexCount + n > maxVertices) return false;
    const need = (vertexCount + n) * VERTEX_FLOATS;
    if (need > vertices.length) {
      const grown = new Float32Array(Math.min(maxVertices * VERTEX_FLOATS, Math.max(need, vertices.length * 2)));
      grown.set(vertices.subarray(0, vertexCount * VERTEX_FLOATS));
      vertices = grown;
    }
    return true;
  };

  const ensurePaint = () => {
    if (paintCount >= size) return false;
    const need = (paintCount + 1) * PAINT_FLOATS;
    if (need > paints.length) {
      const grown = new Float32Array(Math.min(size * PAINT_FLOATS, Math.max(need, paints.length * 2)));
      grown.set(paints.subarray(0, paintCount * PAINT_FLOATS));
      paints = grown;
    }
    return true;
  };

  const capped = () => {
    if (!capWarned) {
      capWarned = true;
      debug('gpu-canvas: frame cap reached, draws dropped');
    }
  };

  const pushVertex = (x, y, edge, across, halfWidth, feather, along, paint) => {
    const i = vertexCount * VERTEX_FLOATS;
    vertices[i] = x;
    vertices[i + 1] = y;
    vertices[i + 2] = pass.z;
    vertices[i + 3] = edge;
    vertices[i + 4] = across;
    vertices[i + 5] = halfWidth;
    vertices[i + 6] = feather;
    vertices[i + 7] = along;
    vertices[i + 8] = paint;
    vertexCount += 1;
  };

  // ---- runs ----
  const blendOf = () => (state.composite === 'lighter' ? 'add' : 'over');
  const stencilOf = () => (state.clipDepth > 0 ? { op: 'test', ref: state.clipDepth } : { op: 'none', ref: 0 });

  const openRun = (key) => {
    const last = runs[runs.length - 1];
    if (
      last &&
      last.layer === key.layer &&
      last.z === key.z &&
      last.depthTest === key.depthTest &&
      last.blend === key.blend &&
      last.colorWrite === key.colorWrite &&
      last.stencil.op === key.stencil.op &&
      last.stencil.ref === key.stencil.ref &&
      last.first + last.count === vertexCount
    ) {
      return last;
    }
    const run = { ...key, first: vertexCount, count: 0 };
    runs.push(run);
    return run;
  };

  const drawKey = (overrides = {}) => ({
    layer: pass.layer,
    z: pass.z,
    depthTest: pass.depthTest,
    blend: blendOf(),
    colorWrite: true,
    stencil: stencilOf(),
    ...overrides,
  });

  // ---- paint rows ----
  const writePaint = (style, { dashed = false } = {}) => {
    if (!ensurePaint()) return -1;
    const row = paintCount;
    const o = row * PAINT_FLOATS;
    paints.fill(0, o, o + PAINT_FLOATS);
    const alpha = clamp01(state.globalAlpha);
    const inverse = invert(state.transform) ?? IDENTITY;
    let kind = PAINT_KIND.solid;
    let stops = [{ offset: 0, rgba: TRANSPARENT }];
    if (style instanceof GpuGradient) {
      kind = style.kind;
      stops = style.stops.length > 0 ? style.stops.slice(0, MAX_STOPS) : [{ offset: 0, rgba: TRANSPARENT }];
      const g = style.geometry;
      if (kind === PAINT_KIND.linear) paints.set([g.x0, g.y0, g.x1, g.y1], o + 4);
      else {
        paints.set([g.x0, g.y0, g.r0, 0], o + 4);
        paints.set([g.x1, g.y1, g.r1, 0], o + 8);
      }
    } else if (style instanceof GpuPattern) {
      kind = PAINT_KIND.pattern;
      pattern = style.image;
      const tile = Number(style.image?.width) || 1;
      paints.set([tile, 0, 0, 0], o + 4);
      stops = [{ offset: 0, rgba: [1, 1, 1, 1] }];
    } else {
      stops = [{ offset: 0, rgba: parseColour(style) }];
    }
    const fx = state.fxStyle;
    const styleName = STYLE_NAMES.includes(fx?.id) ? fx.id : STYLE_NAMES[fx?.id] ?? 'flat';
    paints.set([kind, stops.length, STYLE_IDS[styleName], pass.seed + row * 0.618], o);
    // Device (stage px) → paint space, so a gradient follows the transform it is filled under.
    paints.set([inverse[0], inverse[2], inverse[4], 0], o + 12);
    paints.set([inverse[1], inverse[3], inverse[5], 0], o + 16);
    const params = STYLE_PARAMS[styleName].map(([key, fallback]) => (Number.isFinite(fx?.[key]) ? fx[key] : fallback));
    paints.set([params[0] ?? 0, params[1] ?? 0, params[2] ?? 0, pass.unit], o + 20);
    if (dashed) {
      const scale = scaleOf(state.transform);
      const [on, off] = state.dash.length >= 2 ? state.dash : [state.dash[0], state.dash[0]];
      paints.set([on * scale, off * scale, state.dashOffset * scale, 1], o + 24);
    }
    stops.forEach((stop, i) => {
      paints[o + 28 + i] = stop.offset;
      const [r, g, b, a] = stop.rgba;
      const pa = a * alpha;
      paints.set([r * pa, g * pa, b * pa, pa], o + 36 + i * 4);
    });
    paintCount += 1;
    return row;
  };

  const featherNow = () => {
    const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(state.filter ?? '');
    const blurPx = blur ? Number(blur[1]) * scaleOf(state.transform) : 0;
    return Math.max(MIN_FEATHER, blurPx * BLUR_FEATHER);
  };

  // ---- path building (points stored in stage px) ----
  const startSubpath = (p) => {
    current = { points: [p], closed: false };
    subpaths.push(current);
  };
  const lineToDevice = (p) => {
    if (!current) startSubpath(p);
    else current.points.push(p);
  };

  const ctx = {
    // Canvas2D state as plain properties; the setters below read them at draw time.
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v) {
      state.fillStyle = v;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v) {
      state.strokeStyle = v;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v) {
      if (Number(v) > 0) state.lineWidth = Number(v);
    },
    get lineCap() {
      return state.lineCap;
    },
    set lineCap(v) {
      if (v === 'butt' || v === 'round' || v === 'square') state.lineCap = v;
    },
    get lineJoin() {
      return state.lineJoin;
    },
    set lineJoin(v) {
      if (v === 'miter' || v === 'round' || v === 'bevel') state.lineJoin = v;
    },
    get miterLimit() {
      return state.miterLimit;
    },
    set miterLimit(v) {
      if (Number(v) > 0) state.miterLimit = Number(v);
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v) {
      if (Number.isFinite(Number(v))) state.globalAlpha = clamp01(Number(v));
    },
    get globalCompositeOperation() {
      return state.composite;
    },
    set globalCompositeOperation(v) {
      if (typeof v === 'string') state.composite = v;
    },
    get filter() {
      return state.filter;
    },
    set filter(v) {
      state.filter = typeof v === 'string' ? v : 'none';
    },
    get lineDashOffset() {
      return state.dashOffset;
    },
    set lineDashOffset(v) {
      if (Number.isFinite(Number(v))) state.dashOffset = Number(v);
    },
    /** Design 075 § Styles: a shader-style hint; a real 2D context ignores the property. */
    get fxStyle() {
      return state.fxStyle;
    },
    set fxStyle(v) {
      state.fxStyle = v && typeof v === 'object' ? v : null;
    },

    save() {
      stack.push(state);
      // Clips made after this save are the ones its restore takes back out.
      state = { ...state, clips: [] };
    },
    restore() {
      const saved = stack.pop();
      if (!saved) return;
      // Clips made since the save are taken back out of the stencil, newest first.
      for (const clip of state.clips.slice().reverse()) emitStencil(clip.triangles, 'clear', clip.depth);
      state = saved;
    },
    translate(x, y) {
      if (finite(x, y)) state.transform = multiply(state.transform, [1, 0, 0, 1, x, y]);
    },
    rotate(angle) {
      if (!finite(angle)) return;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      state.transform = multiply(state.transform, [c, s, -s, c, 0, 0]);
    },
    scale(x, y) {
      if (finite(x, y)) state.transform = multiply(state.transform, [x, 0, 0, y, 0, 0]);
    },
    transform(a, b, c, d, e, f) {
      if (finite(a, b, c, d, e, f)) state.transform = multiply(state.transform, [a, b, c, d, e, f]);
    },
    setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
      if (typeof a === 'object' && a) ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
      if (finite(a, b, c, d, e, f)) state.transform = [a, b, c, d, e, f];
    },
    resetTransform() {
      state.transform = IDENTITY;
    },
    getTransform() {
      const [a, b, c, d, e, f] = state.transform;
      return { a, b, c, d, e, f };
    },

    beginPath() {
      subpaths = [];
      current = null;
    },
    moveTo(x, y) {
      if (finite(x, y)) startSubpath(applyTo(state.transform, x, y));
    },
    lineTo(x, y) {
      if (finite(x, y)) lineToDevice(applyTo(state.transform, x, y));
    },
    closePath() {
      if (!current || current.points.length === 0) return;
      current.closed = true;
      const first = current.points[0];
      startSubpath({ x: first.x, y: first.y });
    },
    rect(x, y, w, h) {
      if (!finite(x, y, w, h)) return;
      const m = state.transform;
      startSubpath(applyTo(m, x, y));
      current.points.push(applyTo(m, x + w, y), applyTo(m, x + w, y + h), applyTo(m, x, y + h));
      current.closed = true;
      startSubpath(applyTo(m, x, y));
    },
    arc(x, y, r, start, end, ccw = false) {
      this.ellipse(x, y, r, r, 0, start, end, ccw);
    },
    ellipse(x, y, rx, ry, rotation, start, end, ccw = false) {
      if (!finite(x, y, rx, ry, rotation, start, end) || rx < 0 || ry < 0) return;
      const sweep = arcSweep(start, end, Boolean(ccw));
      const n = arcSegments(sweep, Math.max(rx, ry) * scaleOf(state.transform));
      const cr = Math.cos(rotation);
      const sr = Math.sin(rotation);
      for (let k = 0; k <= n; k += 1) {
        const a = start + (sweep * k) / n;
        const ex = rx * Math.cos(a);
        const ey = ry * Math.sin(a);
        lineToDevice(applyTo(state.transform, x + ex * cr - ey * sr, y + ex * sr + ey * cr));
      }
    },
    quadraticCurveTo(cx, cy, x, y) {
      if (!finite(cx, cy, x, y)) return;
      const from = current?.points[current.points.length - 1];
      if (!from) return this.moveTo(x, y);
      const inv = invert(state.transform) ?? IDENTITY;
      const p0 = applyTo(inv, from.x, from.y);
      for (let k = 1; k <= CURVE_SEGMENTS; k += 1) {
        const t = k / CURVE_SEGMENTS;
        const u = 1 - t;
        lineToDevice(applyTo(state.transform, u * u * p0.x + 2 * u * t * cx + t * t * x, u * u * p0.y + 2 * u * t * cy + t * t * y));
      }
      return undefined;
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      if (!finite(c1x, c1y, c2x, c2y, x, y)) return;
      const from = current?.points[current.points.length - 1];
      if (!from) return this.moveTo(x, y);
      const inv = invert(state.transform) ?? IDENTITY;
      const p0 = applyTo(inv, from.x, from.y);
      for (let k = 1; k <= CURVE_SEGMENTS; k += 1) {
        const t = k / CURVE_SEGMENTS;
        const u = 1 - t;
        const px = u * u * u * p0.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x;
        const py = u * u * u * p0.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y;
        lineToDevice(applyTo(state.transform, px, py));
      }
      return undefined;
    },

    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      return new GpuGradient(PAINT_KIND.radial, { x0, y0, r0: Math.max(0, r0), x1, y1, r1: Math.max(0, r1) });
    },
    createLinearGradient(x0, y0, x1, y1) {
      return new GpuGradient(PAINT_KIND.linear, { x0, y0, x1, y1 });
    },
    createPattern(image, repetition = 'repeat') {
      if (!image) return null;
      if (repetition !== 'repeat') warnOnce(`createPattern(${repetition})`);
      return new GpuPattern(image);
    },
    setLineDash(segments) {
      const list = Array.isArray(segments) ? segments.map(Number).filter((v) => Number.isFinite(v) && v >= 0) : [];
      state.dash = list.length % 2 === 1 ? [...list, ...list] : list;
      if (list.length > 2) warnOnce('setLineDash(>2 segments)');
    },
    getLineDash() {
      return [...state.dash];
    },

    fill() {
      fillSubpaths(subpaths);
    },
    fillRect(x, y, w, h) {
      if (!finite(x, y, w, h)) return;
      const m = state.transform;
      fillSubpaths([{ points: [applyTo(m, x, y), applyTo(m, x + w, y), applyTo(m, x + w, y + h), applyTo(m, x, y + h)], closed: true }]);
    },
    stroke() {
      strokeSubpaths(subpaths);
    },
    strokeRect(x, y, w, h) {
      if (!finite(x, y, w, h)) return;
      const m = state.transform;
      strokeSubpaths([{ points: [applyTo(m, x, y), applyTo(m, x + w, y), applyTo(m, x + w, y + h), applyTo(m, x, y + h)], closed: true }]);
    },
    clip() {
      if (state.clipDepth >= MAX_CLIP_DEPTH) {
        warnOnce(`clip depth > ${MAX_CLIP_DEPTH}`);
        return;
      }
      const triangles = interiorTriangles(subpaths);
      const depth = state.clipDepth + 1;
      emitStencil(triangles, 'write', depth);
      state.clips = [...state.clips, { triangles, depth }];
      state.clipDepth = depth;
    },
  };

  // Calls the kits never make: inert, logged once by name.
  for (const name of ['drawImage', 'fillText', 'strokeText', 'measureText', 'putImageData', 'getImageData', 'createImageData', 'createConicGradient', 'isPointInPath', 'roundRect', 'arcTo']) {
    ctx[name] = () => {
      warnOnce(name);
      return name === 'measureText' ? { width: 0 } : undefined;
    };
  }

  // ---- fills ----
  /** Closed rings of the path, each with ≥ 3 distinct points; holes grouped under their outer ring. */
  const ringsOf = (paths) => {
    const rings = paths.map((path) => cleanRing(path.points)).filter((ring) => ring.length >= 3);
    const groups = [];
    for (const ring of rings) {
      const area = signedArea(ring);
      if (Math.abs(area) < 1e-9) continue;
      const host = groups.find(
        (group) => Math.sign(group.area) !== Math.sign(area) && ring.every((p) => insidePolygon(p, group.outer))
      );
      if (host) host.holes.push(ring);
      else groups.push({ outer: ring, area, holes: [] });
    }
    return groups;
  };

  const triangulateGroup = (group) => {
    try {
      const faces = triangulate(
        group.outer.map((p) => ({ x: p.x, y: p.y })),
        group.holes.map((hole) => hole.map((p) => ({ x: p.x, y: p.y })))
      );
      return Array.isArray(faces) ? faces : [];
    } catch (error) {
      debug('gpu-canvas: triangulation failed', error);
      return [];
    }
  };

  const interiorTriangles = (paths) => {
    const out = [];
    for (const group of ringsOf(paths)) {
      const points = [group.outer, ...group.holes].flat();
      for (const face of triangulateGroup(group)) {
        const tri = face.map((i) => points[i]);
        if (tri.every(Boolean)) out.push(tri);
      }
    }
    return out;
  };

  /** Outward (from the filled side) offset of each ring point, mitred and clamped. */
  const ringOffsets = (ring, sign, distance) =>
    ring.map((p, i) => {
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const next = ring[(i + 1) % ring.length];
      const n0 = unit(sign * (p.y - prev.y), -sign * (p.x - prev.x));
      const n1 = unit(sign * (next.y - p.y), -sign * (next.x - p.x));
      const m = unit(n0.x + n1.x, n0.y + n1.y);
      const cos = m.x * n1.x + m.y * n1.y;
      const length = cos > 1 / MITER_LIMIT_FILL ? distance / cos : distance * MITER_LIMIT_FILL;
      return { x: p.x + m.x * length, y: p.y + m.y * length };
    });

  const fillSubpaths = (paths) => {
    const groups = ringsOf(paths);
    if (groups.length === 0) return;
    const paint = writePaint(state.fillStyle);
    if (paint < 0) return capped();
    const feather = featherNow();
    for (const group of groups) {
      const points = [group.outer, ...group.holes].flat();
      const faces = triangulateGroup(group);
      const bandVertices = [group.outer, ...group.holes].reduce((sum, ring) => sum + ring.length * 6, 0);
      if (!ensureVertices(faces.length * 3 + bandVertices)) return capped();
      const run = openRun(drawKey());
      const start = vertexCount;
      for (const face of faces) {
        for (const i of face) {
          const p = points[i];
          if (p) pushVertex(p.x, p.y, 1, 0, -1, feather, 0, paint);
        }
      }
      // Rings wind against their outer ring when they are holes, so the same sign points away
      // from the filled side on both.
      const sign = Math.sign(group.area) || 1;
      for (const ring of [group.outer, ...group.holes]) {
        const outer = ringOffsets(ring, sign, feather);
        for (let i = 0; i < ring.length; i += 1) {
          const j = (i + 1) % ring.length;
          const a = ring[i];
          const b = ring[j];
          const oa = outer[i];
          const ob = outer[j];
          pushVertex(a.x, a.y, 1, 0, -1, feather, 0, paint);
          pushVertex(b.x, b.y, 1, 0, -1, feather, 0, paint);
          pushVertex(ob.x, ob.y, 0, 0, -1, feather, 0, paint);
          pushVertex(a.x, a.y, 1, 0, -1, feather, 0, paint);
          pushVertex(ob.x, ob.y, 0, 0, -1, feather, 0, paint);
          pushVertex(oa.x, oa.y, 0, 0, -1, feather, 0, paint);
        }
      }
      run.count += vertexCount - start;
    }
    return undefined;
  };

  // ---- strokes ----
  const strokeSubpaths = (paths) => {
    const halfWidth = (state.lineWidth * scaleOf(state.transform)) / 2;
    if (!(halfWidth > 0)) return;
    const lines = paths
      .map((path) => ({ points: cleanRing(path.points), closed: path.closed }))
      .filter((line) => line.points.length >= 2);
    if (lines.length === 0) return;
    const dashed = state.dash.length >= 2 && state.dash.some((v) => v > 0);
    const paint = writePaint(state.strokeStyle, { dashed });
    if (paint < 0) return capped();
    const feather = featherNow();
    const reach = halfWidth + feather;
    for (const line of lines) {
      const strip = strokeStrip(line.points, line.closed, reach);
      const caps = line.closed ? [] : capFans(line.points, reach, strip.length);
      const count = (strip.pairs.length - 1) * 6 + caps.length;
      if (!ensureVertices(count)) return capped();
      const run = openRun(drawKey());
      const start = vertexCount;
      for (let k = 0; k + 1 < strip.pairs.length; k += 1) {
        const [l0, r0] = strip.pairs[k];
        const [l1, r1] = strip.pairs[k + 1];
        pushVertex(l0.x, l0.y, 1, reach, halfWidth, feather, l0.along, paint);
        pushVertex(r0.x, r0.y, 1, -reach, halfWidth, feather, r0.along, paint);
        pushVertex(l1.x, l1.y, 1, reach, halfWidth, feather, l1.along, paint);
        pushVertex(r0.x, r0.y, 1, -reach, halfWidth, feather, r0.along, paint);
        pushVertex(r1.x, r1.y, 1, -reach, halfWidth, feather, r1.along, paint);
        pushVertex(l1.x, l1.y, 1, reach, halfWidth, feather, l1.along, paint);
      }
      for (const v of caps) pushVertex(v.x, v.y, 1, v.across, halfWidth, feather, v.along, paint);
      run.count += vertexCount - start;
    }
    return undefined;
  };

  /** Left/right vertex pairs along a polyline, mitred at gentle joins and bevelled past the limit. */
  const strokeStrip = (points, closed, reach) => {
    const n = points.length;
    const ring = closed ? [...points, points[0]] : points;
    const along = [0];
    for (let i = 1; i < ring.length; i += 1) along.push(along[i - 1] + Math.hypot(ring[i].x - ring[i - 1].x, ring[i].y - ring[i - 1].y));
    const normalOf = (a, b) => {
      const d = unit(b.x - a.x, b.y - a.y);
      return { x: -d.y, y: d.x, dx: d.x, dy: d.y };
    };
    const pair = (p, normal, length, at) => [
      { x: p.x + normal.x * length, y: p.y + normal.y * length, along: at },
      { x: p.x - normal.x * length, y: p.y - normal.y * length, along: at },
    ];
    const limit = state.lineJoin === 'miter' ? state.miterLimit : 1.05;
    const pairs = [];
    for (let i = 0; i < ring.length; i += 1) {
      const p = ring[i];
      const hasPrev = i > 0 || closed;
      const hasNext = i < ring.length - 1;
      const prev = i > 0 ? ring[i - 1] : points[n - 1];
      const next = hasNext ? ring[i + 1] : closed ? ring[1] : null;
      let n0 = hasPrev ? normalOf(prev, p) : null;
      let n1 = next ? normalOf(p, next) : null;
      if (!n0) n0 = n1;
      if (!n1) n1 = n0;
      let shift = { x: 0, y: 0 };
      if (!closed && state.lineCap === 'square') {
        if (i === 0) shift = { x: -n1.dx * reach, y: -n1.dy * reach };
        if (i === ring.length - 1) shift = { x: n0.dx * reach, y: n0.dy * reach };
      }
      const at = { x: p.x + shift.x, y: p.y + shift.y };
      const m = unit(n0.x + n1.x, n0.y + n1.y);
      const cos = m.x * n1.x + m.y * n1.y;
      if (cos > 1e-6 && 1 / cos <= limit) pairs.push(pair(at, m, reach / cos, along[i]));
      else {
        pairs.push(pair(at, n0, reach, along[i]));
        pairs.push(pair(at, n1, reach, along[i]));
      }
    }
    return { pairs, length: along[along.length - 1] };
  };

  /** Round caps: half-disc fans past each open end (radial `across` from the end point). */
  const capFans = (points, reach, length) => {
    if (state.lineCap !== 'round') return [];
    const out = [];
    const fan = (p, dir, at) => {
      const base = Math.atan2(dir.y, dir.x) - Math.PI / 2;
      const steps = 8;
      for (let k = 0; k < steps; k += 1) {
        const a0 = base + (Math.PI * k) / steps;
        const a1 = base + (Math.PI * (k + 1)) / steps;
        out.push({ x: p.x, y: p.y, across: 0, along: at });
        out.push({ x: p.x + Math.cos(a0) * reach, y: p.y + Math.sin(a0) * reach, across: reach, along: at });
        out.push({ x: p.x + Math.cos(a1) * reach, y: p.y + Math.sin(a1) * reach, across: reach, along: at });
      }
    };
    const a = points[0];
    const b = points[1];
    const y = points[points.length - 2];
    const z = points[points.length - 1];
    fan(a, unit(a.x - b.x, a.y - b.y), 0);
    fan(z, unit(z.x - y.x, z.y - y.y), length);
    return out;
  };

  // ---- clips ----
  const emitStencil = (triangles, op, ref) => {
    if (triangles.length === 0) return;
    if (!ensureVertices(triangles.length * 3)) return capped();
    const paint = writePaint('#fff');
    if (paint < 0) return capped();
    const run = openRun(drawKey({ colorWrite: false, stencil: { op, ref } }));
    const start = vertexCount;
    for (const tri of triangles) for (const p of tri) pushVertex(p.x, p.y, 1, 0, -1, MIN_FEATHER, 0, paint);
    run.count += vertexCount - start;
    return undefined;
  };

  return {
    ctx,
    /** Starts a pass: later draws record at its layer, height and depth test; `unit` = lane h. */
    begin({ layer = 'front', z = 0, depthTest = false, unit: unitPx = 100, seed = 0 } = {}) {
      pass = { layer, z, depthTest: Boolean(depthTest), unit: unitPx > 0 ? unitPx : 100, seed: Number(seed) || 0 };
      state = defaultState();
      stack.length = 0;
      subpaths = [];
      current = null;
    },
    recording() {
      return {
        vertices: vertices.subarray(0, vertexCount * VERTEX_FLOATS),
        vertexCount,
        paints: paints.subarray(0, paintCount * PAINT_FLOATS),
        paintCount,
        runs: runs.map((run) => ({ ...run, stencil: { ...run.stencil } })),
        pattern,
      };
    },
    reset() {
      vertexCount = 0;
      paintCount = 0;
      runs = [];
      capWarned = false;
      state = defaultState();
      stack.length = 0;
      subpaths = [];
      current = null;
    },
  };
}
