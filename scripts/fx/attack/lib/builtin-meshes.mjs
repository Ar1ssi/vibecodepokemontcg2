// Design 068: the meshes Unity ships in "unity default resources", by their file ids. Only the
// three the attack prefabs draw are built; any other id is refused by the importer.

export const BUILTIN_QUAD = 10210;
export const BUILTIN_PLANE = 10209;
export const BUILTIN_SPHERE = 10207;

/** Unity's Quad: 1 × 1 in XY, facing −Z. */
const quad = () => ({
  name: 'Quad',
  positions: [
    [-0.5, -0.5, 0],
    [0.5, -0.5, 0],
    [-0.5, 0.5, 0],
    [0.5, 0.5, 0],
  ],
  normals: [
    [0, 0, -1],
    [0, 0, -1],
    [0, 0, -1],
    [0, 0, -1],
  ],
  uv0: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  indices: [0, 2, 1, 2, 3, 1],
});

/** Unity's Plane: 10 × 10 in XZ, facing +Y, 11 × 11 vertices. */
const plane = () => {
  const positions = [];
  const normals = [];
  const uv0 = [];
  const indices = [];
  const side = 11;
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      positions.push([5 - column, 0, 5 - row]);
      normals.push([0, 1, 0]);
      uv0.push([column / 10, row / 10]);
    }
  }
  for (let row = 0; row < side - 1; row += 1) {
    for (let column = 0; column < side - 1; column += 1) {
      const a = row * side + column;
      indices.push(a, a + side, a + 1, a + side, a + side + 1, a + 1);
    }
  }
  return { name: 'Plane', positions, normals, uv0, indices };
};

/** Unity's Sphere: radius 0.5, latitude / longitude UVs (u around the Y axis, v from the south pole up). */
const sphere = () => {
  const positions = [];
  const normals = [];
  const uv0 = [];
  const indices = [];
  const rings = 16;
  const segments = 24;
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = (ring / rings - 0.5) * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const longitude = (segment / segments) * Math.PI * 2;
      const normal = [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
      normals.push(normal);
      positions.push(normal.map((value) => value * 0.5));
      uv0.push([segment / segments, ring / rings]);
    }
  }
  const row = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * row + segment;
      indices.push(a, a + row, a + 1, a + row, a + row + 1, a + 1);
    }
  }
  return { name: 'Sphere', positions, normals, uv0, indices };
};

const BUILDERS = { [BUILTIN_QUAD]: quad, [BUILTIN_PLANE]: plane, [BUILTIN_SPHERE]: sphere };

/** @returns {{name:string, positions:number[][], normals:number[][], uv0:number[][], indices:number[]}} */
export function builtinMesh(id) {
  const build = BUILDERS[id];
  if (!build) throw new Error(`Unity built-in mesh ${id} is not supported`);
  return build();
}
