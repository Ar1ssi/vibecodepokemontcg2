// Design 035: the Mega keystone orb, drawn on a canvas as a real 3D shell.
// Modelled on the main-series Mega Evolution: the Pokémon goes white-hot and
// swells into a glowing sphere, energy ribbons wrap it (passing behind and in
// front), the sphere hardens into a dark faceted shell, glowing cracks spread
// across it in a brick-like net while light bleeds through the gaps, and the
// shell shatters into shards that tumble toward the viewer.
// DOM-free: geometry and timeline are pure; `drawMegaOrb` only uses the 2D
// context passed in, so the whole module runs under `node --test`.
import { seededRandom } from './flow-pose.mjs';

export const MEGA_ORB_PALETTE = {
  shellDark: [46, 30, 30],
  shellLight: [214, 196, 190],
  innerLight: [255, 236, 214],
  crack: [255, 250, 240],
  crackGlow: 'rgba(255, 190, 120, 0.9)',
  orange: [255, 138, 42],
  blue: [42, 184, 255],
};

const DEG = Math.PI / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const plateau = (t, a, b, c, d) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeOutCubic(span(t, a, b));
  if (t <= c) return 1;
  return 1 - easeInCubic(span(t, c, d));
};
const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

// ---- vectors (x right, y up, z toward the viewer) ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return scale(a, 1 / len);
};
/** Point on the unit sphere at latitude/longitude (degrees). */
export const fromLatLon = (lat, lon) => [
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
];
const rotateX = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};
const rotateY = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};
const rotateZ = (p, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
};
/** Rodrigues rotation of `p` about unit `axis` by `angle` radians. */
const rotateAxis = (p, axis, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(scale(p, c), scale(cross(axis, p), s)),
    scale(axis, dot(axis, p) * (1 - c))
  );
};

// ---- shell geometry ----

// Latitude rings (degrees) and cells per band between consecutive rings:
// fewer cells near the poles, staggered like bricks in between.
const RING_LATS = [-90, -56, -24, 6, 36, 64, 90];
const BAND_CELLS = [3, 6, 8, 8, 6, 3];
const EDGE_STEP_DEG = 10;

/**
 * The cracked shell: one fragment per brick cell of a wavy latitude/longitude
 * net on the unit sphere. Deterministic for a given `seed`.
 * @returns {{ fragments: Array<{ points: number[][], centroid: number[],
 *   shade: number, order: number, crackWidth: number, flight: number,
 *   spinAxis: number[], spin: number }> }}
 */
function makeFragment(points, crackOrigin, rand) {
  const centroid = normalize(points.reduce((sum, p) => add(sum, p), [0, 0, 0]));
  const distance =
    Math.acos(Math.max(-1, Math.min(1, dot(centroid, crackOrigin)))) / Math.PI;
  return {
    points,
    centroid,
    shade: rand(),
    order: clamp01(distance * 0.85 + rand() * 0.15),
    crackWidth: 0.55 + rand() * 0.9,
    flight: 1.6 + rand() * 1.8,
    spinAxis: normalize([rand() - 0.5, rand() - 0.5, rand() - 0.5]),
    spin: (rand() - 0.5) * 5,
  };
}

