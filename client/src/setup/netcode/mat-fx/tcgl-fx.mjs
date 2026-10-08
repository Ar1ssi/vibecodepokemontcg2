// Design 066: the pure toolkit the TCG Live evolution/devolution scenes are
// built from. TCG Live authors these effects as Unity ParticleSystems; this
// file evaluates the parts of a ParticleSystem the two prefabs use (curves,
// gradients, rate-over-time births, speed limits, texture dissolves and polar
// UVs) so evolve-scene.mjs / devolve-scene.mjs can stay data plus small pose
// functions. DOM-free; tcgl-canvas.js draws what these compute.

/** Unity prefab units per card height (Card_Sharp, Square_Pop and the highlight ring agree). */
export const CARD_UNITS = 11;

export const TAU = Math.PI * 2;

export const clamp01 = (t) => (Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (lo, hi, x) => {
  if (!(hi > lo)) return x >= hi ? 1 : 0;
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

/** A particle's normalized age in [0, 1], or null while unborn or dead. */
export function ageOf(timeS, birthS, lifeS) {
  if (!Number.isFinite(timeS) || !(lifeS > 0)) return null;
  const age = (timeS - birthS) / lifeS;
  return age >= 0 && age <= 1 ? age : null;
}

/** Piecewise-linear AnimationCurve: `keys` = [[t, v], …] sorted by t; held flat outside. */
export function curveAt(keys, x) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  const t = Number.isFinite(x) ? x : 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return t1 > t0 ? lerp(v0, v1, (t - t0) / (t1 - t0)) : v1;
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Unity Gradient (blend mode) at `x`: `{ color: [[t, [r,g,b]], …], alpha: [[t, a], …] }`.
 * Returns `{ rgb: [r,g,b], a }` with channels in [0, 1]; a missing alpha list is opaque.
 */
export function gradientAt(gradient, x) {
  const t = clamp01(x);
  const colors = gradient?.color || [];
  const rgb = [0, 1, 2].map((c) =>
    colors.length ? clamp01(curveAt(colors.map(([k, col]) => [k, col[c]]), t)) : 1
  );
  const alphas = gradient?.alpha;
  return { rgb, a: Array.isArray(alphas) && alphas.length ? clamp01(curveAt(alphas, t)) : 1 };
}

/**
 * Birth times (s, from the emitter's start) of a burst plus a rate-over-time
 * curve: `rate` particles/s scaled by `curve` over the system's `duration`,
 * emitting while the integral crosses each whole particle, up to `until` s.
 */
export function rateBirths({ burst = 0, rate = 0, curve = [[0, 1]], duration = 1, until = duration, step = 1 / 240 }) {
  const births = Array.from({ length: Math.max(0, Math.floor(burst)) }, () => 0);
  if (!(rate > 0) || !(duration > 0)) return births;
  let made = 0;
  let total = 0;
  const end = Math.min(until, duration);
  for (let t = 0; t < end; t += step) {
    total += rate * curveAt(curve, (t + step / 2) / duration) * step;
    while (total >= made + 1) {
      made += 1;
      births.push(t + step);
    }
  }
  return births;
}

const SIM_STEP_S = 1 / 60;

/**
 * Distance travelled after `t` s by a particle launched at `speed` under a
 * Limit Velocity module, stepped at 60 fps like Unity: each step, speed above
 * the limit (`limit` · `limitCurve` over the particle's `life`) loses
 * `dampen` of its excess; speed below the limit is kept.
 */
export function limitedTravel(speed, { limit = Infinity, limitCurve = null, dampen = 0 } = {}, t, life = 1) {
  const time = Math.max(0, Number.isFinite(t) ? t : 0);
  const sign = speed < 0 ? -1 : 1;
  let s = Math.abs(Number.isFinite(speed) ? speed : 0);
  let distance = 0;
  for (let elapsed = 0; elapsed < time; elapsed += SIM_STEP_S) {
    const step = Math.min(SIM_STEP_S, time - elapsed);
    const cap = limit * (limitCurve ? curveAt(limitCurve, elapsed / life) : 1);
    if (s > cap) s -= (s - cap) * Math.min(1, dampen) * (step / SIM_STEP_S);
    distance += s * step;
  }
  return sign * distance;
}

/** Integral over [0, age·life] of `scalar · curve(age')` rad/s: a rotation-over-lifetime angle. */
export function spinAngle(scalar, curve, age, life, steps = 24) {
  const a = clamp01(age);
  if (!(life > 0) || a === 0) return 0;
  let sum = 0;
  for (let i = 0; i < steps; i += 1) sum += curveAt(curve, ((i + 0.5) / steps) * a);
  return scalar * (sum / steps) * a * life;
}

/** Bilinear, wrapping sample of a texture field `{ w, h, data }` (values 0–255) as [0, 1]. */
export function sampleField(field, u, v) {
  if (!field?.data || !(field.w > 0) || !(field.h > 0)) return 0;
  const { w, h, data } = field;
  const x = (((u % 1) + 1) % 1) * w - 0.5;
  const y = (((v % 1) + 1) % 1) * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx, yy) => data[(((yy % h) + h) % h) * w + (((xx % w) + w) % w)];
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

/** Clamped (no wrap) sample: outside [0,1]² reads 0, the way a mask texture's border does. */
export const sampleMask = (field, u, v) => (u < 0 || u > 1 || v < 0 || v > 1 ? 0 : sampleField(field, Math.min(u, 0.9999), Math.min(v, 0.9999)));

/**
 * The dissolve every TCG Live card material shares: the custom-curve amount
 * eats the texture from its darkest values up, so ≤ 0 shows it all and ≥ 1
 * shows nothing; `soft` widens the edge.
 */
export function dissolveAlpha(value, amount, soft = 0.06) {
  if (!Number.isFinite(amount) || amount <= -soft) return 1;
  return smoothstep(amount - soft, amount + soft, value);
}

const writePixel = (out, i, rgb, alpha) => {
  out[i] = rgb[0] * 255;
  out[i + 1] = rgb[1] * 255;
  out[i + 2] = rgb[2] * 255;
  out[i + 3] = alpha * 255;
};

/**
 * Fill RGBA `out` (w×h) with a mask texture dissolved by a noise texture:
 * alpha = mask · dissolve(noise) · `alpha`. The noise turns by `noiseRot`
 * radians about the centre and repeats `noiseTile` times across. `colors`
 * (RGBA pixels `{ w, h, data }`) paints it from a colour texture instead of `rgb`.
 */
export function fillDissolve(out, w, h, { mask, noise, amount = 0, soft = 0.06, noiseRot = 0, noiseTile = 1, colors = null, rgb = [1, 1, 1], alpha = 1 }) {
  const cos = Math.cos(noiseRot);
  const sin = Math.sin(noiseRot);
  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      const m = mask ? sampleMask(mask, u, v) : 1;
      let a = 0;
      if (m > 0.002) {
        const du = u - 0.5;
        const dv = v - 0.5;
        const n = noise ? sampleField(noise, (du * cos - dv * sin) * noiseTile + 0.5, (du * sin + dv * cos) * noiseTile + 0.5) : 1;
        a = m * dissolveAlpha(n, amount, soft) * alpha;
      }
      writePixel(out, (y * w + x) * 4, colors ? texelRgb(colors, u, v, rgb) : rgb, a);
    }
  }
  return out;
}

