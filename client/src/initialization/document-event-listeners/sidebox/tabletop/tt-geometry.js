import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';

/**
 * Geometry builders for the tabletop (design 073): flat board panels with thickness, rounded card
 * slabs, and the pillow pack grid helpers. All sizes in mm.
 */

/**
 * A flat panel of board `thickness` thick: its outline `points` ([x, y] in the panel plane,
 * counter-clockwise seen from outside), outer face at z = 0 facing +z, inner face at
 * z = −thickness. Groups: 0 outer (UVs from `outerUv(x, y)`), 1 inner (UVs in mm / 100), 2 the
 * cut edges (u along the edge in mm / 10, v across the board).
 *
 * @param {[number, number][]} points
 * @param {number} thickness
 * @param {(x: number, y: number) => [number, number]} outerUv
 */
export function boardPanel(points, thickness, outerUv) {
  const contour = points.map(([x, y]) => new Vector2(x, y));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const positions = [];
  const normals = [];
  const uvs = [];
  const groups = [];
  const push = (x, y, z, nx, ny, nz, u, v) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  };

  let start = 0;
  for (const [a, b, c] of triangles) {
    for (const index of [a, b, c]) {
      const [x, y] = points[index];
      const [u, v] = outerUv(x, y);
      push(x, y, 0, 0, 0, 1, u, v);
    }
  }
  groups.push([start, positions.length / 3 - start, 0]);

  start = positions.length / 3;
  for (const [a, b, c] of triangles) {
    for (const index of [a, c, b]) {
      const [x, y] = points[index];
      push(x, y, -thickness, 0, 0, -1, x / 100, y / 100);
    }
  }
  groups.push([start, positions.length / 3 - start, 1]);

  start = positions.length / 3;
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 1e-6) continue;
    // Outward normal of a counter-clockwise outline.
    const nx = (y1 - y0) / length;
    const ny = -(x1 - x0) / length;
    const u0 = run / 10;
    const u1 = (run + length) / 10;
    run += length;
    push(x0, y0, 0, nx, ny, 0, u0, 1);
    push(x1, y1, 0, nx, ny, 0, u1, 1);
    push(x1, y1, -thickness, nx, ny, 0, u1, 0);
    push(x0, y0, 0, nx, ny, 0, u0, 1);
    push(x1, y1, -thickness, nx, ny, 0, u1, 0);
    push(x0, y0, -thickness, nx, ny, 0, u0, 0);
  }
  groups.push([start, positions.length / 3 - start, 2]);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  for (const [s, count, material] of groups) geometry.addGroup(s, count, material);
  return geometry;
}

/** The outline of a rounded rectangle centred on the origin, counter-clockwise. */
export function roundedRectPoints(width, height, radius, segments = 6) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2;
  const hh = height / 2;
  const corners = [
    [hw - r, -hh + r, -Math.PI / 2],
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
  ];
  const points = [];
  for (const [cx, cy, start] of corners) {
    for (let s = 0; s <= segments; s += 1) {
      const angle = start + (s / segments) * (Math.PI / 2);
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  }
  return points;
}

/**
 * A card-like slab (rounded rectangle `width` × `height`, `thickness` thick) centred on the
 * origin, front face toward +z. Groups: 0 front (u, v over the face), 1 back (mirrored so the
 * back's image reads correctly from behind), 2 the edge (u along the outline, v across).
 */
export function cardSlab(width, height, thickness, radius, segments = 6) {
  const outline = roundedRectPoints(width, height, radius, segments);
  const contour = outline.map(([x, y]) => new Vector2(x, y));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const positions = [];
  const normals = [];
  const uvs = [];
  const half = thickness / 2;
  const push = (x, y, z, nx, ny, nz, u, v) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  };
  const toU = (x) => x / width + 0.5;
  const toV = (y) => y / height + 0.5;

  for (const [a, b, c] of triangles) {
    for (const index of [a, b, c]) {
      const [x, y] = outline[index];
      push(x, y, half, 0, 0, 1, toU(x), toV(y));
    }
  }
  const frontCount = positions.length / 3;
  for (const [a, b, c] of triangles) {
    for (const index of [a, c, b]) {
      const [x, y] = outline[index];
      push(x, y, -half, 0, 0, -1, 1 - toU(x), toV(y));
    }
  }
  const backCount = positions.length / 3 - frontCount;
  let run = 0;
  const perimeter = outline.reduce((sum, point, i) => {
    const next = outline[(i + 1) % outline.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
  for (let i = 0; i < outline.length; i += 1) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 1e-9) continue;
    // Smooth normals around the rounded corners: each vertex takes its two edges' bisector.
    const n0 = edgeNormal(outline, i);
    const n1 = edgeNormal(outline, (i + 1) % outline.length);
    const u0 = run / perimeter;
    const u1 = (run + length) / perimeter;
    run += length;
    push(x0, y0, half, n0[0], n0[1], 0, u0, 1);
    push(x1, y1, -half, n1[0], n1[1], 0, u1, 0);
    push(x1, y1, half, n1[0], n1[1], 0, u1, 1);
    push(x0, y0, half, n0[0], n0[1], 0, u0, 1);
    push(x0, y0, -half, n0[0], n0[1], 0, u0, 0);
    push(x1, y1, -half, n1[0], n1[1], 0, u1, 0);
  }
  const edgeCount = positions.length / 3 - frontCount - backCount;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.addGroup(0, frontCount, 0);
  geometry.addGroup(frontCount, backCount, 1);
  geometry.addGroup(frontCount + backCount, edgeCount, 2);
  return geometry;
}

// The outward normal at outline vertex `i`: the bisector of its two edges.
function edgeNormal(outline, i) {
  const prev = outline[(i - 1 + outline.length) % outline.length];
  const point = outline[i];
  const next = outline[(i + 1) % outline.length];
  const ax = point[1] - prev[1];
  const ay = -(point[0] - prev[0]);
  const bx = next[1] - point[1];
  const by = -(next[0] - point[0]);
  const al = Math.hypot(ax, ay) || 1;
  const bl = Math.hypot(bx, by) || 1;
  const nx = ax / al + bx / bl;
  const ny = ay / al + by / bl;
  const nl = Math.hypot(nx, ny) || 1;
  return [nx / nl, ny / nl];
}