export function buildMegaShell(seed = 1) {
  const rand = seededRandom(seed);
  const waves = RING_LATS.map(() => ({
    a: 4 + rand() * 5,
    p: rand() * Math.PI * 2,
    b: 2 + rand() * 3,
    q: rand() * Math.PI * 2,
  }));
  const ringLat = (i, lon) => {
    if (i === 0 || i === RING_LATS.length - 1) return RING_LATS[i];
    const w = waves[i];
    return (
      RING_LATS[i] +
      w.a * Math.sin(lon * 2 * DEG + w.p) +
      w.b * Math.sin(lon * 3 * DEG + w.q)
    );
  };
  const crackOrigin = fromLatLon(14, -24);
  const fragments = [];
  BAND_CELLS.forEach((cells, band) => {
    const width = 360 / cells;
    const offset = rand();
    const cuts = [];
    for (let k = 0; k < cells; k += 1) {
      const lower = (k + offset) * width + (rand() - 0.5) * width * 0.5;
      cuts.push({ lower, upper: lower + (rand() - 0.5) * width * 0.6 });
    }
    for (let k = 0; k < cells; k += 1) {
      const left = cuts[k];
      const right =
        k + 1 < cells
          ? cuts[k + 1]
          : { lower: cuts[0].lower + 360, upper: cuts[0].upper + 360 };
      const points = [];
      const along = (ring, from, to) => {
        const steps = Math.max(
          1,
          Math.ceil(Math.abs(to - from) / EDGE_STEP_DEG)
        );
        for (let s = 0; s < steps; s += 1) {
          const lon = lerp(from, to, s / steps);
          points.push(fromLatLon(ringLat(ring, lon), lon));
        }
      };
      const side = (from, to) => {
        for (let s = 0; s < 3; s += 1) {
          const f = s / 3;
          const lon = lerp(from.lon, to.lon, f);
          points.push(fromLatLon(lerp(from.lat, to.lat, f), lon));
        }
      };
      along(band, left.lower, right.lower);
      const bottomCount = points.length;
      side(
        { lon: right.lower, lat: ringLat(band, right.lower) },
        { lon: right.upper, lat: ringLat(band + 1, right.upper) }
      );
      const topStart = points.length;
      along(band + 1, right.upper, left.upper);
      const topCount = points.length - topStart;
      side(
        { lon: left.upper, lat: ringLat(band + 1, left.upper) },
        { lon: left.lower, lat: ringLat(band, left.lower) }
      );
      // Some cells crack again along a diagonal, so the net never reads as a grid.
      const splittable =
        bottomCount > 1 &&
        topCount > 1 &&
        band > 0 &&
        band < BAND_CELLS.length - 1;
      if (splittable && rand() < 0.4) {
        const i = 1 + Math.floor(rand() * (bottomCount - 1));
        const j = topStart + 1 + Math.floor(rand() * (topCount - 1));
        fragments.push(makeFragment(points.slice(i, j + 1), crackOrigin, rand));
        fragments.push(
          makeFragment(
            points.slice(j).concat(points.slice(0, i + 1)),
            crackOrigin,
            rand
          )
        );
      } else {
        fragments.push(makeFragment(points, crackOrigin, rand));
      }
    }
  });
  return { fragments };
}

// Energy ribbons wrapping the orb: colour, orbit tilt about x and z (deg),
// radius (× orb radius), arc length (deg), width (× radius), start phase and
// angular speed (deg per unit t).
const RIBBONS = [
  {
    colour: 'blue',
    tiltX: 72,
    tiltZ: 12,
    radius: 1.16,
    arc: 210,
    width: 0.2,
    phase: 0,
    speed: 720,
  },
  {
    colour: 'orange',
    tiltX: 58,
    tiltZ: -28,
    radius: 1.24,
    arc: 180,
    width: 0.17,
    phase: 140,
    speed: 640,
  },
  {
    colour: 'blue',
    tiltX: -20,
    tiltZ: 64,
    radius: 1.3,
    arc: 150,
    width: 0.14,
    phase: 250,
    speed: -560,
  },
  {
    colour: 'orange',
    tiltX: 84,
    tiltZ: 38,
    radius: 1.12,
    arc: 160,
    width: 0.15,
    phase: 60,
    speed: 600,
  },
  {
    colour: 'blue',
    tiltX: 30,
    tiltZ: -70,
    radius: 1.36,
    arc: 130,
    width: 0.12,
    phase: 300,
    speed: -680,
  },
];

/** A point `angleDeg` along a ribbon's orbit, before the view rotation. */
export function ribbonPoint(ribbon, angleDeg) {
  const a = angleDeg * DEG;
  const ring = [Math.cos(a) * ribbon.radius, 0, Math.sin(a) * ribbon.radius];
  return rotateZ(rotateX(ring, ribbon.tiltX * DEG), ribbon.tiltZ * DEG);
}

/** Ribbon thickness along its length: pointed tail and head, fattest near the head. */
export const ribbonTaper = (u) => Math.sin(Math.PI * clamp01(u) ** 1.6);

// ---- timeline ----

/**
 * Everything the orb draws at t in [0, 1] of the Mega entry, whose burst is at
 * `burstAt`. `radius` is a multiple of the base orb radius.
 */