/** Nearest texel colour of RGBA pixels `{ w, h, data }` at (u, v), times `tint`. */
export function texelRgb(pixels, u, v, tint = [1, 1, 1]) {
  const x = Math.min(pixels.w - 1, Math.max(0, Math.floor(u * pixels.w)));
  const y = Math.min(pixels.h - 1, Math.max(0, Math.floor(v * pixels.h)));
  const i = (y * pixels.w + x) * 4;
  return [0, 1, 2].map((c) => (pixels.data[i + c] / 255) * tint[c]);
}

/**
 * Fill RGBA `out` (w×h) with flames standing on a card's edges: the box is
 * `outer` wide/tall, the card `inner`; each side's band maps u along the edge
 * and v outward onto `mask` (base at the card), dissolved by `noise` and
 * coloured along the edge by `lut`.
 */
export function fillFrame(out, w, h, { outer, inner, mask, noise, amount = 0, soft = 0.08, lut = null, rgb = [1, 1, 1], alpha = 1 }) {
  const [ow, oh] = outer;
  const [iw, ih] = inner;
  const bandX = (ow - iw) / 2;
  const bandY = (oh - ih) / 2;
  for (let py = 0; py < h; py += 1) {
    const y = ((py + 0.5) / h - 0.5) * oh;
    for (let px = 0; px < w; px += 1) {
      const x = ((px + 0.5) / w - 0.5) * ow;
      const i = (py * w + px) * 4;
      const dx = bandX > 0 ? (Math.abs(x) - iw / 2) / bandX : -1;
      const dy = bandY > 0 ? (Math.abs(y) - ih / 2) / bandY : -1;
      const outward = Math.max(dx, dy);
      if (outward < 0 || outward > 1) {
        out[i + 3] = 0;
        continue;
      }
      const u = dx > dy ? y / oh + 0.5 : x / ow + 0.5;
      const m = sampleMask(mask, u, 1 - outward);
      const n = noise ? sampleField(noise, u * 2, outward) : 1;
      writePixel(out, i, lut ? lutAt(lut, u, rgb) : rgb, m * dissolveAlpha(n, amount, soft) * alpha);
    }
  }
  return out;
}