export function megaOrbPose(t, burstAt = 0.5) {
  const c = clamp01(t);
  const grow = span(c, 0.06, 0.14);
  const swell = easeInCubic(span(c, 0.28, burstAt));
  const strain = span(c, burstAt - 0.06, burstAt);
  return {
    opacity: plateau(c, 0.05, 0.08, burstAt + 0.08, burstAt + 0.17),
    radius: (grow === 0 ? 0.4 : 0.4 + 0.6 * easeOutBack(grow)) + 0.3 * swell,
    white: 1 - easeInOutCubic(span(c, 0.24, 0.31)),
    shell: easeInOutCubic(span(c, 0.24, 0.31)),
    glow: c < 0.24 ? 1 : 0.35 + 0.65 * easeInCubic(span(c, 0.34, burstAt)),
    crack: easeInOutCubic(span(c, 0.3, burstAt - 0.05)),
    gap: 0.07 * easeInCubic(span(c, 0.4, burstAt)),
    ribbon: easeOutCubic(span(c, 0.12, 0.22)),
    ribbonAlpha: plateau(c, 0.12, 0.15, burstAt, burstAt + 0.06),
    flames: plateau(c, 0.07, 0.15, burstAt - 0.02, burstAt + 0.08),
    shatter: easeOutCubic(span(c, burstAt, burstAt + 0.15)),
    yaw: 50 * c,
    turn: c,
    shake: strain > 0 ? 0.025 * strain * Math.sin(c * 900) : 0,
  };
}

// ---- drawing ----

const PITCH = -16 * DEG;
const LIGHT_DIR = normalize([-0.45, 0.6, 0.66]);
const view = (p, yaw) => rotateX(rotateY(p, yaw), PITCH);

/**
 * Draw one frame of the orb. `ctx` is a 2D context in CSS pixels, (cx, cy) the
 * orb centre and `unit` its base radius in the same pixels.
 */
export function drawMegaOrb(ctx, pose, shell, { cx, cy, unit, time = 0 }) {
  if (!(pose.opacity > 0) || !(unit > 0)) return;
  const R = unit * pose.radius;
  const yaw = pose.yaw * DEG;
  const ox = cx + pose.shake * unit;
  const oy = cy - pose.shake * unit * 0.6;
  ctx.save();
  ctx.globalAlpha = pose.opacity;

  drawFlames(ctx, pose, ox, oy, R, time);
  drawHalo(ctx, pose, ox, oy, R);
  drawRibbons(ctx, pose, ox, oy, R, yaw, 'back');
  drawCore(ctx, pose, ox, oy, R);
  drawInnerRays(ctx, pose, ox, oy, R);
  drawShell(ctx, pose, shell, ox, oy, R, yaw);
  drawRibbons(ctx, pose, ox, oy, R, yaw, 'front');
  drawMotes(ctx, pose, ox, oy, R);
  ctx.restore();
}