/**
 * Fill RGBA `out` (size×size) with a noise texture wrapped in polar UVs —
 * u = angle, v = radius — the way TCG Live's radial shaders do (rays, wisps,
 * the spark disc). `mask` (a texture field) shapes it in plain UVs, `shape`
 * 'disc' cuts it to the inscribed circle ('open' does not), `band` shapes it by
 * radius and `lut` (an array of [r,g,b]) colours it by angle. `levels` [lo, hi]
 * reads the noise as brightness instead of as a dissolve.
 */
export function fillPolar(out, size, {
  noise,
  tileU = 1,
  tileV = 1,
  offU = 0,
  offV = 0,
  amount = 0,
  soft = 0.06,
  levels = null,
  shape = 'disc',
  mask = null,
  band = null,
  lut = null,
  rgb = [1, 1, 1],
  alpha = 1,
  inner = 0,
}) {
  for (let y = 0; y < size; y += 1) {
    const py = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size;
      const dx = px - 0.5;
      const dy = py - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const i = (y * size + x) * 4;
      const m = (mask ? sampleMask(mask, px, py) : 1) * (shape === 'open' ? 1 : 1 - smoothstep(0.94, 1, r));
      if (m <= 0.002 || r < inner) {
        out[i + 3] = 0;
        continue;
      }
      const u = (Math.atan2(dy, dx) / TAU + 1) % 1;
      const radial = inner > 0 ? (r - inner) / (1 - inner) : r;
      const n = sampleField(noise, u * tileU + offU, radial * tileV + offV);
      const b = band ? sampleField(band, 0.5, clamp01(radial)) : 1;
      const color = lut ? lutAt(lut, u, rgb) : rgb;
      const value = levels ? smoothstep(levels[0], levels[1], n) : dissolveAlpha(n, amount, soft);
      writePixel(out, i, color, m * b * value * alpha);
    }
  }
  return out;
}

/** Colour of an [[r,g,b], …] look-up row at `u` (wrapping), times `tint`. */
export function lutAt(lut, u, tint = [1, 1, 1]) {
  if (!Array.isArray(lut) || lut.length === 0) return tint;
  const x = (((u % 1) + 1) % 1) * lut.length;
  const i0 = Math.floor(x) % lut.length;
  const i1 = (i0 + 1) % lut.length;
  const f = x - Math.floor(x);
  return [0, 1, 2].map((c) => clamp01(lerp(lut[i0][c], lut[i1][c], f) * tint[c]));
}

/** Rotate then scale a 2D point list about the origin. */
export function turnPoints(points, angle, scale = 1) {
  const cos = Math.cos(angle) * scale;
  const sin = Math.sin(angle) * scale;
  return points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

/** Two rails (left/right) either side of a centreline, `half[i]` wide at point i. */
export function railsAround(centre, half) {
  const a = [];
  const b = [];
  for (let i = 0; i < centre.length; i += 1) {
    const prev = centre[Math.max(0, i - 1)];
    const next = centre[Math.min(centre.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const h = half[i] ?? 0;
    a.push([centre[i][0] + nx * h, centre[i][1] + ny * h]);
    b.push([centre[i][0] - nx * h, centre[i][1] - ny * h]);
  }
  return { a, b };
}

/** A uniformly random point on the edge of a w×h rectangle centred on the origin. */
export function pointOnRectEdge(rand, w, h) {
  const perimeter = 2 * (w + h);
  let d = rand() * perimeter;
  if (d < w) return [d - w / 2, h / 2];
  d -= w;
  if (d < h) return [w / 2, h / 2 - d];
  d -= h;
  if (d < w) return [w / 2 - d, -h / 2];
  d -= w;
  return [-w / 2, -h / 2 + d];
}

export const between = (rand, lo, hi) => lo + rand() * (hi - lo);