function drawFlames(ctx, pose, x, y, R, time) {
  if (!(pose.flames > 0)) return;
  ctx.save();
  const { orange } = MEGA_ORB_PALETTE;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 8; k += 1) {
      const flicker = 0.7 + 0.3 * Math.sin(time * 31 + k * 2.3 + side * 1.7);
      const angle = side * (18 + k * 8) * DEG;
      const length = R * (1.5 + 0.35 * ((k * 5) % 4)) * flicker * pose.flames;
      const baseX = x + side * R * (0.2 + k * 0.06);
      const baseY = y + R * (0.62 - k * 0.04);
      const dirX = Math.sin(angle);
      const dirY = -Math.cos(angle);
      const halfWidth = R * (0.2 - k * 0.012);
      const tipX = baseX + dirX * length;
      const tipY = baseY + dirY * length;
      const grad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
      grad.addColorStop(0, rgba([255, 252, 240], 0.95 * pose.flames));
      grad.addColorStop(0.3, rgba([255, 196, 110], 0.9 * pose.flames));
      grad.addColorStop(0.7, rgba(orange, 0.75 * pose.flames));
      grad.addColorStop(1, rgba(orange, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(baseX - dirY * halfWidth, baseY + dirX * halfWidth);
      // Jagged edges: alternate in and out along both flanks.
      for (let s = 1; s <= 5; s += 1) {
        const f = s / 6;
        const jag = s % 2 ? 1.5 : 0.45;
        const w = halfWidth * (1 - f) * jag;
        ctx.lineTo(
          baseX + dirX * length * f - dirY * w,
          baseY + dirY * length * f + dirX * w
        );
      }
      ctx.lineTo(tipX, tipY);
      for (let s = 5; s >= 1; s -= 1) {
        const f = s / 6;
        const jag = s % 2 ? 0.45 : 1.5;
        const w = halfWidth * (1 - f) * jag;
        ctx.lineTo(
          baseX + dirX * length * f + dirY * w,
          baseY + dirY * length * f - dirX * w
        );
      }
      ctx.lineTo(baseX + dirY * halfWidth, baseY - dirX * halfWidth);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHalo(ctx, pose, x, y, R) {
  const strength = Math.max(pose.white, pose.glow * 0.8) * (1 - pose.shatter);
  if (!(strength > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 1.7);
  grad.addColorStop(0, rgba([255, 240, 220], 0.7 * strength));
  grad.addColorStop(0.4, rgba([255, 170, 90], 0.25 * strength));
  grad.addColorStop(1, rgba([255, 150, 60], 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, R * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The white-hot sphere, and later the light inside the shell. */
function drawCore(ctx, pose, x, y, R) {
  const strength = Math.max(pose.white, pose.glow) * (1 - pose.shatter);
  if (!(strength > 0)) return;
  const { innerLight } = MEGA_ORB_PALETTE;
  const grad = ctx.createRadialGradient(
    x - R * 0.2,
    y - R * 0.25,
    R * 0.1,
    x,
    y,
    R
  );
  grad.addColorStop(0, rgba([255, 255, 255], strength));
  grad.addColorStop(0.7, rgba([255, 252, 246], strength));
  grad.addColorStop(1, rgba(innerLight, strength));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

/** Light rays inside the shell, seen faintly through its translucent facets. */
function drawInnerRays(ctx, pose, x, y, R) {
  const strength = pose.shell * (1 - pose.shatter);
  if (!(strength > 0)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const turn = pose.turn * 40 * DEG;
  for (let i = 0; i < 14; i += 1) {
    const a = turn + (i / 14) * Math.PI * 2 + (i % 3) * 0.12;
    const half = (0.05 + 0.04 * (i % 2)) * Math.PI;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, rgba([255, 230, 200], 0.55 * strength * pose.glow));
    grad.addColorStop(1, rgba([255, 170, 110], 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R, a - half, a + half);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function fragmentFill(fragment, normal, pose) {
  const { shellDark, shellLight, innerLight } = MEGA_ORB_PALETTE;
  const lambert = Math.max(0, dot(normal, LIGHT_DIR));
  const base = fragment.shade > 0.62 ? shellLight : shellDark;
  const lit = mixRgb([8, 4, 4], base, 0.45 + 0.55 * lambert);
  // Toward the silhouette the shell darkens, which sells the curvature.
  const rimmed = mixRgb(lit, [10, 6, 6], (1 - Math.max(0, normal[2])) * 0.35);
  const warmed = mixRgb(rimmed, innerLight, 0.18 * pose.glow);
  return mixRgb(warmed, [255, 255, 255], 1 - pose.shell);
}

function drawShell(ctx, pose, shell, x, y, R, yaw) {
  if (!(pose.shell > 0) || !shell?.fragments?.length) return;
  const camera = 5;
  const project = (p) => {
    const k = camera / (camera - p[2]);
    return [x + p[0] * R * k, y - p[1] * R * k, p[2]];
  };
  const shatter = pose.shatter;
  const fade = shatter > 0 ? 1 - easeInCubic(span(shatter, 0.3, 1)) : 1;
  const drawn = [];
  for (const fragment of shell.fragments) {
    const centre = view(fragment.centroid, yaw);
    if (shatter === 0 && centre[2] < -0.05) continue;
    const flight = scale(centre, shatter * fragment.flight);
    const push = [0, 0, shatter * fragment.flight * 0.6];
    const shrink = 1 - pose.gap;
    const points = fragment.points.map((p) => {
      let local = sub(view(p, yaw), centre);
      local = scale(local, shrink);
      if (shatter > 0)
        local = rotateAxis(local, fragment.spinAxis, fragment.spin * shatter);
      return project(add(add(add(centre, local), flight), push));
    });
    const normal =
      shatter > 0
        ? rotateAxis(centre, fragment.spinAxis, fragment.spin * shatter)
        : centre;
    drawn.push({
      fragment,
      points,
      normal,
      depth: centre[2] + flight[2] + push[2],
    });
  }
  drawn.sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.globalAlpha *= fade;
  for (const { fragment, points, normal } of drawn) {
    const alpha = shatter > 0 ? 1 : fragment.shade > 0.62 ? 0.93 : 0.82;
    ctx.fillStyle = rgba(fragmentFill(fragment, normal, pose), alpha);
    tracePolygon(ctx, points);
    ctx.fill();
    // A lit bevel on every facet; brighter once the shards fly, so they read as thick glass.
    ctx.strokeStyle = rgba(
      [255, 238, 225],
      shatter > 0 ? 0.75 : 0.28 * pose.shell
    );
    ctx.lineWidth = shatter > 0 ? Math.max(1, R * 0.02) : 1;
    ctx.stroke();
  }

  // Glowing cracks along the fragment borders, spreading from one side.
  if (pose.crack > 0 && shatter < 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = MEGA_ORB_PALETTE.crackGlow;
    ctx.shadowBlur = R * 0.08;
    for (const { fragment } of drawn) {
      const open = clamp01((pose.crack - fragment.order) * 5);
      if (open <= 0) continue;
      const outline = fragment.points.map((p) => project(view(p, yaw)));
      ctx.strokeStyle = rgba(MEGA_ORB_PALETTE.crack, open * (1 - shatter));
      ctx.lineWidth = Math.max(
        0.6,
        R * (0.01 + 0.026 * open + pose.gap * 0.3) * fragment.crackWidth
      );
      tracePolygon(ctx, outline);
      ctx.stroke();
    }
  }
  ctx.restore();

  // The glassy rim of the sphere.
  if (shatter < 1) {
    ctx.save();
    ctx.strokeStyle = rgba([255, 255, 255], 0.85 * pose.shell * (1 - shatter));
    ctx.lineWidth = Math.max(1, R * 0.018);
    ctx.shadowColor = 'rgba(255, 235, 210, 0.9)';
    ctx.shadowBlur = R * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.005, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function tracePolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1)
    ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

const RIBBON_SEGMENTS = 48;

/**
 * Outline of a tapered stroke through screen points `{x, y, w}`: the left
 * edge forward, the right edge back.
 */
export function ribbonOutline(points) {
  const left = [];
  const right = [];
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push([p.x + (nx * p.w) / 2, p.y + (ny * p.w) / 2]);
    right.push([p.x - (nx * p.w) / 2, p.y - (ny * p.w) / 2]);
  });
  return left.concat(right.reverse());
}

/** Split a ribbon's points into runs that lie wholly behind or in front of the orb. */
export function depthRuns(points, layer) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p.z >= 0 === (layer === 'front')) {
      run.push(p);
      continue;
    }
    if (run.length > 1) runs.push(run);
    run = [];
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function drawRibbons(ctx, pose, x, y, R, yaw, layer) {
  if (!(pose.ribbon > 0) || !(pose.ribbonAlpha > 0)) return;
  const spread = 1 + 0.6 * pose.shatter;
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  for (const ribbon of RIBBONS) {
    const colour = MEGA_ORB_PALETTE[ribbon.colour];
    const head = ribbon.phase + ribbon.speed * pose.turn;
    const length = ribbon.arc * pose.ribbon;
    const dir = Math.sign(ribbon.speed) || 1;
    const points = [];
    for (let s = 0; s <= RIBBON_SEGMENTS; s += 1) {
      const u = s / RIBBON_SEGMENTS;
      const p = view(
        scale(ribbonPoint(ribbon, head - dir * length * (1 - u)), spread),
        yaw
      );
      points.push({
        x: x + p[0] * R,
        y: y - p[1] * R,
        z: p[2],
        w: R * ribbon.width * ribbonTaper(u),
      });
    }
    ctx.globalAlpha =
      baseAlpha * pose.ribbonAlpha * (layer === 'front' ? 1 : 0.75);
    for (const run of depthRuns(points, layer)) {
      ctx.shadowColor = rgba(colour, 0.9);
      ctx.shadowBlur = R * 0.1;
      ctx.fillStyle = rgba(colour, 1);
      tracePolygon(ctx, ribbonOutline(run));
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(mixRgb(colour, [255, 255, 255], 0.75), 0.95);
      tracePolygon(
        ctx,
        ribbonOutline(run.map((p) => ({ ...p, w: p.w * 0.32 })))
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

// Glowing motes drifting round the orb: [orbit radius ×R, phase°, speed°, colour].
const MOTES = [
  [1.45, 0, 90, 'orange'],
  [1.7, 50, -70, 'blue'],
  [1.55, 110, 80, 'white'],
  [1.85, 160, -60, 'orange'],
  [1.4, 215, 100, 'blue'],
  [1.75, 270, -85, 'white'],
  [1.6, 320, 75, 'orange'],
  [1.95, 25, -55, 'blue'],
];

function drawMotes(ctx, pose, x, y, R) {
  const alpha = pose.ribbonAlpha;
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [radius, phase, speed, colour] of MOTES) {
    const a = (phase + speed * pose.turn) * DEG;
    const mx = x + Math.cos(a) * radius * R;
    const my = y + Math.sin(a) * radius * R * 0.55;
    const size = R * 0.07;
    const rgb = colour === 'white' ? [255, 255, 255] : MEGA_ORB_PALETTE[colour];
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, size);
    grad.addColorStop(0, rgba([255, 255, 255], alpha));
    grad.addColorStop(0.35, rgba(rgb, 0.9 * alpha));
    grad.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
